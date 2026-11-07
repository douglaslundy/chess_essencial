import { describe, expect, it } from 'vitest';

import {
  describeBetterMove,
  describeMoveFacts,
  describeMoveGoal,
  moveFacts,
} from './move-facts.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('moveFacts', () => {
  it('reads a developing knight move', () => {
    const facts = moveFacts(START, 'g1f3')!;
    expect(facts.piece).toBe('n');
    expect(facts.develops).toBe(true);
    expect(describeMoveFacts(facts)).toContain('Desenvolve a peça, trazendo-a para o jogo.');
  });

  it('flags a capture and the piece taken', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const facts = moveFacts(fen, 'e4d5')!;
    expect(facts.captured).toBe('p');
    expect(describeMoveFacts(facts)[0]).toContain('Captura o peão');
    expect(describeMoveGoal(facts)).toBe('capturar o peão');
  });

  it('says what a move leaves exposed', () => {
    // The rook lands on h5 facing the queen with no defender.
    const fen = '4k3/8/8/3q4/8/8/8/4K2R w K - 0 1';
    const facts = moveFacts(fen, 'h1h5')!;
    expect(facts.exposedPiece).toBe(true);
    expect(describeMoveFacts(facts).join(' ')).toContain('sem proteção suficiente');
  });

  it('reports a threat on an undefended piece', () => {
    const fen = '4k3/8/8/3q4/8/8/8/R3K3 w - - 0 1';
    const facts = moveFacts(fen, 'a1d1')!;
    expect(facts.threatens.map((item) => item.square)).toContain('d5');
    expect(describeMoveFacts(facts).join(' ')).toContain('Ameaça ganhar a dama em d5.');
  });

  it('reports a piece left hanging by moving its defender', () => {
    // The c4 bishop is defended only by the c1 rook; moving the rook away leaves it to the c8 rook.
    const fen = '2r1k3/8/8/8/2B5/8/8/2R1K3 w - - 0 1';
    const facts = moveFacts(fen, 'c1a1')!;
    expect(facts.leavesHanging.map((item) => item.square)).toEqual(['c4']);
    expect(describeMoveFacts(facts).join(' ')).toContain('Deixa o bispo em c4 vulnerável a captura.');
  });

  it('recognises castling and mate', () => {
    expect(describeMoveFacts(moveFacts('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1')!)[0]).toContain(
      'roque pequeno',
    );
    expect(describeMoveFacts(moveFacts('7k/8/5KQ1/8/8/8/8/8 w - - 0 1', 'g6g7')!).join(' ')).toContain(
      'xeque-mate',
    );
  });

  it('counts the recapture: taking a defended rook with a knight nets less than it looks', () => {
    // Nd5xe7? no: white knight takes the e7 rook, defended by the black king.
    const fen = '4k3/4r3/8/3N4/8/8/8/4K3 w - - 0 1';
    const taken = moveFacts(fen, 'd5e7')!;
    expect(taken.captured).toBe('r');
    expect(taken.netMaterial).toBe(2);
    expect(describeMoveFacts(taken).join(' ')).toContain('o saldo de material da troca é +2');
    // The same knight taking an undefended piece wins it clean.
    const clean = moveFacts('4k3/8/4r3/3N4/8/8/8/4K3 w - - 0 1', 'd5e7');
    expect(clean).toBeNull();
  });

  it('compares the played move with the suggestion in measured terms', () => {
    // Knight takes the defended rook (+2 net); the pawn takes a loose knight (+3 net).
    const fen = '4k3/4r3/3n4/2P1N3/8/8/8/4K3 w - - 0 1';
    const played = moveFacts(fen, 'e5d7');
    expect(played).toBeNull();
    const knight = moveFacts('4k3/4r3/8/3N4/2P5/8/8/4K3 w - - 0 1', 'd5e7')!;
    const pawn = moveFacts('4k3/8/3n4/2P5/8/8/8/4K3 w - - 0 1', 'c5d6')!;
    expect(pawn.netMaterial).toBe(3);
    const lines = describeBetterMove(knight, pawn, { after: 20, before: 250, loss: 230 });
    expect(lines.join(' ')).toContain('a sugestão rende +3 e o seu lance, +2');
    expect(lines.join(' ')).toContain('passa de +2,5 para +0,2');
  });

  it('returns null for an illegal move', () => {
    expect(moveFacts(START, 'e2e5')).toBeNull();
  });
});
