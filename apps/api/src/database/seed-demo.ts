import argon2 from 'argon2';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (process.env.DEMO_SEED_ENABLED !== 'true') {
  throw new Error('DEMO_SEED_ENABLED=true is required');
}

const password = process.env.DEMO_USER_PASSWORD;
if (!password || password.length < 12) {
  throw new Error('DEMO_USER_PASSWORD with at least 12 characters is required');
}

const demoUsers = [
  {
    displayName: 'Demo Brancas',
    email: 'demo-brancas@xadrez.local',
    id: '00000000-0000-4000-8000-000000000911',
    username: 'demo_brancas',
  },
  {
    displayName: 'Demo Pretas',
    email: 'demo-pretas@xadrez.local',
    id: '00000000-0000-4000-8000-000000000912',
    username: 'demo_pretas',
  },
] as const;
const ratingPools = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'] as const;

const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await sql.begin(async (transaction) => {
    for (const user of demoUsers) {
      await transaction`
        INSERT INTO users (id, email, username, password_hash, status, email_verified_at)
        VALUES (${user.id}, ${user.email}, ${user.username}, ${passwordHash}, 'active', now())
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          status = 'active',
          email_verified_at = COALESCE(users.email_verified_at, now()),
          updated_at = now()
      `;
      await transaction`
        INSERT INTO user_profiles (user_id, display_name, timezone, locale)
        VALUES (${user.id}, ${user.displayName}, 'America/Sao_Paulo', 'pt-BR')
        ON CONFLICT (user_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          timezone = EXCLUDED.timezone,
          locale = EXCLUDED.locale,
          updated_at = now()
      `;
      for (const pool of ratingPools) {
        await transaction`
          INSERT INTO rating_profiles (user_id, pool)
          VALUES (${user.id}, ${pool})
          ON CONFLICT (user_id, pool) DO NOTHING
        `;
      }
    }
  });
  process.stdout.write(`seed.demo_users=${demoUsers.length}\n`);
} finally {
  await sql.end({ timeout: 5 });
}
