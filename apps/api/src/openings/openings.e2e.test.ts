import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

describeDatabase('openings and traps database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let token = '';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    const registration = await app.inject({
      method: 'POST',
      payload: {
        displayName: 'Aluno das armadilhas',
        email: 'openings-traps@example.com',
        password: 'openings traps integration password 2026',
        username: 'openings_traps',
      },
      url: '/v1/auth/register',
    });
    expect(registration.statusCode).toBe(201);
    await app.inject({
      method: 'POST',
      payload: { token: registration.json().verificationToken },
      url: '/v1/auth/verify',
    });
    const login = await app.inject({
      method: 'POST',
      payload: {
        identifier: 'openings-traps@example.com',
        password: 'openings traps integration password 2026',
      },
      url: '/v1/auth/login',
    });
    token = login.json().tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (url: string) =>
    app.inject({ headers: { authorization: `Bearer ${token}` }, method: 'GET', url });

  it('lists the traps apart from the openings', async () => {
    const traps = (await get('/v1/openings?kind=trap')).json() as Array<{
      family: string;
      id: string;
      side: string;
      trapIdea?: string;
      trapRank?: number;
    }>;
    expect(traps.length).toBeGreaterThanOrEqual(32);
    // Best first: the ranking follows the catalog order.
    expect(traps.map((trap) => trap.trapRank)).toEqual(
      [...traps].map((trap) => trap.trapRank).sort((a, b) => a! - b!),
    );
    expect(traps[0]?.trapRank).toBe(1);
    for (const trap of traps) {
      expect(trap.trapIdea, trap.family).toBeTruthy();
      expect(['white', 'black']).toContain(trap.side);
    }

    const families = (await get('/v1/openings/families')).json() as Array<{ family: string }>;
    const names = new Set(families.map((item) => item.family));
    expect(traps.some((trap) => names.has(trap.family))).toBe(false);

    const found = (await get('/v1/openings?q=L%C3%A9gal')).json() as unknown[];
    expect(found).toHaveLength(0);
    const legal = (await get('/v1/openings?kind=trap&q=L%C3%A9gal')).json() as unknown[];
    expect(legal).toHaveLength(1);
  });

  it('opens a trap with its idea', async () => {
    const [trap] = (await get('/v1/openings?kind=trap&q=Pastor')).json() as Array<{ id: string }>;
    const detail = (await get(`/v1/openings/${trap!.id}`)).json();
    expect(detail.line.trapIdea).toContain('f7');
    expect(detail.line.moves.at(-1)).toBe('Qxf7#');
  });
});
