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
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ total: lines.length })}\n`);
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
      process.stdout.write(`${JSON.stringify({ inserted, total: lines.length })}\n`);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}
