'use client';

import type {
  CompleteLearningStageResult,
  ExerciseSummary,
  LearningLevelDetail,
  StartLearningStageResult,
} from '@xadrez/contracts';
import { Chess } from 'chess.js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ChessBoard } from '@/components/game/chess-board';
import { solverOrientation } from '@/components/game/move-path';
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

type Phase = 'loading' | 'restarting' | 'playing' | 'evaluating' | 'incorrect' | 'solved' | 'error';
type StageKind = 'exercise' | 'lesson';

interface LessonStageInfo {
  lessonId: string;
  title: string;
}

const INSTRUCTOR_MESSAGE: Record<Phase, string> = {
  error: 'Não consegui carregar esta etapa.',
  evaluating: 'Avaliando sua jogada…',
  incorrect: 'Essa não é a melhor jogada aqui. Observe a posição de novo e tente outra vez.',
  loading: 'Preparando a etapa…',
  playing: 'Encontre a melhor jogada para a posição abaixo.',
  restarting: 'Preparando um novo tabuleiro…',
  solved: 'Muito bem! Você encontrou a ideia certa.',
};

export function StageRunner({ stageId }: { stageId: string }) {
  const router = useRouter();
  const { theme: pieceTheme } = usePieceTheme();
  const { voiceName } = useVoicePreference();
  const [stageKind, setStageKind] = useState<StageKind>('exercise');
  const [exercise, setExercise] = useState<ExerciseSummary | null>(null);
  const [lessonInfo, setLessonInfo] = useState<LessonStageInfo | null>(null);
  const [lessonMessage, setLessonMessage] = useState('');
  const [levelId, setLevelId] = useState('');
  const [level, setLevel] = useState<LearningLevelDetail | null>(null);
  const [trainingSessionId, setTrainingSessionId] = useState('');
  const [boardFen, setBoardFen] = useState('');
  const [startingFen, setStartingFen] = useState('');
  // playedMoves is the full alternating sequence (player + opponent
  // replies), needed to replay/display board history correctly. The
  // backend's evaluate-line() only ever expects the PLAYER's own moves —
  // sending it playedMoves (with opponent replies folded in) made every
  // multi-move exercise unsolvable, since a legitimate player move would
  // never match once an opponent reply got mixed into the sequence sent
  // back. playerMoves tracks that narrower list separately.
  const [playedMoves, setPlayedMoves] = useState<string[]>([]);
  const [playerMoves, setPlayerMoves] = useState<string[]>([]);
  const [viewingAt, setViewingAt] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<CompleteLearningStageResult | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [hintsRemaining, setHintsRemaining] = useState(0);
  const [spokenMessage, setSpokenMessage] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [score, setScore] = useState<number | null>(null);

  const instructorMessage =
    viewingAt !== null
      ? 'Revisando um lance anterior.'
      : phase === 'solved' && result
        ? `Etapa concluída! ${result.correctFirstTry ? 'Primeira tentativa certa!' : 'Resolvido.'}`
        : stageKind === 'lesson' && phase === 'playing'
          ? `Esta etapa é uma aula: ${lessonInfo?.title ?? ''}. Termine-a e volte aqui para concluir a etapa.`
          : INSTRUCTOR_MESSAGE[phase];

  // Shared by the initial load and by repeatStage() — both need to apply a
  // fresh StartLearningStageResult (levelId + either a lesson or a live
  // exercise/session) onto the same set of board/lesson state.
  async function applyStart(start: StartLearningStageResult, token: string) {
    setLevelId(start.levelId);
    if (start.type === 'lesson') {
      const overview = await api.getLesson(start.lessonId, token);
      setStageKind('lesson');
      setLessonInfo({ lessonId: start.lessonId, title: overview.title });
      setStartedAt(Date.now());
      setPhase('playing');
      return;
    }
    const detail = await api.getExerciseById(start.exerciseId, token);
    if (!detail.fen || detail.positionType !== 'legal_position') {
      setPhase('error');
      setErrorMessage('Esta etapa ainda não tem um tabuleiro jogável.');
      return;
    }
    setStageKind('exercise');
    setExercise(detail);
    setTrainingSessionId(start.trainingSessionId);
    setHints([]);
    setHintsRemaining(detail.hintsAvailable);
    setStartingFen(detail.fen);
    setBoardFen(detail.fen);
    setPlayedMoves([]);
    setPlayerMoves([]);
    setViewingAt(null);
    setAttemptCount(0);
    setScore(null);
    setResult(null);
    setStartedAt(Date.now());
    setPhase('playing');
  }

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
        if (!active) return;
        await applyStart(start, token);
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
    if (instructorMessage === spokenMessage) return;
    queueMicrotask(() => setSpokenMessage(instructorMessage));
    void speak(instructorMessage, { voiceName })
      .then(() => setSpeechError(''))
      .catch((error: unknown) =>
        setSpeechError(
          error instanceof Error
            ? error.message
            : 'Não foi possível reproduzir a voz do Treinador.',
        ),
      );
  }, [phase, instructorMessage, spokenMessage, voiceName]);

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
    const nextPlayerMoves = [...playerMoves, uci];
    const nextFen = chess.fen();
    setBoardFen(nextFen);
    setPlayedMoves(nextMoves);
    setPlayerMoves(nextPlayerMoves);
    setPhase('evaluating');

    try {
      const evaluation = await api.evaluateExerciseLine(
        exercise.id,
        { playedMoves: nextPlayerMoves, trainingSessionId },
        token,
      );
      if (evaluation.status === 'incorrect') {
        setAttemptCount((current) => current + 1);
        setPhase('incorrect');
        setTimeout(() => {
          setBoardFen(startingFen);
          setPlayedMoves([]);
          setPlayerMoves([]);
          setPhase('playing');
        }, 1500);
        return;
      }
      if (evaluation.status === 'continue') {
        if (evaluation.opponentReply) {
          const replyChess = new Chess(nextFen);
          replyChess.move(uciToChessMove(evaluation.opponentReply));
          setBoardFen(replyChess.fen());
          // Only the full display sequence gets the opponent's reply —
          // playerMoves (sent to evaluate-line) never does.
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

  async function completeLessonStage() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    setLessonMessage('');
    setPhase('evaluating');
    try {
      setElapsedMs(Date.now() - startedAt);
      const [completion, levelDetail] = await Promise.all([
        api.completeLearningStage(stageId, token),
        api.getLearningLevel(levelId, token),
      ]);
      setAttemptCount(1);
      setResult(completion);
      setLevel(levelDetail);
      setPhase('solved');
    } catch (error) {
      // Most likely: the lesson itself isn't finished yet - stay on the
      // lesson screen instead of the full-page error state so the "Ir para
      // a aula" link remains available.
      setPhase('playing');
      setLessonMessage(
        error instanceof Error ? error.message : 'Ainda não foi possível concluir a etapa.',
      );
    }
  }

  async function requestHint() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token || hintsRemaining <= 0) return;
    try {
      const revealed = await api.revealExerciseHint(trainingSessionId, token);
      setHints((current) => [...current, revealed.hint]);
      setHintsRemaining(revealed.remaining);
      void speak(revealed.hint, { voiceName }).catch((error: unknown) =>
        setSpeechError(
          error instanceof Error
            ? error.message
            : 'Não foi possível reproduzir a voz do Treinador.',
        ),
      );
    } catch {
      // A failed hint request isn't worth interrupting the exercise for -
      // the button simply stays available to try again.
    }
  }

  function goToMove(index: number) {
    const clamped = Math.max(0, Math.min(index, playedMoves.length));
    setViewingAt(clamped === playedMoves.length ? null : clamped);
  }

  // Re-plays this stage from a fresh training session — not just a local
  // state reset. The original session was single-item and already got
  // consumed by solving it once (evaluate-line/attempt() advance it past
  // its only item), so reusing it for a second attempt always failed with
  // "Exercício não é o atual nesta sessão de treino" the moment a move was
  // played. startLearningStage() issues a brand-new disposable session for
  // an already-completed stage instead of the exhausted one.
  async function repeatStage() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    setLessonMessage('');
    setSpokenMessage('');
    setPhase('restarting');
    try {
      const start = await api.startLearningStage(stageId, token);
      await applyStart(start, token);
    } catch (error) {
      setPhase('error');
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao reiniciar a etapa.');
    }
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
        <p>{instructorMessage}</p>
      </div>
      {speechError ? (
        <p className="status" role="alert">
          {speechError}
        </p>
      ) : null}
      {stageKind === 'lesson' && lessonInfo && phase !== 'solved' ? (
        <div className="stageLessonArea">
          <Link className="primaryButton" href={`/app/aula/${lessonInfo.lessonId}`}>
            📖 Ir para a aula
          </Link>
          <button onClick={() => void completeLessonStage()} type="button">
            Concluir etapa
          </button>
          {lessonMessage ? (
            <p className="status" role="status">
              {lessonMessage}
            </p>
          ) : null}
        </div>
      ) : null}
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
            orientation={solverOrientation(startingFen)}
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
          {result.newBadges.length > 0 ? (
            <p className="stageCompletionBadge" role="status">
              {result.newBadges.map((badge) => `🏆 Nova conquista: ${badge.label}`).join(' · ')}
            </p>
          ) : null}
          <div className="stageCompletionStats">
            <span>
              {score !== null ? `${score} pontos` : '—'}
              {result.xpAwarded > 0 ? ` · +${result.xpAwarded} XP` : ''}
            </span>
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
            {stageKind === 'lesson' && lessonInfo ? (
              <Link href={`/app/aula/${lessonInfo.lessonId}`}>Rever aula</Link>
            ) : null}
            <button className="stageCompletionPrimary" onClick={goToNextStage} type="button">
              Próximo
            </button>
            <button onClick={() => void repeatStage()} type="button">
              Repetir
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
