'use client';

import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';

const pieceNames: Record<PieceSymbol, string> = {
  k: 'rei',
  q: 'dama',
  r: 'torre',
  b: 'bispo',
  n: 'cavalo',
  p: 'peão',
};

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
            <path d="M32 7v14M25 14h14" fill="none" />
            <path d="M23 27c0-6 4-9 9-9s9 3 9 9c0 4-2 7-5 10l8 12H20l8-12c-3-3-5-6-5-10Z" />
            <path d="M14 49h36l3 7H11l3-7Z" />
          </>
        ) : null}
      </g>
    </svg>
  );
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
  lastMove?: { from: string; to: string } | undefined;
  movableColor?: Color | undefined;
  onMove: (uci: string) => void;
}

export function ChessBoard({
  fen,
  orientation,
  disabled,
  lastMove,
  movableColor,
  onMove,
}: ChessBoardProps) {
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
  const destinations = useMemo(
    () =>
      selected && chess
        ? new Set(chess.moves({ square: selected, verbose: true }).map((move) => move.to))
        : new Set<string>(),
    [chess, selected],
  );

  function attempt(from: Square, to: Square) {
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
    if (from) attempt(from, to);
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const columns = 8;
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columns,
      ArrowDown: columns,
    };
    const offset = offsets[event.key];
    if (offset !== undefined) {
      event.preventDefault();
      const next = Math.max(0, Math.min(63, index + offset));
      setFocused(squares[next]!);
      document.getElementById(`square-${squares[next]}`)?.focus();
    }
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
        <div className="chessBoard" role="grid" aria-label="Tabuleiro de xadrez">
          {squares.map((square, index) => {
            const piece = chess?.get(square) ?? fallbackPieces.get(square);
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
                {piece ? <ChessPiece color={piece.color} type={piece.type} /> : null}
                {destinations.has(square) ? (
                  <span className="moveTarget" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
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
