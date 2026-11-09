import type { OpeningLine } from '@xadrez/contracts';

export const MAIN_VARIATIONS = 5;

export interface Variations {
  /** The family's own line (for example "Sicilian Defense"), the starting point of the study. */
  base: OpeningLine | null;
  /** The most played first-level variations, most played first: "Variação 1", "Variação 2"... */
  main: OpeningLine[];
  /** Everything else (sub-variations and the less played ones), most played first. */
  others: OpeningLine[];
}

/**
 * Splits the lines of a family, already ordered from the most to the least played. A first-level
 * variation is named "Family: Variation" (no comma); the comma marks a sub-variation.
 */
export function pickVariations(lines: OpeningLine[]): Variations {
  const base = [...lines].sort((a, b) => a.plyCount - b.plyCount)[0] ?? null;
  const rest = lines.filter((line) => line.id !== base?.id);
  const firstLevel = (line: OpeningLine) => line.name.includes(':') && !line.name.includes(',');
  const main = rest.filter(firstLevel).slice(0, MAIN_VARIATIONS);
  const mainIds = new Set(main.map((line) => line.id));
  return { base, main, others: rest.filter((line) => !mainIds.has(line.id)) };
}
