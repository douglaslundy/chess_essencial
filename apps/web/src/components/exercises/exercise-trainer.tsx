'use client';

import type {
  ExerciseMetrics,
  ExerciseSearchResult,
  ExerciseSolution,
  ExerciseTrainingView,
} from '@xadrez/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';

import { ChessBoard } from '@/components/game/chess-board';
import {
  MoveAnnouncement,
  describeImportantMove,
  type Announcement,
} from '@/components/game/move-announcement';
import { api } from '@/lib/api/client';
import { usePieceTheme } from '@/lib/piece-theme';
import { playCaptureSound, playMoveSound, primeAudio } from '@/lib/sound';

import styles from './exercise-trainer.module.css';
import { guidedChallengeLine } from './guided-challenge-lines';

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

type ExerciseSource = 'all' | 'classic' | 'book';

interface ExerciseTrainerProps {
  description?: string;
  guided?: boolean;
  initialDifficulty?: string;
  initialQuery?: string;
  positionType?: 'legal_position' | 'illustrative_diagram' | 'text_only';
  showSourceFilter?: boolean;
  storageKey?: string;
  title?: string;
}

export function ExerciseTrainer({
  description = 'Busque por tema e módulo; as respostas são avaliadas e persistidas pelo servidor.',
  guided = false,
  initialDifficulty = '',
  initialQuery = '',
  positionType,
  showSourceFilter = false,
  storageKey = 'xadrez.challenge_training_session',
  title = 'Exercícios de Xadrez Essencial',
}: ExerciseTrainerProps = {}) {
  const [category, setCategory] = useState('');
  const { theme: pieceTheme } = usePieceTheme();
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [moduleNumber, setModuleNumber] = useState('');
  const [query, setQuery] = useState(initialQuery);
  const [source, setSource] = useState<ExerciseSource>('all');
  const [result, setResult] = useState(emptySearch);
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [training, setTraining] = useState<ExerciseTrainingView | null>(null);
  const [line, setLine] = useState('');
  const [hint, setHint] = useState('');
  const [solution, setSolution] = useState<ExerciseSolution | null>(null);
  const [message, setMessage] = useState('Carregando exercícios…');
  const [startedAt, setStartedAt] = useState(0);
  const [boardLocked, setBoardLocked] = useState(false);
  const [showRetryBanner, setShowRetryBanner] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const autoStarted = useRef(false);
  const opponentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    (overrides?: { source?: ExerciseSource }) => {
      const value = new URLSearchParams();
      if (query.trim()) value.set('q', query.trim());
      if (category.trim()) value.set('category', category.trim());
      if (difficulty) value.set('difficulty', difficulty);
      if (moduleNumber) value.set('module', moduleNumber);
      if (positionType) value.set('positionType', positionType);
      const effectiveSource = overrides?.source ?? source;
      if (effectiveSource !== 'all') value.set('source', effectiveSource);
      return value;
    },
    [category, difficulty, moduleNumber, positionType, query, source],
  );

  function resetAttemptUi() {
    setBoardHistory(null);
    setHint('');
    setSolution(null);
    setStartedAt(Date.now());
    setBoardLocked(false);
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
    async (overrides?: { source?: ExerciseSource }) => {
      const accessToken = token();
      if (!accessToken) return;
      const search = filters(overrides);
      const parsedModule = search.get('module');
      try {
        const value = await api.startExerciseTraining(
          {
            filters: {
              ...(search.get('category') ? { category: search.get('category')! } : {}),
              ...(search.get('difficulty') ? { difficulty: search.get('difficulty')! } : {}),
              limit: 10,
              ...(parsedModule ? { module: Number(parsedModule) } : {}),
              ...(search.get('q') ? { q: search.get('q')! } : {}),
              ...(search.get('positionType')
                ? {
                    positionType: search.get('positionType') as
                      'legal_position' | 'illustrative_diagram' | 'text_only',
                  }
                : {}),
              ...(search.get('source')
                ? { source: search.get('source') as 'classic' | 'book' }
                : {}),
            },
          },
          accessToken,
        );
        setTraining(value);
        if (guided) {
          window.localStorage.setItem(storageKey, value.sessionId);
        }
        resetAttemptUi();
        setShowRetryBanner(false);
        setMessage(
          value.total ? 'Treino iniciado.' : 'Nenhum exercício disponível para este treino.',
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Falha ao iniciar treino.');
      }
    },
    [filters, guided, storageKey],
  );

  useEffect(() => {
    if (!guided || autoStarted.current) return;
    autoStarted.current = true;
    queueMicrotask(() => {
      void (async () => {
        const accessToken = token();
        const savedSession = window.localStorage.getItem(storageKey);
        if (accessToken && savedSession) {
          try {
            const saved = await api.getExerciseTraining(savedSession, accessToken);
            setTraining(saved);
            setStartedAt(Date.now());
            setMessage(
              saved.status === 'completed'
                ? 'Parabéns! Você concluiu todos os desafios.'
                : 'Continuando do último desafio liberado.',
            );
            return;
          } catch {
            window.localStorage.removeItem(storageKey);
          }
        }
        await startTraining();
      })();
    });
  }, [guided, startTraining, storageKey]);

  function selectSource(next: ExerciseSource) {
    setSource(next);
    void startTraining({ source: next });
  }

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

  async function submit(submittedMoves?: string[]) {
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
        },
        accessToken,
      );
      setTraining(attempt.training);
      resetAttemptUi();
      setLine('');
      setShowRetryBanner(!attempt.correct);
      setAnnouncement({
        key: `attempt-${Date.now()}`,
        text: attempt.correct ? 'Você conseguiu!' : 'Essa não era a jogada certa.',
        tone: attempt.correct ? 'success' : 'danger',
      });
      setMessage(
        attempt.correct
          ? attempt.training?.status === 'completed'
            ? 'Parabéns! Você concluiu todos os desafios.'
            : `Correto. Próximo desafio liberado. Pontuação: ${attempt.score}.`
          : 'Ainda não. Esse não era o lance certo.',
      );
      if (!guided) setMetrics(await api.getExerciseMetrics(accessToken));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao avaliar tentativa.');
    }
  }

  const current = training?.currentExercise;
  const hasGuidedLine = guided && current ? Boolean(guidedChallengeLine(current.id)) : false;
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
    setShowRetryBanner(false);
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
      if (described) setAnnouncement({ ...described, key: `${current.id}-${Date.now()}` });
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

      if (guided) {
        const expected = guidedChallengeLine(current.id);
        if (expected) {
          if (canonical !== expected[moves.length - 1]) {
            setBoardLocked(true);
            setMessage('Esse não é o lance esperado. Avaliando para você tentar novamente…');
            void submit(moves);
            return;
          }
          const opponentMove = expected[moves.length];
          if (!opponentMove) {
            setBoardLocked(true);
            setMessage('Lance correto. Liberando o próximo desafio…');
            void submit(moves);
            return;
          }

          setBoardLocked(true);
          setMessage('Boa jogada. O adversário está respondendo…');
          opponentTimer.current = setTimeout(() => {
            try {
              const replyPosition = new Chess(chess.fen());
              const reply = replyPosition.move(uciToChessMove(opponentMove));
              const replyUci = moveToUci(reply);
              const repliedMoves = [...moves, replyUci];
              setBoardHistory({
                exerciseId: current.id,
                index: repliedMoves.length,
                moves: repliedMoves,
                positions: [...positions, replyPosition.fen()],
              });
              setLine(repliedMoves.join(' '));
              if (repliedMoves.length === expected.length) void submit(repliedMoves);
              else {
                setBoardLocked(false);
                setMessage('O adversário respondeu. Agora é sua vez.');
              }
            } catch {
              setBoardLocked(false);
              setMessage('Não foi possível reproduzir a resposta automática.');
            }
          }, 450);
        } else if (current.answerFormat === 'move_sequence') {
          setMessage('Lance registrado. Toque em Confirmar quando terminar a sequência.');
        }
      }
    } catch {
      setMessage('Esse lance não é permitido nesta posição.');
    }
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
  return (
    <main className={`${styles.page} ${guided ? styles.guidedPage : ''}`}>
      <header className={styles.heading}>
        <span>Treino autoritativo</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

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

      {guided && showSourceFilter ? (
        <div className={styles.sourceFilter} role="group" aria-label="Origem dos exercícios">
          {(
            [
              { label: 'Todos', value: 'all' },
              { label: 'Clássicos', value: 'classic' },
              { label: 'Livro', value: 'book' },
            ] as const
          ).map((option) => (
            <button
              aria-pressed={source === option.value}
              key={option.value}
              onClick={() => selectSource(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
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

      {current ? (
        <section
          className={`${styles.training} ${guided ? styles.guidedTraining : ''}`}
          aria-label="Exercício atual"
        >
          <div className={styles.progress}>
            Exercício {training.position} de {training.total}
          </div>
          <span className={styles.badge}>
            {current.positionType === 'illustrative_diagram'
              ? 'Diagrama ilustrativo'
              : current.positionType === 'text_only'
                ? 'Exercício textual'
                : 'Posição legal'}
          </span>
          <h2>{current.title ?? `Exercício ${current.sourceNumber ?? ''}`}</h2>
          <p>{current.promptMd}</p>
          {boardFen ? (
            <div className={styles.boardArea}>
              <ChessBoard
                disabled={
                  current.positionType !== 'legal_position' ||
                  boardLocked ||
                  Boolean(boardHistory && boardHistory.index < boardHistory.moves.length)
                }
                fen={boardFen}
                onMove={playBoardMove}
                orientation="white"
                pieceTheme={pieceTheme}
              />
              {current.positionType === 'legal_position' ? (
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
                </div>
              ) : null}
              {!guided ? (
                <details>
                  <summary>Ver posição FEN</summary>
                  <code className={styles.fen}>{current.fen}</code>
                </details>
              ) : null}
            </div>
          ) : (
            <p className={styles.textOnlyNotice}>
              Este exercício do livro não contém uma posição de tabuleiro associada.
            </p>
          )}
          {guided && hasGuidedLine && showRetryBanner ? (
            <aside className={styles.incorrectFeedback}>
              <span>Esse não era o lance certo.</span>
              <button onClick={() => setShowRetryBanner(false)} type="button">
                ↻ Tentar novamente
              </button>
            </aside>
          ) : null}
          {hint ? (
            <aside className={styles.feedback}>
              <strong>Dica:</strong> {hint}
            </aside>
          ) : null}
          {solution ? (
            <aside className={styles.feedback}>
              <strong>Solução:</strong> {solution.solutionMd}
            </aside>
          ) : null}
          {!guided || !hasGuidedLine ? (
            <label className={styles.answer}>
              {current.answerFormat === 'free_text'
                ? 'Resposta'
                : 'Linha em UCI, separada por espaços'}
              <input
                placeholder={
                  current.answerFormat === 'free_text' ? 'Digite sua resposta' : 'e2e4 e7e5'
                }
                onChange={(event) => setLine(event.target.value)}
                value={line}
              />
            </label>
          ) : null}
          <div className={styles.actions}>
            {!guided || !hasGuidedLine ? (
              <button className={styles.primaryAction} onClick={() => void submit()} type="button">
                {guided ? 'Confirmar resposta' : 'Enviar tentativa'}
              </button>
            ) : null}
            <button className={styles.secondaryAction} onClick={revealHint} type="button">
              Pedir dica
            </button>
            {!guided ? (
              <button className={styles.secondaryAction} onClick={revealSolution} type="button">
                Ver solução
              </button>
            ) : null}
          </div>
        </section>
      ) : training?.status === 'completed' ? (
        <section className={styles.training}>
          <h2>Treino concluído</h2>
          <p>{training.completed} exercícios registrados.</p>
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
    </main>
  );
}
