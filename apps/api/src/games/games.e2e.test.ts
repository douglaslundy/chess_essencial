import { ChessJsRules } from '@xadrez/chess-domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;
interface Identity {
  accessToken: string;
  userId: string;
}

describeDatabase('games database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let white: Identity;
  let black: Identity;
  let gameId = '';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    white = await createIdentity('white@example.com', 'game_white');
    black = await createIdentity('black@example.com', 'game_black');
  });
  afterAll(async () => app.close());

  async function createIdentity(email: string, username: string): Promise<Identity> {
    const registration = await app.inject({
      method: 'POST',
      payload: {
        displayName: username,
        email,
        password: 'game integration password 2026',
        username,
      },
      url: '/v1/auth/register',
    });
    expect(registration.statusCode).toBe(201);
    const registered = registration.json();
    expect(
      (
        await app.inject({
          method: 'POST',
          payload: { token: registered.verificationToken },
          url: '/v1/auth/verify',
        })
      ).statusCode,
    ).toBe(200);
    const login = await app.inject({
      method: 'POST',
      payload: { identifier: email, password: 'game integration password 2026' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id };
  }

  const auth = (identity: Identity) => ({ authorization: `Bearer ${identity.accessToken}` });
  async function move(
    identity: Identity,
    clientMoveId: string,
    expectedVersion: number,
    uci: string,
  ) {
    return app.inject({
      headers: auth(identity),
      method: 'POST',
      payload: { clientMoveId, expectedVersion, uci },
      url: `/v1/games/${gameId}/moves`,
    });
  }

  it('creates server-owned state', async () => {
    const response = await app.inject({
      headers: auth(white),
      method: 'POST',
      payload: {
        opponentUserId: black.userId,
        timeControlCode: 'blitz-3-0',
        currentFen: 'untrusted',
      },
      url: '/v1/games',
    });
    expect(response.statusCode, response.body).toBe(201);
    const game = response.json();
    gameId = game.id;
    expect(game).toMatchObject({
      blackClockMs: 180_000,
      currentFen: new ChessJsRules().fen(),
      sideToMove: 'white',
      status: 'active',
      version: 0,
      whiteClockMs: 180_000,
    });
  });

  it('enforces turn and clientMoveId idempotency', async () => {
    expect((await move(black, '018f47f4-7b2f-4d90-8a66-a00000000001', 0, 'e7e5')).statusCode).toBe(
      403,
    );
    const id = '018f47f4-7b2f-4d90-8a66-a00000000002';
    const first = await move(white, id, 0, 'f2f3');
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toMatchObject({ move: { san: 'f3' }, state: { version: 1 } });
    const repeated = await move(white, id, 0, 'f2f3');
    expect(repeated.statusCode).toBe(201);
    expect(repeated.json().move.id).toBe(first.json().move.id);
    const listed = await app.inject({
      headers: auth(white),
      method: 'GET',
      url: `/v1/games/${gameId}/moves`,
    });
    expect(listed.json()).toHaveLength(1);
  });

  it('persists mate, reconstructs FEN and generates PGN', async () => {
    expect((await move(black, '018f47f4-7b2f-4d90-8a66-a00000000003', 1, 'e7e5')).statusCode).toBe(
      201,
    );
    expect((await move(white, '018f47f4-7b2f-4d90-8a66-a00000000004', 2, 'g2g4')).statusCode).toBe(
      201,
    );
    const mate = await move(black, '018f47f4-7b2f-4d90-8a66-a00000000005', 3, 'd8h4');
    expect(mate.statusCode, mate.body).toBe(201);
    expect(mate.json().state).toMatchObject({
      result: 'black_win',
      status: 'finished',
      termination: 'checkmate',
      version: 4,
    });
    const response = await app.inject({
      headers: auth(black),
      method: 'GET',
      url: `/v1/games/${gameId}/moves`,
    });
    const moves = response.json();
    expect(moves).toHaveLength(4);
    expect(
      new ChessJsRules(
        'startpos',
        moves.map((item: { uci: string }) => item.uci),
      ).fen(),
    ).toBe(mate.json().state.currentFen);
    const pgn = await app.inject({
      headers: auth(white),
      method: 'GET',
      url: `/v1/games/${gameId}/pgn`,
    });
    expect(pgn.statusCode).toBe(200);
    expect(pgn.body).toContain('Qh4#');
  });

  it('returns the engine analysis for a finished game once the worker has processed it', async () => {
    const pending = await app.inject({
      headers: auth(white),
      method: 'GET',
      url: `/v1/games/${gameId}/analysis`,
    });
    expect(pending.statusCode, pending.body).toBe(200);
    expect(pending.json()).toEqual({ moves: [], status: 'pending', summary: null });

    // Simulates the worker's analysis job having already run, without
    // spawning a real Stockfish subprocess here — this only verifies the
    // API layer surfaces what's in the database (see
    // apps/worker/src/analysis/game-analysis-job.test.ts for the job itself).
    const database = app.get(DatabaseService);
    await database.client`
      INSERT INTO game_analyses (game_id, status, engine_depth, completed_at)
      VALUES (${gameId}, 'completed', 14, now())
    `;
    await database.client`
      INSERT INTO game_move_analyses (
        game_id, ply, color, score_before_cp, mate_before, score_after_cp, mate_after,
        best_move_uci, centipawn_loss, quality, missed_win
      ) VALUES
        (${gameId}, 1, 'white', 20, null, 15, null, 'e2e4', 5, 'otimo', false),
        (${gameId}, 4, 'black', -400, null, null, 1, null, 0, 'otimo', false)
    `;

    const completed = await app.inject({
      headers: auth(black),
      method: 'GET',
      url: `/v1/games/${gameId}/analysis`,
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json()).toMatchObject({
      status: 'completed',
      summary: {
        white: { bom: 0, erro: 0, excelente: 0, gafe: 0, imprecisao: 0, missedWin: 0, otimo: 1 },
        black: { bom: 0, erro: 0, excelente: 0, gafe: 0, imprecisao: 0, missedWin: 0, otimo: 1 },
      },
    });
    expect(completed.json().moves).toHaveLength(2);

    const outsider = await createIdentity('analysis-outsider@example.com', 'game_analysis_out');
    const forbidden = await app.inject({
      headers: auth(outsider),
      method: 'GET',
      url: `/v1/games/${gameId}/analysis`,
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('returns the AI narration for a finished game once the worker has processed it', async () => {
    const pending = await app.inject({
      headers: auth(white),
      method: 'GET',
      url: `/v1/games/${gameId}/narration`,
    });
    expect(pending.statusCode, pending.body).toBe(200);
    expect(pending.json()).toEqual({
      keyMoments: [],
      patterns: [],
      status: 'pending',
      studyPlan: [],
      summary: null,
    });

    // Simulates the worker's narration job having already run, without
    // calling a real LLM here (see
    // apps/worker/src/narration/game-narration-job.test.ts for the job itself).
    const database = app.get(DatabaseService);
    const keyMoments = [
      {
        color: 'black',
        narrative: 'Você deixou a dama pendurada.',
        ply: 4,
        quality: 'gafe',
        san: 'Qh5',
      },
    ];
    await database.client`
      INSERT INTO game_narrations (game_id, status, summary, key_moments, patterns, study_plan, completed_at)
      VALUES (
        ${gameId}, 'completed', 'Uma partida curta decidida por um erro tático.',
        ${JSON.stringify(keyMoments)}::jsonb, ${JSON.stringify(['Cuidado com peças penduradas.'])}::jsonb,
        ${JSON.stringify(['Treinar táticas básicas de captura.'])}::jsonb, now()
      )
    `;

    const completed = await app.inject({
      headers: auth(black),
      method: 'GET',
      url: `/v1/games/${gameId}/narration`,
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json()).toEqual({
      keyMoments,
      patterns: ['Cuidado com peças penduradas.'],
      status: 'completed',
      studyPlan: ['Treinar táticas básicas de captura.'],
      summary: 'Uma partida curta decidida por um erro tático.',
    });

    const outsider = await createIdentity('narration-outsider@example.com', 'game_narration_out');
    const forbidden = await app.inject({
      headers: auth(outsider),
      method: 'GET',
      url: `/v1/games/${gameId}/narration`,
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('live narration is gated to coach-mode games and degrades to null without an AI provider configured', async () => {
    // No provider is configured in this environment (see ai-providers.e2e.test.ts
    // for the LLM-calling path itself, mocked there) - this only proves the
    // endpoint's auth/gating wiring, and that the "no provider" fallback is
    // silent (200 + null), never an error that would interrupt a live game.
    const student = await createIdentity('live-narration-student@example.com', 'live_narration');
    const coachGame = await app.inject({
      headers: auth(student),
      method: 'POST',
      payload: {
        botDifficulty: 'beginner',
        coachMode: true,
        playerColor: 'white',
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/matchmaking/bot-games',
    });
    expect(coachGame.statusCode, coachGame.body).toBe(201);
    const coachGameId = coachGame.json().id as string;

    const suggestion = await app.inject({
      headers: auth(student),
      method: 'POST',
      payload: {
        bestMoveUci: 'e2e4',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        kind: 'suggestion',
        mate: null,
        scoreCp: 30,
      },
      url: `/v1/games/${coachGameId}/live-narration`,
    });
    expect(suggestion.statusCode, suggestion.body).toBe(200);
    expect(suggestion.json()).toEqual({ narrative: null });

    const outsider = await createIdentity('live-narration-outsider@example.com', 'ln_outsider');
    const forbidden = await app.inject({
      headers: auth(outsider),
      method: 'POST',
      payload: {
        bestMoveUci: 'e2e4',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        kind: 'suggestion',
        mate: null,
        scoreCp: 30,
      },
      url: `/v1/games/${coachGameId}/live-narration`,
    });
    expect(forbidden.statusCode).toBe(403);

    // A non-coach-mode game silently degrades too - never errors, just
    // never has anything to enrich.
    const nonCoach = await app.inject({
      headers: auth(white),
      method: 'POST',
      payload: {
        bestMoveUci: 'e2e4',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        kind: 'suggestion',
        mate: null,
        scoreCp: 30,
      },
      url: `/v1/games/${gameId}/live-narration`,
    });
    expect(nonCoach.statusCode, nonCoach.body).toBe(200);
    expect(nonCoach.json()).toEqual({ narrative: null });
  });

  it('lists paginated history and persists private review annotations', async () => {
    const history = await app.inject({
      headers: auth(white),
      method: 'GET',
      url: '/v1/games?page=1&limit=1&status=finished&pool=blitz',
    });
    expect(history.statusCode, history.body).toBe(200);
    expect(history.json()).toMatchObject({
      items: [
        {
          color: 'white',
          id: gameId,
          opponent: { userId: black.userId },
          pool: 'blitz',
          result: 'black_win',
          status: 'finished',
        },
      ],
      limit: 1,
      page: 1,
    });
    expect(history.json().total).toBeGreaterThanOrEqual(1);

    const saved = await app.inject({
      headers: auth(white),
      method: 'PUT',
      payload: {
        arrows: [{ color: 'gold', from: 'd1', to: 'h5' }],
        comment: 'A dama chegou tarde.',
        highlights: [{ color: 'orange', square: 'h4' }],
        ply: 4,
      },
      url: `/v1/games/${gameId}/review-annotations`,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({
      arrows: [{ from: 'd1', to: 'h5' }],
      comment: 'A dama chegou tarde.',
      gameId,
      highlights: [{ square: 'h4' }],
      ply: 4,
      userId: white.userId,
    });

    const listed = await app.inject({
      headers: auth(white),
      method: 'GET',
      url: `/v1/games/${gameId}/review-annotations`,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([saved.json()]);

    const invalidPly = await app.inject({
      headers: auth(white),
      method: 'PUT',
      payload: { ply: 99 },
      url: `/v1/games/${gameId}/review-annotations`,
    });
    expect(invalidPly.statusCode).toBe(400);
    expect(invalidPly.headers['content-type']).toContain('application/problem+json');
  });

  it('persists and accepts a draw offer from the opponent', async () => {
    const created = await app.inject({
      headers: auth(white),
      method: 'POST',
      payload: {
        opponentUserId: black.userId,
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/games',
    });
    expect(created.statusCode, created.body).toBe(201);
    const drawGameId = created.json().id;

    const offered = await app.inject({
      headers: auth(white),
      method: 'POST',
      url: `/v1/games/${drawGameId}/draw-offers`,
    });
    expect(offered.statusCode, offered.body).toBe(201);
    expect(offered.json()).toMatchObject({
      accepted: false,
      state: {
        status: 'active',
        pendingDrawOffer: {
          offerId: offered.json().offerId,
          offeredByUserId: white.userId,
        },
      },
    });

    // A separate read (e.g. the opponent refreshing the page or reconnecting
    // from another device) must still see the pending offer: it is not only
    // visible in the response that created it.
    const reread = await app.inject({
      headers: auth(black),
      method: 'GET',
      url: `/v1/games/${drawGameId}`,
    });
    expect(reread.statusCode, reread.body).toBe(200);
    expect(reread.json().pendingDrawOffer).toMatchObject({
      offerId: offered.json().offerId,
      offeredByUserId: white.userId,
    });
    expect(typeof reread.json().pendingDrawOffer.createdAt).toBe('string');

    const repeated = await app.inject({
      headers: auth(white),
      method: 'POST',
      url: `/v1/games/${drawGameId}/draw-offers`,
    });
    expect(repeated.statusCode).toBe(201);
    expect(repeated.json().offerId).toBe(offered.json().offerId);

    const accepted = await app.inject({
      headers: auth(black),
      method: 'POST',
      url: `/v1/games/${drawGameId}/draw-offers`,
    });
    expect(accepted.statusCode, accepted.body).toBe(201);
    expect(accepted.json()).toMatchObject({
      accepted: true,
      offerId: offered.json().offerId,
      state: {
        result: 'draw',
        status: 'finished',
        termination: 'agreement',
        version: 1,
        pendingDrawOffer: null,
      },
    });

    // The offer is resolved (status 'accepted' in the DB), so it must no
    // longer surface as pending on subsequent reads either.
    const finalRead = await app.inject({
      headers: auth(white),
      method: 'GET',
      url: `/v1/games/${drawGameId}`,
    });
    expect(finalRead.statusCode, finalRead.body).toBe(200);
    expect(finalRead.json().pendingDrawOffer).toBeNull();
  });

  it('finishes a game by resignation with the opponent as winner', async () => {
    const created = await app.inject({
      headers: auth(white),
      method: 'POST',
      payload: {
        opponentUserId: black.userId,
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/games',
    });
    expect(created.statusCode, created.body).toBe(201);
    const resignGameId = created.json().id;

    const resigned = await app.inject({
      headers: auth(white),
      method: 'POST',
      url: `/v1/games/${resignGameId}/resign`,
    });
    expect(resigned.statusCode, resigned.body).toBe(200);
    expect(resigned.json()).toMatchObject({
      result: 'black_win',
      status: 'finished',
      termination: 'resignation',
      version: 1,
    });

    const repeated = await app.inject({
      headers: auth(white),
      method: 'POST',
      url: `/v1/games/${resignGameId}/resign`,
    });
    expect(repeated.statusCode).toBe(409);
  });

  it('rejects moves after game end', async () => {
    const response = await move(white, '018f47f4-7b2f-4d90-8a66-a00000000006', 4, 'e2e4');
    expect(response.statusCode).toBe(409);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json().detail).toContain('ativa');
  });
});
