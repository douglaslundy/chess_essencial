import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';

interface BotPersonaRow {
  targetRating: number;
  userId: string;
}

interface TimeControlRow {
  id: string;
  pool: string;
}

const presenceKey = (userId: string) => `presence:${userId}`;

/**
 * Deterministic per-bot time control choice (stable across ticks so a bot
 * doesn't flicker between pools), spreading the fleet across every rated
 * pool the same way real players spread across them.
 */
export function pickTimeControlForBot<T extends TimeControlRow>(
  userId: string,
  timeControls: readonly T[],
): T {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return timeControls[hash % timeControls.length]!;
}

/**
 * Keeps every online, idle bot persona sitting in the matchmaking queue —
 * exactly like a real player who clicked "buscar adversário" and is
 * waiting — so a human's search can match them instantly, the same way it
 * would match another human. Removes queue entries for bots that went
 * offline or started a game elsewhere in the meantime.
 */
export async function runBotQueueJob(
  sql: Sql,
  redis: Redis,
  now: Date = new Date(),
): Promise<{ queued: number; removed: number }> {
  const personas = await sql<BotPersonaRow[]>`
    SELECT user_id AS "userId", target_rating AS "targetRating" FROM bot_personas
  `;
  if (personas.length === 0) return { queued: 0, removed: 0 };

  const presenceValues = await redis.mget(personas.map((persona) => presenceKey(persona.userId)));
  const onlineIds = new Set(
    personas.filter((_, index) => presenceValues[index] !== null).map((persona) => persona.userId),
  );

  const busyRows = onlineIds.size
    ? await sql<{ userId: string }[]>`
        SELECT DISTINCT game_players.user_id AS "userId"
        FROM game_players
        JOIN games ON games.id = game_players.game_id
        WHERE game_players.user_id = ANY(${[...onlineIds]}::uuid[]) AND games.status = 'active'
      `
    : [];
  const busyIds = new Set(busyRows.map((row) => row.userId));

  const staleIds = personas
    .filter((persona) => !onlineIds.has(persona.userId) || busyIds.has(persona.userId))
    .map((persona) => persona.userId);
  const removeResult = staleIds.length
    ? await sql`DELETE FROM matchmaking_queue WHERE user_id = ANY(${staleIds}::uuid[])`
    : { count: 0 };

  const eligible = personas.filter(
    (persona) => onlineIds.has(persona.userId) && !busyIds.has(persona.userId),
  );
  if (eligible.length === 0) return { queued: 0, removed: removeResult.count };

  const timeControls = await sql<TimeControlRow[]>`
    SELECT id, pool FROM game_time_controls WHERE active = true AND code <> 'untimed'
  `;
  if (timeControls.length === 0) return { queued: 0, removed: removeResult.count };

  let queued = 0;
  for (const persona of eligible) {
    const timeControl = pickTimeControlForBot(persona.userId, timeControls);
    const [ratingRow] = await sql<{ rating: number }[]>`
      SELECT rating FROM rating_profiles
      WHERE user_id = ${persona.userId} AND pool = ${timeControl.pool}::rating_pool
    `;
    const rating = ratingRow?.rating ?? persona.targetRating;
    await sql`
      INSERT INTO matchmaking_queue (
        user_id, pool, time_control_id, rating, min_rating, max_rating, enqueued_at, heartbeat_at
      ) VALUES (
        ${persona.userId}, ${timeControl.pool}::rating_pool, ${timeControl.id}, ${rating},
        ${rating - 100}, ${rating + 100}, ${now.toISOString()}, ${now.toISOString()}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        pool = EXCLUDED.pool, time_control_id = EXCLUDED.time_control_id,
        rating = EXCLUDED.rating, min_rating = EXCLUDED.min_rating,
        max_rating = EXCLUDED.max_rating, heartbeat_at = EXCLUDED.heartbeat_at
    `;
    queued += 1;
  }
  return { queued, removed: removeResult.count };
}
