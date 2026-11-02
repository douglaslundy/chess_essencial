'use client';

import type { ExerciseTrainingView } from '@xadrez/contracts';
import { Chess } from 'chess.js';
import { useEffect, useState } from 'react';

import type { CourseStep } from './course-types';
import { ChessBoard, type PieceTheme } from '@/components/game/chess-board';
import { api } from '@/lib/api/client';

type PuzzleStep = Extract<CourseStep, { kind: 'puzzle' }>;

const token = () => window.localStorage.getItem('xadrez.access_token');
const playsWith = (side: string | null) =>
  side === 'black' ? 'Você joga com as pretas.' : 'Você joga com as brancas.';

/** Bank puzzles graded by the server (/v1/exercises/:id/evaluate-line); a wrong move restarts the puzzle. */
export function CoursePuzzle({
  step,
  pieceTheme,
  onFeedback,
  onDone,
}: {
  step: PuzzleStep;
  pieceTheme: PieceTheme;
  onFeedback: (message: string) => void;
  onDone: () => void;
}) {
  const [training, setTraining] = useState<ExerciseTrainingView | null>(null);
  const [fen, setFen] = useState<string | null>(null);
  const [played, setPlayed] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | undefined>();
  const [solved, setSolved] = useState(0);
  const [busy, setBusy] = useState(true);
  const exercise = training?.currentExercise ?? null;

  useEffect(() => {
    const accessToken = token();
    if (!accessToken) {
      onFeedback('Entre na sua conta para resolver os problemas.');
      return;
    }
    let live = true;
    api
      .startExerciseTraining(
        {
          filters: {
            difficulty: step.difficulty,
            limit: step.count,
            source: 'lichess',
            theme: step.theme,
          },
        },
        accessToken,
      )
      .then((view) => {
        if (!live) return;
        if (!view.currentExercise?.fen) {
          onFeedback('Nenhum problema encontrado para este tema.');
          return;
        }
        onFeedback(`${step.say} ${playsWith(view.currentExercise.sideToMove)}`);
        setTraining(view);
        setFen(view.currentExercise.fen);
        setBusy(false);
      })
      .catch(() => live && onFeedback('Não foi possível carregar os problemas.'));
    return () => {
      live = false;
    };
  }, [step, onFeedback]);

  function restart(message: string) {
    onFeedback(message);
    setFen(exercise?.fen ?? null);
    setPlayed([]);
    setLastMove(undefined);
    setBusy(false);
  }

  async function onMove(uci: string) {
    const accessToken = token();
    if (!exercise || !training || !fen || busy || !accessToken) return;
    const chess = new Chess(fen);
    let move;
    try {
      move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
    } catch {
      return;
    }
    const line = [...played, `${move.from}${move.to}${move.promotion ?? ''}`];
    setFen(chess.fen());
    setLastMove({ from: move.from, to: move.to });
    setBusy(true);
    try {
      const result = await api.evaluateExerciseLine(
        exercise.id,
        { playedMoves: line, trainingSessionId: training.sessionId },
        accessToken,
      );
      if (result.status === 'incorrect') {
        restart('Não é esse lance. O problema recomeçou: tente de novo.');
        return;
      }
      if (result.status === 'solved') {
        const count = solved + 1;
        const next = result.attempt?.training?.currentExercise;
        setSolved(count);
        if (count >= step.count || !next?.fen) {
          onDone();
          return;
        }
        onFeedback(`Resolvido! Faltam ${step.count - count}. ${playsWith(next.sideToMove)}`);
        setTraining(result.attempt!.training);
        setFen(next.fen);
        setPlayed([]);
        setLastMove(undefined);
        setBusy(false);
        return;
      }
      const reply = result.opponentReply;
      if (reply) {
        const answer = chess.move({
          from: reply.slice(0, 2),
          to: reply.slice(2, 4),
          promotion: reply[4] ?? 'q',
        });
        setFen(chess.fen());
        setLastMove({ from: answer.from, to: answer.to });
      }
      setPlayed(line);
      onFeedback('Boa! Continue a sequência.');
      setBusy(false);
    } catch {
      restart('Não foi possível conferir o lance. Verifique a conexão e tente de novo.');
    }
  }

  const side = exercise?.sideToMove === 'black' ? 'b' : 'w';
  return (
    <ChessBoard
      disabled={busy}
      fen={fen ?? new Chess().fen()}
      lastMove={lastMove}
      movableColor={side}
      onMove={(uci) => void onMove(uci)}
      orientation={side === 'b' ? 'black' : 'white'}
      pieceTheme={pieceTheme}
    />
  );
}
