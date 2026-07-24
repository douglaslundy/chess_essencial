import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
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
  {
    // Untimed / free play: a 20-day clock (safely below the int4 initial_ms
    // limit) that never runs out in a session. Unrated. The UI shows "∞".
    code: 'untimed',
    label: 'Sem tempo',
    pool: 'correspondence',
    initialMs: 1_728_000_000,
    incrementMs: 0,
    rated: false,
  },
] as const;
const courseModules = [
  'Fundamentos',
  'Pensamento e cálculo',
  'Tática',
  'Estratégia',
  'Finais',
  'Aberturas',
  'Ataque e defesa',
  'Jogo prático',
  'Competição',
  'Consolidação',
] as const;

try {
  await sql.begin(async (transaction) => {
    for (const control of timeControls)
      await transaction`
      INSERT INTO game_time_controls (code, label, pool, initial_ms, increment_ms, delay_ms, rated, active)
      VALUES (${control.code}, ${control.label}, ${control.pool}, ${control.initialMs}, ${control.incrementMs}, 0, ${'rated' in control ? control.rated : true}, true)
      ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, pool = EXCLUDED.pool,
        initial_ms = EXCLUDED.initial_ms, increment_ms = EXCLUDED.increment_ms,
        delay_ms = EXCLUDED.delay_ms, rated = EXCLUDED.rated, active = EXCLUDED.active
    `;
    const [course] = await transaction`
      INSERT INTO courses (slug, title, description)
      VALUES ('xadrez-essencial', 'Xadrez Essencial', 'Currículo progressivo em 10 módulos.')
      ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description
      RETURNING id
    `;
    for (const [index, title] of courseModules.entries())
      await transaction`
      INSERT INTO course_modules (course_id, position, title, source_volume)
      VALUES (${course!.id}, ${index + 1}, ${title}, ${index + 1})
      ON CONFLICT (course_id, position) DO UPDATE SET title = EXCLUDED.title,
        source_volume = EXCLUDED.source_volume
    `;
  });
  process.stdout.write(
    `seed.time_controls=${timeControls.length}\nseed.course_modules=${courseModules.length}\n`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
