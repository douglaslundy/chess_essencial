import { describe, expect, it } from 'vitest';

import { parseStepsAnswer } from './tutor-prompt.js';
import { lessonSteps, movesToSteps, reviewNotes } from './tutor-script.js';

describe('movesToSteps', () => {
  it('names the piece, its color and the squares', () => {
    const steps = movesToSteps(null, ['e4', 'e5', 'Nf3']);
    expect(steps.map((step) => step.label)).toEqual([
      'Peão branco de e2 para e4',
      'Peão preto de e7 para e5',
      'Cavalo branco de g1 para f3',
    ]);
    expect(steps[0]?.index).toBe(1);
  });

  it('accepts UCI moves from a start position and stops at an illegal one', () => {
    const steps = movesToSteps('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', ['a1a8', 'zz99']);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.label).toBe('Torre branca de a1 para a8');
  });

  it('writes castling as a roque', () => {
    const steps = movesToSteps(null, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']);
    expect(steps.at(-1)?.label).toBe('Roque curto das brancas');
  });
});

describe('reviewNotes', () => {
  it('adds the engine verdict and its better move for a bad move', () => {
    const notes = reviewNotes(
      ['e4', 'f6'],
      [
        { best_move_uci: 'e7e5', ply: 2, quality: 'erro' },
        { best_move_uci: 'e2e4', ply: 1, quality: 'otimo' },
      ],
    );
    expect(notes[0]).toBe('avaliação do motor: ótimo');
    expect(notes[1]).toContain('erro');
    expect(notes[1]).toContain('Peão preto de e7 para e5');
  });
});

describe('parseStepsAnswer', () => {
  it('keeps the model text for the wanted steps and drops the missing ones', () => {
    const steps = lessonSteps([{ say: 'a' }, { say: 'b' }]);
    const frames = parseStepsAnswer('Aqui: [{"index":2,"text":" Segundo. "}]', steps);
    expect(frames).toEqual([{ index: 2, label: 'Passo 2', text: 'Segundo.' }]);
  });
});
