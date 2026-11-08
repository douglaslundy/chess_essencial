'use client';

import type {
  ExerciseMetrics,
  ExerciseSearchResult,
  ExerciseSolution,
  ExerciseStudyContext,
  ExerciseTheme,
  ExerciseTrainingView,
} from '@xadrez/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useTutorContent } from '@/lib/tutor-store';
import { Chess } from 'chess.js';

import { ChessBoard } from '@/components/game/chess-board';
import { solverOrientation } from '@/components/game/move-path';
import { useStageFullscreen } from '@/components/game/use-stage-fullscreen';
import {
  MoveAnnouncement,
  describeImportantMove,
  type Announcement,
} from '@/components/game/move-announcement';
import { api } from '@/lib/api/client';
import { usePieceTheme } from '@/lib/piece-theme';
import { useEntitlements } from '@/lib/subscriptions/use-entitlements';
import {
  playCaptureSound,
  playDefeatSound,
  playMoveSound,
  playVictorySound,
  primeAudio,
} from '@/lib/sound';

import styles from './exercise-trainer.module.css';
import { nextTheme } from './next-theme';

const emptySearch: ExerciseSearchResult = { items: [], limit: 20, offset: 0, total: 0 };
const emptyMetrics: ExerciseMetrics = {
  accuracyPercent: 0,
  attempted: 0,
  averageDurationMs: 0,
  correct: 0,
  hintsUsed: 0,
};

function uciToChessMove(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci[4] ? { promotion: uci[4] } : {}),
  };
}

function moveToUci(move: { from: string; promotion?: string | undefined; to: string }) {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

type ExerciseSource = 'all' | 'classic' | 'lichess' | 'book';

// Each source/theme combination (Todos/Clássicos/Livro × tema tático) keeps
// its own session so switching tabs and coming back resumes where the
// learner left off, instead of starting a brand-new disposable batch every
// time.
function sessionStorageKey(storageKey: string, src: ExerciseSource, themeTag: string) {
  return `${storageKey}:${src}:${themeTag || 'all'}`;
}

// Theme tags are catalogued as snake_case (e.g. "peca_pendurada"); this is a
// mechanical formatter, not invented copy.
function formatThemeLabel(tag: string) {
  return tag
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface ExerciseTrainerProps {
  description?: string;
  guided?: boolean;
  initialDifficulty?: string;
  initialExerciseId?: string | undefined;
  initialQuery?: string;
  positionType?: 'legal_position' | 'illustrative_diagram' | 'text_only';
  showThemeFilter?: boolean;
  storageKey?: string;
  title?: string;
}

export function ExerciseTrainer({
  description = 'Busque por tema e módulo; as respostas são avaliadas e persistidas pelo servidor.',
  guided = false,
  initialDifficulty = '',
  initialExerciseId,
  initialQuery = '',
  positionType,
  showThemeFilter = false,
  storageKey = 'xadrez.challenge_training_session',
  title = 'Exercícios de Xadrez Essencial',
}: ExerciseTrainerProps = {}) {
  const effectiveStorageKey = initialExerciseId
    ? storageKey + ':recommendation:' + initialExerciseId
    : storageKey;
  const [category, setCategory] = useState('');
  const { theme: pieceTheme } = usePieceTheme();
  const { hasFeature } = useEntitlements();
  const hintsAllowed = hasFeature('hints_per_day');
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [moduleNumber, setModuleNumber] = useState('');
  const [query, setQuery] = useState(initialQuery);
  const [source] = useState<ExerciseSource>('all');
  const [theme, setTheme] = useState('');
  const [themes, setThemes] = useState<ExerciseTheme[]>([]);
  const [result, setResult] = useState(emptySearch);
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [training, setTraining] = useState<ExerciseTrainingView | null>(null);
  const [line, setLine] = useState('');
  const [hint, setHint] = useState('');
  const [solution, setSolution] = useState<ExerciseSolution | null>(null);
  const [message, setMessage] = useState('Carregando exercícios…');
  const [startedAt, setStartedAt] = useState(0);
  const [boardLocked, setBoardLocked] = useState(false);
  const [resultModal, setResultModal] = useState<'won' | 'lost' | null>(null);
  const [playerMoves, setPlayerMoves] = useState<string[]>([]);
  const [study, setStudy] = useState<ExerciseStudyContext | null>(null);
  const [studyOpen, setStudyOpen] = useState(true);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [exerciseHistory, setExerciseHistory] = useState<
    NonNullable<ExerciseTrainingView['currentExercise']>[]
  >([]);
  const [viewingExerciseAt, setViewingExerciseAt] = useState<number | null>(null);
  const previousExerciseRef = useRef<ExerciseTrainingView['currentExercise'] | null>(null);
  const autoStarted = useRef(false);
  const announceSeq = useRef(0);
  const opponentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEvaluationRef = useRef<Parameters<typeof evaluatePlayedLine> | null>(null);
  const [evaluationFailed, setEvaluationFailed] = useState(false);
  // The AI tutor teaches the open exercise: its frame is the move the solver has to find now
  // (the solution alternates the solver's move and the opponent's reply).
  const tutorExerciseId = training?.currentExercise?.id ?? null;
  useTutorContent(
    tutorExerciseId ? { contentId: tutorExerciseId, kind: 'exercise' } : null,
    playerMoves.length * 2 + 1,
  );
  const boardStageRef = useRef<HTMLDivElement>(null);
  const { active: boardFullscreen, toggle: toggleBoardFullscreen } =
    useStageFullscreen(boardStageRef);
  const [boardHistory, setBoardHistory] = useState<{
    exerciseId: string;
    index: number;
    moves: string[];
    positions: string[];
  } | null>(null);

  function token() {
    return window.localStorage.getItem('xadrez.access_token');
  }

  const filters = useCallback(
    (overrides?: { source?: ExerciseSource; theme?: string }) => {
      const value = new URLSearchParams();
      if (query.trim()) value.set('q', query.trim());
      if (category.trim()) value.set('category', category.trim());
      if (difficulty) value.set('difficulty', difficulty);
      if (moduleNumber) value.set('module', moduleNumber);
      if (positionType) value.set('positionType', positionType);
      const effectiveSource = overrides?.source ?? source;
      if (effectiveSource !== 'all') value.set('source', effectiveSource);
      const effectiveTheme = overrides?.theme ?? theme;
      if (effectiveTheme) value.set('theme', effectiveTheme);
      return value;
    },
    [category, difficulty, moduleNumber, positionType, query, source, theme],
  );

  function resetAttemptUi() {
    setBoardHistory(null);
    setHint('');
    setSolution(null);
    setStartedAt(Date.now());
    setBoardLocked(false);
    setPlayerMoves([]);
    setEvaluationFailed(false);
    pendingEvaluationRef.current = null;
  }

  const load = useCallback(async () => {
    if (guided) return;
    const accessToken = token();
    if (!accessToken) return setMessage('Entre na sua conta para acessar os exercícios.');
    try {
      const [exercises, performance] = await Promise.all([
        api.searchExercises(filters(), accessToken),
        api.getExerciseMetrics(accessToken),
      ]);
      setResult(exercises);
      setMetrics(performance);
      setMessage(exercises.total ? '' : 'Nenhum exercício corresponde aos filtros.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar exercícios.');
    }
  }, [filters, guided]);

  useEffect(() => {
    if (!guided) queueMicrotask(load);
  }, [guided, load]);

  const startTraining = useCallback(
    async (overrides?: { source?: ExerciseSource; theme?: string }) => {
      const accessToken = token();
      if (!accessToken) return;
      const effectiveSource = overrides?.source ?? source;
      const effectiveTheme = overrides?.theme ?? theme;
      const search = filters(overrides);
      const parsedModule = search.get('module');
      try {
        const value = await api.startExerciseTraining(
          {
            filters: {
              ...(search.get('category') ? { category: search.get('category')! } : {}),
              ...(search.get('difficulty') ? { difficulty: search.get('difficulty')! } : {}),
              ...(initialExerciseId ? { exerciseId: initialExerciseId } : {}),
              limit: initialExerciseId ? 1 : 10,
              ...(parsedModule ? { module: Number(parsedModule) } : {}),
              ...(search.get('q') ? { q: search.get('q')! } : {}),
              ...(search.get('positionType')
                ? {
                    positionType: search.get('positionType') as
                      'legal_position' | 'illustrative_diagram' | 'text_only',
                  }
                : {}),
              ...(search.get('source')
                ? { source: search.get('source') as 'classic' | 'lichess' | 'book' }
                : {}),
              ...(search.get('theme') ? { theme: search.get('theme')! } : {}),
            },
          },
          accessToken,
        );
        setTraining(value);
        if (guided) {
          window.localStorage.setItem(
            sessionStorageKey(effectiveStorageKey, effectiveSource, effectiveTheme),
            value.sessionId,
          );
        }
        resetAttemptUi();
        setExerciseHistory([]);
        setViewingExerciseAt(null);
        previousExerciseRef.current = null;
        setMessage(value.total ? 'Treino iniciado.' : 'Você já resolveu tudo por aqui!');
        return value;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Falha ao iniciar treino.');
      }
    },
    [effectiveStorageKey, filters, guided, initialExerciseId, source, theme],
  );

  const resumeOrStart = useCallback(
    async (overrides: { source?: ExerciseSource; theme?: string }) => {
      const effectiveSource = overrides.source ?? source;
      const effectiveTheme = overrides.theme ?? theme;
      const accessToken = token();
      const key = sessionStorageKey(effectiveStorageKey, effectiveSource, effectiveTheme);
      const savedSession = accessToken ? window.localStorage.getItem(key) : null;
      if (accessToken && savedSession) {
        try {
          const saved = await api.getExerciseTraining(savedSession, accessToken);
          setTraining(saved);
          resetAttemptUi();
          setExerciseHistory([]);
          setViewingExerciseAt(null);
          previousExerciseRef.current = null;
          setMessage(
            saved.status === 'completed'
              ? 'Parabéns! Você concluiu todos os desafios.'
              : 'Continuando de onde você parou.',
          );
          return;
        } catch {
          window.localStorage.removeItem(key);
        }
      }
      await startTraining(overrides);
    },
    [effectiveStorageKey, startTraining, source, theme],
  );

  useEffect(() => {
    if (!guided || autoStarted.current) return;
    autoStarted.current = true;
    // 'all'/'' match the source/theme states' initial values.
    queueMicrotask(() => void resumeOrStart({ source: 'all', theme: '' }));
  }, [guided, resumeOrStart]);

  useEffect(() => {
    if (!guided || !showThemeFilter) return;
    const accessToken = token();
    if (!accessToken) return;
    let active = true;
    api
      .listChallengeThemes(accessToken)
      .then((value) => {
        if (active) setThemes(value);
      })
      .catch(() => {
        if (active) setThemes([]);
      });
    return () => {
      active = false;
    };
  }, [guided, showThemeFilter]);

  function selectTheme(next: string) {
    setTheme(next);
    void resumeOrStart({ source, theme: next });
  }

  // Desafios: bloco concluído abre o próximo bloco do mesmo tema; tema esgotado (sessão vazia)
  // segue para o próximo tema da lista. Cada sessão é tratada uma vez e cada tema esgotado entra
  // em `exhaustedThemes`, então uma API que só devolve sessões vazias não gera laço.
  const handledSessionRef = useRef<string | null>(null);
  const exhaustedThemes = useRef(new Set<string>());
  useEffect(() => {
    if (!guided || resultModal || training?.status !== 'completed') return;
    if (handledSessionRef.current === training.sessionId) return;
    if (training.total > 0) {
      handledSessionRef.current = training.sessionId;
      queueMicrotask(() => void startTraining());
      return;
    }
    exhaustedThemes.current.add(theme);
    const next = nextTheme(
      themes.map((option) => option.theme),
      theme,
      exhaustedThemes.current,
    );
    // Sem próximo tema (ou lista ainda carregando): fica a mensagem final; reavalia se `themes` chegar.
    if (next === null) return;
    handledSessionRef.current = training.sessionId;
    queueMicrotask(() => {
      setTheme(next);
      void startTraining({ theme: next }).then((value) => {
        if (value?.total) setMessage(`Tema concluído! Seguindo para: ${formatThemeLabel(next)}`);
      });
    });
  }, [guided, resultModal, startTraining, theme, themes, training]);

  useEffect(
    () => () => {
      if (opponentTimer.current) clearTimeout(opponentTimer.current);
    },
    [],
  );

  async function revealHint() {
    const accessToken = token();
    if (!accessToken || !training) return;
    try {
      const value = await api.revealExerciseHint(training.sessionId, accessToken);
      setHint(value.hint);
      setMessage(`Dica ${value.hintNumber} revelada; ${value.remaining} restante(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nenhuma dica disponível.');
    }
  }

  async function revealSolution() {
    const accessToken = token();
    if (!accessToken || !training) return;
    try {
      setSolution(await api.revealExerciseSolution(training.sessionId, accessToken));
      setMessage('Solução revelada e registrada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao revelar solução.');
    }
  }

  async function submit(submittedMoves?: string[], selfAssessedCorrect?: boolean) {
    const accessToken = token();
    const exercise = training?.currentExercise;
    const submittedLine =
      submittedMoves ??
      (exercise?.answerFormat === 'free_text'
        ? [line.trim()].filter(Boolean)
        : line.trim().split(/\s+/).filter(Boolean));
    if (!accessToken || !training || !exercise || submittedLine.length === 0) return;
    try {
      const attempt = await api.submitExerciseAttempt(
        exercise.id,
        {
          durationMs: Math.max(0, Date.now() - startedAt),
          submittedLine,
          trainingSessionId: training.sessionId,
          ...(selfAssessedCorrect !== undefined ? { selfAssessedCorrect } : {}),
        },
        accessToken,
      );
      setTraining(attempt.training);
      resetAttemptUi();
      setLine('');
      primeAudio();
      if (attempt.correct) {
        playVictorySound();
        setResultModal('won');
      } else {
        playDefeatSound();
        setResultModal('lost');
      }
      if (!guided) setMetrics(await api.getExerciseMetrics(accessToken));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao avaliar tentativa.');
    }
  }

  const current = training?.currentExercise;
  const isPlayablePosition =
    guided && current
      ? current.positionType === 'legal_position' && current.answerFormat === 'move_sequence'
      : false;
  // Book/text exercises get a verified study panel (linked lesson text) before
  // the question so the student never answers blind.
  const showsStudy = Boolean(current && current.answerFormat === 'free_text');
  const currentId = current?.id ?? null;

  // Whenever the live exercise actually changes (i.e. the previous one was
  // solved), remember it so the learner can review it with "Anterior".
  useEffect(() => {
    const previous = previousExerciseRef.current;
    if (previous && current && previous.id !== current.id) {
      setExerciseHistory((history) => [...history, previous]);
      setViewingExerciseAt(null);
    }
    previousExerciseRef.current = current ?? null;
  }, [currentId]);

  const viewedHistoryExercise =
    viewingExerciseAt !== null ? exerciseHistory[viewingExerciseAt] : null;
  const displayedExercise = viewedHistoryExercise ?? current;
  const viewingHistory = viewedHistoryExercise !== null;

  function viewPreviousExercise() {
    if (exerciseHistory.length === 0) return;
    setViewingExerciseAt((index) =>
      index === null ? exerciseHistory.length - 1 : Math.max(0, index - 1),
    );
  }

  function viewNextExercise() {
    setViewingExerciseAt((index) => {
      if (index === null) return null;
      if (index + 1 >= exerciseHistory.length) return null;
      return index + 1;
    });
  }
  useEffect(() => {
    let active = true;
    const accessToken = token();
    if (!currentId || !showsStudy || !accessToken) {
      queueMicrotask(() => {
        if (active) setStudy(null);
      });
      return () => {
        active = false;
      };
    }
    queueMicrotask(() => {
      if (active) setStudyOpen(true);
    });
    api
      .getExerciseStudy(currentId, accessToken)
      .then((value) => {
        if (active) setStudy(value);
      })
      .catch(() => {
        if (active) setStudy(null);
      });
    return () => {
      active = false;
    };
  }, [currentId, showsStudy]);

  const boardFen =
    current && boardHistory?.exerciseId === current.id
      ? boardHistory.positions[boardHistory.index]!
      : (current?.fen ?? null);

  function playBoardMove(uci: string) {
    if (
      !boardFen ||
      !current ||
      boardLocked ||
      current.positionType !== 'legal_position' ||
      (boardHistory && boardHistory.index < boardHistory.moves.length)
    )
      return;
    primeAudio();
    try {
      const chess = new Chess(boardFen);
      const move = chess.move(uciToChessMove(uci));
      if (move.captured) playCaptureSound();
      else playMoveSound();
      const described = describeImportantMove({
        san: move.san,
        to: move.to,
        flags: {
          capture: move.isCapture() || move.isEnPassant(),
          castling: move.isKingsideCastle()
            ? 'king_side'
            : move.isQueensideCastle()
              ? 'queen_side'
              : null,
          promotion: move.isPromotion(),
        },
      });
      announceSeq.current += 1;
      if (described) setAnnouncement({ ...described, key: `${current.id}-${announceSeq.current}` });
      const canonical = moveToUci(move);
      const previous =
        boardHistory?.exerciseId === current.id
          ? boardHistory
          : { exerciseId: current.id, index: 0, moves: [], positions: [current.fen!] };
      const moves = [...previous.moves.slice(0, previous.index), canonical];
      const positions = [...previous.positions.slice(0, previous.index + 1), chess.fen()];
      setBoardHistory({ exerciseId: current.id, index: previous.index + 1, moves, positions });
      if (current.answerFormat === 'move_sequence') setLine(moves.join(' '));
      else setMessage('Movimento reproduzido no tabuleiro; responda à pergunta no campo de texto.');

      if (isPlayablePosition && training) {
        const played = [...playerMoves, canonical];
        setPlayerMoves(played);
        setBoardLocked(true);
        setEvaluationFailed(false);
        setMessage('Avaliando sua jogada…');
        pendingEvaluationRef.current = [played, current, chess.fen(), moves, positions];
        void evaluatePlayedLine(played, current, chess.fen(), moves, positions);
      }
    } catch {
      setMessage('Esse lance não é permitido nesta posição.');
    }
  }

  async function evaluatePlayedLine(
    played: string[],
    exercise: NonNullable<typeof current>,
    fenAfterPlayer: string,
    moves: string[],
    positions: string[],
  ) {
    const accessToken = token();
    if (!accessToken || !training) return;
    try {
      const result = await api.evaluateExerciseLine(
        exercise.id,
        { playedMoves: played, trainingSessionId: training.sessionId },
        accessToken,
      );
      if (result.status === 'solved') {
        if (result.attempt?.training) setTraining(result.attempt.training);
        primeAudio();
        playVictorySound();
        setResultModal('won');
        return;
      }
      if (result.status === 'incorrect') {
        primeAudio();
        playDefeatSound();
        setResultModal('lost');
        return;
      }
      // status === 'continue': animate the forced opponent reply, then unlock.
      const opponentMove = result.opponentReply;
      if (!opponentMove) {
        setBoardLocked(false);
        setMessage('Boa jogada. Continue a sequência.');
        return;
      }
      setMessage('Boa jogada. O adversário está respondendo…');
      opponentTimer.current = setTimeout(() => {
        try {
          const replyPosition = new Chess(fenAfterPlayer);
          const reply = replyPosition.move(uciToChessMove(opponentMove));
          if (reply.captured) playCaptureSound();
          else playMoveSound();
          const replyUci = moveToUci(reply);
          const repliedMoves = [...moves, replyUci];
          setBoardHistory({
            exerciseId: exercise.id,
            index: repliedMoves.length,
            moves: repliedMoves,
            positions: [...positions, replyPosition.fen()],
          });
          setLine(repliedMoves.join(' '));
          setBoardLocked(false);
          setMessage('O adversário respondeu. Agora é sua vez.');
        } catch {
          setBoardLocked(false);
          setMessage('Não foi possível reproduzir a resposta automática.');
        }
      }, 450);
    } catch {
      // The browser's own fetch() rejection text ("Load failed", "Failed to
      // fetch") is not a message we ever want to show verbatim; the move
      // itself was fine, only the grading request dropped, so a retry (not
      // a "wrong answer") is the correct recovery.
      setBoardLocked(false);
      setEvaluationFailed(true);
      setMessage('Não foi possível avaliar sua jogada agora. Verifique sua conexão.');
    }
  }

  function retryEvaluation() {
    const pending = pendingEvaluationRef.current;
    if (!pending) return;
    setEvaluationFailed(false);
    setBoardLocked(true);
    setMessage('Avaliando sua jogada…');
    void evaluatePlayedLine(...pending);
  }

  function closeResultModalAndAdvance() {
    setResultModal(null);
    resetAttemptUi();
    if (training?.status === 'completed') {
      setMessage('Parabéns! Você concluiu todos os desafios.');
    } else {
      setMessage('Próximo desafio liberado.');
    }
  }

  function retryCurrentExercise() {
    setResultModal(null);
    resetAttemptUi();
    setMessage('Tente novamente.');
  }

  function moveBoardHistory(offset: -1 | 1) {
    if (!boardHistory || !current || boardHistory.exerciseId !== current.id) return;
    const index = Math.max(0, Math.min(boardHistory.moves.length, boardHistory.index + offset));
    setBoardHistory({ ...boardHistory, index });
    if (current.answerFormat === 'move_sequence') {
      setLine(boardHistory.moves.slice(0, index).join(' '));
    }
    setMessage(
      offset < 0 ? 'Lance desfeito. Você pode repeti-lo.' : 'Lance repetido no tabuleiro.',
    );
  }
  // Only called while an exercise is displayed.
  function renderBoard() {
    if (!displayedExercise) return null;
    return viewingHistory
      ? displayedExercise.fen && (
          <div className={styles.boardArea}>
            <ChessBoard
              disabled
              fen={displayedExercise.fen}
              onMove={() => undefined}
              orientation={solverOrientation(displayedExercise.fen)}
              pieceTheme={pieceTheme}
            />
          </div>
        )
      : boardFen && (
          <div
            className={`${styles.boardArea} boardStage ${boardFullscreen ? 'isFullscreen' : ''}`}
            ref={boardStageRef}
          >
            <ChessBoard
              disabled={
                current!.positionType !== 'legal_position' ||
                boardLocked ||
                Boolean(boardHistory && boardHistory.index < boardHistory.moves.length)
              }
              fen={boardFen}
              onMove={playBoardMove}
              orientation={solverOrientation(current!.fen)}
              pieceTheme={pieceTheme}
            />
            {current!.positionType === 'legal_position' ? (
              <div
                className={styles.boardControls}
                aria-label="Controles do histórico do exercício"
              >
                <button
                  className={styles.secondaryAction}
                  disabled={!boardHistory || boardHistory.index === 0}
                  onClick={() => moveBoardHistory(-1)}
                  type="button"
                >
                  ← Voltar lance
                </button>
                <button
                  className={styles.secondaryAction}
                  disabled={!boardHistory || boardHistory.index >= boardHistory.moves.length}
                  onClick={() => moveBoardHistory(1)}
                  type="button"
                >
                  ↻ Repetir lance
                </button>
                <button
                  aria-label={boardFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                  aria-pressed={boardFullscreen}
                  className={styles.secondaryAction}
                  onClick={toggleBoardFullscreen}
                  title={boardFullscreen ? 'Sair da tela cheia (Esc ou F)' : 'Tela cheia (F)'}
                  type="button"
                >
                  {boardFullscreen ? '✕ Sair' : '⛶ Tela cheia'}
                </button>
              </div>
            ) : null}
            {evaluationFailed ? (
              <button className={styles.primaryAction} onClick={retryEvaluation} type="button">
                🔄 Tentar avaliar novamente
              </button>
            ) : null}
            {!guided ? (
              <details>
                <summary>Ver posição FEN</summary>
                <code className={styles.fen}>{current!.fen}</code>
              </details>
            ) : null}
          </div>
        );
  }
  return (
    <main className={`${styles.page} ${guided ? styles.guidedPage : ''}`}>
      {guided ? (
        <h1 className={styles.visuallyHidden}>{title}</h1>
      ) : (
        <header className={styles.heading}>
          <span>Treino autoritativo</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
      )}

      {!guided ? (
        <section className={styles.metrics} aria-label="Métricas de exercícios">
          <div>
            <strong>{metrics.attempted}</strong>
            <span>Tentativas</span>
          </div>
          <div>
            <strong>{metrics.correct}</strong>
            <span>Corretas</span>
          </div>
          <div>
            <strong>{metrics.accuracyPercent}%</strong>
            <span>Precisão</span>
          </div>
          <div>
            <strong>{metrics.averageDurationMs} ms</strong>
            <span>Tempo médio</span>
          </div>
        </section>
      ) : null}

      {guided && showThemeFilter ? (
        <label className={styles.themeFilter}>
          Tema tático
          <select onChange={(event) => selectTheme(event.target.value)} value={theme}>
            <option value="">Todos os temas</option>
            {themes.map((option) => (
              <option key={option.theme} value={option.theme}>
                {formatThemeLabel(option.theme)} ({option.count})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!guided ? (
        <section className={styles.filters} aria-label="Filtros de exercícios">
          <label>
            Busca
            <input onChange={(event) => setQuery(event.target.value)} value={query} />
          </label>
          <label>
            Categoria
            <input onChange={(event) => setCategory(event.target.value)} value={category} />
          </label>
          <label>
            Dificuldade
            <select onChange={(event) => setDifficulty(event.target.value)} value={difficulty}>
              <option value="">Todas</option>
              <option value="beginner">Iniciante · até 999</option>
              <option value="intermediate">Intermediário · 1000–1399</option>
              <option value="advanced">Avançado · 1400–1799</option>
              <option value="expert">Especialista · 1800+</option>
            </select>
          </label>
          <label>
            Módulo
            <input
              min="1"
              max="10"
              onChange={(event) => setModuleNumber(event.target.value)}
              type="number"
              value={moduleNumber}
            />
          </label>
          <button onClick={load} type="button">
            Buscar
          </button>
          <button onClick={() => void startTraining()} type="button">
            Treinar resultados
          </button>
        </section>
      ) : null}

      <MoveAnnouncement announcement={announcement} />
      <p className={styles.status} role="status">
        {message}
      </p>

      {displayedExercise ? (
        <section
          className={`${styles.training} ${guided ? styles.guidedTraining : ''}`}
          aria-label="Exercício atual"
        >
          <div className={styles.progress}>
            Exercício {training?.position} de {training?.total}
          </div>
          {exerciseHistory.length > 0 ? (
            <div className={styles.exerciseNav}>
              <button
                disabled={viewingHistory ? viewingExerciseAt === 0 : false}
                onClick={viewPreviousExercise}
                type="button"
              >
                ← Exercício anterior
              </button>
              {viewingHistory ? (
                <button onClick={viewNextExercise} type="button">
                  {viewingExerciseAt !== null && viewingExerciseAt + 1 < exerciseHistory.length
                    ? 'Próximo exercício →'
                    : 'Voltar ao atual →'}
                </button>
              ) : null}
            </div>
          ) : null}
          {viewingHistory ? (
            <p className={styles.reviewBanner} role="status">
              Revisando um exercício já resolvido.
            </p>
          ) : null}
          <span className={styles.badge}>
            {displayedExercise.positionType === 'illustrative_diagram'
              ? 'Diagrama ilustrativo'
              : displayedExercise.positionType === 'text_only'
                ? 'Exercício textual'
                : 'Posição legal'}
          </span>
          <h2>{displayedExercise.title ?? `Exercício ${displayedExercise.sourceNumber ?? ''}`}</h2>
          {!viewingHistory &&
          showsStudy &&
          study &&
          (study.teaching.length > 0 || study.sourcePages.length > 0) ? (
            <section className={styles.studyPanel} aria-label="Conteúdo de estudo">
              <button
                aria-expanded={studyOpen}
                className={styles.studyToggle}
                onClick={() => setStudyOpen((value) => !value)}
                type="button"
              >
                <span>📖 Estudo{study.lessonTitle ? `: ${study.lessonTitle}` : ''}</span>
                <span aria-hidden="true">{studyOpen ? '▾' : '▸'}</span>
              </button>
              {studyOpen ? (
                <div className={styles.studyBody}>
                  {study.teaching.map((step, index) => (
                    <div key={index}>
                      {step.title ? <strong>{step.title}</strong> : null}
                      <p>{step.bodyMd}</p>
                    </div>
                  ))}
                  {study.sourcePages.length > 0 ? (
                    <p className={styles.studySource}>
                      Fonte: página{study.sourcePages.length > 1 ? 's' : ''} {study.sourcePages[0]}
                      {study.sourcePages.length > 1
                        ? `–${study.sourcePages[study.sourcePages.length - 1]}`
                        : ''}
                      {study.moduleTitle ? ` · ${study.moduleTitle}` : ''}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
          <p>{displayedExercise.promptMd}</p>
          {!guided ? renderBoard() : null}
          {!viewingHistory && !boardFen ? (
            <p className={styles.textOnlyNotice}>
              Este exercício do livro não contém uma posição de tabuleiro associada.
            </p>
          ) : null}
          {!viewingHistory && hint ? (
            <aside className={styles.feedback}>
              <strong>Dica:</strong> {hint}
            </aside>
          ) : null}
          {!viewingHistory && solution ? (
            <aside className={styles.feedback}>
              <strong>
                {displayedExercise.answerFormat === 'free_text' ? 'Resposta do livro:' : 'Solução:'}
              </strong>{' '}
              {solution.solutionMd}
              {displayedExercise.answerFormat === 'free_text' ? (
                <p>Compare com o que você escreveu e diga se acertou a ideia.</p>
              ) : null}
            </aside>
          ) : null}
          {!viewingHistory && (!guided || !isPlayablePosition) ? (
            <label className={styles.answer}>
              {displayedExercise.answerFormat === 'free_text'
                ? 'Sua resposta'
                : 'Linha em UCI, separada por espaços'}
              <input
                disabled={Boolean(solution) && displayedExercise.answerFormat === 'free_text'}
                placeholder={
                  displayedExercise.answerFormat === 'free_text'
                    ? 'Escreva sua resposta antes de ver o gabarito'
                    : 'e2e4 e7e5'
                }
                onChange={(event) => setLine(event.target.value)}
                value={line}
              />
            </label>
          ) : null}
          {!viewingHistory ? (
            <div className={styles.actions}>
              {displayedExercise.answerFormat === 'free_text' ? (
                solution ? (
                  <>
                    <button
                      className={styles.primaryAction}
                      onClick={() => void submit(undefined, true)}
                      type="button"
                    >
                      Acertei
                    </button>
                    <button
                      className={styles.secondaryAction}
                      onClick={() => void submit(undefined, false)}
                      type="button"
                    >
                      Preciso revisar
                    </button>
                  </>
                ) : (
                  <button
                    className={styles.primaryAction}
                    disabled={!line.trim()}
                    onClick={revealSolution}
                    type="button"
                  >
                    Ver resposta do livro
                  </button>
                )
              ) : !guided || !isPlayablePosition ? (
                <button
                  className={styles.primaryAction}
                  onClick={() => void submit()}
                  type="button"
                >
                  {guided ? 'Confirmar resposta' : 'Enviar tentativa'}
                </button>
              ) : null}
              {displayedExercise.hintsAvailable > 0 && hintsAllowed ? (
                <button className={styles.secondaryAction} onClick={revealHint} type="button">
                  Pedir dica
                </button>
              ) : null}
              {!guided && displayedExercise.answerFormat !== 'free_text' ? (
                <button className={styles.secondaryAction} onClick={revealSolution} type="button">
                  Ver solução
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {displayedExercise && guided ? renderBoard() : null}
      {displayedExercise ? null : training?.status === 'completed' && training.total === 0 ? (
        <section className={styles.training}>
          <h2>Você já resolveu tudo por aqui!</h2>
          <p>
            Não há mais desafios novos disponíveis com esses filtros agora — você já acertou todos.
            Volte mais tarde para novidades.
          </p>
        </section>
      ) : training?.status === 'completed' ? (
        <section className={styles.training}>
          <h2>Treino concluído</h2>
          <p>{training.completed} exercícios registrados.</p>
          <button
            className={styles.primaryAction}
            onClick={() => void startTraining()}
            type="button"
          >
            Próximo desafio →
          </button>
        </section>
      ) : null}

      {!guided ? (
        <section className={styles.results} aria-label="Resultados da busca">
          <h2>{result.total} exercício(s) encontrado(s)</h2>
          <div className={styles.grid}>
            {result.items.map((exercise) => (
              <article key={exercise.id}>
                <span>{exercise.category ?? 'Sem categoria'}</span>
                <h3>{exercise.title ?? `Exercício ${exercise.sourceNumber ?? ''}`}</h3>
                <p>{exercise.promptMd}</p>
                <small>
                  Módulo {exercise.moduleNumber ?? '—'} ·{' '}
                  {exercise.positionType === 'legal_position'
                    ? 'posição legal'
                    : exercise.positionType === 'text_only'
                      ? 'texto'
                      : 'diagrama'}
                </small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {resultModal ? (
        <div className={styles.resultOverlay} role="presentation">
          <div
            className={`${styles.resultDialog} ${
              resultModal === 'won' ? styles.resultWon : styles.resultLost
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="exercise-result-title"
          >
            <h2 id="exercise-result-title">
              {resultModal === 'won' ? 'Você venceu!' : 'Não foi dessa vez'}
            </h2>
            <p>
              {resultModal === 'won'
                ? 'Exercício resolvido corretamente.'
                : 'Esse não era o lance certo. Estude a posição e tente de novo.'}
            </p>
            <div className={styles.resultActions}>
              {resultModal === 'lost' ? (
                <button
                  className={styles.primaryAction}
                  onClick={retryCurrentExercise}
                  type="button"
                >
                  ↻ Tentar novamente
                </button>
              ) : null}
              <button
                className={styles.secondaryAction}
                onClick={closeResultModalAndAdvance}
                type="button"
              >
                Próximo exercício →
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
