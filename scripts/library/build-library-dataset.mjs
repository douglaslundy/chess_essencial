// Gera database/content/library/games.jsonl.gz a partir de PGNs públicos
// (PGN Mentor) e das tabelas de aberturas lichess (CC0).
// Uso: node scripts/library/build-library-dataset.mjs <dirPgn> <dirEcoTsv> [maxJogos]
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const require = createRequire(resolve('apps/web/package.json'));
const { Chess } = require('chess.js');

const [pgnDir, ecoDir, maxArg] = process.argv.slice(2);
const MAX = Number(maxArg ?? 30000);

const openings = new Map();
for (const f of readdirSync(ecoDir).filter((n) => n.endsWith('.tsv'))) {
  for (const line of readFileSync(join(ecoDir, f), 'utf8').split('\n').slice(1)) {
    const [eco, name, pgn] = line.split('\t');
    if (!pgn) continue;
    const key = pgn
      .replace(/\d+\.(\.\.)?/g, '')
      .trim()
      .split(/\s+/)
      .join(' ');
    openings.set(key, { eco, name });
  }
}

function detectOpening(sans) {
  for (let n = Math.min(sans.length, 24); n >= 1; n--) {
    const hit = openings.get(sans.slice(0, n).join(' '));
    if (hit) return hit;
  }
  return null;
}

const tagRe = /\[(\w+)\s+"([^"]*)"\]/g;
const events =
  /world|candidates|interzonal|olympiad|tal memorial|linares|wijk|tata|corus|sinquefield|match|tournament|zurich|nottingham|hastings|moscow|new york|london|paris/i;
const seen = new Set();
const games = [];

function clean(v) {
  return v === '?' || v === '' ? null : v;
}

for (const file of readdirSync(pgnDir).filter((n) => n.endsWith('.pgn'))) {
  const text = readFileSync(join(pgnDir, file), 'latin1').replace(/\r/g, '');
  for (const chunk of text.split(/\n\n(?=\[Event )/)) {
    const tags = {};
    for (const m of chunk.matchAll(tagRe)) tags[m[1]] = m[2];
    if (!tags.White || !tags.Black || !['1-0', '0-1', '1/2-1/2'].includes(tags.Result)) continue;
    const body = chunk
      .replace(/\[[^\]]*\]\s*/g, '')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/\([^)]*\)/g, ' ');
    const sans = body
      .replace(/\$\d+/g, ' ')
      .replace(/\d+\.(\.\.)?/g, ' ')
      .replace(/1-0|0-1|1\/2-1\/2|\*/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (sans.length < 24) continue;
    const key = createHash('sha1')
      .update(`${tags.White}|${tags.Black}|${tags.Date}|${sans.join(' ')}`)
      .digest('hex');
    if (seen.has(key)) continue;
    seen.add(key);
    const year = Number((tags.Date ?? '').slice(0, 4)) || null;
    const we = Number(tags.WhiteElo) || null;
    const be = Number(tags.BlackElo) || null;
    const avg = we && be ? (we + be) / 2 : 0;
    const famous = events.test(tags.Event ?? '');
    let score =
      (avg >= 2600 ? avg : 0) +
      (famous ? 400 : 0) +
      (year && year < 1960 ? 600 : 0) +
      Math.min(sans.length, 80);
    if (!famous && !(year && year < 1975) && avg < 2650) continue;
    games.push({
      score,
      row: {
        k: key,
        w: tags.White,
        b: tags.Black,
        we,
        be,
        ev: clean(tags.Event),
        si: clean(tags.Site),
        d: clean((tags.Date ?? '').replace(/\.\?\?/g, '').replace(/\./g, '-')),
        y: year,
        r: clean(tags.Round),
        res: tags.Result,
        eco: clean(tags.ECO),
        op: null,
        m: sans.join(' '),
        n: sans.length,
      },
    });
  }
}
games.sort((a, b) => b.score - a.score);
const picked = [];
for (const { row } of games) {
  if (picked.length >= MAX) break;
  const sans = row.m.split(' ');
  const chess = new Chess();
  try {
    for (const san of sans) chess.move(san);
  } catch {
    continue;
  }
  const op = detectOpening(sans);
  row.eco = row.eco ?? op?.eco ?? null;
  row.op = op?.name ?? null;
  picked.push(row);
}
console.error(`candidatos=${games.length} escolhidos=${picked.length}`);
const out = picked.map((r) => JSON.stringify(r)).join('\n') + '\n';
writeFileSync('database/content/library/games.jsonl.gz', gzipSync(out, { level: 9 }));
console.error(`bytes gz=${gzipSync(out, { level: 9 }).length}`);
