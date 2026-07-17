import { createHash, randomUUID } from 'node:crypto';

import { ChessJsRules, IllegalMoveError } from '@xadrez/chess-domain';
import type { CreateGameInput, GameMove, GameState, SubmitMoveInput } from '@xadrez/contracts';
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
import { calculateClockTransition, effectiveClockMs } from '../domain/game-clock.js';

interface GameRow {
  activeClockStartedAt: Date | string | null;
  blackClockMs: number;
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

@Injectable()
export class GamesRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(creatorUserId: string, input: CreateGameInput): Promise<GameState> {
    if (creatorUserId === input.opponentUserId) {
      throw new BadRequestException('Os jogadores devem ser diferentes');
    }

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

  async realtimeSnapshot(gameId: string, userId: string, lastKnownVersion: number) {
    return this.database.client.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${gameId}, 0))`;
      const state = await this.getStateInTransaction(transaction, gameId, userId);
      if (lastKnownVersion > state.version) {
        throw new ConflictException('Client version is ahead of the server');
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
      if (!databaseClock) throw new InternalServerErrorException('Database clock unavailable');
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
    if (!outcome) throw new ConflictException('Move received after timeout');
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

    const players = await query<PlayerRow[]>`
      SELECT
        user_id AS "userId",
        color,
        rating_before AS "ratingBefore"
      FROM game_players
      WHERE game_id = ${gameId}
      ORDER BY color DESC
    `;

    return {
      activeClockStartedAt: this.toIso(game.activeClockStartedAt),
      blackClockMs: game.blackClockMs,
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
