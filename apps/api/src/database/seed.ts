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
      VALUES (${control.code}, ${control.label}, ${control.pool}, ${control.initialMs}, ${control.incrementMs}, 0, true, true)
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
    const [fundamentals] = await transaction`
      SELECT id FROM course_modules WHERE course_id = ${course!.id} AND position = 1
    `;
    const demoLessonId = '00000000-0000-4000-8000-000000000901';
    await transaction`
      INSERT INTO lessons (id, module_id, slug, position, title, summary, estimated_minutes, status, version)
      VALUES (${demoLessonId}, ${fundamentals!.id}, 'primeiro-movimento-do-peao', 1,
        'Primeiro movimento do peão', 'Aula demonstrativa interativa do módulo 1.', 8, 'published', 1)
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary,
        estimated_minutes = EXCLUDED.estimated_minutes, status = EXCLUDED.status
    `;
    await transaction`DELETE FROM lesson_steps WHERE lesson_id = ${demoLessonId}`;
    const demoSteps = [
      {
        key: 'boas-vindas',
        type: 'text',
        body: 'Nesta aula você aprenderá o primeiro movimento do peão.',
        actions: [],
        feedback: {},
      },
      {
        key: 'mova-o-peao',
        type: 'board_instruction',
        body: 'Mova o peão de b2 para b3.',
        fen: '4k3/8/8/8/8/8/1P6/4K3 w - - 0 1',
        actions: [{ type: 'move', uci: 'b2b3' }],
        feedback: {
          correct: 'Correto. O peão avançou uma casa.',
          incorrect: 'Tente mover o peão de b2 para b3.',
        },
      },
      {
        key: 'confirme-a-casa',
        type: 'quiz',
        body: 'Em qual casa o peão terminou?',
        actions: [{ type: 'answer', value: 'b3' }],
        feedback: {
          correct: 'Isso mesmo: b3.',
          incorrect: 'Observe novamente a coluna b e a terceira fileira.',
        },
      },
      {
        key: 'explicacao',
        type: 'explanation',
        body: 'Em seu primeiro lance, o peão poderia avançar uma ou duas casas quando o caminho está livre.',
        actions: [],
        feedback: {},
      },
      {
        key: 'resumo',
        type: 'summary',
        body: 'Você moveu legalmente o peão e identificou sua casa final.',
        actions: [],
        feedback: {},
      },
    ] as const;
    for (const [index, step] of demoSteps.entries())
      await transaction`
      INSERT INTO lesson_steps (lesson_id, step_key, position, step_type, body_md, initial_fen,
        orientation, expected_actions, feedback, next_step_rules)
      VALUES (${demoLessonId}, ${step.key}, ${index + 1}, ${step.type}, ${step.body},
        ${'fen' in step ? step.fen : null}, 'white', ${JSON.stringify(step.actions)}::jsonb,
        ${JSON.stringify(step.feedback)}::jsonb, '[]'::jsonb)
    `;
    await transaction`
      INSERT INTO lesson_source_pages (lesson_id, page) VALUES (${demoLessonId}, 1)
      ON CONFLICT DO NOTHING
    `;
  });
  process.stdout.write(
    `seed.time_controls=${timeControls.length}\nseed.course_modules=${courseModules.length}\n`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
