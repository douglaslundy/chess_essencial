import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';

import { isWithinSchedule, type OnlineWindow } from './is-within-schedule.js';

// Must match apps/api/src/social/social.service.ts's presence key/TTL exactly
// so bot personas are indistinguishable from real users' online status.
const PRESENCE_TTL_SECONDS = 90;
const presenceKey = (userId: string) => `presence:${userId}`;

interface BotPersonaRow {
  onlineWindows: OnlineWindow[] | string;
  userId: string;
}

/**
 * Refreshes (or clears) the Redis presence key for every bot persona
 * according to its daily online/offline schedule. Meant to be called
 * repeatedly (well under the presence TTL) so a bot's status flips
 * naturally as the clock crosses its window boundaries.
 */
export async function runPresenceSchedule(
  sql: Sql,
  redis: Redis,
  now: Date = new Date(),
): Promise<{ offline: number; online: number }> {
  const rows = await sql<BotPersonaRow[]>`
    SELECT user_id AS "userId", online_windows AS "onlineWindows" FROM bot_personas
  `;
  const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();

  const pipeline = redis.pipeline();
  let online = 0;
  let offline = 0;
  for (const row of rows) {
    const windows =
      typeof row.onlineWindows === 'string'
        ? (JSON.parse(row.onlineWindows) as OnlineWindow[])
        : row.onlineWindows;
    if (isWithinSchedule(windows, minuteOfDay)) {
      pipeline.set(presenceKey(row.userId), '1', 'EX', PRESENCE_TTL_SECONDS);
      online += 1;
    } else {
      pipeline.del(presenceKey(row.userId));
      offline += 1;
    }
  }
  if (rows.length > 0) await pipeline.exec();
  return { offline, online };
}
