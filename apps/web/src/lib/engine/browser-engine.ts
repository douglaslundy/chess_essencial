export interface EngineEvaluation {
  bestMove: string | null;
  mate: number | null;
  principalVariation: string[];
  scoreCp: number | null;
}

export interface EvaluateOptions {
  depth?: number;
}

const ENGINE_URL = '/engine/stockfish-18-lite-single.js';
const DEFAULT_DEPTH = 10;
const EVALUATE_TIMEOUT_MS = 15_000;

let workerPromise: Promise<Worker> | null = null;
// Stockfish speaks one UCI conversation at a time; queue evaluate() calls so
// a second call's "position"/"go" can't interleave with a still-running one.
let queue: Promise<unknown> = Promise.resolve();

function getWorker(): Promise<Worker> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('O motor de xadrez só roda no navegador'));
  }
  if (!workerPromise) {
    workerPromise = new Promise<Worker>((resolve, reject) => {
      const worker = new Worker(ENGINE_URL);
      const onMessage = (event: MessageEvent<string>) => {
        if (event.data === 'uciok') {
          worker.removeEventListener('message', onMessage);
          resolve(worker);
        }
      };
      const onError = (event: ErrorEvent) => {
        worker.removeEventListener('message', onMessage);
        reject(event.error instanceof Error ? event.error : new Error('Falha ao iniciar o motor'));
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError, { once: true });
      worker.postMessage('uci');
    });
  }
  return workerPromise;
}

/** Evaluates a FEN position using the browser's Stockfish Web Worker (fast/shallow by default — for the Treinador's real-time suggestion and blunder check, not the deeper server-side post-game analysis). */
export function evaluatePosition(
  fen: string,
  options: EvaluateOptions = {},
): Promise<EngineEvaluation> {
  const depth = options.depth ?? DEFAULT_DEPTH;
  const task = queue.then(() => runEvaluation(fen, depth));
  queue = task.catch(() => undefined);
  return task;
}

async function runEvaluation(fen: string, depth: number): Promise<EngineEvaluation> {
  const worker = await getWorker();
  return new Promise<EngineEvaluation>((resolve, reject) => {
    let scoreCp: number | null = null;
    let mate: number | null = null;
    let principalVariation: string[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Motor de xadrez excedeu o tempo limite'));
    }, EVALUATE_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    }

    function onMessage(event: MessageEvent<string>) {
      const line = event.data;
      if (settled || typeof line !== 'string') return;
      if (line.startsWith('info') && line.includes(' pv ')) {
        const scoreMatch = /score (cp|mate) (-?\d+)/.exec(line);
        if (scoreMatch) {
          if (scoreMatch[1] === 'cp') {
            scoreCp = Number(scoreMatch[2]);
            mate = null;
          } else {
            mate = Number(scoreMatch[2]);
            scoreCp = null;
          }
        }
        const pvMatch = /\bpv\s+(.+)$/.exec(line);
        if (pvMatch?.[1]) principalVariation = pvMatch[1].trim().split(/\s+/);
      } else if (line.startsWith('bestmove')) {
        settled = true;
        cleanup();
        const [, bestMoveToken] = line.split(/\s+/);
        resolve({
          bestMove: !bestMoveToken || bestMoveToken === '(none)' ? null : bestMoveToken,
          mate,
          principalVariation,
          scoreCp,
        });
      }
    }

    function onError(event: ErrorEvent) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(event.error instanceof Error ? event.error : new Error('Erro no motor de xadrez'));
    }

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage(`position fen ${fen}`);
    worker.postMessage(`go depth ${depth}`);
  });
}
