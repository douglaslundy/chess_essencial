import { selectBotMove } from '@xadrez/chess-domain';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The same vendored Stockfish the worker uses for reviews: every runtime image carries all of /app.
const DEFAULT_ENGINE_PATH = fileURLToPath(
  new URL('../../../worker/vendor/stockfish/stockfish-18-lite-single.cjs', import.meta.url),
);
/** Stockfish only plays weaker than full strength from this Elo up; below it the heuristic bot plays. */
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

/**
 * The bot's move. From 1320 Elo up it is Stockfish limited to that Elo (the old two-ply
 * heuristic played far below its label); weaker bots, or any engine failure, use the heuristic.
 */
export async function selectBotMoveWithEngine(
  fen: string,
  strength: number,
  enginePath = DEFAULT_ENGINE_PATH,
): Promise<string> {
  if (strength < MIN_ENGINE_ELO) return selectBotMove(fen, strength);
  const elo = Math.min(Math.round(strength), MAX_ENGINE_ELO);
  await acquire();
  try {
    return await askEngine(enginePath, fen, elo);
  } catch {
    return selectBotMove(fen, strength);
  } finally {
    release();
  }
}
