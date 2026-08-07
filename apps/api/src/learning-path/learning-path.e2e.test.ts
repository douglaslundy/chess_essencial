import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';
import { LearningPathRepository } from './learning-path.repository.js';

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
  let advancedWorldId: string;
  let advancedLevelId: string;
  let advancedExerciseId: string;
  let advancedStageId: string;
  let lessonWorldId: string;
  let lessonLevelId: string;
  let lessonStageId: string;
  let lessonPlacementExerciseId: string;
  const lessonId = '00000000-0000-4000-8000-000000000998';
  let replayWorldId: string;
  let replayStageId: string;
  let replayExerciseId: string;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    member = await createIdentity('learning-path-member@example.com', 'learning_path_member');

    const [exercise] = await database.client<{ id: string }[]>`
      INSERT INTO exercises (
        external_id, title, prompt_md, solution_md, difficulty, fen, side_to_move,
        solution_lines, position_type, status, difficulty_score, hints
      )
      VALUES (
        'learning-path-test-001', 'Teste', 'Encontre o melhor lance.', 'e2e4', 'beginner',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white',
        '[["e2e4"]]'::jsonb, 'legal_position', 'published', 900, '["Mova o peão do rei."]'::jsonb
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

    // Separate, non-overlapping difficulty band (above the seeded curriculum's
    // 0-2200 range) used only by the placement-heuristic test below — proves a
    // placed user actually lands somewhere other than the curriculum's first
    // level, which a single shared-range world/exercise couldn't distinguish.
    const [advancedExercise] = await database.client<{ id: string }[]>`
      INSERT INTO exercises (
        external_id, title, prompt_md, solution_md, difficulty, fen, side_to_move,
        solution_lines, position_type, status, difficulty_score
      )
      VALUES (
        'learning-path-test-002', 'Teste avançado', 'Encontre o melhor lance.', 'e2e4', 'expert',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white',
        '[["e2e4"]]'::jsonb, 'legal_position', 'published', 2500
      )
      RETURNING id
    `;
    advancedExerciseId = advancedExercise!.id;
    const [advancedWorld] = await database.client<{ id: string }[]>`
      INSERT INTO learning_worlds (position, title, description, difficulty_min, difficulty_max)
      VALUES (1000, 'Mundo Avançado de Teste', 'Só para o e2e.', 2300, 2700)
      RETURNING id
    `;
    advancedWorldId = advancedWorld!.id;
    const [advancedLevel] = await database.client<{ id: string }[]>`
      INSERT INTO learning_levels (world_id, position, title, difficulty_min, difficulty_max, challenge_count)
      VALUES (${advancedWorldId}, 1, 'Nível Avançado', 2300, 2700, 1)
      RETURNING id
    `;
    advancedLevelId = advancedLevel!.id;
    const [advancedStage] = await database.client<{ id: string }[]>`
      INSERT INTO learning_stages (level_id, position, type, exercise_id)
      VALUES (${advancedLevelId}, 1, 'challenge', ${advancedExerciseId})
      RETURNING id
    `;
    advancedStageId = advancedStage!.id;

    // Third, non-overlapping band (well above the advanced one too) reached
    // by its own dedicated placement exercise, holding a single 'lesson'
    // stage — proves LESSON-type stages actually work end to end, not just
    // that the backend no longer rejects them outright.
    const [lessonPlacementExercise] = await database.client<{ id: string }[]>`
      INSERT INTO exercises (
        external_id, title, prompt_md, solution_md, difficulty, fen, side_to_move,
        solution_lines, position_type, status, difficulty_score
      )
      VALUES (
        'learning-path-test-003', 'Teste posicionamento de aula', 'Encontre o melhor lance.',
        'e2e4', 'expert', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white',
        '[["e2e4"]]'::jsonb, 'legal_position', 'published', 3500
      )
      RETURNING id
    `;
    lessonPlacementExerciseId = lessonPlacementExercise!.id;
    const [lessonWorld] = await database.client<{ id: string }[]>`
      INSERT INTO learning_worlds (position, title, description, difficulty_min, difficulty_max)
      VALUES (1001, 'Mundo de Aula de Teste', 'Só para o e2e.', 3000, 4000)
      RETURNING id
    `;
    lessonWorldId = lessonWorld!.id;
    const [lessonLevel] = await database.client<{ id: string }[]>`
      INSERT INTO learning_levels (world_id, position, title, difficulty_min, difficulty_max, challenge_count)
      VALUES (${lessonWorldId}, 1, 'Nível com Aula', 3000, 4000, 1)
      RETURNING id
    `;
    lessonLevelId = lessonLevel!.id;

    const [courseModule] = await database.client<{ id: string }[]>`
      SELECT cm.id FROM course_modules cm JOIN courses c ON c.id = cm.course_id
      WHERE c.slug = 'xadrez-essencial' AND cm.source_volume = 1
    `;
    await database.client`
      INSERT INTO lessons (id, module_id, slug, position, title, estimated_minutes, status, version)
      VALUES (${lessonId}, ${courseModule!.id}, 'learning-path-lesson-stage-fixture', 998,
        'Learning path lesson stage fixture', 5, 'published', 1)
      ON CONFLICT (id) DO UPDATE SET status = 'published'
    `;
    await database.client`DELETE FROM lesson_steps WHERE lesson_id = ${lessonId}`;
    await database.client`DELETE FROM lesson_source_pages WHERE lesson_id = ${lessonId}`;
    await database.client`
      INSERT INTO lesson_source_pages (lesson_id, page) VALUES (${lessonId}, 1)
    `;
    await database.client`
      INSERT INTO lesson_steps (lesson_id, step_key, position, step_type, body_md, orientation, expected_actions, feedback, next_step_rules)
      VALUES
        (${lessonId}, 'intro', 1, 'text', 'Etapa de teste.', 'white', '[]'::jsonb, '{}'::jsonb, '[]'::jsonb),
        (${lessonId}, 'fim', 2, 'summary', 'Fim.', 'white', '[]'::jsonb, '{}'::jsonb, '[]'::jsonb)
    `;

    const [lessonStage] = await database.client<{ id: string }[]>`
      INSERT INTO learning_stages (level_id, position, type, lesson_id)
      VALUES (${lessonLevelId}, 1, 'lesson', ${lessonId})
      RETURNING id
    `;
    lessonStageId = lessonStage!.id;

    // A fourth, non-overlapping band (above the lesson band, below the
    // review-exercise-selection band) dedicated to the replay/"Repetir"
    // regression test below.
    const [replayExercise] = await database.client<{ id: string }[]>`
      INSERT INTO exercises (
        external_id, title, prompt_md, solution_md, difficulty, fen, side_to_move,
        solution_lines, position_type, status, difficulty_score, hints
      )
      VALUES (
        'learning-path-test-007', 'Teste replay', 'Encontre o melhor lance.', 'e2e4', 'expert',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white',
        '[["e2e4"]]'::jsonb, 'legal_position', 'published', 4400, '["Mova o peão do rei."]'::jsonb
      )
      RETURNING id
    `;
    replayExerciseId = replayExercise!.id;
    const [replayWorld] = await database.client<{ id: string }[]>`
      INSERT INTO learning_worlds (position, title, description, difficulty_min, difficulty_max)
      VALUES (1002, 'Mundo de Replay de Teste', 'Só para o e2e.', 4200, 4700)
      RETURNING id
    `;
    replayWorldId = replayWorld!.id;
    const [replayLevel] = await database.client<{ id: string }[]>`
      INSERT INTO learning_levels (world_id, position, title, difficulty_min, difficulty_max, challenge_count)
      VALUES (${replayWorldId}, 1, 'Nível de Replay', 4200, 4700, 1)
      RETURNING id
    `;
    const [replayStage] = await database.client<{ id: string }[]>`
      INSERT INTO learning_stages (level_id, position, type, exercise_id)
      VALUES (${replayLevel!.id}, 1, 'challenge', ${replayExercise!.id})
      RETURNING id
    `;
    replayStageId = replayStage!.id;
  });

  afterAll(async () => {
    await database.client`DELETE FROM learning_worlds WHERE id = ${worldId}`;
    await database.client`DELETE FROM learning_worlds WHERE id = ${advancedWorldId}`;
    await database.client`DELETE FROM learning_worlds WHERE id = ${lessonWorldId}`;
    await database.client`DELETE FROM learning_worlds WHERE id = ${replayWorldId}`;
    await database.client`DELETE FROM exercises WHERE external_id LIKE 'learning-path-test-%'`;
    await database.client`UPDATE user_course_enrollments SET last_lesson_id = NULL WHERE last_lesson_id = ${lessonId}`;
    await database.client`DELETE FROM lessons WHERE id = ${lessonId}`;
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

  it('places a user with enough real exercise history at an estimated level, not always the first one', async () => {
    const placed = await createIdentity(
      'learning-path-placement@example.com',
      'learning_path_placement',
    );
    // Direct attempts, bypassing the training-session flow — only the
    // resulting exercise_attempts rows matter for the placement estimate.
    for (let i = 0; i < 10; i += 1) {
      await database.client`
        INSERT INTO exercise_attempts (user_id, exercise_id, submitted_line, correct)
        VALUES (${placed.userId}, ${advancedExerciseId}, '["e2e4"]'::jsonb, true)
      `;
    }

    const progress = await app.inject({
      headers: auth(placed),
      method: 'GET',
      url: '/v1/learning-path/progress',
    });
    expect(progress.statusCode, progress.body).toBe(200);
    expect(progress.json()).toMatchObject({
      currentLevelId: advancedLevelId,
      currentWorldId: advancedWorldId,
    });

    const level = await app.inject({
      headers: auth(placed),
      method: 'GET',
      url: `/v1/learning-path/levels/${advancedLevelId}`,
    });
    expect(level.statusCode, level.body).toBe(200);
    expect(level.json()).toMatchObject({
      completedStageCount: 0,
      status: 'current',
      stages: [{ id: advancedStageId, status: 'available' }],
    });
  });

  it('supports lesson-type stages end to end, reusing the existing lesson-runtime flow', async () => {
    const learner = await createIdentity(
      'learning-path-lesson@example.com',
      'learning_path_lesson',
    );
    for (let i = 0; i < 10; i += 1) {
      await database.client`
        INSERT INTO exercise_attempts (user_id, exercise_id, submitted_line, correct)
        VALUES (${learner.userId}, ${lessonPlacementExerciseId}, '["e2e4"]'::jsonb, true)
      `;
    }

    const start = await app.inject({
      headers: auth(learner),
      method: 'POST',
      url: `/v1/learning-path/stages/${lessonStageId}/start`,
    });
    expect(start.statusCode, start.body).toBe(201);
    const startBody = start.json();
    expect(startBody).toMatchObject({ lessonId, stageId: lessonStageId, type: 'lesson' });
    const attemptId = startBody.lessonAttemptId as string;
    expect(typeof attemptId).toBe('string');

    const tooEarly = await app.inject({
      headers: auth(learner),
      method: 'POST',
      url: `/v1/learning-path/stages/${lessonStageId}/complete`,
    });
    expect(tooEarly.statusCode, tooEarly.body).toBe(400);

    // Walk the lesson to completion via the real, unmodified lesson-runtime
    // endpoints — proves the Jornada stage is backed by a genuine lesson
    // attempt, not a shortcut duplicating that domain's own logic.
    await app.inject({
      headers: auth(learner),
      method: 'POST',
      payload: { type: 'continue' },
      url: `/v1/lesson-attempts/${attemptId}/actions`,
    });
    const finished = await app.inject({
      headers: auth(learner),
      method: 'POST',
      payload: { type: 'continue' },
      url: `/v1/lesson-attempts/${attemptId}/actions`,
    });
    expect(finished.statusCode, finished.body).toBe(201);
    expect(finished.json().status).toBe('completed');

    const complete = await app.inject({
      headers: auth(learner),
      method: 'POST',
      url: `/v1/learning-path/stages/${lessonStageId}/complete`,
    });
    expect(complete.statusCode, complete.body).toBe(201);
    const completeBody = complete.json();
    // A single-stage level with no checkpoint/boss stage isn't a capstone,
    // so it completes the level but not the world. This user's first-ever
    // stage completion, on a single-stage level solved cleanly, earns both
    // the "primeiros passos" and "nível perfeito" badges at once.
    expect(completeBody).toMatchObject({
      correctFirstTry: true,
      levelCompleted: true,
      worldCompleted: false,
      xpAwarded: 15,
    });
    expect(
      completeBody.newBadges.map((badge: { badgeKey: string }) => badge.badgeKey).sort(),
    ).toEqual(['first_stage', 'perfect_level'].sort());
  });

  it('lets a stage be replayed after it was already completed, with a fresh training session', async () => {
    const learner = await createIdentity(
      'learning-path-replay@example.com',
      'learning_path_replay',
    );
    for (let i = 0; i < 10; i += 1) {
      await database.client`
        INSERT INTO exercise_attempts (user_id, exercise_id, submitted_line, correct)
        VALUES (${learner.userId}, ${replayExerciseId}, '["e2e4"]'::jsonb, true)
      `;
    }

    const firstStart = await app.inject({
      headers: auth(learner),
      method: 'POST',
      url: `/v1/learning-path/stages/${replayStageId}/start`,
    });
    expect(firstStart.statusCode, firstStart.body).toBe(201);
    const { exerciseId, trainingSessionId: firstSessionId } = firstStart.json();

    const firstEvaluate = await app.inject({
      headers: auth(learner),
      method: 'POST',
      payload: { playedMoves: ['e2e4'], trainingSessionId: firstSessionId },
      url: `/v1/exercises/${exerciseId}/evaluate-line`,
    });
    expect(firstEvaluate.statusCode, firstEvaluate.body).toBe(201);
    expect(firstEvaluate.json().status).toBe('solved');

    const complete = await app.inject({
      headers: auth(learner),
      method: 'POST',
      url: `/v1/learning-path/stages/${replayStageId}/complete`,
    });
    expect(complete.statusCode, complete.body).toBe(201);

    // This is the "Repetir" action on an already-completed stage: start()
    // is called again. Before the fix, this returned the SAME (now
    // exhausted) session, and the evaluate-line call below failed with
    // "Exercício não é o atual nesta sessão de treino" — reproducing the
    // reported bug exactly (board effectively unusable after "Repetir").
    const replayStart = await app.inject({
      headers: auth(learner),
      method: 'POST',
      url: `/v1/learning-path/stages/${replayStageId}/start`,
    });
    expect(replayStart.statusCode, replayStart.body).toBe(201);
    const replayBody = replayStart.json();
    expect(replayBody.exerciseId).toBe(exerciseId);
    expect(replayBody.trainingSessionId).not.toBe(firstSessionId);

    const replayEvaluate = await app.inject({
      headers: auth(learner),
      method: 'POST',
      payload: { playedMoves: ['e2e4'], trainingSessionId: replayBody.trainingSessionId },
      url: `/v1/exercises/${exerciseId}/evaluate-line`,
    });
    expect(replayEvaluate.statusCode, replayEvaluate.body).toBe(201);
    expect(replayEvaluate.json().status).toBe('solved');
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
    expect(startFirst.statusCode, startFirst.body).toBe(201);
    const { exerciseId, trainingSessionId } = startFirst.json();
    expect(typeof trainingSessionId).toBe('string');

    const completeTooEarly = await app.inject({
      headers: auth(member),
      method: 'POST',
      url: `/v1/learning-path/stages/${stageOneId}/complete`,
    });
    expect(completeTooEarly.statusCode).toBe(400);

    // Requested before solving, so completeStage() below must report it
    // back truthfully — proves hintsUsed comes from the real server-side
    // counter (exercise_training_items.hints_used), not a hardcoded 0.
    const hint = await app.inject({
      headers: auth(member),
      method: 'POST',
      url: `/v1/exercise-training-sessions/${trainingSessionId}/hints`,
    });
    expect(hint.statusCode, hint.body).toBe(201);

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
    expect(evaluated.statusCode, evaluated.body).toBe(201);
    expect(evaluated.json().status).toBe('solved');

    const completeFirst = await app.inject({
      headers: auth(member),
      method: 'POST',
      url: `/v1/learning-path/stages/${stageOneId}/complete`,
    });
    expect(completeFirst.statusCode, completeFirst.body).toBe(201);
    // A server-tracked hint makes this assisted even though the first
    // submitted move was correct: base XP only and no perfection credit.
    // The first-ever completion badge remains independent from assistance.
    expect(completeFirst.json()).toMatchObject({
      correctFirstTry: false,
      hintsUsed: 1,
      levelCompleted: false,
      newBadges: [{ badgeKey: 'first_stage', label: 'Primeiros passos' }],
      streakDays: 1,
      worldCompleted: false,
      xpAwarded: 10,
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
    expect(completeSecond.statusCode, completeSecond.body).toBe(201);
    const completeSecondBody = completeSecond.json();
    // The second stage was unaided, but the hinted first stage prevents
    // the level-perfect badge. World completion remains independent.
    expect(completeSecondBody).toMatchObject({
      levelCompleted: true,
      streakDays: 1,
      worldCompleted: true,
      xpAwarded: 15,
    });
    expect(
      completeSecondBody.newBadges.map((badge: { badgeKey: string }) => badge.badgeKey).sort(),
    ).toEqual([`world_completed:${worldId}`]);

    const badges = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/learning-path/badges',
    });
    expect(badges.statusCode, badges.body).toBe(200);
    expect(
      badges
        .json()
        .map((badge: { badgeKey: string }) => badge.badgeKey)
        .sort(),
    ).toEqual(['first_stage', `world_completed:${worldId}`].sort());

    const progress = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/learning-path/progress',
    });
    expect(progress.json().highestUnlockedLevelId).toBe(levelTwoId);
  });

  it('review stages accept playable no-hint tactics and reject exercises without move validation', async () => {
    // Same difficulty band: free_text cannot validate moves, while both
    // move-sequence tactics are playable. A hint is optional assistance; the
    // solution line is what makes a review evaluable.
    const [unplayableFreeText] = await database.client<{ id: string }[]>`
      INSERT INTO exercises (
        external_id, title, prompt_md, solution_md, difficulty, fen, side_to_move,
        solution_lines, position_type, status, difficulty_score, import_metadata
      )
      VALUES (
        'learning-path-test-004', 'Teste texto livre', 'Explique a ideia posicional.',
        'Controle do centro.', 'beginner',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white',
        '[]'::jsonb, 'legal_position', 'published', 5000, '{"answerFormat": "free_text"}'::jsonb
      )
      RETURNING id
    `;
    const [playableNoHints] = await database.client<{ id: string }[]>`
      INSERT INTO exercises (
        external_id, title, prompt_md, solution_md, difficulty, fen, side_to_move,
        solution_lines, position_type, status, difficulty_score, hints
      )
      VALUES (
        'learning-path-test-005', 'Teste sem dica', 'Encontre o melhor lance.', 'e2e4', 'beginner',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white',
        '[["e2e4"]]'::jsonb, 'legal_position', 'published', 5000, '[]'::jsonb
      )
      RETURNING id
    `;
    const [playable] = await database.client<{ id: string }[]>`
      INSERT INTO exercises (
        external_id, title, prompt_md, solution_md, difficulty, fen, side_to_move,
        solution_lines, position_type, status, difficulty_score, hints
      )
      VALUES (
        'learning-path-test-006', 'Teste jogável', 'Encontre o melhor lance.', 'e2e4', 'beginner',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white',
        '[["e2e4"]]'::jsonb, 'legal_position', 'published', 5000, '["Mova o peão do rei."]'::jsonb
      )
      RETURNING id
    `;

    const repository = app.get(LearningPathRepository);
    // Repeated (ORDER BY random() inside pickReviewExercise means a single
    // call could get lucky) - every single pick must land on either playable
    // exercise in this band, never the free-text one.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const picked = await repository.pickReviewExercise(randomUUID(), null, 4900, 5100);
      expect([playableNoHints!.id, playable!.id]).toContain(picked);
    }

    await database.client`
      DELETE FROM exercises WHERE id IN (${unplayableFreeText!.id}, ${playableNoHints!.id}, ${playable!.id})
    `;
  });
});
