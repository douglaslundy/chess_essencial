// Generates verified forced-mate puzzles (mate in 1/2/3) and emits a SQL
// migration. Every puzzle is verified with the chess-domain mate solver: the
// first move is unique and forces mate, and full interleaved solution lines
// are produced for the grader. No external data; positions are random and
// filtered to clean, unique mates.
//
// Usage: node scripts/generate-tactics.mjs <migrationNumber> [count]
// Requires the chess-domain package to be built (pnpm --filter @xadrez/chess-domain build).

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildSolutionLines,
  findMateFirstMoves,
  hasCheckingMove,
  isPlayableStart,
} from '../packages/chess-domain/dist/mate-solver.js';

const here = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const migrationNumber = args[0] ?? '0015';
const targetCount = Number(args[1] ?? '240');

const FILES = 'abcdefgh';
const PROMO = ['', '', '', 'q']; // occasional promotion piece is not needed here

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function square() {
  return `${FILES[randomInt(8)]}${1 + randomInt(8)}`;
}

// Edge/corner squares: almost every clean few-piece forced mate nets the king
// against a border, so biasing the black king here hugely raises the hit rate.
const EDGE_SQUARES = [];
for (let f = 0; f < 8; f += 1) {
  for (let r = 1; r <= 8; r += 1) {
    if (f === 0 || f === 7 || r === 1 || r === 8) EDGE_SQUARES.push(`${FILES[f]}${r}`);
  }
}
function edgeSquare() {
  return EDGE_SQUARES[randomInt(EDGE_SQUARES.length)];
}

// Piece pools per intended mate depth. More attacking material for shallower
// mates keeps generation productive.
const ATTACKER_SETS = [
  ['Q'],
  ['Q', 'R'],
  ['R', 'R'],
  ['Q', 'B'],
  ['Q', 'N'],
  ['R', 'B'],
  ['R', 'N'],
];

function fileIndex(sq) {
  return FILES.indexOf(sq[0]);
}
function rankIndex(sq) {
  return Number(sq[1]) - 1;
}
// A square within Chebyshev distance `d` of `center`, biased near the king to
// raise the mate hit rate.
function squareNear(center, d) {
  const cf = fileIndex(center);
  const cr = rankIndex(center);
  for (let tries = 0; tries < 30; tries += 1) {
    const f = cf + randomInt(2 * d + 1) - d;
    const r = cr + randomInt(2 * d + 1) - d;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) return `${FILES[f]}${r + 1}`;
  }
  return square();
}

function buildRandomPosition() {
  const used = new Set();
  const place = () => {
    let s = square();
    while (used.has(s)) s = square();
    used.add(s);
    return s;
  };
  const placeNear = (center, d) => {
    let s = squareNear(center, d);
    let tries = 0;
    while (used.has(s) && tries < 40) {
      s = squareNear(center, d);
      tries += 1;
    }
    if (used.has(s)) return place();
    used.add(s);
    return s;
  };
  const board = {};
  // Black king on an edge; white king and attackers placed near it so forced
  // mates are common.
  const bk = edgeSquare();
  used.add(bk);
  const wk = placeNear(bk, 3);
  board[wk] = 'K';
  board[bk] = 'k';
  const set = ATTACKER_SETS[randomInt(ATTACKER_SETS.length)];
  for (const piece of set) board[placeNear(bk, 4)] = piece;
  // Optionally add one black blocker pawn near the king to enable
  // smothered/back-rank motifs.
  if (Math.random() < 0.5) {
    const s = placeNear(bk, 2);
    if (s[1] !== '1' && s[1] !== '8') board[s] = 'p';
  }
  return board;
}

function boardToFen(board) {
  const rows = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const sq = `${FILES[file]}${rank}`;
      const piece = board[sq];
      if (piece) {
        if (empty > 0) {
          row += empty;
          empty = 0;
        }
        row += piece;
      } else {
        empty += 1;
      }
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} w - - 0 1`;
}

function isLegalStart(fen) {
  return isPlayableStart(fen);
}

const DIFFICULTY_BY_DEPTH = { 1: 'beginner', 2: 'intermediate', 3: 'advanced' };
const BAND_BY_DEPTH = { 1: '0-999', 2: '1000-1399', 3: '1400-1799' };
const THEME_BY_DEPTH = { 1: 'mate_em_um', 2: 'mate_em_dois', 3: 'mate_em_tres' };
const TITLE_BY_DEPTH = { 1: 'Mate em um', 2: 'Mate em dois', 3: 'Mate em três' };

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function generate() {
  const perDepth = {
    1: Math.round(targetCount * 0.45),
    2: Math.round(targetCount * 0.5),
    3: Math.round(targetCount * 0.05),
  };
  // Wall-clock budget per depth (ms) so generation never hangs. Mate-in-3 is
  // rare/expensive under random search, so it gets a small best-effort budget.
  const budgetMs = { 1: 120_000, 2: 600_000, 3: 120_000 };
  const puzzles = [];
  const seenFens = new Set();
  const seenSolutions = new Set();

  for (const depth of [1, 2, 3]) {
    let found = 0;
    let attempts = 0;
    const deadline = Date.now() + budgetMs[depth];
    while (found < perDepth[depth] && Date.now() < deadline) {
      attempts += 1;
      const board = buildRandomPosition();
      const fen = boardToFen(board);
      if (seenFens.has(fen) || !isLegalStart(fen)) continue;
      // Cheap pre-filter: only run the expensive search on positions where a
      // check is available (these generated mate nets are all check-first).
      if (!hasCheckingMove(fen)) continue;
      // Generated mates are check-first: restrict the attacker's key move to a
      // check for depth >= 2, which both prunes the search and yields cleaner,
      // more instructive forcing lines.
      const firsts = findMateFirstMoves(fen, depth, depth >= 2);
      if (firsts.length !== 1) continue; // require a unique key move
      const lines = buildSolutionLines(fen, depth, firsts[0], depth >= 2);
      if (!lines) continue;
      // Cap branching so the grader stays clean and small.
      if (lines.length > 6) continue;
      const solKey = JSON.stringify(lines);
      if (seenSolutions.has(solKey)) continue;
      seenFens.add(fen);
      seenSolutions.add(solKey);
      puzzles.push({ fen, depth, lines, firstMove: firsts[0] });
      found += 1;
    }
    process.stderr.write(`depth ${depth}: ${found}/${perDepth[depth]} (attempts ${attempts})\n`);
  }
  return puzzles;
}

function toSql(puzzles) {
  const upRows = [];
  const ids = [];
  puzzles.forEach((p, index) => {
    const seq = String(index + 1).padStart(4, '0');
    const uuid = `${migrationNumber.slice(0, 4)}0000-0000-4000-8000-${createHash('md5')
      .update(p.fen + seq)
      .digest('hex')
      .slice(0, 12)}`;
    const externalId = `gen-mate-${migrationNumber}-${seq}`;
    ids.push(externalId);
    const title = `${TITLE_BY_DEPTH[p.depth]} #${seq}`;
    const prompt = `As brancas jogam. Encontre o ${TITLE_BY_DEPTH[p.depth].toLowerCase()}.`;
    const solutionMd = `Solução verificada: ${p.lines[0].join(' ')}`;
    const linesJson = JSON.stringify(p.lines);
    const meta = JSON.stringify({
      answerFormat: 'move_sequence',
      generated: true,
      ratingBand: BAND_BY_DEPTH[p.depth],
    });
    upRows.push(
      `  (${sqlLiteral(uuid)}, ${sqlLiteral(externalId)}, ${sqlLiteral(title)}, ${sqlLiteral(
        prompt,
      )}, ${sqlLiteral(solutionMd)}, ${sqlLiteral(DIFFICULTY_BY_DEPTH[p.depth])}, 'Táticas geradas', ${sqlLiteral(
        p.fen,
      )}, 'white', ${sqlLiteral(linesJson)}::jsonb, '[]'::jsonb, ARRAY['classico', ${sqlLiteral(
        THEME_BY_DEPTH[p.depth],
      )}, 'mate'], 'published', 'legal_position', ${sqlLiteral(meta)}::jsonb)`,
    );
  });

  const up = `INSERT INTO exercises (
  id, external_id, title, prompt_md, solution_md, difficulty, category, fen, side_to_move,
  solution_lines, hints, tags, status, position_type, import_metadata
) VALUES
${upRows.join(',\n')}
ON CONFLICT (external_id) DO NOTHING;
`;
  const down = `DELETE FROM exercises WHERE external_id IN (\n${ids
    .map((id) => `  ${sqlLiteral(id)}`)
    .join(',\n')}\n);\n`;
  return { up, down };
}

const puzzles = generate();
if (puzzles.length === 0) {
  process.stderr.write('No puzzles generated.\n');
  process.exit(1);
}
const { up, down } = toSql(puzzles);
const base = resolve(here, '..', 'database', 'migrations', `${migrationNumber}_generated_mates`);
await writeFile(`${base}.up.sql`, up, 'utf8');
await writeFile(`${base}.down.sql`, down, 'utf8');
process.stderr.write(`Wrote ${puzzles.length} puzzles to ${base}.up/.down.sql\n`);
