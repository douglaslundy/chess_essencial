import type { Sql } from 'postgres';

// A bot that accepted instantly would look suspicious; waiting a few
// seconds (instead of the default hourly worker tick) is what actually
// makes the acceptance read as a real person glancing at a notification.
const AUTO_ACCEPT_DELAY_SECONDS = 5;

/**
 * Accepts any friend request sent to a bot persona, once it has been
 * pending for at least AUTO_ACCEPT_DELAY_SECONDS. Returns how many were
 * accepted this run.
 */
export async function runAutoAcceptFriendRequests(sql: Sql): Promise<number> {
  const result = await sql`
    UPDATE friendships
    SET status = 'accepted', updated_at = now()
    WHERE status = 'pending'
      AND created_at <= now() - make_interval(secs => ${AUTO_ACCEPT_DELAY_SECONDS})
      AND addressee_id IN (SELECT user_id FROM bot_personas)
  `;
  return result.count;
}
