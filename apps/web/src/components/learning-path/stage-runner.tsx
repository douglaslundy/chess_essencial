'use client';

import type { CompleteLearningStageResult, ExerciseSummary } from '@xadrez/contracts';
import { Chess } from 'chess.js';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ChessBoard } from '@/components/game/chess-board';
import { api } from '@/lib/api/client';
import { usePieceTheme } from '@/lib/piece-theme';

function uciToChessMove(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci[4] ? { promotion: uci[4] } : {}),
  };
}

type Phase = 'loading' | 'playing' | 'evaluating' | 'incorrect' | 'solved' | 'error';

const INSTRUCTOR_MESSAGE: Record<Phase, string> = {
  error: 'Não consegui carregar esta etapa.',
  evaluating: 'Avaliando sua jogada…',
  incorrect: 'Essa não é a melhor jogada aqui. Observe a posição de novo e tente outra vez.',
  loading: 'Preparando a etapa…',
  playing: 'Encontre a melhor jogada para a posição abaixo.',
  solved: 'Muito bem! Você encontrou a ideia certa.',
};

export function StageRunner({ stageId }: { stageId: string }) {
  const { theme: pieceTheme } = usePieceTheme();
  const [exercise, setExercise] = useState<ExerciseSummary | null>(null);
  const [trainingSessionId, setTrainingSessionId] = useState('');
  const [boardFen, setBoardFen] = useState('');
  const [playedMoves, setPlayedMoves] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<CompleteLearningStageResult | null>(null);
  const startingFen = useRef('');

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      queueMicrotask(() => {
        setPhase('error');
        setErrorMessage('Entre na sua conta para continuar.');
      });
      return;
    }
    let active = true;
    (async () => {
      try {
        const start = await api.startLearningStage(stageId, token);
        const detail = await api.getExerciseById(start.exerciseId, token);
        if (!active) return;
        if (!detail.fen || detail.positionType !== 'legal_position') {
          setPhase('error');
          setErrorMessage('Esta etapa ainda não tem um tabuleiro jogável.');
          return;
        }
        setExercise(detail);
        setTrainingSessionId(start.trainingSessionId);
        startingFen.current = detail.fen;
        setBoardFen(detail.fen);
        setPhase('playing');
      } catch (error) {
        if (!active) return;
        setPhase('error');
        setErrorMessage(error instanceof Error ? error.message : 'Falha ao carregar a etapa.');
      }
    })();
    return () => {
      active = false;
    };
  }, [stageId]);

  async function playMove(uci: string) {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token || !exercise || phase !== 'playing') return;

    const chess = new Chess(boardFen);
    try {
      chess.move(uciToChessMove(uci));
    } catch {
      return; // Illegal move — ChessBoard already restricts this, but stay defensive.
    }
    const nextMoves = [...playedMoves, uci];
    const nextFen = chess.fen();
    setBoardFen(nextFen);
    setPlayedMoves(nextMoves);
    setPhase('evaluating');

    try {
      const evaluation = await api.evaluateExerciseLine(
        exercise.id,
        { playedMoves: nextMoves, trainingSessionId },
        token,
      );
      if (evaluation.status === 'incorrect') {
        setPhase('incorrect');
        setTimeout(() => {
          setBoardFen(startingFen.current);
          setPlayedMoves([]);
          setPhase('playing');
        }, 1500);
        return;
      }
      if (evaluation.status === 'continue') {
        if (evaluation.opponentReply) {
          const replyChess = new Chess(nextFen);
          replyChess.move(uciToChessMove(evaluation.opponentReply));
          setBoardFen(replyChess.fen());
          setPlayedMoves([...nextMoves, evaluation.opponentReply]);
        }
        setPhase('playing');
        return;
      }
      // status === 'solved'
      const completion = await api.completeLearningStage(stageId, token);
      setResult(completion);
      setPhase('solved');
    } catch (error) {
      setPhase('error');
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao avaliar a jogada.');
    }
  }

  if (phase === 'loading' || phase === 'error') {
    return (
      <main className="stageRunnerPage">
        <p className="status" role="status">
          {phase === 'error' ? errorMessage : 'Preparando a etapa…'}
        </p>
        <Link href="/app/treinamento">← Voltar ao mapa</Link>
      </main>
    );
  }

  return (
    <main className="stageRunnerPage">
      <header className="pageHeader">
        <Link href="/app/treinamento">← Sair</Link>
      </header>
      <div className="instructorBubble" role="status">
        <span aria-hidden="true" className="instructorAvatar">
          ♞
        </span>
        <p>{INSTRUCTOR_MESSAGE[phase]}</p>
      </div>
      {exercise ? (
        <ChessBoard
          disabled={phase !== 'playing'}
          fen={boardFen}
          onMove={(uci) => void playMove(uci)}
          orientation="white"
          pieceTheme={pieceTheme}
        />
      ) : null}
      {phase === 'solved' && result ? (
        <section className="stageCompletionCard">
          <h2>Etapa concluída</h2>
          <p>{result.correctFirstTry ? 'Primeira tentativa certa!' : 'Resolvido.'}</p>
          {result.levelCompleted ? <p>Você concluiu este nível.</p> : null}
          {result.worldCompleted ? <p>🏆 Você concluiu este mundo!</p> : null}
          <Link className="primaryButton" href="/app/treinamento">
            Continuar
          </Link>
        </section>
      ) : null}
    </main>
  );
}
