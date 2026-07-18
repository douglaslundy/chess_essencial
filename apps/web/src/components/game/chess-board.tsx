'use client';

import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';

const glyphs: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};
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
  onMove: (uci: string) => void;
}

export function ChessBoard({ fen, orientation, disabled, lastMove, onMove }: ChessBoardProps) {
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
    else setSelected(selected === square ? null : square);
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
              draggable={Boolean(piece) && Boolean(chess) && !disabled}
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
              {piece ? (
                <span
                  className={piece.color === 'w' ? 'whitePiece' : 'blackPiece'}
                  aria-hidden="true"
                >
                  {glyphs[piece.color][piece.type]}
                </span>
              ) : null}
              {destinations.has(square) ? <span className="moveTarget" aria-hidden="true" /> : null}
              {(index % 8 === 0 || index >= 56) && (
                <span className="coordinate" aria-hidden="true">
                  {index % 8 === 0 ? square[1] : square[0]}
                </span>
              )}
            </button>
          );
        })}
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
                  <span aria-hidden="true">{glyphs.w[piece]}</span>
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
