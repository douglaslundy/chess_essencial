'use client';

import type { ExerciseTrainingView } from '@xadrez/contracts';
import { Chess } from 'chess.js';
import { useEffect, useRef, useState } from 'react';

import { ChessBoard } from '@/components/game/chess-board';
import { useDialogA11y } from '@/components/ui/dialog-a11y';
import { api } from '@/lib/api/client';
import { usePieceTheme } from '@/lib/piece-theme';

const token = () => window.localStorage.getItem('xadrez.access_token');

/**
 * One bank exercise on a board inside a modal: the page behind stays where it is. A wrong move
 * restarts the exercise; when it is solved, `onSolved` fires and the student closes the modal.
 */
export function ExerciseDialog({
  exerciseId,
  onClose,
  onSolved,
  title,
}: {
  exerciseId: string;
  onClose: () => void;
  onSolved: () => void;
  title: string;
}) {
  const { theme: pieceTheme } = usePieceTheme();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [training, setTraining] = useState<ExerciseTrainingView | null>(null);
  const [fen, setFen] = useState<string | null>(null);
  const [played, setPlayed] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | undefined>();
  const [busy, setBusy] = useState(true);
  const [solved, setSolved] = useState(false);
  const [message, setMessage] = useState('Carregando o exercício…');
  const exercise = training?.currentExercise ?? null;
  useDialogA11y({ initialFocusRef: closeRef, onCancel: onClose, open: true });

  useEffect(() => {
    const accessToken = token();
    if (!accessToken) {
      queueMicrotask(() => setMessage('Entre na sua conta para resolver o exercício.'));
      return;
    }
    let live = true;
    api
      .startExerciseTraining({ filters: { exerciseId, limit: 1 } }, accessToken)
      .then((view) => {
        if (!live) return;
        if (!view.currentExercise?.fen) {
          setMessage('Este exercício não está disponível.');
          return;
        }
        setTraining(view);
        setFen(view.currentExercise.fen);
        setMessage(
          view.currentExercise.sideToMove === 'black'
            ? 'Você joga com as pretas. Encontre o melhor lance.'
            : 'Você joga com as brancas. Encontre o melhor lance.',
        );
        setBusy(false);
      })
      .catch(() => live && setMessage('Não foi possível carregar o exercício.'));
    return () => {
      live = false;
    };
  }, [exerciseId]);

  function restart(text: string) {
    setMessage(text);
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
        restart('Não é esse lance. O exercício recomeçou: tente de novo.');
        return;
      }
      if (result.status === 'solved') {
        setSolved(true);
        setMessage('Exercício concluído! Pode fechar.');
        onSolved();
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
      setMessage('Boa! Continue a sequência.');
      setBusy(false);
    } catch {
      restart('Não foi possível conferir o lance. Verifique a conexão e tente de novo.');
    }
  }

  const side = exercise?.sideToMove === 'black' ? 'b' : 'w';
  return (
    <div className="dialogBackdrop" role="presentation">
      <div
        aria-label={`Exercício: ${title}`}
        aria-modal="true"
        className="studyDialog"
        role="dialog"
      >
        <header className="studyDialogHeader">
          <h2>{title}</h2>
          <button onClick={onClose} ref={closeRef} type="button">
            Fechar
          </button>
        </header>
        <p role="status">{message}</p>
        <div className="studyDialogBoard">
          <ChessBoard
            disabled={busy || solved}
            fen={fen ?? new Chess().fen()}
            lastMove={lastMove}
            movableColor={side}
            onMove={(uci) => void onMove(uci)}
            orientation={side === 'b' ? 'black' : 'white'}
            pieceTheme={pieceTheme}
          />
        </div>
      </div>
    </div>
  );
}
