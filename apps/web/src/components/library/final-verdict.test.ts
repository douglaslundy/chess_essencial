import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { finalVerdict } from './final-verdict';

function play(moves: string[]) {
  const chess = new Chess();
  for (const san of moves) chess.move(san);
  return chess;
}

describe('finalVerdict', () => {
  it('reports checkmate when the final position is mate', () => {
    const mate = play(['f3', 'e5', 'g4', 'Qh4#']);
    expect(finalVerdict('0-1', mate)).toEqual({
      detail: 'Pretas venceram por xeque-mate.',
      outcome: 'win',
      title: 'Pretas venceram',
    });
  });

  it('reads a decisive game without mate as a resignation', () => {
    expect(finalVerdict('1-0', play(['e4', 'e5']))?.detail).toBe('As pretas desistiram.');
  });

  it('labels draws and skips unknown results', () => {
    expect(finalVerdict('1/2-1/2', play(['e4']))).toMatchObject({
      detail: 'Empate por acordo.',
      outcome: 'draw',
    });
    expect(finalVerdict('*', play([]))).toBeNull();
  });
});
