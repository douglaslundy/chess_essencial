import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { initialPieces, reconcile } from './piece-tracker';

function after(fens: string[]) {
  let state = initialPieces(fens[0]!);
  let last = { captures: [] as ReturnType<typeof reconcile>['captures'], ...state };
  for (const fen of fens.slice(1)) {
    last = reconcile(state.pieces, fen, state.nextId);
    state = { nextId: last.nextId, pieces: last.pieces };
  }
  return last;
}

function play(sans: string[]) {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of sans) {
    chess.move(san);
    fens.push(chess.fen());
  }
  return fens;
}

describe('piece tracker', () => {
  it('keeps piece identity across an ordinary move', () => {
    const [start, moved] = play(['e4']);
    const initial = initialPieces(start!);
    const pawn = initial.pieces.find((piece) => piece.square === 'e2')!;
    const result = reconcile(initial.pieces, moved!, initial.nextId);
    expect(result.pieces.find((piece) => piece.id === pawn.id)?.square).toBe('e4');
    expect(result.captures).toHaveLength(0);
  });

  it('reports the capturing piece', () => {
    const result = after(play(['e4', 'd5', 'exd5']));
    expect(result.captures).toHaveLength(1);
    const { victim, captorId } = result.captures[0]!;
    expect(victim).toMatchObject({ color: 'b', square: 'd5', type: 'p' });
    expect(result.pieces.find((piece) => piece.id === captorId)).toMatchObject({
      color: 'w',
      square: 'd5',
    });
  });

  it('handles en passant, castling and promotion', () => {
    const ep = after(play(['e4', 'a6', 'e5', 'd5', 'exd6']));
    expect(ep.captures[0]!.victim.square).toBe('d5');
    expect(ep.captures[0]!.captorId).not.toBeNull();

    const castle = after(play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']));
    expect(castle.captures).toHaveLength(0);
    expect(castle.pieces.filter((piece) => piece.color === 'w')).toHaveLength(16);

    const promo = reconcile(
      initialPieces('8/P7/8/8/8/8/8/k6K w - - 0 1').pieces,
      'Q7/8/8/8/8/8/8/k6K b - - 0 1',
      10,
    );
    expect(promo.captures).toHaveLength(0);
    expect(promo.pieces.find((piece) => piece.type === 'q')?.square).toBe('a8');
  });
});
