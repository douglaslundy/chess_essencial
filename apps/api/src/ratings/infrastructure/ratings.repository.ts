import { calculateRatingChange, type GameScore } from '@xadrez/rating-domain';
import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';

interface ProfileRow {
  gamesCount: number;
  hasEverReached2400: boolean;
  rating: number;
  userId: string;
}

@Injectable()
export class RatingsRepository {
  constructor(private readonly database: DatabaseService) {}

  async processFinishedGame(gameId: string): Promise<boolean> {
    return this.database.client.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${`rating:game:${gameId}`}, 0))`;
      const [game] = await transaction<
        { pool: string; rated: boolean; result: string; status: string }[]
      >`
        SELECT games.status, games.result, games.rated, game_time_controls.pool
        FROM games
        JOIN game_time_controls ON game_time_controls.id = games.time_control_id
        WHERE games.id = ${gameId}
      `;
      if (!game || game.status !== 'finished' || !game.rated || game.result === 'none')
        return false;

      const players = await transaction<{ color: 'white' | 'black'; userId: string }[]>`
        SELECT color, user_id AS "userId"
        FROM game_players
        WHERE game_id = ${gameId}
        ORDER BY user_id
      `;
      const [firstPlayer, secondPlayer] = players;
      if (!firstPlayer || !secondPlayer)
        throw new InternalServerErrorException('A rated game must have two players');

      // The single shared practice-bot identity never gets a rating_profiles
      // row of its own (it's reused across every difficulty and every
      // human, so a persisted rating for it would be meaningless): only the
      // human side is rated there, using the bot's per-game target_rating
      // (captured on game_players.rating_before at creation) as the fixed
      // opponent rating. A bot persona (apps/api/src/database/bot-personas)
      // is a real, distinct account with its own evolving rating_profiles
      // row, so games against one are rated normally on both sides, exactly
      // like a human vs human game.
      const [bot] = await transaction<{ botUserId: string }[]>`
        SELECT bot_user_id AS "botUserId" FROM game_bots WHERE game_id = ${gameId}
      `;
      const [persona] = bot
        ? await transaction<{ userId: string }[]>`
            SELECT user_id AS "userId" FROM bot_personas WHERE user_id = ${bot.botUserId}
          `
        : [];
      const isSharedPracticeBot = Boolean(bot) && !persona;
      const ratedPlayers = isSharedPracticeBot
        ? players.filter((player) => player.userId !== bot!.botUserId)
        : players;
      const expectedLedgerCount = ratedPlayers.length;

      for (const player of ratedPlayers) {
        await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${`rating:user:${player.userId}:${game.pool}`}, 0))`;
        await transaction`
          INSERT INTO rating_profiles (user_id, pool)
          VALUES (${player.userId}, ${game.pool}::rating_pool)
          ON CONFLICT (user_id, pool) DO NOTHING
        `;
      }

      const profiles = await transaction<ProfileRow[]>`
        SELECT user_id AS "userId", rating, games_count AS "gamesCount",
               has_ever_reached_2400 AS "hasEverReached2400"
        FROM rating_profiles
        WHERE pool = ${game.pool}::rating_pool
          AND user_id IN (${firstPlayer.userId}, ${secondPlayer.userId})
        ORDER BY user_id
        FOR UPDATE
      `;
      const [ledgerCount] = await transaction<{ count: number }[]>`
        SELECT count(*)::integer AS count
        FROM rating_transactions
        WHERE game_id = ${gameId} AND transaction_type = 'game'
      `;
      if (ledgerCount?.count === expectedLedgerCount) return false;
      if (ledgerCount?.count)
        throw new InternalServerErrorException('Incomplete rating ledger state');

      const botOpponentRating = isSharedPracticeBot
        ? (
            await transaction<{ ratingBefore: number }[]>`
              SELECT rating_before AS "ratingBefore" FROM game_players
               WHERE game_id = ${gameId} AND user_id = ${bot!.botUserId}
            `
          )[0]?.ratingBefore
        : undefined;

      const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
      for (const player of ratedPlayers) {
        const profile = profileByUser.get(player.userId);
        const opponentRating =
          isSharedPracticeBot && botOpponentRating !== undefined
            ? botOpponentRating
            : profiles.find((candidate) => candidate.userId !== player.userId)?.rating;
        if (!profile || opponentRating === undefined)
          throw new InternalServerErrorException('Rating profile not found');

        const actualScore = this.score(game.result, player.color);
        const calculation = calculateRatingChange(profile, opponentRating, actualScore);
        const nextGamesCount = profile.gamesCount + 1;
        const win = actualScore === 1 ? 1 : 0;
        const draw = actualScore === 0.5 ? 1 : 0;
        const loss = actualScore === 0 ? 1 : 0;

        await transaction`
          INSERT INTO rating_transactions (
            user_id, game_id, pool, rating_before, opponent_rating,
            expected_score, actual_score, k_factor, delta, rating_after,
            algorithm_version, calculation, transaction_type
          ) VALUES (
            ${player.userId}, ${gameId}, ${game.pool}::rating_pool,
            ${calculation.ratingBefore}, ${calculation.opponentRating},
            ${calculation.expectedScore}, ${calculation.actualScore},
            ${calculation.kFactor}, ${calculation.delta}, ${calculation.ratingAfter},
            ${calculation.algorithmVersion}, ${JSON.stringify(calculation)}::jsonb, 'game'
          )
        `;
        await transaction`
          UPDATE rating_profiles
          SET rating = ${calculation.ratingAfter}, games_count = ${nextGamesCount},
              wins = wins + ${win}, draws = draws + ${draw}, losses = losses + ${loss},
              peak_rating = GREATEST(peak_rating, ${calculation.ratingAfter}),
              has_ever_reached_2400 = has_ever_reached_2400 OR ${calculation.ratingAfter >= 2400},
              provisional = ${nextGamesCount < 20}, version = version + 1, updated_at = now()
          WHERE user_id = ${player.userId} AND pool = ${game.pool}::rating_pool
        `;
        await transaction`
          UPDATE game_players
          SET rating_after = ${calculation.ratingAfter}, rating_delta = ${calculation.delta}
          WHERE game_id = ${gameId} AND user_id = ${player.userId}
        `;
        await transaction`
          INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
          VALUES ('rating', ${player.userId}, 'rating.changed', ${JSON.stringify({
            delta: calculation.delta,
            gameId,
            pool: game.pool,
            rating: calculation.ratingAfter,
            userId: player.userId,
          })}::jsonb)
        `;
      }
      return true;
    });
  }

  async reverseGame(gameId: string, reason: string): Promise<boolean> {
    return this.database.client.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${`rating:game:${gameId}`}, 0))`;
      const originals = await transaction<
        {
          actualScore: number;
          algorithmVersion: string;
          delta: number;
          expectedScore: number;
          id: string;
          kFactor: number;
          opponentRating: number;
          pool: string;
          userId: string;
        }[]
      >`
        SELECT id, user_id AS "userId", pool, opponent_rating AS "opponentRating",
               expected_score::float8 AS "expectedScore", actual_score::float8 AS "actualScore",
               k_factor AS "kFactor", delta, algorithm_version AS "algorithmVersion"
        FROM rating_transactions
        WHERE game_id = ${gameId} AND transaction_type = 'game'
        ORDER BY user_id
      `;
      const [firstOriginal, secondOriginal] = originals;
      if (!firstOriginal || !secondOriginal) return false;
      const [alreadyReversed] = await transaction<{ present: boolean }[]>`
        SELECT true AS present FROM rating_transactions
        WHERE reversal_of IN (${firstOriginal.id}, ${secondOriginal.id})
        LIMIT 1
      `;
      if (alreadyReversed) return false;

      for (const original of originals) {
        await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${`rating:user:${original.userId}:${original.pool}`}, 0))`;
        const [profile] = await transaction<{ gamesCount: number; rating: number }[]>`
          SELECT rating, games_count AS "gamesCount"
          FROM rating_profiles
          WHERE user_id = ${original.userId} AND pool = ${original.pool}::rating_pool
          FOR UPDATE
        `;
        if (!profile) throw new InternalServerErrorException('Rating profile not found');
        const ratingAfter = profile.rating - original.delta;
        const nextGamesCount = Math.max(0, profile.gamesCount - 1);
        const win = original.actualScore === 1 ? 1 : 0;
        const draw = original.actualScore === 0.5 ? 1 : 0;
        const loss = original.actualScore === 0 ? 1 : 0;
        const calculation = {
          originalTransactionId: original.id,
          originalDelta: original.delta,
          rawDelta: -original.delta,
          reason,
        };

        await transaction`
          INSERT INTO rating_transactions (
            user_id, game_id, pool, rating_before, opponent_rating,
            expected_score, actual_score, k_factor, delta, rating_after,
            algorithm_version, calculation, transaction_type, reversal_of
          ) VALUES (
            ${original.userId}, ${gameId}, ${original.pool}::rating_pool,
            ${profile.rating}, ${original.opponentRating}, ${original.expectedScore},
            ${original.actualScore}, ${original.kFactor}, ${-original.delta}, ${ratingAfter},
            ${`${original.algorithmVersion}:reversal`}, ${JSON.stringify(calculation)}::jsonb,
            'reversal', ${original.id}
          )
        `;
        await transaction`
          UPDATE rating_profiles
          SET rating = ${ratingAfter}, games_count = ${nextGamesCount},
              wins = GREATEST(0, wins - ${win}), draws = GREATEST(0, draws - ${draw}),
              losses = GREATEST(0, losses - ${loss}), provisional = ${nextGamesCount < 20},
              version = version + 1, updated_at = now()
          WHERE user_id = ${original.userId} AND pool = ${original.pool}::rating_pool
        `;
      }
      return true;
    });
  }

  profiles(userId: string) {
    return this.database.client`
      SELECT pool, rating, games_count AS "gamesCount", wins, draws, losses,
             peak_rating AS "peakRating", provisional
      FROM rating_profiles
      WHERE user_id = ${userId}
      ORDER BY pool
    `;
  }

  history(userId: string, pool?: string) {
    return this.database.client`
      SELECT id, game_id AS "gameId", pool, rating_before AS "ratingBefore",
             opponent_rating AS "opponentRating", expected_score::float8 AS "expectedScore",
             actual_score::float8 AS "actualScore", k_factor AS "kFactor",
             (calculation->>'rawDelta')::float8 AS "rawDelta", delta,
             rating_after AS "ratingAfter", transaction_type AS "transactionType",
             created_at AS "createdAt"
      FROM rating_transactions
      WHERE user_id = ${userId}
        AND (${pool ?? null}::text IS NULL OR pool = ${pool ?? null}::rating_pool)
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    `;
  }

  leaderboard(pool: string, limit: number) {
    return this.database.client`
      SELECT row_number() OVER (ORDER BY rating_profiles.rating DESC, rating_profiles.games_count DESC, rating_profiles.user_id)::integer AS rank,
             rating_profiles.user_id AS "userId", users.username::text, user_profiles.display_name AS "displayName",
             user_profiles.avatar_url AS "avatarUrl",
             rating_profiles.rating, rating_profiles.games_count AS "gamesCount", rating_profiles.provisional
      FROM rating_profiles
      JOIN users ON users.id = rating_profiles.user_id
      JOIN user_profiles ON user_profiles.user_id = rating_profiles.user_id
      WHERE rating_profiles.pool = ${pool}::rating_pool
        AND users.status = 'active'
        AND user_profiles.is_profile_public = true
      ORDER BY rating_profiles.rating DESC, rating_profiles.games_count DESC, rating_profiles.user_id
      LIMIT ${limit}
    `;
  }

  private score(result: string, color: 'white' | 'black'): GameScore {
    if (result === 'draw') return 0.5;
    if (result === `${color}_win`) return 1;
    return 0;
  }
}
