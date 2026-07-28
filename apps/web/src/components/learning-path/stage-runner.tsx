'use client';

import type {
  CompleteLearningStageResult,
  ExerciseSummary,
  LearningLevelDetail,
} from '@xadrez/contracts';
import { Chess } from 'chess.js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ChessBoard } from '@/components/game/chess-board';
import { api } from '@/lib/api/client';
import { usePieceTheme } from '@/lib/piece-theme';
import { speak, stopSpeaking } from '@/lib/speech';
import { useVoicePreference } from '@/lib/voice-preference';

function uciToChessMove(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci[4] ? { promotion: uci[4] } : {}),
  };
}

/** Replays `moves` from `fen` up to (not including) `count` and returns the resulting position. */
function fenAfter(fen: string, moves: string[], count: number) {
  const chess = new Chess(fen);
  for (const move of moves.slice(0, count)) chess.move(uciToChessMove(move));
  return chess.fen();
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
  const router = useRouter();
  const { theme: pieceTheme } = usePieceTheme();
  const { voiceName } = useVoicePreference();
  const [exercise, setExercise] = useState<ExerciseSummary | null>(null);
  const [levelId, setLevelId] = useState('');
  const [level, setLevel] = useState<LearningLevelDetail | null>(null);
  const [trainingSessionId, setTrainingSessionId] = useState('');
  const [boardFen, setBoardFen] = useState('');
  const [startingFen, setStartingFen] = useState('');
  const [playedMoves, setPlayedMoves] = useState<string[]>([]);
  const [viewingAt, setViewingAt] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<CompleteLearningStageResult | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [hintsRemaining, setHintsRemaining] = useState(0);
  const [spokenMessage, setSpokenMessage] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [score, setScore] = useState<number | null>(null);

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
        setLevelId(start.levelId);
        setTrainingSessionId(start.trainingSessionId);
        setHintsRemaining(detail.hintsAvailable);
        setStartingFen(detail.fen);
        setBoardFen(detail.fen);
        setStartedAt(Date.now());
        setPhase('playing');
      } catch (error) {
        if (!active) return;
        setPhase('error');
        setErrorMessage(error instanceof Error ? error.message : 'Falha ao carregar a etapa.');
      }
    })();
    return () => {
      active = false;
      stopSpeaking();
    };
  }, [stageId]);

  // The instructor speaks the same message shown in its bubble - only for
  // the states worth narrating, and only once per message (not on every
  // re-render), matching the "fala o que está escrito" request.
  useEffect(() => {
    if (phase === 'loading' || phase === 'error' || phase === 'evaluating') return;
    const message =
      phase === 'solved' && result
        ? `Etapa concluída! ${result.correctFirstTry ? 'Primeira tentativa certa.' : 'Resolvido.'}`
        : INSTRUCTOR_MESSAGE[phase];
    if (message === spokenMessage) return;
    queueMicrotask(() => setSpokenMessage(message));
    void speak(message, { voiceName });
  }, [phase, result, spokenMessage, voiceName]);

  async function playMove(uci: string) {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token || !exercise || phase !== 'playing' || viewingAt !== null) return;

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
        setAttemptCount((current) => current + 1);
        setPhase('incorrect');
        setTimeout(() => {
          setBoardFen(startingFen);
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
      setAttemptCount((current) => current + 1);
      setScore(evaluation.attempt?.score ?? null);
      setElapsedMs(Date.now() - startedAt);
      const [completion, levelDetail] = await Promise.all([
        api.completeLearningStage(stageId, token),
        api.getLearningLevel(levelId, token),
      ]);
      setResult(completion);
      setLevel(levelDetail);
      setPhase('solved');
    } catch (error) {
      setPhase('error');
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao avaliar a jogada.');
    }
  }

  async function requestHint() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token || hintsRemaining <= 0) return;
    try {
      const revealed = await api.revealExerciseHint(trainingSessionId, token);
      setHints((current) => [...current, revealed.hint]);
      setHintsRemaining(revealed.remaining);
      void speak(revealed.hint, { voiceName });
    } catch {
      // A failed hint request isn't worth interrupting the exercise for -
      // the button simply stays available to try again.
    }
  }

  function goToMove(index: number) {
    const clamped = Math.max(0, Math.min(index, playedMoves.length));
    setViewingAt(clamped === playedMoves.length ? null : clamped);
  }

  function repeatStage() {
    setBoardFen(startingFen);
    setPlayedMoves([]);
    setViewingAt(null);
    setHints([]);
    setAttemptCount(0);
    setScore(null);
    setResult(null);
    setStartedAt(Date.now());
    setSpokenMessage('');
    setPhase('playing');
  }

  function goToNextStage() {
    const currentPosition = level?.stages.find((stage) => stage.id === stageId)?.position;
    const next =
      currentPosition !== undefined
        ? level?.stages.find((stage) => stage.position === currentPosition + 1)
        : undefined;
    router.push(next ? `/app/treinamento/etapa/${next.id}` : '/app/treinamento');
  }

  const displayedFen =
    viewingAt !== null ? fenAfter(startingFen, playedMoves, viewingAt) : boardFen;

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

  const progressPercent = level
    ? Math.round((level.completedStageCount / level.stageCount) * 100)
    : 0;

  return (
    <main className="stageRunnerPage">
      <header className="pageHeader">
        <Link href="/app/treinamento">← Sair</Link>
      </header>
      <div className="instructorBubble" role="status">
        <span aria-hidden="true" className="instructorAvatar">
          ♞
        </span>
        <p>
          {viewingAt !== null
            ? 'Revisando um lance anterior.'
            : phase === 'solved' && result
              ? `Etapa concluída! ${result.correctFirstTry ? 'Primeira tentativa certa!' : 'Resolvido.'}`
              : INSTRUCTOR_MESSAGE[phase]}
        </p>
      </div>
      {hints.length > 0 ? (
        <ul className="stageHintList">
          {hints.map((hint, index) => (
            <li key={index}>💡 {hint}</li>
          ))}
        </ul>
      ) : null}
      {exercise ? (
        <div className="stageBoardArea">
          <ChessBoard
            disabled={phase !== 'playing' || viewingAt !== null}
            fen={displayedFen}
            onMove={(uci) => void playMove(uci)}
            orientation="white"
            pieceTheme={pieceTheme}
          />
        </div>
      ) : null}
      {playedMoves.length > 0 && phase !== 'solved' ? (
        <div className="stageMoveNav">
          <button
            disabled={(viewingAt ?? playedMoves.length) <= 0}
            onClick={() => goToMove((viewingAt ?? playedMoves.length) - 1)}
            type="button"
          >
            ← Lance anterior
          </button>
          <button
            disabled={viewingAt === null}
            onClick={() => goToMove(playedMoves.length)}
            type="button"
          >
            Lance atual →
          </button>
        </div>
      ) : null}
      {phase === 'playing' && hintsRemaining > 0 ? (
        <button className="secondaryButton" onClick={() => void requestHint()} type="button">
          💡 Pedir dica ({hintsRemaining})
        </button>
      ) : null}
      {phase === 'solved' && result ? (
        <section className="stageCompletionCard">
          <div className="stageCompletionStats">
            <span>{score !== null ? `${score} pontos` : '—'}</span>
            <span>
              {formatElapsed(elapsedMs)} · {attemptCount}{' '}
              {attemptCount === 1 ? 'tentativa' : 'tentativas'}
            </span>
          </div>
          <div className="stageCompletionProgress">
            <div className="stageCompletionProgressTrack">
              <div
                className="stageCompletionProgressFill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span>{level ? `Nível ${level.position}` : ''}</span>
          </div>
          <div className="stageCompletionActions">
            <button onClick={() => goToMove(0)} type="button">
              Analisar
            </button>
            <button className="stageCompletionPrimary" onClick={goToNextStage} type="button">
              Próximo
            </button>
            <button onClick={repeatStage} type="button">
              Repetir
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
