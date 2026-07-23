import { randomBytes } from 'node:crypto';

import argon2 from 'argon2';
import postgres from 'postgres';

import { generateBotIdentities } from './bot-personas/generate-identities.js';
import { generateOnlineSchedule } from './bot-personas/generate-schedule.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (process.env.BOT_PERSONAS_ENABLED !== 'true') {
  throw new Error('BOT_PERSONAS_ENABLED=true is required');
}

const count = Number(process.env.BOT_PERSONAS_COUNT ?? '200');
if (!Number.isInteger(count) || count <= 0) {
  throw new Error('BOT_PERSONAS_COUNT must be a positive integer');
}

const ratingPools = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'] as const;

const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  const [existing] = await sql<{ count: number }[]>`
    SELECT count(*)::integer AS count FROM bot_personas
  `;
  if ((existing?.count ?? 0) >= count) {
    process.stdout.write(`seed.bot_personas=skipped (already ${existing?.count})\n`);
  } else {
    const identities = generateBotIdentities(count);
    // Bots never authenticate, so every persona shares one random, unusable
    // password hash rather than generating (and storing) 200 individually.
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'), {
      type: argon2.argon2id,
    });

    await sql.begin(async (transaction) => {
      for (const identity of identities) {
        const [user] = await transaction<{ id: string }[]>`
          INSERT INTO users (email, username, password_hash, status, email_verified_at)
          VALUES (${identity.email}, ${identity.username}, ${passwordHash}, 'active', now())
          ON CONFLICT (email) DO NOTHING
          RETURNING id
        `;
        if (!user) continue;
        await transaction`
          INSERT INTO user_profiles (
            user_id, display_name, birth_date, timezone, locale,
            is_profile_public, allow_challenges, allow_friend_requests
          )
          VALUES (
            ${user.id}, ${identity.displayName}, ${identity.birthDate}::date,
            'America/Sao_Paulo', 'pt-BR', true, true, true
          )
          ON CONFLICT (user_id) DO NOTHING
        `;
        for (const pool of ratingPools) {
          await transaction`
            INSERT INTO rating_profiles (user_id, pool, rating, peak_rating)
            VALUES (${user.id}, ${pool}, ${identity.targetRating}, ${identity.targetRating})
            ON CONFLICT (user_id, pool) DO NOTHING
          `;
        }
        await transaction`
          INSERT INTO bot_personas (user_id, target_rating, online_windows)
          VALUES (
            ${user.id}, ${identity.targetRating},
            ${JSON.stringify(generateOnlineSchedule())}::text::jsonb
          )
          ON CONFLICT (user_id) DO NOTHING
        `;
      }
    });
    process.stdout.write(`seed.bot_personas=${identities.length}\n`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
