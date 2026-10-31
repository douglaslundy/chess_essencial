import { describe, expect, it } from 'vitest';

import { nextTheme } from './next-theme';

const themes = ['garfo', 'cravada', 'mate_em_dois'];

describe('nextTheme', () => {
  it('segue para o tema seguinte da lista', () => {
    expect(nextTheme(themes, 'garfo', new Set(['garfo']))).toBe('cravada');
  });

  it('dá a volta na lista pulando os temas já tentados', () => {
    expect(nextTheme(themes, 'mate_em_dois', new Set(['garfo', 'mate_em_dois']))).toBe('cravada');
  });

  it('para quando todos os temas já foram tentados', () => {
    expect(nextTheme(themes, 'cravada', new Set(themes))).toBeNull();
  });

  it('não avança a partir de "Todos os temas" nem com a lista vazia', () => {
    expect(nextTheme(themes, '', new Set())).toBeNull();
    expect(nextTheme([], 'garfo', new Set(['garfo']))).toBeNull();
  });

  it('começa do início quando o tema atual não está na lista', () => {
    expect(nextTheme(themes, 'outro', new Set(['outro']))).toBe('garfo');
  });
});
