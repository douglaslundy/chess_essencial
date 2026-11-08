import { selectBotMove } from '@xadrez/chess-domain';
import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The same vendored Stockfish the worker uses for reviews: every runtime image carries all of /app.
const DEFAULT_ENGINE_PATH = fileURLToPath(
  new URL('../../../worker/vendor/stockfish/stockfish-18-lite-single.cjs', import.meta.url),
);
/** Stockfish cannot be limited below this Elo; weaker bots add random moves to it (see blunderRate). */
const MIN_ENGINE_ELO = 1320;
const MAX_ENGINE_ELO = 3190;
const MOVE_TIME_MS = 400;
const REPLY_TIMEOUT_MS = 6_000;
/** Each engine is a separate WebAssembly process (~50 MB): a few at once is plenty for the bots. */
const MAX_PARALLEL_ENGINES = 2;

let running = 0;
const waiting: Array<() => void> = [];

async function acquire() {
  if (running >= MAX_PARALLEL_ENGINES) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
}

function release() {
  running -= 1;
  waiting.shift()?.();
}

function askEngine(enginePath: string, fen: string, elo: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [enginePath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    const finish = (error: Error | null, move?: string) => {
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(move!);
    };
    const timer = setTimeout(
      () => finish(new Error('O motor do bot demorou demais para responder.')),
      REPLY_TIMEOUT_MS,
    );
    const send = (line: string) => {
      if (!child.stdin.destroyed) child.stdin.write(`${line}\n`);
    };
    child.stdin.on('error', () => undefined);
    child.on('error', (error) => finish(error));
    child.on('exit', () => finish(new Error('O motor do bot encerrou antes de jogar.')));
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (line === 'uciok') {
          send('setoption name Threads value 1');
          send('setoption name Hash value 16');
          send('setoption name UCI_LimitStrength value true');
          send(`setoption name UCI_Elo value ${elo}`);
          send('isready');
        } else if (line === 'readyok') {
          send(`position fen ${fen}`);
          send(`go movetime ${MOVE_TIME_MS}`);
        } else if (line.startsWith('bestmove')) {
          const move = line.split(/\s+/)[1];
          if (!move || move === '(none)') finish(new Error('O motor do bot não achou lance.'));
          else finish(null, move);
        }
      }
    });
    send('uci');
  });
}

// Measured in bot-vs-bot matches against Stockfish at 1320 (400 ms a move): the old two-ply
// heuristic labelled 1300 lost 0-8 (about -800 Elo), while Stockfish 1320 with 10% random moves
// lost about -280 and with 25% or more lost everything. The scale is steep, so the rate stays small.
const BLUNDER_CURVE: ReadonlyArray<readonly [number, number]> = [
  [1320, 0],
  [1000, 0.11],
  [700, 0.2],
  [400, 0.3],
];

/** Chance that a bot below the engine's floor plays a random legal move instead of the engine's. */
export function blunderRate(strength: number): number {
  const first = BLUNDER_CURVE[0]!;
  const last = BLUNDER_CURVE[BLUNDER_CURVE.length - 1]!;
  if (strength >= first[0]) return 0;
  if (strength <= last[0]) return last[1];
  for (let i = 1; i < BLUNDER_CURVE.length; i += 1) {
    const [highElo, highRate] = BLUNDER_CURVE[i - 1]!;
    const [lowElo, lowRate] = BLUNDER_CURVE[i]!;
    if (strength >= lowElo) {
      return highRate + ((highElo - strength) / (highElo - lowElo)) * (lowRate - highRate);
    }
  }
  return last[1];
}

function randomLegalMove(fen: string, random: () => number): string {
  const legal = new Chess(fen).moves({ verbose: true });
  const move = legal[Math.min(legal.length - 1, Math.floor(random() * legal.length))]!;
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/**
 * The bot's move. Stockfish limited to the bot's Elo (at least 1320); weaker bots are Stockfish
 * at 1320 that sometimes plays a random move. Only an engine failure uses the old two-ply
 * heuristic, which plays far below its label.
 */
export async function selectBotMoveWithEngine(
  fen: string,
  strength: number,
  enginePath = DEFAULT_ENGINE_PATH,
  random: () => number = Math.random,
): Promise<string> {
  if (random() < blunderRate(strength)) return randomLegalMove(fen, random);
  const elo = Math.min(Math.max(Math.round(strength), MIN_ENGINE_ELO), MAX_ENGINE_ELO);
  await acquire();
  try {
    return await askEngine(enginePath, fen, elo);
  } catch {
    return selectBotMove(fen, strength);
  } finally {
    release();
  }
}
