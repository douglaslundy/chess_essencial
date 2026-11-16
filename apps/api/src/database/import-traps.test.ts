import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseTraps } from './import-openings.js';

const file = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
  'database/content/traps/armadilhas.tsv',
);
const text = readFileSync(file, 'utf8');

describe('catálogo de armadilhas', () => {
  const traps = parseTraps(text);

  it('lê todas as linhas: lances legais, lado e ideia preenchidos', () => {
    const rows = text.split(/\r?\n/).filter(Boolean).length - 1;
    expect(traps).toHaveLength(rows);
    for (const trap of traps) {
      expect(trap.kind).toBe('trap');
      expect(trap.trap_idea?.length ?? 0).toBeGreaterThan(30);
    }
  });

  it('não repete linha nem nome', () => {
    expect(new Set(traps.map((trap) => trap.uci)).size).toBe(traps.length);
    expect(new Set(traps.map((trap) => trap.name)).size).toBe(traps.length);
  });
});
