import { describe, expect, it } from 'vitest';

import {
  formatUciSquares,
  speakableSquares,
  spokenMove,
  spokenSan,
  toBrazilianSan,
} from './notation';

describe('toBrazilianSan', () => {
  it('translates each piece letter except the bishop', () => {
    expect(toBrazilianSan('Nf3')).toBe('Cf3');
    expect(toBrazilianSan('Qxe4')).toBe('Dxe4');
    expect(toBrazilianSan('Rae1')).toBe('Tae1');
    expect(toBrazilianSan('Bb5')).toBe('Bb5');
    expect(toBrazilianSan('Kg1')).toBe('Rg1');
  });

  it('leaves pawn moves untouched (no leading piece letter)', () => {
    expect(toBrazilianSan('e4')).toBe('e4');
    expect(toBrazilianSan('exd5')).toBe('exd5');
  });

  it('translates a promotion piece', () => {
    expect(toBrazilianSan('e8=Q')).toBe('e8=D');
    expect(toBrazilianSan('bxa1=N+')).toBe('bxa1=C+');
  });

  it('leaves castling untouched', () => {
    expect(toBrazilianSan('O-O')).toBe('O-O');
    expect(toBrazilianSan('O-O-O')).toBe('O-O-O');
  });

  it('preserves check and mate suffixes', () => {
    expect(toBrazilianSan('Qxe4+')).toBe('Dxe4+');
    expect(toBrazilianSan('Rd8#')).toBe('Td8#');
  });
});

describe('formatUciSquares', () => {
  it('splits a UCI move into a readable square pair', () => {
    expect(formatUciSquares('e2e4')).toBe('e2 → e4');
  });
});

describe('speakableSquares', () => {
  it('spells out the file letter so speech synthesis reads it, not a guessed word', () => {
    expect(speakableSquares('g6 para c6')).toBe('gê 6 para cê 6');
  });

  it('leaves text with no square references untouched', () => {
    expect(speakableSquares('Eu sugiro roque pequeno')).toBe('Eu sugiro roque pequeno');
  });

  it('reads castling notation as roque', () => {
    expect(speakableSquares('Eu indico O-O. A linha é Bc4, Be7, O-O-O.')).toBe(
      'Eu indico roque pequeno. A linha é B cê 4, B é 7, roque grande.',
    );
    expect(speakableSquares('Você jogou 0-0+')).toBe('Você jogou roque pequeno+');
    expect(speakableSquares('Resultado 1-0')).toBe('Resultado 1-0');
  });
});

describe('spokenSan', () => {
  it('names the piece and the action instead of reading the letters', () => {
    expect(spokenSan('Nf3')).toBe('Cavalo para f3');
    expect(spokenSan('Qxe4+')).toBe('Dama captura em e4, xeque');
    expect(spokenSan('Rad1')).toBe('Torre da coluna á para d1');
    expect(spokenSan('e4')).toBe('Peão para e4');
    expect(spokenSan('exd5')).toBe('Peão de é captura em d5');
    expect(spokenSan('e8=Q#')).toBe('Peão para e8 e promove a dama, xeque-mate');
    expect(spokenSan('O-O-O')).toBe('Roque grande');
    expect(spokenSan('O-O+')).toBe('Roque pequeno, xeque');
  });

  it('says the piece and both squares when the squares are known', () => {
    expect(spokenSan('Bh6', { from: 'b1', to: 'h6' })).toBe('o bispo de b1 para h6');
    expect(spokenSan('Nxe5+', { from: 'c4', to: 'e5' })).toBe(
      'o cavalo de c4 captura em e5, xeque',
    );
    expect(spokenSan('exd5', { from: 'e4', to: 'd5' })).toBe('o peão de e4 captura em d5');
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(spokenMove(start, 'b1c3')).toBe('o cavalo de b1 para c3');
    expect(speakableSquares(spokenMove(start, 'b1c3'))).toBe('o cavalo de bê 1 para cê 3');
  });

  it('reads aloud as piece, preposition and spelled square once squares are expanded', () => {
    expect(speakableSquares(spokenSan('Nc3'))).toBe('Cavalo para cê 3');
  });
});
