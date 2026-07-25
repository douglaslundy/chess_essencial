import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ENGINE_PATH = fileURLToPath(
  new URL('../../vendor/stockfish/stockfish-18-lite-single.cjs', import.meta.url),
);
const DEFAULT_DEPTH = 14;
const EVALUATE_TIMEOUT_MS = 30_000;

export interface EngineEvaluation {
  bestMove: string | null;
  /** Forced mate distance in plies from the side-to-move's perspective, or null. */
  mate: number | null;
  pv: string[];
  /** Score in centipawns from the side-to-move's perspective (raw UCI convention), or null when mate is set. */
  scoreCp: number | null;
}

export interface EvaluateOptions {
  depth?: number;
}

/**
 * Evaluates a FEN position with a fresh, single-use Stockfish subprocess.
 *
 * The returned score is reported from the perspective of the side to move in
 * `fen` — the standard UCI convention. Callers comparing a position "before"
 * a move against the resulting position "after" that move must negate the
 * "after" score before comparing the two, since after a move the side to
 * move flips to the opponent (see `@xadrez/chess-domain`'s `classifyMove`,
 * whose inputs are expected already normalized to a single player's
 * perspective).
 */
export async function evaluatePosition(
  fen: string,
  options: EvaluateOptions = {},
): Promise<EngineEvaluation> {
  const depth = options.depth ?? DEFAULT_DEPTH;
  const child = spawn(process.execPath, [ENGINE_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.on('error', () => {
    // Writing after the engine process has exited (e.g. during cleanup); safe to ignore.
  });

  let settled = false;
  let stdoutBuffer = '';
  let stderrOutput = '';
  let latestScoreCp: number | null = null;
  let latestMate: number | null = null;
  let latestPv: string[] = [];

  const writeLine = (line: string) => {
    if (child.stdin.destroyed) return;
    child.stdin.write(`${line}\n`);
  };

  try {
    return await new Promise<EngineEvaluation>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new Error(
            `Motor de xadrez excedeu o tempo limite ao avaliar a posição "${fen}" (${stderrOutput})`,
          ),
        );
      }, EVALUATE_TIMEOUT_MS);

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });

      child.on('exit', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(
          new Error(`Motor de xadrez encerrou inesperadamente (código ${code}): ${stderrOutput}`),
        );
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrOutput += chunk.toString('utf8');
      });

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8');
        let newlineIndex = stdoutBuffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = stdoutBuffer.slice(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
          newlineIndex = stdoutBuffer.indexOf('\n');
          if (line.length === 0) continue;

          if (line === 'uciok') {
            writeLine('isready');
          } else if (line === 'readyok') {
            writeLine(`position fen ${fen}`);
            writeLine(`go depth ${depth}`);
          } else if (line.startsWith('info') && line.includes(' pv ')) {
            const scoreMatch = /score (cp|mate) (-?\d+)/.exec(line);
            if (scoreMatch) {
              if (scoreMatch[1] === 'cp') {
                latestScoreCp = Number(scoreMatch[2]);
                latestMate = null;
              } else {
                latestMate = Number(scoreMatch[2]);
                latestScoreCp = null;
              }
            }
            const pvMatch = /\bpv\s+(.+)$/.exec(line);
            if (pvMatch?.[1]) latestPv = pvMatch[1].trim().split(/\s+/);
          } else if (line.startsWith('bestmove')) {
            if (settled) continue;
            settled = true;
            clearTimeout(timeout);
            const [, bestMoveToken] = line.split(/\s+/);
            resolve({
              bestMove: !bestMoveToken || bestMoveToken === '(none)' ? null : bestMoveToken,
              mate: latestMate,
              pv: latestPv,
              scoreCp: latestScoreCp,
            });
          }
        }
      });

      writeLine('uci');
    });
  } finally {
    try {
      writeLine('quit');
    } catch {
      // Process may have already exited; killing below is sufficient cleanup.
    }
    child.kill();
  }
}
