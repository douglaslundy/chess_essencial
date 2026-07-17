import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

const isWindows = process.platform === 'win32';
const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm';
const commandArgs = isWindows ? ['/d', '/s', '/c', 'pnpm dev'] : ['dev'];
const child = spawn(command, commandArgs, {
  cwd: process.cwd(),
  detached: !isWindows,
  env: {
    ...process.env,
    API_PORT: '4100',
    PORT: '3100',
    WORKER_HEALTH_PORT: '4101',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-20_000);
  });
}

const endpoints = [
  ['web', 'http://127.0.0.1:3100/api/health'],
  ['api', 'http://127.0.0.1:4100/v1/health'],
  ['worker', 'http://127.0.0.1:4101/health'],
];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForEndpoint(name, url) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`pnpm dev exited before ${name} became healthy`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        const body = await response.json();
        if (body.status === 'ok') {
          console.log(`smoke.dev ${name}=ok`);
          return;
        }
      }
    } catch {
      // The service may still be starting.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${name} at ${url}`);
}

function stopDevTree() {
  if (child.exitCode !== null) return;

  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    });
  } else {
    process.kill(-child.pid, 'SIGTERM');
  }
}

try {
  await Promise.all(endpoints.map(([name, url]) => waitForEndpoint(name, url)));
  console.log('smoke.dev all=ok');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  stopDevTree();
}
