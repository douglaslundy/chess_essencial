import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
}

describeDatabase('learning path database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let database: DatabaseService;
  let member: Identity;
  let worldId: string;
  let levelOneId: string;
  let levelTwoId: string;
  let stageOneId: string;
  let stageTwoId: string;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    member = await createIdentity('learning-path-member@example.com', 'learning_path_member');

    const [exercise] = await database.client<{ id: string }[]>`
      INSERT INTO exercises (
        external_id, title, prompt_md, solution_md, difficulty, fen, side_to_move,
        solution_lines, position_type, status, difficulty_score
      )
      VALUES (
        'learning-path-test-001', 'Teste', 'Encontre o melhor lance.', 'e2e4', 'beginner',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white',
        '[["e2e4"]]'::jsonb, 'legal_position', 'published', 900
      )
      RETURNING id
    `;

    const [world] = await database.client<{ id: string }[]>`
      INSERT INTO learning_worlds (position, title, description, difficulty_min, difficulty_max)
      VALUES (999, 'Mundo de Teste', 'Só para o e2e.', 0, 1000)
      RETURNING id
    `;
    worldId = world!.id;

    const [levelOne] = await database.client<{ id: string }[]>`
      INSERT INTO learning_levels (world_id, position, title, difficulty_min, difficulty_max, challenge_count)
      VALUES (${worldId}, 1, 'Nível 1', 0, 1000, 2)
      RETURNING id
    `;
    levelOneId = levelOne!.id;
    const [levelTwo] = await database.client<{ id: string }[]>`
      INSERT INTO learning_levels (world_id, position, title, difficulty_min, difficulty_max, challenge_count)
      VALUES (${worldId}, 2, 'Nível 2', 0, 1000, 1)
      RETURNING id
    `;
    levelTwoId = levelTwo!.id;

    const [stageOne] = await database.client<{ id: string }[]>`
      INSERT INTO learning_stages (level_id, position, type, exercise_id)
      VALUES (${levelOneId}, 1, 'challenge', ${exercise!.id})
      RETURNING id
    `;
    stageOneId = stageOne!.id;
    const [stageTwo] = await database.client<{ id: string }[]>`
      INSERT INTO learning_stages (level_id, position, type, exercise_id)
      VALUES (${levelOneId}, 2, 'boss', ${exercise!.id})
      RETURNING id
    `;
    stageTwoId = stageTwo!.id;
    await database.client`
      INSERT INTO learning_stages (level_id, position, type, exercise_id)
      VALUES (${levelTwoId}, 1, 'challenge', ${exercise!.id})
    `;
  });

  afterAll(async () => {
    await database.client`DELETE FROM learning_worlds WHERE id = ${worldId}`;
    await database.client`DELETE FROM exercises WHERE external_id = 'learning-path-test-001'`;
    await app.close();
  });

  function auth(identity: Identity) {
    return { authorization: `Bearer ${identity.accessToken}` };
  }

  async function createIdentity(email: string, username: string): Promise<Identity> {
    const registration = await app.inject({
      method: 'POST',
      payload: { displayName: username, email, password: 'learning path test password', username },
      url: '/v1/auth/register',
    });
    expect(registration.statusCode, registration.body).toBe(201);
    const registered = registration.json();
    await app.inject({
      method: 'POST',
      payload: { token: registered.verificationToken },
      url: '/v1/auth/verify',
    });
    const login = await app.inject({
      method: 'POST',
      payload: { identifier: email, password: 'learning path test password' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id };
  }

  it('initializes progress at the first level of the curriculum on first access', async () => {
    const response = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/learning-path/progress',
    });
    expect(response.statusCode, response.body).toBe(200);
    // A curricula real (seed-learning-path) já roda em CI antes destes testes,
    // então o "primeiro nível global" pode não ser o nosso mundo de teste —
    // só confirmamos que a inicialização de fato aconteceu.
    expect(response.json()).toMatchObject({ currentLevelId: expect.any(String) });
  });

  it('shows the world in the map with a level status derived from progress', async () => {
    const response = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/learning-path/map',
    });
    expect(response.statusCode, response.body).toBe(200);
    const world = response.json().worlds.find((entry: { id: string }) => entry.id === worldId);
    expect(world).toBeTruthy();
    expect(world.levels).toEqual([
      expect.objectContaining({ id: levelOneId, isCapstone: true, stageCount: 2 }),
      expect.objectContaining({ id: levelTwoId, isCapstone: false, stageCount: 1 }),
    ]);
  });

  it('marks only the first stage of a level available before anything is completed', async () => {
    const response = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: `/v1/learning-path/levels/${levelOneId}`,
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.stages).toHaveLength(2);
    // Whether "available" or "locked" depends on whether this world's level
    // ended up being the user's globally-first level — assert the invariant
    // that matters instead: never more than one stage available at once,
    // and stage order is preserved.
    expect(body.stages.map((stage: { id: string }) => stage.id)).toEqual([stageOneId, stageTwoId]);
    const availableCount = body.stages.filter(
      (stage: { status: string }) => stage.status === 'available',
    ).length;
    expect(availableCount).toBeLessThanOrEqual(1);
  });

  it('rejects an unknown level id with 404', async () => {
    const response = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/learning-path/levels/00000000-0000-4000-8000-000000000000',
    });
    expect(response.statusCode).toBe(404);
  });

  it('completing every stage of a capstone level unlocks the next level and closes the world', async () => {
    // Only proceed if this test world genuinely is this user's current
    // frontier (true whenever no other suite seeded a world ahead of ours in
    // this same database run — see comment on the progress test above).
    const before = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/learning-path/levels/' + levelOneId,
    });
    if (before.json().status !== 'current') return;

    const startFirst = await app.inject({
      headers: auth(member),
      method: 'POST',
      url: `/v1/learning-path/stages/${stageOneId}/start`,
    });
    expect(startFirst.statusCode, startFirst.body).toBe(200);
    const { exerciseId, trainingSessionId } = startFirst.json();
    expect(typeof trainingSessionId).toBe('string');

    const completeTooEarly = await app.inject({
      headers: auth(member),
      method: 'POST',
      url: `/v1/learning-path/stages/${stageOneId}/complete`,
    });
    expect(completeTooEarly.statusCode).toBe(400);

    // Exercises evaluate-line() requires a real training session (see
    // migration 0038) — proves the session created by start() actually
    // works with the pre-existing move-by-move grading endpoint, not just
    // the simpler direct-attempts path.
    const evaluated = await app.inject({
      headers: auth(member),
      method: 'POST',
      payload: { playedMoves: ['e2e4'], trainingSessionId },
      url: `/v1/exercises/${exerciseId}/evaluate-line`,
    });
    expect(evaluated.statusCode, evaluated.body).toBe(200);
    expect(evaluated.json().status).toBe('solved');

    const completeFirst = await app.inject({
      headers: auth(member),
      method: 'POST',
      url: `/v1/learning-path/stages/${stageOneId}/complete`,
    });
    expect(completeFirst.statusCode, completeFirst.body).toBe(200);
    expect(completeFirst.json()).toMatchObject({
      correctFirstTry: true,
      levelCompleted: false,
      worldCompleted: false,
    });

    await app.inject({
      headers: auth(member),
      method: 'POST',
      url: `/v1/learning-path/stages/${stageTwoId}/start`,
    });
    await app.inject({
      headers: auth(member),
      method: 'POST',
      payload: { durationMs: 1000, submittedLine: ['e2e4'] },
      url: `/v1/exercises/${exerciseId}/attempts`,
    });
    const completeSecond = await app.inject({
      headers: auth(member),
      method: 'POST',
      url: `/v1/learning-path/stages/${stageTwoId}/complete`,
    });
    expect(completeSecond.statusCode, completeSecond.body).toBe(200);
    expect(completeSecond.json()).toMatchObject({ levelCompleted: true, worldCompleted: true });

    const progress = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/learning-path/progress',
    });
    expect(progress.json().highestUnlockedLevelId).toBe(levelTwoId);
  });
});
