import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

const timeControls = [
  { code: 'bullet-1-0', label: 'Bullet 1+0', pool: 'bullet', initialMs: 60_000, incrementMs: 0 },
  {
    code: 'bullet-2-1',
    label: 'Bullet 2+1',
    pool: 'bullet',
    initialMs: 120_000,
    incrementMs: 1_000,
  },
  { code: 'blitz-3-0', label: 'Blitz 3+0', pool: 'blitz', initialMs: 180_000, incrementMs: 0 },
  { code: 'blitz-3-2', label: 'Blitz 3+2', pool: 'blitz', initialMs: 180_000, incrementMs: 2_000 },
  { code: 'rapid-10-0', label: 'Rápida 10+0', pool: 'rapid', initialMs: 600_000, incrementMs: 0 },
  {
    code: 'rapid-15-10',
    label: 'Rápida 15+10',
    pool: 'rapid',
    initialMs: 900_000,
    incrementMs: 10_000,
  },
  {
    code: 'classical-30-0',
    label: 'Clássica 30+0',
    pool: 'classical',
    initialMs: 1_800_000,
    incrementMs: 0,
  },
] as const;

try {
  await sql.begin(async (transaction) => {
    for (const control of timeControls) {
      await transaction`
        INSERT INTO game_time_controls (
          code,
          label,
          pool,
          initial_ms,
          increment_ms,
          delay_ms,
          rated,
          active
        )
        VALUES (
          ${control.code},
          ${control.label},
          ${control.pool},
          ${control.initialMs},
          ${control.incrementMs},
          0,
          true,
          true
        )
        ON CONFLICT (code) DO UPDATE SET
          label = EXCLUDED.label,
          pool = EXCLUDED.pool,
          initial_ms = EXCLUDED.initial_ms,
          increment_ms = EXCLUDED.increment_ms,
          delay_ms = EXCLUDED.delay_ms,
          rated = EXCLUDED.rated,
          active = EXCLUDED.active
      `;
    }
  });

  process.stdout.write(`seed.time_controls=${timeControls.length}\n`);
} finally {
  await sql.end({ timeout: 5 });
}
