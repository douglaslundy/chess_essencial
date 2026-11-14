'use client';

import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

import dynamic from 'next/dynamic';

import { nextAuraSquares } from '@/components/game/board3d/piece-attacks';
import { detectMove, hintSquares, walkPath, type PlayedMove } from '@/components/game/move-path';
import { MoveToast } from '@/components/game/move-toast';
import { useDialogA11y } from '@/components/ui/dialog-a11y';
import { useBoardMode } from '@/lib/board-mode';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';

const pieceNames: Record<PieceSymbol, string> = {
  k: 'rei',
  q: 'dama',
  r: 'torre',
  b: 'bispo',
  n: 'cavalo',
  p: 'peão',
};

const pieceFileNames: Record<PieceSymbol, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

export type PieceTheme = 'classic' | 'staunton_3d' | 'wood';

export type BoardOrientation = 'white' | 'black';
type BoardPiece = { color: Color; type: PieceSymbol };

function ChessPiece({ color, type }: BoardPiece) {
  return (
    <svg
      aria-hidden="true"
      className={`chessPiece ${color === 'w' ? 'whitePiece' : 'blackPiece'}`}
      data-color={color}
      data-piece={type}
      focusable="false"
      viewBox="0 0 64 64"
    >
      <g strokeLinecap="round" strokeLinejoin="round">
        {type === 'p' ? (
          <>
            <circle cx="32" cy="17" r="8" />
            <path d="M25 28h14l5 20H20l5-20Z" />
            <path d="M17 48h30l3 8H14l3-8Z" />
          </>
        ) : null}
        {type === 'r' ? (
          <>
            <path d="M16 10h8v7h8v-7h8v7h8v10H16V10Z" />
            <path d="M21 27h22l3 22H18l3-22Z" />
            <path d="M15 49h34l3 7H12l3-7Z" />
          </>
        ) : null}
        {type === 'n' ? (
          <>
            <path d="M19 49c2-14 7-24 18-31l-2-7c12 4 17 13 15 24l-5 14H19Z" />
            <path d="M24 34c6-2 10-6 12-12" fill="none" />
            <circle cx="40" cy="22" r="1.7" className="pieceDetail" stroke="none" />
            <path d="M15 49h34l3 7H12l3-7Z" />
          </>
        ) : null}
        {type === 'b' ? (
          <>
            <path d="M32 9c8 7 11 14 6 22l-6 8-6-8c-5-8-2-15 6-22Z" />
            <path d="m35 15-8 12" fill="none" />
            <path d="M23 39h18l5 10H18l5-10Z" />
            <path d="M15 49h34l3 7H12l3-7Z" />
          </>
        ) : null}
        {type === 'q' ? (
          <>
            <circle cx="14" cy="14" r="3" />
            <circle cx="32" cy="9" r="3" />
            <circle cx="50" cy="14" r="3" />
            <path d="m14 18 8 23h20l8-23-12 11-6-15-6 15-12-11Z" />
            <path d="M19 41h26l4 8H15l4-8Z" />
            <path d="M13 49h38l2 7H11l2-7Z" />
          </>
        ) : null}
        {type === 'k' ? (
          <>
            <path className="kingCross" d="M32 7v14M25 14h14" fill="none" />
            <path d="M23 27c0-6 4-9 9-9s9 3 9 9c0 4-2 7-5 10l8 12H20l8-12c-3-3-5-6-5-10Z" />
            <path d="M14 49h36l3 7H11l3-7Z" />
          </>
        ) : null}
      </g>
    </svg>
  );
}

function WoodChessPiece({ color, type }: BoardPiece) {
  return (
    <svg
      aria-hidden="true"
      className={`chessPiece woodPiece ${color === 'w' ? 'whitePiece' : 'blackPiece'}`}
      data-color={color}
      data-piece={type}
      focusable="false"
      viewBox="0 0 64 64"
    >
      <path className="woodBase" d="M14 50h36l4 8H10l4-8Z" />
      <path className="woodBase" d="M20 42h24l3 8H17l3-8Z" />
      {type === 'p' ? <circle className="woodBody" cx="32" cy="28" r="11" /> : null}
      {type === 'r' ? (
        <>
          <rect className="woodBody" height="28" rx="3" width="22" x="21" y="14" />
          <path className="woodBody" d="M19 14h4v-5h6v5h6v-5h6v5h4v6H19v-6Z" />
        </>
      ) : null}
      {type === 'n' ? (
        <path
          className="woodBody"
          d="M24 42c-1-10 1-18 8-23l-3-6c9 2 14 9 13 18l3 11c1 3-1 5-4 5h-4l-2-6-3 6h-8Z"
        />
      ) : null}
      {type === 'b' ? (
        <>
          <ellipse className="woodBody" cx="32" cy="30" rx="10" ry="16" />
          <circle className="woodBody" cx="32" cy="10" r="4" />
          <path
            className="woodDetail"
            d="M26 24 38 30"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </>
      ) : null}
      {type === 'q' ? (
        <>
          <ellipse className="woodBody" cx="32" cy="32" rx="12" ry="14" />
          <circle className="woodDetail" cx="32" cy="10" r="4" />
          <circle className="woodDetail" cx="18" cy="16" r="3" />
          <circle className="woodDetail" cx="46" cy="16" r="3" />
          <circle className="woodDetail" cx="24" cy="12" r="3" />
          <circle className="woodDetail" cx="40" cy="12" r="3" />
        </>
      ) : null}
      {type === 'k' ? (
        <>
          <ellipse className="woodBody" cx="32" cy="32" rx="12" ry="15" />
          <rect className="woodDetail kingCross" height="14" width="6" x="29" y="4" />
          <rect className="woodDetail kingCross" height="6" width="16" x="24" y="8" />
        </>
      ) : null}
    </svg>
  );
}

function StauntonPieceImage({ color, type }: BoardPiece) {
  const colorName = color === 'w' ? 'white' : 'black';
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`pieceImage ${color === 'w' ? 'whitePiece' : 'blackPiece'}`}
      data-color={color}
      data-piece={type}
      src={`/piece-themes/staunton-3d/${colorName}-${pieceFileNames[type]}.png`}
    />
  );
}

function renderPiece(piece: BoardPiece, theme: PieceTheme) {
  if (theme === 'staunton_3d') return <StauntonPieceImage color={piece.color} type={piece.type} />;
  if (theme === 'wood') return <WoodChessPiece color={piece.color} type={piece.type} />;
  return <ChessPiece color={piece.color} type={piece.type} />;
}

function diagramPieces(fen: string) {
  const pieces = new Map<Square, BoardPiece>();
  const ranks = (fen.split(' ')[0] ?? '').split('/');
  if (ranks.length !== 8) return pieces;
  ranks.forEach((rank, rankIndex) => {
    let fileIndex = 0;
    for (const value of rank) {
      if (/\d/.test(value)) {
        fileIndex += Number(value);
        continue;
      }
      if (fileIndex > 7 || !/[prnbqk]/i.test(value)) continue;
      const square = `${'abcdefgh'[fileIndex]}${8 - rankIndex}` as Square;
      pieces.set(square, {
        color: value === value.toUpperCase() ? 'w' : 'b',
        type: value.toLowerCase() as PieceSymbol,
      });
      fileIndex += 1;
    }
  });
  return pieces;
}

export function boardSquares(orientation: BoardOrientation): Square[] {
  const files = orientation === 'white' ? 'abcdefgh' : 'hgfedcba';
  const ranks = orientation === 'white' ? '87654321' : '12345678';
  return [...ranks].flatMap((rank) => [...files].map((file) => `${file}${rank}` as Square));
}

interface ChessBoardProps {
  fen: string;
  orientation: BoardOrientation;
  disabled?: boolean;
  /** Treinador's suggested move: its path is drawn up to the target square. */
  hint?: { from: string; to: string } | undefined;
  lastMove?: { from: string; to: string } | undefined;
  /** Course stars still to collect (squares). */
  marks?: readonly string[] | undefined;
  movableColor?: Color | undefined;
  /** The capture film of the position `fen` started playing (true) or is over (false). */
  onCaptureFilm?: ((playing: boolean, fen: string) => void) | undefined;
  onMove: (uci: string) => void;
  pieceTheme?: PieceTheme;
}

/** "a1" → "A1", the form the player asked to read on the squares. */
const squareName = (square: string) => square.toUpperCase();

interface BoardEffectProps {
  /** Move to announce in the fading balloon, or null. */
  toast: PlayedMove | null;
  /** Move whose piece should walk to its destination, or null. */
  walk: PlayedMove | null;
  /** Squares whose piece wears the ki aura. */
  aura: ReadonlySet<string>;
  squareNames: boolean;
}

const WALK_STEP_MS = 320;

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Display (column,row) of a square for the given orientation, 0..7 from the top-left. */
function cell(square: Square, orientation: BoardOrientation): [number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return orientation === 'white' ? [file, 7 - rank] : [7 - file, rank];
}

function ChessBoard2D({
  aura,
  fen,
  orientation,
  disabled,
  hint,
  lastMove,
  marks,
  movableColor,
  onMove,
  pieceTheme = 'classic',
  squareNames,
  toast,
  walk,
}: ChessBoardProps & BoardEffectProps) {
  const hinted = useMemo(() => hintSquares(fen, hint), [fen, hint]);
  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);
  const fallbackPieces = useMemo(() => diagramPieces(fen), [fen]);
  const squares = useMemo(() => boardSquares(orientation), [orientation]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [focused, setFocused] = useState<Square>(orientation === 'white' ? 'e2' : 'e7');
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const promotionFocusRef = useRef<HTMLButtonElement>(null);
  const walker = useRef<HTMLDivElement>(null);
  const [walkedId, setWalkedId] = useState(0);
  // A dragged piece already sits on its target: it stays there while the server confirms,
  // and the confirmed move does not walk it again from its origin.
  const [dropped, setDropped] = useState<{ fen: string; from: Square; to: Square } | null>(null);
  const preview = useMemo(() => {
    if (dropped?.fen !== fen) return null;
    try {
      const next = new Chess(fen);
      next.move({ from: dropped.from, to: dropped.to });
      return next;
    } catch {
      return null;
    }
  }, [dropped, fen]);
  const draggedWalk =
    walk && dropped && dropped.fen !== fen && walk.from === dropped.from && walk.to === dropped.to;
  const walking =
    walk && walk.id !== walkedId && !draggedWalk && !prefersReducedMotion() ? walk : null;

  if (draggedWalk && walk.id !== walkedId) setWalkedId(walk.id);

  // A rejected move leaves the fen unchanged: the preview gives way and the piece goes back.
  useEffect(() => {
    if (!dropped) return;
    const timer = window.setTimeout(() => setDropped(null), 3000);
    return () => window.clearTimeout(timer);
  }, [dropped]);

  // The piece walks square by square (small hop on each) on a layer above the squares,
  // because each square clips its own content.
  useLayoutEffect(() => {
    const node = walker.current;
    if (!walking || !node) return;
    const points = [walking.from, ...walkPath(walking.from, walking.to, walking.piece)].map(
      (square) => cell(square, orientation),
    );
    const frames: Keyframe[] = [];
    points.forEach(([x, y], index) => {
      frames.push({ transform: `translate(${x * 100}%, ${y * 100}%)` });
      const next = points[index + 1];
      if (next)
        frames.push({
          transform: `translate(${((x + next[0]) / 2) * 100}%, ${((y + next[1]) / 2) * 100 - 5}%)`,
        });
    });
    const animation = node.animate(frames, {
      duration: (points.length - 1) * WALK_STEP_MS,
      easing: 'ease-in-out',
      fill: 'forwards',
    });
    const id = walking.id;
    animation.onfinish = () => setWalkedId(id);
    return () => animation.cancel();
  }, [walking, orientation]);

  useDialogA11y({
    initialFocusRef: promotionFocusRef,
    onCancel: () => setPromotion(null),
    open: promotion !== null,
  });
  const destinations = useMemo(
    () =>
      selected && chess
        ? new Set(chess.moves({ square: selected, verbose: true }).map((move) => move.to))
        : new Set<string>(),
    [chess, selected],
  );

  function attempt(from: Square, to: Square, dragged = false) {
    if (!chess) return;
    const legal = chess.moves({ square: from, verbose: true }).find((move) => move.to === to);
    if (!legal) {
      setSelected(chess.get(to) ? to : null);
      return;
    }
    if (legal.promotion) {
      setPromotion({ from, to });
      return;
    }
    setSelected(null);
    if (dragged) setDropped({ fen, from, to });
    onMove(`${from}${to}`);
  }

  function activate(square: Square) {
    if (disabled || !chess) return;
    if (selected && selected !== square) attempt(selected, square);
    else {
      const piece = chess.get(square);
      setSelected(
        selected === square || !piece || (movableColor && piece.color !== movableColor)
          ? null
          : square,
      );
    }
  }

  function drop(event: DragEvent<HTMLButtonElement>, to: Square) {
    event.preventDefault();
    const from = event.dataTransfer.getData('text/plain') as Square;
    if (from) attempt(from, to, true);
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const row = Math.floor(index / 8);
    const column = index % 8;
    let next = index;

    if (event.key === 'ArrowLeft' && column > 0) next = index - 1;
    else if (event.key === 'ArrowRight' && column < 7) next = index + 1;
    else if (event.key === 'ArrowUp' && row > 0) next = index - 8;
    else if (event.key === 'ArrowDown' && row < 7) next = index + 8;
    else if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;

    event.preventDefault();
    if (next === index) return;
    setFocused(squares[next]!);
    document.getElementById(`square-${squares[next]}`)?.focus();
  }

  return (
    <>
      <div className="boardWithCoordinates">
        <div className="boardFiles boardFilesTop" aria-hidden="true">
          {[...(orientation === 'white' ? 'abcdefgh' : 'hgfedcba')].map((file) => (
            <span key={file}>{file}</span>
          ))}
        </div>
        <div className="boardRanks boardRanksLeft" aria-hidden="true">
          {[...(orientation === 'white' ? '87654321' : '12345678')].map((rank) => (
            <span key={rank}>{rank}</span>
          ))}
        </div>
        <div
          className="chessBoard"
          data-board-theme={pieceTheme}
          role="grid"
          aria-label="Tabuleiro de xadrez"
        >
          {squares.map((square, index) => {
            const piece = (preview ?? chess)?.get(square) ?? fallbackPieces.get(square);
            const isLight = (square.charCodeAt(0) + Number(square[1])) % 2 === 1;
            const isLast = lastMove?.from === square || lastMove?.to === square;
            return (
              <button
                aria-label={
                  piece
                    ? `${square}, ${piece.color === 'w' ? 'branco' : 'preto'} ${pieceNames[piece.type]}`
                    : `${square}, vazia`
                }
                className={[
                  'boardSquare',
                  isLight ? 'lightSquare' : 'darkSquare',
                  selected === square ? 'selectedSquare' : '',
                  destinations.has(square) ? 'targetSquare' : '',
                  isLast ? 'lastMoveSquare' : '',
                  walking?.to === square ? 'walkTarget' : '',
                  hint?.from === square ? 'hintFrom' : '',
                  hinted.path.has(square) ? 'hintPath' : '',
                  hinted.target === square ? 'hintTarget' : '',
                ].join(' ')}
                draggable={
                  Boolean(piece) &&
                  Boolean(chess) &&
                  !disabled &&
                  (!movableColor || piece?.color === movableColor)
                }
                id={`square-${square}`}
                key={square}
                onClick={() => activate(square)}
                onDragOver={(event) => event.preventDefault()}
                onDragStart={(event) => event.dataTransfer.setData('text/plain', square)}
                onDrop={(event) => drop(event, square)}
                onFocus={() => setFocused(square)}
                onKeyDown={(event) => navigate(event, index)}
                role="gridcell"
                tabIndex={focused === square ? 0 : -1}
                type="button"
              >
                {piece && aura.has(square) ? (
                  <span aria-hidden="true" className={`kiAura kiAura-${piece.color}`} />
                ) : null}
                {piece ? renderPiece(piece, pieceTheme) : null}
                {marks?.includes(square) ? (
                  <span className="courseStar" aria-hidden="true">
                    ★
                  </span>
                ) : null}
                {!piece && squareNames && !marks?.includes(square) ? (
                  <span className="squareName" aria-hidden="true">
                    {squareName(square)}
                  </span>
                ) : null}
                {destinations.has(square) ? (
                  <span className="moveTarget" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
        {walking ? (
          <div aria-hidden="true" className="walkingPiece" ref={walker}>
            {renderPiece({ color: walking.color, type: walking.piece }, pieceTheme)}
          </div>
        ) : null}
        <MoveToast move={toast} />
        <div className="boardRanks boardRanksRight" aria-hidden="true">
          {[...(orientation === 'white' ? '87654321' : '12345678')].map((rank) => (
            <span key={rank}>{rank}</span>
          ))}
        </div>
        <div className="boardFiles boardFilesBottom" aria-hidden="true">
          {[...(orientation === 'white' ? 'abcdefgh' : 'hgfedcba')].map((file) => (
            <span key={file}>{file}</span>
          ))}
        </div>
      </div>
      {promotion ? (
        <div className="dialogBackdrop" role="presentation">
          <div
            aria-labelledby="promotion-title"
            aria-modal="true"
            className="promotionDialog"
            role="dialog"
          >
            <h2 id="promotion-title">Escolha a promoção</h2>
            <div className="promotionChoices">
              {(['q', 'r', 'b', 'n'] as const).map((piece) => (
                <button
                  key={piece}
                  onClick={() => {
                    onMove(`${promotion.from}${promotion.to}${piece}`);
                    setPromotion(null);
                    setSelected(null);
                  }}
                  ref={piece === 'q' ? promotionFocusRef : undefined}
                  type="button"
                >
                  <ChessPiece color="w" type={piece} />
                  {pieceNames[piece]}
                </button>
              ))}
            </div>
            <button className="textButton" onClick={() => setPromotion(null)} type="button">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

const Chess3DBoard = dynamic(() => import('./board3d/chess-3d-board'), {
  loading: () => <p role="status">Carregando tabuleiro 3D…</p>,
  ssr: false,
});

const NO_AURA: ReadonlySet<string> = new Set();

const CaptureVideo = dynamic(() => import('./capture-fx/capture-video'), { ssr: false });

/** Tracks the last single move that produced the current FEN (derived during render, no flicker). */
function usePlayedMove(fen: string) {
  const [track, setTrack] = useState<{
    aura: ReadonlySet<string>;
    count: number;
    fen: string;
    played: PlayedMove | null;
  }>({ aura: NO_AURA, count: 0, fen, played: null });
  if (track.fen !== fen) {
    const move = detectMove(track.fen, fen);
    const count = track.count + 1;
    setTrack({
      aura: nextAuraSquares(track.aura, fen, move),
      count,
      fen,
      played: move ? { ...move, id: count } : null,
    });
  }
  return track;
}

/** Renders the flat board, or the immersive 3D board when the player enabled it (menu switch). */
export function ChessBoard(live: ChessBoardProps) {
  const { effects, mode } = useBoardMode();
  // While a capture film plays the board stays on the capture: the next move (the opponent's
  // reply) only reaches it when the film ends or the player skips it.
  const [film, setFilm] = useState<{ hold: ChessBoardProps; move: PlayedMove } | null>(null);
  const [filmedId, setFilmedId] = useState(0);
  const props: ChessBoardProps = film
    ? {
        ...film.hold,
        disabled: live.disabled || film.hold.fen !== live.fen,
        onMove: live.onMove,
      }
    : live;
  const { aura, played } = usePlayedMove(props.fen);
  const toast = effects.moveToast ? played : null;
  const walk = effects.moveAnimation ? played : null;
  // The Medieval Cinema board stages the capture itself, on the board.
  const staged = mode === '3d' && effects.cinema3d && effects.cinemaScenes;
  if (effects.captureAnimation && !staged && played?.captured && played.id !== filmedId) {
    setFilmedId(played.id);
    setFilm({ hold: live, move: played });
  }
  const cinematic = film ? (
    <CaptureVideo
      key={film.move.id}
      move={film.move}
      onClose={() => {
        live.onCaptureFilm?.(false, film.hold.fen);
        setFilm(null);
      }}
      onPlaying={() => live.onCaptureFilm?.(true, film.hold.fen)}
    />
  ) : null;
  if (mode === '3d') {
    return (
      <>
        <Chess3DBoard
          disabled={props.disabled}
          fen={props.fen}
          hint={props.hint}
          lastMove={props.lastMove}
          marks={props.marks}
          squareNames={effects.squareNames}
          movableColor={props.movableColor}
          onMove={props.onMove}
          coordinates={effects.coordinates3d}
          medieval={effects.medieval3d && !effects.ivory3d && !effects.cinema3d}
          ivory={effects.ivory3d && !effects.cinema3d}
          cinema={effects.cinema3d}
          cinemaScenes={effects.cinemaScenes}
          kiAura={effects.kiAura}
          greyLightSquares={effects.greyLight3d}
          rims={{ b: effects.rimBlack, w: effects.rimWhite }}
          orientation={props.orientation}
          toast={toast}
          walk={walk}
        />
        {cinematic}
      </>
    );
  }
  return (
    <>
      <ChessBoard2D
        {...props}
        aura={effects.kiAura ? aura : NO_AURA}
        squareNames={effects.squareNames}
        toast={toast}
        walk={walk}
      />
      {cinematic}
    </>
  );
}
