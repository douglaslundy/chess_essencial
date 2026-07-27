import { createHash, randomInt, randomUUID } from 'node:crypto';

import { ChessJsRules, IllegalMoveError } from '@xadrez/chess-domain';
import type {
  CreateGameInput,
  CreateBotGameInput,
  BotDifficulty,
  DrawOfferAction,
  GameAnalysis,
  GameAnalysisQualityCounts,
  GameHistoryPage,
  GameHistoryQuery,
  GameMove,
  GameMoveAnalysis,
  GameNarration,
  GameState,
  ReviewAnnotation,
  ReviewAnnotationInput,
  SubmitMoveInput,
} from '@xadrez/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { TransactionSql } from 'postgres';

import { DatabaseService } from '../../database/database.service.js';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service.js';
import { calculateClockTransition, effectiveClockMs } from '../domain/game-clock.js';

interface GameRow {
  activeClockStartedAt: Date | string | null;
  blackClockMs: number;
  coachMode: boolean;
  delayMs?: number;
  incrementMs?: number;
  currentFen: string;
  finishedAt: Date | string | null;
  id: string;
  initialFen: string;
  result: GameState['result'];
  sideToMove: GameState['sideToMove'];
  startedAt: Date | string | null;
  status: GameState['status'];
  termination: GameState['termination'];
  version: number;
  whiteClockMs: number;
}

interface PlayerRow {
  color: 'white' | 'black';
  ratingBefore: number;
  userId: string;
}

interface PlayerStateRow extends PlayerRow {
  avatarUrl: string | null;
  displayName: string;
  username: string;
}

export interface BotTurn {
  botUserId: string;
  currentFen: string;
  difficulty: BotDifficulty;
  targetRating: number;
  version: number;
}

const BOT_USER_ID = '00000000-0000-4000-8000-000000000b07';
const difficultyRatings: Record<Exclude<BotDifficulty, 'matched'>, number> = {
  beginner: 800,
  intermediate: 1200,
  advanced: 1600,
  expert: 2000,
};

interface MoveRow {
  clientMoveId: string;
  color: 'white' | 'black';
  committedAt: Date | string;
  fenAfter: string;
  fenBefore: string;
  flags: GameMove['flags'];
  from: string;
  id: number | string;
  ply: number | string;
  promotion: string | null;
  san: string;
  to: string;
  uci: string;
}

interface HistoryRow {
  coachMode: boolean;
  color: 'white' | 'black';
  displayName: string;
  opponentAvatarUrl: string | null;
  finishedAt: Date | string | null;
  id: string;
  opponentRating: number;
  opponentUserId: string;
  pool: NonNullable<GameHistoryQuery['pool']>;
  rated: boolean;
  result: GameState['result'];
  startedAt: Date | string | null;
  status: GameState['status'];
  termination: string;
  timeControl: string;
  username: string;
}

interface ReviewAnnotationRow {
  arrows: ReviewAnnotation['arrows'];
  comment: string | null;
  gameId: string;
  highlights: ReviewAnnotation['highlights'];
  ply: number;
  updatedAt: Date | string;
  userId: string;
}
@Injectable()
export class GamesRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async create(creatorUserId: string, input: CreateGameInput): Promise<GameState> {
    if (creatorUserId === input.opponentUserId) {
      throw new BadRequestException('Os jogadores devem ser diferentes');
    }
    const entitlement = await this.subscriptions.checkEntitlement(creatorUserId, 'games_per_day');
    if (!entitlement.allowed)
      throw new ForbiddenException(
        'Você atingiu o limite diário de partidas do seu plano. Volte amanhã ou assine um plano com mais acesso.',
      );

    const gameId = randomUUID();
    const initialPosition = new ChessJsRules();
    const initialFen = initialPosition.fen();

    return this.database.client.begin(async (transaction) => {
      const activeUsers = await transaction<{ id: string }[]>`
        SELECT id
        FROM users
        WHERE id IN (${creatorUserId}, ${input.opponentUserId})
          AND status = 'active'
      `;
      if (activeUsers.length !== 2) {
        throw new NotFoundException('Oponente ativo não encontrado');
      }

      const [timeControl] = await transaction<
        {
          id: string;
          initialMs: number;
          pool: string;
          rated: boolean;
        }[]
      >`
        SELECT id, initial_ms AS "initialMs", pool, rated
        FROM game_time_controls
        WHERE code = ${input.timeControlCode}
          AND active = true
      `;
      if (!timeControl) {
        throw new NotFoundException('Controle de tempo não encontrado');
      }

      const creatorColor = input.creatorColor;
      const opponentColor = creatorColor === 'white' ? 'black' : 'white';
      const ratings = await transaction<{ rating: number; userId: string }[]>`
        SELECT
          selected.user_id AS "userId",
          COALESCE(rating_profiles.rating, 1200)::integer AS rating
        FROM (
          VALUES (${creatorUserId}::uuid), (${input.opponentUserId}::uuid)
        ) AS selected(user_id)
        LEFT JOIN rating_profiles
          ON rating_profiles.user_id = selected.user_id
         AND rating_profiles.pool = ${timeControl.pool}::rating_pool
      `;

      await transaction`
        INSERT INTO games (
          id,
          status,
          result,
          termination,
          time_control_id,
          rated,
          initial_fen,
          current_fen,
          side_to_move,
          white_clock_ms,
          black_clock_ms,
          active_clock_started_at,
          started_at
        )
        VALUES (
          ${gameId},
          'active',
          'none',
          'none',
          ${timeControl.id},
          ${timeControl.rated},
          'startpos',
          ${initialFen},
          'white',
          ${timeControl.initialMs},
          ${timeControl.initialMs},
          now(),
          now()
        )
      `;

      const ratingByUser = new Map(ratings.map((rating) => [rating.userId, rating.rating]));
      await transaction`
        INSERT INTO game_players (game_id, user_id, color, rating_before)
        VALUES
          (${gameId}, ${creatorUserId}, ${creatorColor}, ${ratingByUser.get(creatorUserId) ?? 1200}),
          (${gameId}, ${input.opponentUserId}, ${opponentColor}, ${ratingByUser.get(input.opponentUserId) ?? 1200})
      `;

      return this.getStateInTransaction(transaction, gameId, creatorUserId);
    });
  }

  async createBotGame(userId: string, input: CreateBotGameInput): Promise<GameState> {
    const entitlement = await this.subscriptions.checkEntitlement(userId, 'games_per_day');
    if (!entitlement.allowed)
      throw new ForbiddenException(
        'Você atingiu o limite diário de partidas do seu plano. Volte amanhã ou assine um plano com mais acesso.',
      );
    if (input.coachMode) {
      const coachEntitlement = await this.subscriptions.checkEntitlement(
        userId,
        'coach_mode_access',
      );
      if (!coachEntitlement.allowed)
        throw new ForbiddenException(
          'O modo Treinador não está disponível no seu plano atual. Assine um plano com esse recurso.',
        );
    }
    const gameId = randomUUID();
    const initialFen = new ChessJsRules().fen();

    return this.database.client.begin(async (transaction) => {
      const [user] = await transaction<{ id: string }[]>`
        SELECT id FROM users WHERE id = ${userId} AND status = 'active'
      `;
      if (!user) throw new NotFoundException('Usuário ativo não encontrado');

      const [timeControl] = await transaction<
        { id: string; initialMs: number; pool: string; rated: boolean }[]
      >`
        SELECT id, initial_ms AS "initialMs", pool, rated
        FROM game_time_controls
        WHERE code = ${input.timeControlCode} AND active = true
      `;
      if (!timeControl) throw new NotFoundException('Controle de tempo não encontrado');

      const [profile] = await transaction<{ rating: number }[]>`
        SELECT rating FROM rating_profiles
        WHERE user_id = ${userId} AND pool = ${timeControl.pool}::rating_pool
      `;
      const userRating = profile?.rating ?? 1200;
      // Treinador mode always matches the bot to the player's own rating —
      // any explicit difficulty picked client-side is ignored — and never
      // touches the official rating, regardless of the time control's own
      // rated flag (same spirit as the existing untimed/demo mode).
      const botDifficulty = input.coachMode ? 'matched' : input.botDifficulty;
      const targetRating =
        botDifficulty === 'matched' ? userRating : difficultyRatings[botDifficulty];
      const rated = input.coachMode ? false : timeControl.rated;
      const playerColor =
        input.playerColor === 'random'
          ? randomInt(2) === 0
            ? 'white'
            : 'black'
          : input.playerColor;
      const botColor = playerColor === 'white' ? 'black' : 'white';

      await transaction`
        INSERT INTO games (
          id, status, result, termination, time_control_id, rated, coach_mode,
          initial_fen, current_fen, side_to_move, white_clock_ms,
          black_clock_ms, active_clock_started_at, started_at
        ) VALUES (
          ${gameId}, 'active', 'none', 'none', ${timeControl.id}, ${rated}, ${input.coachMode},
          'startpos', ${initialFen}, 'white', ${timeControl.initialMs},
          ${timeControl.initialMs}, now(), now()
        )
      `;
      await transaction`
        INSERT INTO game_players (game_id, user_id, color, rating_before)
        VALUES
          (${gameId}, ${userId}, ${playerColor}, ${userRating}),
          (${gameId}, ${BOT_USER_ID}, ${botColor}, ${targetRating})
      `;
      await transaction`
        INSERT INTO game_bots (game_id, bot_user_id, difficulty, target_rating)
        VALUES (${gameId}, ${BOT_USER_ID}, ${botDifficulty}, ${targetRating})
      `;
      await transaction`
        INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES (
          'game', ${gameId}, 'game.bot_created',
          ${JSON.stringify({
            botDifficulty,
            gameId,
            playerColor,
            targetRating,
          })}::jsonb
        )
      `;
      return this.getStateInTransaction(transaction, gameId, userId);
    });
  }

  async botTurn(gameId: string): Promise<BotTurn | null> {
    const [turn] = await this.database.client<BotTurn[]>`
      SELECT
        game_bots.bot_user_id AS "botUserId",
        games.current_fen AS "currentFen",
        game_bots.difficulty,
        game_bots.target_rating AS "targetRating",
        games.version::integer AS version
      FROM game_bots
      JOIN games ON games.id = game_bots.game_id
      JOIN game_players bot
        ON bot.game_id = games.id AND bot.user_id = game_bots.bot_user_id
      WHERE game_bots.game_id = ${gameId}
        AND games.status = 'active'
        AND games.side_to_move = bot.color
    `;
    return turn ?? null;
  }

  async history(userId: string, input: GameHistoryQuery): Promise<GameHistoryPage> {
    const offset = (input.page - 1) * input.limit;
    const status = input.status ?? null;
    const result = input.result ?? null;
    const pool = input.pool ?? null;
    const color = input.color ?? null;
    const rated = input.rated ?? null;
    const [count] = await this.database.client<{ total: number }[]>`
      SELECT count(*)::integer AS total
      FROM games
      JOIN game_players mine ON mine.game_id = games.id AND mine.user_id = ${userId}
      JOIN game_time_controls controls ON controls.id = games.time_control_id
      WHERE (${status}::text IS NULL OR games.status::text = ${status})
        AND (${result}::text IS NULL OR games.result::text = ${result})
        AND (${pool}::text IS NULL OR controls.pool::text = ${pool})
        AND (${color}::text IS NULL OR mine.color::text = ${color})
        AND (${rated}::boolean IS NULL OR games.rated = ${rated})
    `;
    const rows = await this.database.client<HistoryRow[]>`
      SELECT games.id, games.status, games.result, games.termination, games.rated,
        games.coach_mode AS "coachMode",
        games.started_at AS "startedAt", games.finished_at AS "finishedAt", mine.color,
        controls.pool, controls.label AS "timeControl", opponent.user_id AS "opponentUserId",
        opponent.rating_before::integer AS "opponentRating", opponent_user.username::text AS username,
        opponent_profile.display_name AS "displayName",
        opponent_profile.avatar_url AS "opponentAvatarUrl"
      FROM games
      JOIN game_players mine ON mine.game_id = games.id AND mine.user_id = ${userId}
      JOIN game_players opponent ON opponent.game_id = games.id AND opponent.user_id <> ${userId}
      JOIN users opponent_user ON opponent_user.id = opponent.user_id
      JOIN user_profiles opponent_profile ON opponent_profile.user_id = opponent.user_id
      JOIN game_time_controls controls ON controls.id = games.time_control_id
      WHERE (${status}::text IS NULL OR games.status::text = ${status})
        AND (${result}::text IS NULL OR games.result::text = ${result})
        AND (${pool}::text IS NULL OR controls.pool::text = ${pool})
        AND (${color}::text IS NULL OR mine.color::text = ${color})
        AND (${rated}::boolean IS NULL OR games.rated = ${rated})
      ORDER BY COALESCE(games.finished_at, games.started_at, games.created_at) DESC, games.id
      LIMIT ${input.limit} OFFSET ${offset}
    `;
    return {
      items: rows.map((row) => ({
        coachMode: row.coachMode,
        color: row.color,
        finishedAt: this.toIso(row.finishedAt),
        id: row.id,
        opponent: {
          avatarUrl: row.opponentAvatarUrl,
          displayName: row.displayName,
          rating: row.opponentRating,
          userId: row.opponentUserId,
          username: row.username,
        },
        pool: row.pool,
        rated: row.rated,
        result: row.result,
        startedAt: this.toIso(row.startedAt),
        status: row.status,
        termination: row.termination,
        timeControl: row.timeControl,
      })),
      limit: input.limit,
      page: input.page,
      total: count?.total ?? 0,
    };
  }

  async listReviewAnnotations(gameId: string, userId: string): Promise<ReviewAnnotation[]> {
    await this.assertPlayer(gameId, userId);
    const rows = await this.database.client<ReviewAnnotationRow[]>`
      SELECT game_id AS "gameId", user_id AS "userId", ply, comment, arrows, highlights,
             updated_at AS "updatedAt"
      FROM game_review_annotations
      WHERE game_id = ${gameId} AND user_id = ${userId}
      ORDER BY ply
    `;
    return rows.map((row) => ({
      ...row,
      updatedAt: this.toIso(row.updatedAt) ?? new Date(0).toISOString(),
    }));
  }

  async saveReviewAnnotation(
    gameId: string,
    userId: string,
    input: ReviewAnnotationInput,
  ): Promise<ReviewAnnotation> {
    await this.assertPlayer(gameId, userId);
    const [moves] = await this.database.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM game_moves WHERE game_id = ${gameId}
    `;
    if (input.ply > (moves?.count ?? 0)) throw new BadRequestException('Ply fora do histórico');
    const [row] = await this.database.client<ReviewAnnotationRow[]>`
      INSERT INTO game_review_annotations (game_id, user_id, ply, comment, arrows, highlights)
      VALUES (${gameId}, ${userId}, ${input.ply}, ${input.comment},
        ${JSON.stringify(input.arrows)}::jsonb, ${JSON.stringify(input.highlights)}::jsonb)
      ON CONFLICT (game_id, user_id, ply) DO UPDATE SET
        comment = EXCLUDED.comment, arrows = EXCLUDED.arrows,
        highlights = EXCLUDED.highlights, updated_at = now()
      RETURNING game_id AS "gameId", user_id AS "userId", ply, comment, arrows, highlights,
                updated_at AS "updatedAt"
    `;
    if (!row) throw new InternalServerErrorException('Anotação não foi persistida');
    return { ...row, updatedAt: this.toIso(row.updatedAt) ?? new Date(0).toISOString() };
  }
  async getState(gameId: string, userId: string) {
    return this.getStateInTransaction(this.database.client, gameId, userId);
  }

  async listMoves(gameId: string, userId: string): Promise<GameMove[]> {
    await this.assertPlayer(gameId, userId);
    const rows = await this.database.client<MoveRow[]>`
      SELECT
        id,
        ply,
        color,
        client_move_id AS "clientMoveId",
        uci,
        san,
        from_square AS "from",
        to_square AS "to",
        promotion,
        fen_before AS "fenBefore",
        fen_after AS "fenAfter",
        flags,
        committed_at AS "committedAt"
      FROM game_moves
      WHERE game_id = ${gameId}
      ORDER BY ply
    `;
    return rows.map((row) => this.mapMove(row));
  }

  async getAnalysis(gameId: string, userId: string): Promise<GameAnalysis> {
    await this.assertPlayer(gameId, userId);
    const entitlement = await this.subscriptions.checkEntitlement(userId, 'game_analysis_access');
    if (!entitlement.allowed)
      throw new ForbiddenException(
        'A revisão com o motor não está disponível no seu plano atual. Assine um plano com esse recurso.',
      );
    const [analysis] = await this.database.client<{ status: GameAnalysis['status'] }[]>`
      SELECT status FROM game_analyses WHERE game_id = ${gameId}
    `;
    const status = analysis?.status ?? 'pending';
    const rows = await this.database.client<
      Array<Omit<GameMoveAnalysis, 'ply'> & { ply: number | string }>
    >`
      SELECT
        gm.ply, gm.color, gm.san, gm.uci,
        gma.score_before_cp AS "scoreBeforeCp", gma.mate_before AS "mateBefore",
        gma.score_after_cp AS "scoreAfterCp", gma.mate_after AS "mateAfter",
        gma.best_move_uci AS "bestMoveUci", gma.centipawn_loss AS "centipawnLoss",
        gma.quality, gma.missed_win AS "missedWin"
      FROM game_move_analyses gma
      JOIN game_moves gm ON gm.game_id = gma.game_id AND gm.ply = gma.ply
      WHERE gma.game_id = ${gameId}
      ORDER BY gma.ply
    `;
    const moves = rows.map((row) => ({ ...row, ply: Number(row.ply) }));
    return { moves, status, summary: status === 'completed' ? summarizeAnalysis(moves) : null };
  }

  async getNarration(gameId: string, userId: string): Promise<GameNarration> {
    await this.assertPlayer(gameId, userId);
    // Not entitled: behave exactly like "no AI narration exists yet" (the
    // same shape already used when no provider is configured at all) — the
    // free, non-LLM template summary the frontend falls back to is never
    // gated, only the real AI-generated one is.
    const entitlement = await this.subscriptions.checkEntitlement(userId, 'ai_narrations_per_day');
    if (!entitlement.allowed) {
      return { keyMoments: [], patterns: [], status: 'pending', studyPlan: [], summary: null };
    }
    const [row] = await this.database.client<
      {
        keyMoments: GameNarration['keyMoments'] | null;
        patterns: string[] | null;
        status: GameNarration['status'];
        studyPlan: string[] | null;
        summary: string | null;
      }[]
    >`
      SELECT status, summary, key_moments AS "keyMoments", patterns, study_plan AS "studyPlan"
      FROM game_narrations WHERE game_id = ${gameId}
    `;
    return {
      keyMoments: row?.keyMoments ?? [],
      patterns: row?.patterns ?? [],
      status: row?.status ?? 'pending',
      studyPlan: row?.studyPlan ?? [],
      summary: row?.summary ?? null,
    };
  }

  async realtimeSnapshot(gameId: string, userId: string, lastKnownVersion: number) {
    return this.database.client.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${gameId}, 0))`;
      const state = await this.getStateInTransaction(transaction, gameId, userId);
      if (lastKnownVersion > state.version) {
        throw new ConflictException('Versão do cliente está à frente do servidor');
      }
      const rows = await transaction<MoveRow[]>`
        SELECT
          id,
          ply,
          color,
          client_move_id AS "clientMoveId",
          uci,
          san,
          from_square AS "from",
          to_square AS "to",
          promotion,
          fen_before AS "fenBefore",
          fen_after AS "fenAfter",
          flags,
          committed_at AS "committedAt"
        FROM game_moves
        WHERE game_id = ${gameId}
          AND ply > ${lastKnownVersion}
        ORDER BY ply
      `;
      return { moves: rows.map((row) => this.mapMove(row)), state };
    });
  }

  async setConnection(gameId: string, userId: string, connected: boolean) {
    await this.database.client`
      UPDATE game_players
      SET
        connected_at = CASE WHEN ${connected} THEN now() ELSE connected_at END,
        disconnected_at = CASE WHEN ${connected} THEN NULL ELSE now() END
      WHERE game_id = ${gameId}
        AND user_id = ${userId}
    `;
  }

  async getPgn(gameId: string, userId: string) {
    await this.assertPlayer(gameId, userId);
    const [row] = await this.database.client<{ pgn: string }[]>`
      SELECT pgn FROM game_pgn WHERE game_id = ${gameId}
    `;
    if (!row) throw new NotFoundException('PGN ainda não disponível');
    return row.pgn;
  }

  async expireOnTime(gameId: string): Promise<GameState | null> {
    return this.database.client.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${gameId}, 0))`;
      const [game] = await transaction<(GameRow & { userId: string })[]>`
        SELECT
          games.id,
          games.status,
          games.result,
          games.termination,
          games.initial_fen AS "initialFen",
          games.current_fen AS "currentFen",
          games.side_to_move AS "sideToMove",
          games.version::integer AS version,
          games.white_clock_ms::integer AS "whiteClockMs",
          games.black_clock_ms::integer AS "blackClockMs",
          games.active_clock_started_at AS "activeClockStartedAt",
          game_time_controls.delay_ms AS "delayMs",
          games.started_at AS "startedAt",
          games.finished_at AS "finishedAt",
          selected_player.user_id AS "userId"
        FROM games
        JOIN game_time_controls ON game_time_controls.id = games.time_control_id
        JOIN LATERAL (
          SELECT user_id
          FROM game_players
          WHERE game_id = games.id
          ORDER BY color
          LIMIT 1
        ) selected_player ON true
        WHERE games.id = ${gameId}
      `;
      if (!game || game.status !== 'active' || !game.activeClockStartedAt) return null;

      const [databaseClock] = await transaction<{ now: Date | string }[]>`
        SELECT clock_timestamp() AS now
      `;
      if (!databaseClock) return null;
      const receivedAt = new Date(databaseClock.now);
      const storedClockMs = game.sideToMove === 'white' ? game.whiteClockMs : game.blackClockMs;
      const remainingMs = effectiveClockMs(
        storedClockMs,
        new Date(game.activeClockStartedAt),
        receivedAt,
        game.delayMs ?? 0,
      );
      if (remainingMs > 0) return null;

      const history = await transaction<{ uci: string }[]>`
        SELECT uci FROM game_moves WHERE game_id = ${gameId} ORDER BY ply
      `;
      const rules = new ChessJsRules(
        game.initialFen,
        history.map((move) => move.uci),
      );
      const winner = game.sideToMove === 'white' ? 'black' : 'white';
      const result = rules.canWinOnTime(winner)
        ? winner === 'white'
          ? 'white_win'
          : 'black_win'
        : 'draw';

      await transaction`
        UPDATE games
        SET
          white_clock_ms = ${game.sideToMove === 'white' ? 0 : game.whiteClockMs},
          black_clock_ms = ${game.sideToMove === 'black' ? 0 : game.blackClockMs},
          active_clock_started_at = NULL,
          status = 'finished',
          result = ${result}::game_result,
          termination = 'timeout',
          version = version + 1,
          finished_at = ${receivedAt.toISOString()},
          updated_at = now()
        WHERE id = ${gameId}
          AND status = 'active'
      `;
      await transaction`
        INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES (
          'game',
          ${gameId},
          'game.finished',
          ${JSON.stringify({ gameId, result, termination: 'timeout' })}::jsonb
        )
      `;
      const pgn = rules.pgn();
      const digest = createHash('sha256').update(pgn).digest('hex');
      await transaction`
        INSERT INTO game_pgn (game_id, pgn, checksum_sha256)
        VALUES (${gameId}, ${pgn}, ${digest})
        ON CONFLICT (game_id) DO UPDATE SET
          pgn = EXCLUDED.pgn,
          checksum_sha256 = EXCLUDED.checksum_sha256,
          generated_at = now()
      `;
      return this.getStateInTransaction(transaction, gameId, game.userId);
    });
  }

  async resign(gameId: string, userId: string): Promise<GameState> {
    return this.database.client.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${gameId}, 0))`;
      const [player] = await transaction<PlayerRow[]>`
        SELECT user_id AS "userId", color, rating_before AS "ratingBefore"
        FROM game_players
        WHERE game_id = ${gameId} AND user_id = ${userId}
      `;
      if (!player) throw new ForbiddenException('Usuário não participa da partida');

      const [game] = await transaction<GameRow[]>`
        SELECT
          id, status, result, termination, initial_fen AS "initialFen",
          current_fen AS "currentFen", side_to_move AS "sideToMove",
          version::integer AS version, white_clock_ms::integer AS "whiteClockMs",
          black_clock_ms::integer AS "blackClockMs",
          active_clock_started_at AS "activeClockStartedAt",
          started_at AS "startedAt", finished_at AS "finishedAt"
        FROM games
        WHERE id = ${gameId}
      `;
      if (!game) throw new NotFoundException('Partida não encontrada');
      if (game.status !== 'active') throw new ConflictException('Partida não está ativa');

      const [databaseClock] = await transaction<{ now: Date | string }[]>`
        SELECT clock_timestamp() AS now
      `;
      if (!databaseClock)
        throw new InternalServerErrorException('Relógio do banco de dados indisponível');
      const receivedAt = new Date(databaseClock.now);
      const result = player.color === 'white' ? 'black_win' : 'white_win';
      const history = await transaction<{ uci: string }[]>`
        SELECT uci FROM game_moves WHERE game_id = ${gameId} ORDER BY ply
      `;
      const rules = new ChessJsRules(
        game.initialFen,
        history.map((move) => move.uci),
      );
      if (rules.fen() !== game.currentFen) {
        throw new InternalServerErrorException('Estado persistido não pode ser reconstruído');
      }

      await transaction`
        UPDATE games
        SET
          status = 'finished',
          result = ${result}::game_result,
          termination = 'resignation',
          active_clock_started_at = NULL,
          version = version + 1,
          finished_at = ${receivedAt.toISOString()},
          updated_at = now()
        WHERE id = ${gameId} AND status = 'active'
      `;
      await transaction`
        INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES (
          'game',
          ${gameId},
          'game.finished',
          ${JSON.stringify({ gameId, result, termination: 'resignation' })}::jsonb
        )
      `;
      const pgn = rules.pgn();
      const digest = createHash('sha256').update(pgn).digest('hex');
      await transaction`
        INSERT INTO game_pgn (game_id, pgn, checksum_sha256)
        VALUES (${gameId}, ${pgn}, ${digest})
        ON CONFLICT (game_id) DO UPDATE SET
          pgn = EXCLUDED.pgn,
          checksum_sha256 = EXCLUDED.checksum_sha256,
          generated_at = now()
      `;
      return this.getStateInTransaction(transaction, gameId, userId);
    });
  }

  async offerDraw(gameId: string, userId: string): Promise<DrawOfferAction> {
    return this.database.client.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${gameId}, 0))`;
      const [player] = await transaction<PlayerRow[]>`
        SELECT user_id AS "userId", color, rating_before AS "ratingBefore"
        FROM game_players
        WHERE game_id = ${gameId} AND user_id = ${userId}
      `;
      if (!player) throw new ForbiddenException('Usuário não participa da partida');

      const [game] = await transaction<GameRow[]>`
        SELECT
          id, status, result, termination, initial_fen AS "initialFen",
          current_fen AS "currentFen", side_to_move AS "sideToMove",
          version::integer AS version, white_clock_ms::integer AS "whiteClockMs",
          black_clock_ms::integer AS "blackClockMs",
          active_clock_started_at AS "activeClockStartedAt",
          started_at AS "startedAt", finished_at AS "finishedAt"
        FROM games
        WHERE id = ${gameId}
      `;
      if (!game) throw new NotFoundException('Partida não encontrada');
      if (game.status !== 'active') throw new ConflictException('Partida não está ativa');

      const [pending] = await transaction<{ id: string; offeredByUserId: string }[]>`
        SELECT id, offered_by_user_id AS "offeredByUserId"
        FROM game_draw_offers
        WHERE game_id = ${gameId} AND status = 'pending'
      `;
      if (pending?.offeredByUserId === userId) {
        return {
          accepted: false,
          offerId: pending.id,
          state: await this.getStateInTransaction(transaction, gameId, userId),
        };
      }

      if (pending) {
        const [databaseClock] = await transaction<{ now: Date | string }[]>`
          SELECT clock_timestamp() AS now
        `;
        if (!databaseClock)
          throw new InternalServerErrorException('Relógio do banco de dados indisponível');
        const receivedAt = new Date(databaseClock.now);
        await transaction`
          UPDATE game_draw_offers
          SET status = 'accepted', resolved_at = ${receivedAt.toISOString()}
          WHERE id = ${pending.id} AND status = 'pending'
        `;
        await transaction`
          UPDATE games
          SET
            status = 'finished',
            result = 'draw',
            termination = 'agreement',
            active_clock_started_at = NULL,
            version = version + 1,
            finished_at = ${receivedAt.toISOString()},
            updated_at = now()
          WHERE id = ${gameId} AND status = 'active'
        `;
        await transaction`
          INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
          VALUES (
            'game',
            ${gameId},
            'game.finished',
            ${JSON.stringify({ gameId, result: 'draw', termination: 'agreement' })}::jsonb
          )
        `;
        const history = await transaction<{ uci: string }[]>`
          SELECT uci FROM game_moves WHERE game_id = ${gameId} ORDER BY ply
        `;
        const rules = new ChessJsRules(
          game.initialFen,
          history.map((move) => move.uci),
        );
        if (rules.fen() !== game.currentFen) {
          throw new InternalServerErrorException('Estado persistido não pode ser reconstruído');
        }
        const pgn = rules.pgn();
        const digest = createHash('sha256').update(pgn).digest('hex');
        await transaction`
          INSERT INTO game_pgn (game_id, pgn, checksum_sha256)
          VALUES (${gameId}, ${pgn}, ${digest})
          ON CONFLICT (game_id) DO UPDATE SET
            pgn = EXCLUDED.pgn,
            checksum_sha256 = EXCLUDED.checksum_sha256,
            generated_at = now()
        `;
        return {
          accepted: true,
          offerId: pending.id,
          state: await this.getStateInTransaction(transaction, gameId, userId),
        };
      }

      const [offer] = await transaction<{ id: string }[]>`
        INSERT INTO game_draw_offers (game_id, offered_by_user_id)
        VALUES (${gameId}, ${userId})
        RETURNING id
      `;
      if (!offer) throw new InternalServerErrorException('Oferta de empate não foi persistida');
      await transaction`
        INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES (
          'game',
          ${gameId},
          'game.draw_offered',
          ${JSON.stringify({ gameId, offerId: offer.id, offeredByUserId: userId })}::jsonb
        )
      `;
      return {
        accepted: false,
        offerId: offer.id,
        state: await this.getStateInTransaction(transaction, gameId, userId),
      };
    });
  }

  async commitMove(
    gameId: string,
    userId: string,
    input: SubmitMoveInput,
  ): Promise<{ move: GameMove; state: GameState }> {
    const outcome = await this.database.client.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${gameId}, 0))`;

      const [player] = await transaction<PlayerRow[]>`
        SELECT
          user_id AS "userId",
          color,
          rating_before AS "ratingBefore"
        FROM game_players
        WHERE game_id = ${gameId}
          AND user_id = ${userId}
      `;
      if (!player) throw new ForbiddenException('Usuário não participa da partida');

      const [existing] = await transaction<MoveRow[]>`
        SELECT
          id,
          ply,
          color,
          client_move_id AS "clientMoveId",
          uci,
          san,
          from_square AS "from",
          to_square AS "to",
          promotion,
          fen_before AS "fenBefore",
          fen_after AS "fenAfter",
          flags,
          committed_at AS "committedAt"
        FROM game_moves
        WHERE game_id = ${gameId}
          AND client_move_id = ${input.clientMoveId}
      `;
      if (existing) {
        if (existing.uci !== input.uci) {
          throw new ConflictException('clientMoveId já usado para outro lance');
        }
        return {
          move: this.mapMove(existing),
          state: await this.getStateInTransaction(transaction, gameId, userId),
        };
      }

      const [game] = await transaction<GameRow[]>`
        SELECT
          games.id,
          games.status,
          games.result,
          games.termination,
          initial_fen AS "initialFen",
          current_fen AS "currentFen",
          side_to_move AS "sideToMove",
          games.version::integer AS version,
          games.white_clock_ms::integer AS "whiteClockMs",
          games.black_clock_ms::integer AS "blackClockMs",
          active_clock_started_at AS "activeClockStartedAt",
          game_time_controls.increment_ms AS "incrementMs",
          game_time_controls.delay_ms AS "delayMs",
          started_at AS "startedAt",
          finished_at AS "finishedAt"
        FROM games
        JOIN game_time_controls ON game_time_controls.id = games.time_control_id
        WHERE games.id = ${gameId}
      `;
      if (!game) throw new NotFoundException('Partida não encontrada');
      if (game.status !== 'active') throw new ConflictException('Partida não está ativa');
      if (game.version !== input.expectedVersion) {
        throw new ConflictException('Versão da partida desatualizada');
      }
      if (game.sideToMove !== player.color) {
        throw new ForbiddenException('Não é o turno do jogador');
      }
      const [databaseClock] = await transaction<{ now: Date | string }[]>`
        SELECT clock_timestamp() AS now
      `;
      if (!databaseClock)
        throw new InternalServerErrorException('Relógio do banco de dados indisponível');
      const receivedAt = new Date(databaseClock.now);
      const activeClockStartedAt = game.activeClockStartedAt
        ? new Date(game.activeClockStartedAt)
        : receivedAt;
      const clockBeforeMs = player.color === 'white' ? game.whiteClockMs : game.blackClockMs;
      const clock = calculateClockTransition({
        activeClockStartedAt,
        clockBeforeMs,
        delayMs: game.delayMs ?? 0,
        incrementMs: game.incrementMs ?? 0,
        receivedAt,
      });
      const history = await transaction<{ uci: string }[]>`
        SELECT uci FROM game_moves WHERE game_id = ${gameId} ORDER BY ply
      `;
      const rules = new ChessJsRules(
        game.initialFen,
        history.map((move) => move.uci),
      );
      if (rules.fen() !== game.currentFen) {
        throw new InternalServerErrorException('Estado persistido não pode ser reconstruído');
      }

      if (clock.timedOut) {
        const winner = player.color === 'white' ? 'black' : 'white';
        const result = rules.canWinOnTime(winner)
          ? winner === 'white'
            ? 'white_win'
            : 'black_win'
          : 'draw';
        await transaction`
          UPDATE games
          SET
            white_clock_ms = ${player.color === 'white' ? 0 : game.whiteClockMs},
            black_clock_ms = ${player.color === 'black' ? 0 : game.blackClockMs},
            active_clock_started_at = NULL,
            status = 'finished',
            result = ${result}::game_result,
            termination = 'timeout',
            version = version + 1,
            finished_at = ${receivedAt.toISOString()},
            updated_at = now()
          WHERE id = ${gameId}
        `;
        await transaction`
          INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
          VALUES (
            'game',
            ${gameId},
            'game.finished',
            ${JSON.stringify({ gameId, result, termination: 'timeout' })}::jsonb
          )
        `;
        const pgn = rules.pgn();
        const digest = createHash('sha256').update(pgn).digest('hex');
        await transaction`
          INSERT INTO game_pgn (game_id, pgn, checksum_sha256)
          VALUES (${gameId}, ${pgn}, ${digest})
          ON CONFLICT (game_id) DO UPDATE SET
            pgn = EXCLUDED.pgn,
            checksum_sha256 = EXCLUDED.checksum_sha256,
            generated_at = now()
        `;
        return null;
      }

      let applied;
      try {
        applied = rules.applyMove(input.uci);
      } catch (error) {
        if (error instanceof IllegalMoveError) {
          throw new BadRequestException('Lance ilegal');
        }
        throw error;
      }

      const ply = history.length + 1;
      const [inserted] = await transaction<MoveRow[]>`
        INSERT INTO game_moves (
          game_id,
          ply,
          color,
          client_move_id,
          uci,
          san,
          from_square,
          to_square,
          promotion,
          fen_before,
          fen_after,
          clock_before_ms,
          clock_after_ms,
          server_received_at,
          think_time_ms,
          flags
        )
        VALUES (
          ${gameId},
          ${ply},
          ${player.color},
          ${input.clientMoveId},
          ${applied.uci},
          ${applied.san},
          ${applied.from},
          ${applied.to},
          ${applied.promotion},
          ${applied.fenBefore},
          ${applied.fenAfter},
          ${clockBeforeMs},
          ${clock.clockAfterMoveMs},
          ${receivedAt.toISOString()},
          ${clock.chargedMs},
          ${JSON.stringify({
            capture: applied.flags.capture,
            castling: applied.flags.castling,
            enPassant: applied.flags.enPassant,
            promotion: applied.flags.promotion,
          })}::jsonb
        )
        RETURNING
          id,
          ply,
          color,
          client_move_id AS "clientMoveId",
          uci,
          san,
          from_square AS "from",
          to_square AS "to",
          promotion,
          fen_before AS "fenBefore",
          fen_after AS "fenAfter",
          flags,
          committed_at AS "committedAt"
      `;
      if (!inserted) throw new InternalServerErrorException('Falha ao persistir lance');

      const fenParts = applied.fenAfter.split(' ');
      await transaction`
        UPDATE games
        SET
          current_fen = ${applied.fenAfter},
          side_to_move = ${applied.status.sideToMove},
          white_clock_ms = ${player.color === 'white' ? clock.clockAfterMoveMs : game.whiteClockMs},
          black_clock_ms = ${player.color === 'black' ? clock.clockAfterMoveMs : game.blackClockMs},
          active_clock_started_at = ${applied.status.isGameOver ? null : receivedAt.toISOString()},
          halfmove_clock = ${Number(fenParts[4] ?? 0)},
          fullmove_number = ${Number(fenParts[5] ?? 1)},
          version = version + 1,
          status = ${applied.status.isGameOver ? 'finished' : 'active'}::game_status,
          result = ${applied.status.result}::game_result,
          termination = ${applied.status.termination}::termination_reason,
          finished_at = ${applied.status.isGameOver ? receivedAt.toISOString() : null},
          updated_at = now()
        WHERE id = ${gameId}
      `;

      await transaction`
        INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES (
          'game',
          ${gameId},
          'game.move_committed',
          ${JSON.stringify({
            clientMoveId: input.clientMoveId,
            gameId,
            ply,
            san: applied.san,
            uci: applied.uci,
          })}::jsonb
        )
      `;

      if (applied.status.isGameOver) {
        const pgn = rules.pgn();
        const digest = createHash('sha256').update(pgn).digest('hex');
        await transaction`
          INSERT INTO game_pgn (game_id, pgn, checksum_sha256)
          VALUES (${gameId}, ${pgn}, ${digest})
          ON CONFLICT (game_id) DO UPDATE SET
            pgn = EXCLUDED.pgn,
            checksum_sha256 = EXCLUDED.checksum_sha256,
            generated_at = now()
        `;
      }

      return {
        move: this.mapMove(inserted),
        state: await this.getStateInTransaction(transaction, gameId, userId),
      };
    });
    if (!outcome) throw new ConflictException('Lance recebido após o tempo esgotar');
    return outcome;
  }

  private async assertPlayer(gameId: string, userId: string) {
    const [player] = await this.database.client<{ present: boolean }[]>`
      SELECT true AS present
      FROM game_players
      WHERE game_id = ${gameId}
        AND user_id = ${userId}
    `;
    if (!player) throw new ForbiddenException('Usuário não participa da partida');
  }

  private async getStateInTransaction(
    query: typeof this.database.client | TransactionSql<Record<string, never>>,
    gameId: string,
    userId: string,
  ): Promise<GameState> {
    const [game] = await query<GameRow[]>`
      SELECT
        games.id,
        games.status,
        games.result,
        games.termination,
        games.initial_fen AS "initialFen",
        games.current_fen AS "currentFen",
        games.side_to_move AS "sideToMove",
        games.coach_mode AS "coachMode",
        games.version::integer AS version,
        games.white_clock_ms::integer AS "whiteClockMs",
        games.black_clock_ms::integer AS "blackClockMs",
        games.active_clock_started_at AS "activeClockStartedAt",
        games.started_at AS "startedAt",
        games.finished_at AS "finishedAt"
      FROM games
      WHERE games.id = ${gameId}
        AND EXISTS (
          SELECT 1 FROM game_players
          WHERE game_players.game_id = games.id
            AND game_players.user_id = ${userId}
        )
    `;
    if (!game) throw new NotFoundException('Partida não encontrada');

    const players = await query<PlayerStateRow[]>`
      SELECT
        game_players.user_id AS "userId",
        game_players.color,
        game_players.rating_before AS "ratingBefore",
        users.username,
        user_profiles.display_name AS "displayName",
        user_profiles.avatar_url AS "avatarUrl"
      FROM game_players
      JOIN users ON users.id = game_players.user_id
      JOIN user_profiles ON user_profiles.user_id = game_players.user_id
      WHERE game_players.game_id = ${gameId}
      ORDER BY game_players.color DESC
    `;

    return {
      activeClockStartedAt: this.toIso(game.activeClockStartedAt),
      blackClockMs: game.blackClockMs,
      coachMode: game.coachMode,
      currentFen: game.currentFen,
      finishedAt: this.toIso(game.finishedAt),
      id: game.id,
      players,
      result: game.result,
      sideToMove: game.sideToMove,
      startedAt: this.toIso(game.startedAt),
      status: game.status,
      termination: game.termination,
      version: game.version,
      whiteClockMs: game.whiteClockMs,
    };
  }

  private toIso(value: Date | string | null) {
    if (value === null) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private mapMove(row: MoveRow): GameMove {
    return {
      ...row,
      id: Number(row.id),
      ply: Number(row.ply),
      committedAt: this.toIso(row.committedAt) ?? new Date(0).toISOString(),
    };
  }
}

function emptyQualityCounts(): GameAnalysisQualityCounts {
  return { bom: 0, erro: 0, excelente: 0, gafe: 0, imprecisao: 0, missedWin: 0, otimo: 0 };
}

function summarizeAnalysis(moves: GameMoveAnalysis[]): {
  white: GameAnalysisQualityCounts;
  black: GameAnalysisQualityCounts;
} {
  const summary: Record<'white' | 'black', GameAnalysisQualityCounts> = {
    black: emptyQualityCounts(),
    white: emptyQualityCounts(),
  };
  for (const move of moves) {
    const counts = summary[move.color];
    counts[move.quality] += 1;
    if (move.missedWin) counts.missedWin += 1;
  }
  return summary;
}
