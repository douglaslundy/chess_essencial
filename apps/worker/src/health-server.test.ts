import { afterEach, describe, expect, it } from 'vitest';

import { createHealthServer } from './health-server.js';

describe('worker health server', () => {
  const servers: ReturnType<typeof createHealthServer>[] = [];

  afterEach(() => {
    for (const server of servers) server.close();
    servers.length = 0;
  });

  it('returns an OK health response', async () => {
    const server = createHealthServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Port was not assigned');

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ service: 'worker', status: 'ok' });
  });
});
