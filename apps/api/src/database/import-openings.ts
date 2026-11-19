import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Chess } from 'chess.js';
import postgres from 'postgres';

// Source: https://github.com/lichess-org/chess-openings (CC0). Columns: eco, name, pgn.
const VOLUMES = ['a', 'b', 'c', 'd', 'e'];
const BATCH = 500;
const dryRun = process.argv.includes('--dry-run');
const root = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
  'database/content/openings',
);

interface Line {
  eco: string;
  kind?: 'opening' | 'trap';
  trap_idea?: string;
  trap_rank?: number;
  family: string;
  name: string;
  pgn: string;
  ply_count: number;
  side: 'black' | 'white';
  uci: string;
}

/** Defenses are studied from Black's side, everything else from White's. */
export function sideOf(name: string): 'black' | 'white' {
  return /\bDefen[cs]e\b/.test(name) ? 'black' : 'white';
}

export function parseLine(eco: string, name: string, pgn: string): Line | null {
  const chess = new Chess();
  const uci: string[] = [];
  try {
    for (const token of pgn.split(/\s+/)) {
      if (!token || /^\d+\.+$/.test(token)) continue;
      const move = chess.move(token.replace(/^\d+\.+/, ''));
      uci.push(`${move.from}${move.to}${move.promotion ?? ''}`);
    }
  } catch {
    return null;
  }
  if (uci.length === 0) return null;
  return {
    eco,
    family: name.split(':')[0]!.trim(),
    name,
    pgn,
    ply_count: uci.length,
    side: sideOf(name),
    uci: uci.join(' '),
  };
}

/**
 * Traps: our own catalog (`database/content/traps/armadilhas.tsv`: name, trapper's side, PGN, idea).
 * Rows go from the most effective trap (fastest finish) to the least: the order sets `trap_rank`.
 * Every line was checked with Stockfish: at its end the trapper has mated, won material or has a
 * clear attack (never equal).
 */
export function parseTraps(text: string): Line[] {
  const traps: Line[] = [];
  for (const row of text.split(/\r?\n/).slice(1)) {
    const [name, side, pgn, idea] = row.split('\t');
    if (!name || !pgn || !idea || (side !== 'white' && side !== 'black')) continue;
    const line = parseLine('TRP', name, pgn);
    if (!line) continue;
    // The file is sorted best first: the row order is the ranking.
    traps.push({
      ...line,
      family: name,
      kind: 'trap',
      side,
      trap_idea: idea,
      trap_rank: traps.length + 1,
    });
  }
  return traps;
}

if (process.argv[1]?.endsWith('import-openings.ts')) {
  const lines: Line[] = [];
  for (const volume of VOLUMES) {
    const text = await readFile(resolve(root, `${volume}.tsv`), 'utf8');
    for (const row of text.split(/\r?\n/).slice(1)) {
      const [eco, name, pgn] = row.split('\t');
      if (!eco || !name || !pgn) continue;
      const line = parseLine(eco, name, pgn);
      if (line) lines.push(line);
    }
  }
  const traps = parseTraps(await readFile(resolve(root, '../traps/armadilhas.tsv'), 'utf8'));
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ total: lines.length, traps: traps.length })}\n`);
  } else {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required unless --dry-run is used');
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      let inserted = 0;
      for (let i = 0; i < lines.length; i += BATCH) {
        const result = await sql`
          INSERT INTO opening_lines ${sql(lines.slice(i, i + BATCH))} ON CONFLICT (uci) DO NOTHING
        `;
        inserted += result.count;
      }
      // A trap wins over a plain opening line with the same moves (e.g. "Fool's Mate").
      for (const trap of traps) {
        await sql`
          INSERT INTO opening_lines ${sql(trap, 'eco', 'family', 'name', 'pgn', 'ply_count', 'side', 'uci', 'kind', 'trap_idea', 'trap_rank')}
          ON CONFLICT (uci) DO UPDATE SET
            family = EXCLUDED.family, name = EXCLUDED.name, pgn = EXCLUDED.pgn, side = EXCLUDED.side,
            kind = 'trap', trap_idea = EXCLUDED.trap_idea, trap_rank = EXCLUDED.trap_rank
        `;
      }
      process.stdout.write(
        `${JSON.stringify({ inserted, total: lines.length, traps: traps.length })}\n`,
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}
