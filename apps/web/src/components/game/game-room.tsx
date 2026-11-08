'use client';

import type { MoveQualityResult } from '@xadrez/chess-domain';
import type { GameMove, GameState } from '@xadrez/contracts';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChessBoard, type BoardOrientation } from './chess-board';
import { GameResultDialog, type GameResult } from './game-result-dialog';
import { MoveAnnouncement, describeImportantMove, type Announcement } from './move-announcement';
import { useStageFullscreen } from './use-stage-fullscreen';
import { CoachCallout } from '@/components/coach/coach-callout';
import { formatCoachExplanation, formatCoachWarning } from '@/components/coach/coach-explanation';
import { explainMove, moveQualityLabel } from '@/components/history/move-narration';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { api, getRealtimeAccessToken, getStoredUserId } from '@/lib/api/client';
import { useCoachEngine } from '@/lib/engine/use-coach-engine';
import { useOpponentReview } from '@/lib/engine/use-opponent-review';
import { speakableSquares, toBrazilianSan } from '@/lib/notation';
import { usePieceTheme } from '@/lib/piece-theme';
import { GameSocket } from '@/lib/realtime/game-socket';
import { speak, stopSpeaking } from '@/lib/speech';
import { useVoicePreference } from '@/lib/voice-preference';
import {
  isSoundMuted,
  playCaptureSound,
  playDefeatSound,
  playMoveSound,
  playVictorySound,
  primeAudio,
  setSoundMuted,
} from '@/lib/sound';
import { randomUUID } from '@/lib/uuid';

const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Clocks at or above 7 days belong to the untimed ("Sem tempo") control and
// render as an infinity glyph instead of a huge countdown.
const UNTIMED_CLOCK_THRESHOLD_MS = 604_800_000;

export function formatClock(milliseconds: number) {
  if (milliseconds >= UNTIMED_CLOCK_THRESHOLD_MS) return '∞';
  const safe = Math.max(0, milliseconds);
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const terminationLabels: Record<GameState['termination'], string> = {
  admin: 'por decisão administrativa',
  abandonment: 'por abandono',
  agreement: 'por acordo mútuo',
  checkmate: 'por xeque-mate',
  fifty_move: 'pela regra dos 50 lances',
  insufficient_material: 'por material insuficiente',
  none: '',
  repetition: 'por repetição de posição',
  resignation: 'por desistência',
  stalemate: 'por afogamento',
  timeout: 'por tempo esgotado',
};

const pieceNames: Record<PieceSymbol, string> = {
  b: 'bispo',
  k: 'rei',
  n: 'cavalo',
  p: 'peão',
  q: 'dama',
  r: 'torre',
};

export function formatMove(move: GameMove) {
  let pieceType: PieceSymbol | undefined;
  if (move.fenBefore) {
    try {
      pieceType = new Chess(move.fenBefore).get(move.from as Square)?.type;
    } catch {
      // Legacy records may lack a valid FEN; SAN remains a display-only fallback.
    }
  }
  pieceType ??=
    ({ B: 'b', C: 'n', D: 'q', K: 'k', N: 'n', Q: 'q', R: 'r', T: 'r' } as const)[
      move.san.charAt(0) as 'B' | 'C' | 'D' | 'K' | 'N' | 'Q' | 'R' | 'T'
    ] ?? 'p';
  return `${toBrazilianSan(move.san)} · ${pieceNames[pieceType]} ${move.from}→${move.to}`;
}

export function shouldCoachTurn(input: {
  assistedColor: BoardOrientation | null;
  coachMode: boolean;
  connection: 'demo' | 'connecting' | 'online' | 'reconnecting' | 'offline';
  isDemo: boolean;
  myColor: BoardOrientation | null;
  sideToMove: BoardOrientation;
  status: GameState['status'];
}): boolean {
  if (input.status !== 'active') return false;
  if (input.isDemo) {
    return input.assistedColor !== null && input.sideToMove === input.assistedColor;
  }
  return (
    input.coachMode &&
    input.connection === 'online' &&
    input.myColor !== null &&
    input.sideToMove === input.myColor
  );
}

export function shouldSuggestCoachMove(input: {
  coachMode: boolean;
  isDemo: boolean;
  preferenceEnabled: boolean;
}): boolean {
  return input.isDemo || input.coachMode || input.preferenceEnabled;
}

export function gameOutcomeFor(
  result: GameState['result'],
  myColor: 'white' | 'black',
): 'win' | 'loss' | 'draw' {
  if (result === 'draw') return 'draw';
  return result === `${myColor}_win` ? 'win' : 'loss';
}

/**
 * How a demo game ends after a move, decided on the device (the demo never reaches the server,
 * which decides it in real games). Null while the game goes on.
 */
export function demoGameEnd(chess: Chess): Pick<GameState, 'result' | 'termination'> | null {
  if (chess.isCheckmate()) {
    return { result: chess.turn() === 'w' ? 'black_win' : 'white_win', termination: 'checkmate' };
  }
  if (chess.isStalemate()) return { result: 'draw', termination: 'stalemate' };
  if (chess.isInsufficientMaterial())
    return { result: 'draw', termination: 'insufficient_material' };
  if (chess.isThreefoldRepetition()) return { result: 'draw', termination: 'repetition' };
  if (chess.isDrawByFiftyMoves()) return { result: 'draw', termination: 'fifty_move' };
  return null;
}

export function historyBaseIndex(viewIndex: number | null, moves: GameMove[]): number {
  return viewIndex ?? moves.length - 1;
}

export function stepHistoryIndex(
  viewIndex: number | null,
  offset: -1 | 1,
  moves: GameMove[],
): number | null {
  if (moves.length === 0) return null;
  const base = historyBaseIndex(viewIndex, moves);
  const next = Math.max(0, Math.min(moves.length - 1, base + offset));
  // Reaching the latest move is the live position: leave history mode automatically.
  return next === moves.length - 1 ? null : next;
}

// Where a demo move branches from: keeps moves up to the viewed position and
// returns the FEN to continue from. When not viewing history, appends normally.
export function demoBranchPoint(
  moves: GameMove[],
  viewIndex: number | null,
  startFen: string,
): { baseFen: string; baseMoves: GameMove[]; branchAt: number } {
  const branchAt = viewIndex === null ? moves.length : viewIndex + 1;
  const baseMoves = moves.slice(0, branchAt);
  const baseFen = branchAt === 0 ? startFen : baseMoves[branchAt - 1]!.fenAfter;
  return { baseFen, baseMoves, branchAt };
}

function displayedClock(state: GameState, color: BoardOrientation, serverOffset: number) {
  const base = color === 'white' ? state.whiteClockMs : state.blackClockMs;
  if (state.status !== 'active' || state.sideToMove !== color || !state.activeClockStartedAt)
    return base;
  return Math.max(0, base - (Date.now() + serverOffset - Date.parse(state.activeClockStartedAt)));
}

function demoState(gameId: string): GameState {
  return {
    id: gameId,
    status: 'active',
    result: 'none',
    termination: 'none',
    currentFen: initialFen,
    sideToMove: 'white',
    coachMode: false,
    version: 0,
    whiteClockMs: 600000,
    blackClockMs: 600000,
    activeClockStartedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    pendingDrawOffer: null,
    players: [
      {
        avatarUrl: null,
        color: 'white',
        displayName: 'Você',
        ratingBefore: 1524,
        userId: '00000000-0000-4000-8000-000000000001',
        username: 'demo_branco',
      },
      {
        avatarUrl: null,
        color: 'black',
        displayName: 'Adversário (demo)',
        ratingBefore: 1587,
        userId: '00000000-0000-4000-8000-000000000002',
        username: 'demo_preto',
      },
    ],
  };
}

export function GameRoom({ gameId }: { gameId: string }) {
  const isDemo = gameId === 'demo';
  const { theme: pieceTheme } = usePieceTheme();
  const [state, setState] = useState<GameState>(() => demoState(gameId));
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [connection, setConnection] = useState<
    'demo' | 'connecting' | 'online' | 'reconnecting' | 'offline'
  >('demo');
  const [message, setMessage] = useState('Entre na sua conta para sincronizar esta partida.');
  const [orientation, setOrientation] = useState<BoardOrientation>('white');
  const [myColor, setMyColor] = useState<BoardOrientation | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [resignDialogOpen, setResignDialogOpen] = useState(false);
  const [resigning, setResigning] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [muted, setMuted] = useState(false);
  const [resultModal, setResultModal] = useState<GameResult | null>(null);
  const [suggestMoveEnabled, setSuggestMoveEnabled] = useState(false);
  const [assistedGameAvailable, setAssistedGameAvailable] = useState(false);
  const [assistedColor, setAssistedColor] = useState<BoardOrientation | null>(null);
  const [pendingCoachMove, setPendingCoachMove] = useState<{
    quality: MoveQualityResult;
    uci: string;
  } | null>(null);
  const [coachLine, setCoachLine] = useState<{ fen: string; text: string } | null>(null);
  const previousStatusRef = useRef(state.status);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuted(isSoundMuted());
  }, []);
  const previousMoveCount = useRef(0);
  const [, tick] = useState(0);
  const socketRef = useRef<GameSocket | undefined>(undefined);

  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isDemo) return;
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    api
      .getAssistedGameSettings(token)
      .then((settings) => setAssistedGameAvailable(settings.enabled))
      .catch(() => undefined);
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) {
      queueMicrotask(() => {
        setConnection('demo');
        setMessage('Demonstração local: mova as peças livremente no tabuleiro.');
      });
      return;
    }
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setConnection('connecting');
    });
    Promise.all([api.getGame(gameId, token), api.getMoves(gameId, token), api.getMe(token)])
      .then(([nextState, nextMoves, myProfile]) => {
        if (!active) return;
        setState(nextState);
        setMoves(nextMoves);
        setSuggestMoveEnabled(myProfile.profile.suggestMoveEnabled);
        const me = getStoredUserId();
        const player = nextState.players.find((item) => item.userId === me);
        if (player) {
          setOrientation(player.color);
          setMyColor(player.color);
        }
        const socket = new GameSocket(gameId, getRealtimeAccessToken, nextState.version, {
          connection: setConnection,
          drawOffered: (_offerId, offeredByUserId, snapshot) => {
            setState(snapshot);
            if (offeredByUserId !== me) {
              setMessage('Seu adversário ofereceu empate. Use Empate para aceitar.');
            }
          },
          snapshot: (snapshot, snapshotMoves, clock) => {
            setState(snapshot);
            setMoves((current) => [
              ...current,
              ...snapshotMoves.filter((move) => !current.some((item) => item.id === move.id)),
            ]);
            setServerOffset(Date.parse(clock.serverNow) - Date.now());
            setMessage('Partida sincronizada. Jogue quando for a sua vez.');
          },
          move: (snapshot, move, clock) => {
            setState(snapshot);
            setMoves((current) =>
              current.some((item) => item.id === move.id) ? current : [...current, move],
            );
            setServerOffset(Date.parse(clock.serverNow) - Date.now());
            setMessage('Lance confirmado pelo servidor.');
            if (move.flags.capture) playCaptureSound();
            else playMoveSound();
            const described = describeImportantMove(move);
            if (described) setAnnouncement({ ...described, key: `move-${move.id}` });
          },
          finished: (snapshot, clock) => {
            setState(snapshot);
            setServerOffset(Date.parse(clock.serverNow) - Date.now());
          },
          error: setMessage,
        });
        socketRef.current = socket;
        socket.connect();
      })
      .catch((error: unknown) => {
        setConnection('offline');
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar a partida.');
      });
    return () => {
      active = false;
      socketRef.current?.stop();
    };
  }, [gameId, isDemo]);

  const lastMove = moves.at(-1);
  useEffect(() => {
    setViewIndex((current) => {
      if (
        current !== null &&
        current === previousMoveCount.current - 1 &&
        moves.length > previousMoveCount.current
      ) {
        return moves.length - 1;
      }
      return current;
    });
    previousMoveCount.current = moves.length;
  }, [moves.length]);

  useEffect(() => {
    if (
      !isDemo &&
      myColor !== null &&
      previousStatusRef.current !== 'finished' &&
      state.status === 'finished'
    ) {
      const outcome = gameOutcomeFor(state.result, myColor);
      setResultModal({ outcome, reason: terminationLabels[state.termination] });
      if (outcome === 'win') playVictorySound();
      else if (outcome === 'loss') playDefeatSound();
    }
    previousStatusRef.current = state.status;
  }, [isDemo, myColor, state.result, state.status, state.termination]);

  const stageRef = useRef<HTMLDivElement>(null);
  const { active: stageFullscreen, toggle: toggleStageFullscreen } = useStageFullscreen(stageRef);
  const viewingHistory = viewIndex !== null;
  const viewedMove = viewingHistory ? moves[viewIndex] : undefined;
  const displayFen = viewedMove ? viewedMove.fenAfter : state.currentFen;

  function viewMove(ply: number) {
    setViewIndex(ply >= moves.length ? null : ply - 1);
  }

  function stepView(offset: -1 | 1) {
    setViewIndex((current) => stepHistoryIndex(current, offset, moves));
  }

  // Arrow keys browse the move history (except while a board square has keyboard focus).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof Element && target.closest('input, select, textarea, .chessBoard'))
        return;
      if (event.key === 'ArrowLeft')
        setViewIndex((current) => stepHistoryIndex(current, -1, moves));
      if (event.key === 'ArrowRight')
        setViewIndex((current) => stepHistoryIndex(current, 1, moves));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moves]);

  function returnToLive() {
    setViewIndex(null);
  }

  const white = state.players.find((player) => player.color === 'white');
  const black = state.players.find((player) => player.color === 'black');
  const me = myColor ? state.players.find((player) => player.color === myColor) : undefined;
  // Reflects the server's persisted pending draw offer (populated on initial
  // load, WS reconnection snapshots, and every live event), so a fresh page
  // load or a second device shows an opponent's pending offer even if the
  // player was never connected when it was made.
  const pendingDrawOfferFromOpponent =
    !isDemo &&
    state.pendingDrawOffer !== null &&
    me !== undefined &&
    state.pendingDrawOffer.offeredByUserId !== me.userId;
  const canMove =
    state.status === 'active' &&
    (isDemo || (connection === 'online' && myColor !== null && state.sideToMove === myColor));
  // Assisted mode (demo board only): the player moves both sides, but the
  // Treinador only speaks up for the color they picked, and only on that
  // color's turn — everything else about the demo (free movement of either
  // side, no server persistence) stays exactly as it already worked.
  const coachEnabled = shouldCoachTurn({
    assistedColor,
    coachMode: state.coachMode,
    connection,
    isDemo,
    myColor,
    sideToMove: state.sideToMove,
    status: state.status,
  });
  const {
    checkCandidateMove,
    failed: coachFailed,
    suggestion: coachSuggestion,
  } = useCoachEngine({
    enabled: coachEnabled,
    fen: state.currentFen,
    suggestEnabled: shouldSuggestCoachMove({
      coachMode: state.coachMode,
      isDemo,
      preferenceEnabled: suggestMoveEnabled,
    }),
  });

  // The Treinador's own moves are graded and narrated too, like the player's.
  const opponentReview = useOpponentReview({
    enabled:
      state.coachMode &&
      !isDemo &&
      myColor !== null &&
      state.status === 'active' &&
      lastMove !== undefined &&
      lastMove.color !== myColor,
    move: lastMove ?? null,
  });
  // The note about the Treinador's last move, shown and spoken before the tip for the new position.
  const opponentNoteRef = useRef<{ fen: string; text: string } | null>(null);
  const withOpponentNote = useCallback((fen: string, text: string) => {
    const note = opponentNoteRef.current;
    return note?.fen === fen ? `${note.text} ${text}` : text;
  }, []);

  const { voiceName } = useVoicePreference();
  // Bumped by every new narration-worthy moment (suggestion or quality
  // warning); a pending AI reply only gets spoken if it's still the one
  // that's current when it arrives - otherwise the game has already moved
  // on and the reply is stale, so it's silently dropped.
  const narrationGenerationRef = useRef(0);
  // The AI voice can fail (no OpenAI key, quota, autoplay block); the browser voice keeps
  // the Treinador audible instead of silently showing only text.
  const speakCoach = useCallback(
    (text: string, interrupt = true) => {
      // interrupt: the Treinador always speaks about the current position, never a queued old tip.
      speak(text, { interrupt, voiceName }).catch(() => {
        setMessage('A voz por IA falhou; o Treinador está usando a voz do navegador.');
        void speak(text, { interrupt }).catch(() => undefined);
      });
    },
    [voiceName],
  );

  useEffect(() => {
    if (!coachEnabled) narrationGenerationRef.current += 1;
  }, [coachEnabled]);

  useEffect(() => {
    if (!opponentReview || !lastMove || opponentReview.ply !== lastMove.ply) return;
    const verdict = {
      bestMoveUci: opponentReview.bestMoveUci,
      centipawnLoss: opponentReview.quality.centipawnLoss,
      quality: opponentReview.quality.quality,
    };
    const text = explainMove(lastMove, verdict, 'text', 'opponent', 'O Treinador');
    const speech = explainMove(lastMove, verdict, 'speech', 'opponent', 'O Treinador');
    const fen = state.currentFen;
    opponentNoteRef.current = { fen, text };
    queueMicrotask(() =>
      setCoachLine((current) => ({
        fen,
        text: current?.fen === fen ? `${text} ${current.text}` : text,
      })),
    );
    // Queued: the tip for the new position follows it instead of cutting it.
    speakCoach(speakableSquares(speech), false);
  }, [lastMove, opponentReview, speakCoach, state.currentFen]);

  // Any move cuts the tip being spoken; the next position's tip starts fresh.
  useEffect(() => {
    narrationGenerationRef.current += 1;
    stopSpeaking();
  }, [state.currentFen]);

  useEffect(() => {
    if (muted || !coachSuggestion || !coachSuggestion.bestMoveUci) return;
    const spokenText = formatCoachExplanation(state.currentFen, coachSuggestion);
    if (!spokenText) return;
    queueMicrotask(() =>
      setCoachLine({ fen: state.currentFen, text: withOpponentNote(state.currentFen, spokenText) }),
    );
    speakCoach(
      speakableSquares(
        formatCoachExplanation(state.currentFen, coachSuggestion, 'speech') ?? spokenText,
      ),
      opponentNoteRef.current?.fen !== state.currentFen,
    );

    // AI narration enriches the instant template above once it arrives -
    // never blocks or delays it. Skipped in demo mode (no real game row on
    // the server to authorize/gate against).
    if (isDemo) return;
    const generation = ++narrationGenerationRef.current;
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    const { bestMoveUci, mate, principalVariation, scoreCp } = coachSuggestion;
    api
      .getLiveNarration(
        gameId,
        { bestMoveUci, kind: 'suggestion', mate, principalVariation, scoreCp },
        token,
      )
      .then((result) => {
        if (!result.narrative || narrationGenerationRef.current !== generation) return;
        setCoachLine({ fen: state.currentFen, text: result.narrative });
        // Queued: the richer tip follows the instant one instead of cutting it mid-sentence.
        speakCoach(speakableSquares(result.narrative), false);
      })
      .catch(() => undefined);
  }, [coachSuggestion, gameId, isDemo, muted, speakCoach, state.currentFen, withOpponentNote]);

  useEffect(() => {
    if (muted || !pendingCoachMove) return;
    const { quality, uci } = pendingCoachMove;
    const verdict = {
      centipawnLoss: quality.centipawnLoss,
      label: moveQualityLabel[quality.quality].toLowerCase(),
      missedWin: quality.missedWin,
    };
    const bestUci = coachSuggestion?.bestMoveUci ?? null;
    const spokenText = formatCoachWarning(state.currentFen, uci, verdict, bestUci);
    queueMicrotask(() => setCoachLine({ fen: state.currentFen, text: spokenText }));
    speakCoach(
      speakableSquares(formatCoachWarning(state.currentFen, uci, verdict, bestUci, 'speech')),
    );

    if (isDemo) return;
    const generation = ++narrationGenerationRef.current;
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    api
      .getLiveNarration(
        gameId,
        {
          bestMoveUci: coachSuggestion?.bestMoveUci ?? null,
          centipawnLoss: quality.centipawnLoss,
          kind: 'quality',
          missedWin: quality.missedWin,
          quality: quality.quality,
          uci,
        },
        token,
      )
      .then((result) => {
        if (!result.narrative || narrationGenerationRef.current !== generation) return;
        setCoachLine({ fen: state.currentFen, text: result.narrative });
        speakCoach(speakableSquares(result.narrative), false);
      })
      .catch(() => undefined);
  }, [coachSuggestion, gameId, isDemo, muted, pendingCoachMove, speakCoach, state.currentFen]);

  const groupedMoves = useMemo(() => {
    const rows: Array<{ number: number; white?: GameMove; black?: GameMove }> = [];
    for (const move of moves) {
      const number = Math.ceil(move.ply / 2);
      const row = rows.find((item) => item.number === number) ?? { number };
      if (!rows.includes(row)) rows.push(row);
      if (move.color === 'white') row.white = move;
      else row.black = move;
    }
    return rows;
  }, [moves]);

  async function action(kind: 'draw' | 'resign') {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      setMessage('Faça login para usar ações de partida.');
      return;
    }
    try {
      if (kind === 'draw') {
        const result = await api.offerDraw(gameId, token);
        setState(result.state);
        setMessage(
          result.accepted ? 'Empate aceito. A partida foi encerrada.' : 'Oferta de empate enviada.',
        );
      } else {
        setResignDialogOpen(true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir a ação.');
    }
  }

  async function confirmResignation() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      setResignDialogOpen(false);
      setMessage('Faça login para desistir da partida.');
      return;
    }
    setResigning(true);
    try {
      setState(await api.resign(gameId, token));
      setResignDialogOpen(false);
      setMessage('Partida encerrada por desistência.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível desistir da partida.');
    } finally {
      setResigning(false);
    }
  }

  function sendMove(uci: string) {
    socketRef.current?.submitMove(uci);
    setMessage('Lance enviado. Aguardando confirmação do servidor…');
  }

  // Treinador mode: grade the candidate move client-side (fast, shallow
  // engine check) before it ever reaches the server. Nothing is applied
  // optimistically by ChessBoard (it's fully driven by the fen prop), so
  // declining here has nothing to undo — the move was simply never sent.
  async function handleCoachMove(uci: string) {
    const quality = await checkCandidateMove(uci).catch(() => null);
    if (quality && (quality.quality === 'gafe' || quality.quality === 'erro')) {
      setPendingCoachMove({ quality, uci });
      return;
    }
    sendMove(uci);
  }

  function playDemoMove(uci: string) {
    try {
      // Branching: if the player rewound the demo and plays from a past
      // position, drop the later moves and continue from there.
      const { baseFen, baseMoves, branchAt } = demoBranchPoint(moves, viewIndex, initialFen);
      const chess = new Chess(baseFen);
      const fenBefore = chess.fen();
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci[4] ? { promotion: uci[4] } : {}),
      });
      const nextMove: GameMove = {
        clientMoveId: randomUUID(),
        color: move.color === 'w' ? 'white' : 'black',
        committedAt: new Date().toISOString(),
        fenAfter: chess.fen(),
        fenBefore,
        flags: {
          capture: move.isCapture() || move.isEnPassant(),
          castling: move.isKingsideCastle()
            ? 'king_side'
            : move.isQueensideCastle()
              ? 'queen_side'
              : null,
          enPassant: move.isEnPassant(),
          promotion: move.isPromotion(),
        },
        from: move.from,
        id: branchAt + 1,
        ply: branchAt + 1,
        promotion: move.promotion ?? null,
        san: move.san,
        to: move.to,
        uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      };
      setMoves([...baseMoves, nextMove]);
      setViewIndex(null);
      // A branch played from an earlier position reopens a finished demo.
      const end = demoGameEnd(chess);
      setState((current) => ({
        ...current,
        currentFen: chess.fen(),
        result: end?.result ?? 'none',
        sideToMove: chess.turn() === 'w' ? 'white' : 'black',
        status: end ? 'finished' : 'active',
        termination: end?.termination ?? 'none',
        version: current.version + 1,
      }));
      if (end) {
        // In the demo the player moves both sides, so the side they help (if any) decides it.
        const outcome = assistedColor
          ? gameOutcomeFor(end.result, assistedColor)
          : end.result === 'draw'
            ? 'draw'
            : 'win';
        setResultModal({ outcome, reason: terminationLabels[end.termination] });
        if (outcome === 'win') playVictorySound();
        else if (outcome === 'loss') playDefeatSound();
      }
      setMessage(
        branchAt < moves.length
          ? 'Nova linha a partir deste lance (demonstração).'
          : 'Lance aplicado somente nesta demonstração.',
      );
    } catch {
      setMessage('Esse lance não é permitido nesta posição.');
    }
  }

  return (
    <main className="gamePage">
      {connection === 'reconnecting' || connection === 'offline' ? (
        <div className="connectionBanner" role="status">
          <span aria-hidden="true">↻</span>
          {connection === 'reconnecting'
            ? 'Reconectando e recuperando o estado…'
            : 'Conexão interrompida. Seus lances não confirmados não são aplicados.'}
        </div>
      ) : null}
      <section className="gameIdentity" aria-label="Partida">
        <span className="brandMark" aria-hidden="true">
          XE
        </span>
        <div>
          <strong>{isDemo ? 'Tabuleiro demonstrativo' : 'Partida ao vivo'}</strong>
          <span>
            {isDemo
              ? 'Treino contra o bot no seu aparelho (não usa o servidor)'
              : state.status === 'active'
                ? 'Rápida · 10 min'
                : 'Partida encerrada'}
          </span>
        </div>
        <button
          className="iconButton"
          onClick={() => setOrientation((value) => (value === 'white' ? 'black' : 'white'))}
          title="Girar tabuleiro"
          type="button"
        >
          ↻
        </button>
      </section>

      <aside className="playersColumn">
        <Player
          displayName={black?.displayName ?? 'Jogador preto'}
          avatarUrl={black?.avatarUrl ?? null}
          rating={black?.ratingBefore ?? 0}
          active={state.sideToMove === 'black'}
          clock={displayedClock(state, 'black', serverOffset)}
        />
        {!isDemo ? (
          <div className="gameActions">
            <button onClick={() => action('draw')} type="button">
              ½ Oferecer empate
            </button>
            <button className="dangerAction" onClick={() => action('resign')} type="button">
              ⚑ Desistir
            </button>
            <button
              onClick={() => {
                const next = !muted;
                setMuted(next);
                setSoundMuted(next);
              }}
              type="button"
            >
              {muted ? '🔇 Som' : '🔊 Som'}
            </button>
          </div>
        ) : null}
        <Player
          displayName={white?.displayName ?? 'Jogador branco'}
          avatarUrl={white?.avatarUrl ?? null}
          rating={white?.ratingBefore ?? 0}
          active={state.sideToMove === 'white'}
          clock={displayedClock(state, 'white', serverOffset)}
        />
      </aside>

      <section className="boardColumn" aria-label="Área do tabuleiro">
        {coachEnabled ? (
          <CoachCallout
            message={
              coachLine?.fen === state.currentFen
                ? coachLine.text
                : coachSuggestion
                  ? (formatCoachExplanation(state.currentFen, coachSuggestion) ??
                    'Estou analisando esta posição…')
                  : coachFailed
                    ? 'Não consegui analisar esta posição neste navegador.'
                    : 'Estou analisando esta posição…'
            }
          />
        ) : null}
        <div className="mobilePlayer">
          <Player
            displayName={
              (orientation === 'white' ? black : white)?.displayName ??
              (orientation === 'white' ? 'Jogador preto' : 'Jogador branco')
            }
            avatarUrl={(orientation === 'white' ? black : white)?.avatarUrl ?? null}
            rating={(orientation === 'white' ? black : white)?.ratingBefore ?? 0}
            active={state.sideToMove !== orientation}
            clock={displayedClock(state, orientation === 'white' ? 'black' : 'white', serverOffset)}
          />
        </div>
        <div className={`boardStage ${stageFullscreen ? 'isFullscreen' : ''}`} ref={stageRef}>
          <ChessBoard
            disabled={isDemo ? !canMove : viewingHistory || !canMove}
            fen={displayFen}
            hint={
              coachSuggestion?.bestMoveUci && displayFen === state.currentFen
                ? {
                    from: coachSuggestion.bestMoveUci.slice(0, 2),
                    to: coachSuggestion.bestMoveUci.slice(2, 4),
                  }
                : undefined
            }
            lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : undefined}
            movableColor={
              isDemo
                ? displayFen.split(' ')[1] === 'b'
                  ? 'b'
                  : 'w'
                : myColor === 'white'
                  ? 'w'
                  : myColor === 'black'
                    ? 'b'
                    : undefined
            }
            onMove={(uci) => {
              primeAudio();
              if (isDemo) playDemoMove(uci);
              else if (state.coachMode) void handleCoachMove(uci);
              else sendMove(uci);
            }}
            orientation={orientation}
            pieceTheme={pieceTheme}
          />
          {stageFullscreen ? (
            <>
              {/* Read-only overlays: pointer-events none, so they never block a move. */}
              <div aria-hidden="true" className="stageClocks">
                {([orientation === 'white' ? 'black' : 'white', orientation] as const).map(
                  (color) => (
                    <span
                      className={state.sideToMove === color ? 'stageClockActive' : undefined}
                      key={color}
                    >
                      {(color === 'white' ? white : black)?.displayName ??
                        (color === 'white' ? 'Brancas' : 'Pretas')}
                      <b>{formatClock(displayedClock(state, color, serverOffset))}</b>
                    </span>
                  ),
                )}
              </div>
              <ol aria-hidden="true" className="stageMoves">
                {groupedMoves.slice(-12).map((row) => (
                  <li key={row.number}>
                    <span>{row.number}.</span> {row.white ? toBrazilianSan(row.white.san) : ''}{' '}
                    {row.black ? toBrazilianSan(row.black.san) : ''}
                  </li>
                ))}
              </ol>
            </>
          ) : null}
          <div className="historyControls" role="group" aria-label="Comandos do tabuleiro">
            <button
              aria-label="Voltar lance"
              disabled={moves.length === 0}
              onClick={() => stepView(-1)}
              title="Voltar lance (←)"
              type="button"
            >
              ◀
            </button>
            <button
              aria-label="Avançar lance"
              disabled={viewIndex === null}
              onClick={() => stepView(1)}
              title="Avançar lance (→)"
              type="button"
            >
              ▶
            </button>
            <button
              aria-label="Girar tabuleiro"
              onClick={() => setOrientation((value) => (value === 'white' ? 'black' : 'white'))}
              title="Girar tabuleiro"
              type="button"
            >
              ↻
            </button>
            {isDemo && assistedGameAvailable ? (
              assistedColor === null ? (
                <>
                  <button
                    aria-label="Partida assistida jogando de brancas"
                    onClick={() => setAssistedColor('white')}
                    title="Partida assistida: o Treinador ajuda as brancas"
                    type="button"
                  >
                    🎓♙
                  </button>
                  <button
                    aria-label="Partida assistida jogando de pretas"
                    onClick={() => setAssistedColor('black')}
                    title="Partida assistida: o Treinador ajuda as pretas"
                    type="button"
                  >
                    🎓♟
                  </button>
                </>
              ) : (
                <button
                  aria-label="Encerrar partida assistida"
                  onClick={() => setAssistedColor(null)}
                  title="Encerrar partida assistida"
                  type="button"
                >
                  🎓✕
                </button>
              )
            ) : null}
            {isDemo ? (
              <button
                aria-label={
                  muted ? 'Ligar som e voz do Treinador' : 'Desligar som e voz do Treinador'
                }
                aria-pressed={!muted}
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  setSoundMuted(next);
                }}
                title={muted ? 'Som desligado' : 'Som ligado'}
                type="button"
              >
                {muted ? '🔇' : '🔊'}
              </button>
            ) : null}
            <button
              aria-label={stageFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              aria-pressed={stageFullscreen}
              onClick={toggleStageFullscreen}
              title={stageFullscreen ? 'Sair da tela cheia (Esc ou F)' : 'Tela cheia (F)'}
              type="button"
            >
              {stageFullscreen ? '✕' : '⛶'}
            </button>
            {stageFullscreen ? <span className="stageHint">Esc ou F para sair</span> : null}
          </div>
        </div>
        {isDemo && viewingHistory ? (
          <p className="demoBranchHint" role="note">
            Jogue um lance nesta posição para criar uma nova linha.
          </p>
        ) : null}
        {viewingHistory ? (
          <div className="historyBanner" role="status">
            Vendo lance {viewIndex! + 1} de {moves.length}
            <button onClick={returnToLive} type="button">
              {isDemo ? 'Ir ao último lance' : 'Voltar ao vivo'}
            </button>
          </div>
        ) : null}
        {pendingDrawOfferFromOpponent ? (
          <div className="drawOfferBanner" role="status">
            Seu adversário ofereceu empate.
            <button onClick={() => action('draw')} type="button">
              Aceitar empate
            </button>
          </div>
        ) : null}
        <div className="mobilePlayer">
          <Player
            displayName={
              (orientation === 'white' ? white : black)?.displayName ??
              (orientation === 'white' ? 'Jogador branco' : 'Jogador preto')
            }
            avatarUrl={(orientation === 'white' ? white : black)?.avatarUrl ?? null}
            rating={(orientation === 'white' ? white : black)?.ratingBefore ?? 0}
            active={state.sideToMove === orientation}
            clock={displayedClock(state, orientation, serverOffset)}
          />
        </div>
        <MoveAnnouncement announcement={announcement} />
        <p className="gameMessage" role="status">
          {message}
        </p>
      </section>

      <aside className="movesPanel">
        <div className="panelTabs" role="tablist" aria-label="Detalhes da partida">
          <button aria-selected="true" role="tab" type="button">
            Lances
          </button>
          <button aria-selected="false" role="tab" type="button">
            Detalhes
          </button>
        </div>
        <div className="moveList" aria-label="Lista de lances">
          {groupedMoves.length ? (
            groupedMoves.map((row) => (
              <div className="moveRow" key={row.number}>
                <span>{row.number}.</span>
                {row.white ? (
                  <button
                    aria-current={viewIndex === row.white.ply - 1}
                    aria-label={formatMove(row.white)}
                    className="moveLink"
                    onClick={() => viewMove(row.white!.ply)}
                    title={formatMove(row.white)}
                    type="button"
                  >
                    {toBrazilianSan(row.white.san)}
                  </button>
                ) : (
                  <strong />
                )}
                {row.black ? (
                  <button
                    aria-current={viewIndex === row.black.ply - 1}
                    aria-label={formatMove(row.black)}
                    className="moveLink"
                    onClick={() => viewMove(row.black!.ply)}
                    title={formatMove(row.black)}
                    type="button"
                  >
                    {toBrazilianSan(row.black.san)}
                  </button>
                ) : (
                  <strong />
                )}
              </div>
            ))
          ) : (
            <div className="emptyMoves">
              <span aria-hidden="true">♟</span>
              <p>Os lances confirmados aparecerão aqui.</p>
            </div>
          )}
        </div>
        <div className="connectionState">
          <span className={connection === 'online' ? 'onlineDot' : 'idleDot'} />
          {connection === 'online'
            ? 'Sincronizado com o servidor'
            : connection === 'demo'
              ? 'Modo de demonstração'
              : connection === 'connecting'
                ? 'Autenticando e entrando na partida…'
                : connection === 'reconnecting'
                  ? 'Reconectando ao servidor…'
                  : 'Partida desconectada'}
        </div>
      </aside>

      {!isDemo ? (
        <div className="mobileActions">
          <button onClick={() => action('draw')} type="button">
            ½ Empate
          </button>
          <button className="dangerAction" onClick={() => action('resign')} type="button">
            ⚑ Desistir
          </button>
        </div>
      ) : null}
      <ConfirmDialog
        busy={resigning}
        confirmLabel="Sim, desistir"
        danger
        description="A partida será encerrada imediatamente e seu adversário será declarado vencedor. Essa ação não pode ser desfeita."
        eyebrow="Ação da partida"
        onCancel={() => setResignDialogOpen(false)}
        onConfirm={confirmResignation}
        open={resignDialogOpen}
        title="Desistir da partida?"
      />
      <ConfirmDialog
        cancelLabel="Escolher outro lance"
        confirmLabel="Jogar assim mesmo"
        danger
        description={
          pendingCoachMove
            ? `Eu classifiquei esse lance como ${moveQualityLabel[pendingCoachMove.quality.quality].toLowerCase()} (perda de ${pendingCoachMove.quality.centipawnLoss}cp)${pendingCoachMove.quality.missedWin ? ', deixando passar uma posição melhor' : ''}. Quer jogar mesmo assim?`
            : ''
        }
        eyebrow="Treinador"
        onCancel={() => setPendingCoachMove(null)}
        onConfirm={() => {
          if (pendingCoachMove) sendMove(pendingCoachMove.uci);
          setPendingCoachMove(null);
        }}
        open={pendingCoachMove !== null}
        title="Tem certeza desse lance?"
      />
      <GameResultDialog
        onClose={() => setResultModal(null)}
        result={resultModal}
        reviewHref={isDemo ? undefined : `/app/partidas/${gameId}/revisao`}
      />
    </main>
  );
}

function Player({
  displayName,
  avatarUrl,
  rating,
  active,
  clock,
}: {
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  active: boolean;
  clock: number;
}) {
  return (
    <article className={`playerCard ${active ? 'activePlayer' : ''}`}>
      <div className="playerAvatar" aria-hidden="true">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="playerAvatarImage" src={avatarUrl} />
        ) : (
          displayName.slice(0, 2).toUpperCase()
        )}
      </div>
      <div className="playerMeta">
        <strong>{displayName}</strong>
        <span>{rating} XE</span>
      </div>
      <time className="chessClock">{formatClock(clock)}</time>
    </article>
  );
}
