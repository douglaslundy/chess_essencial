import postgres from 'postgres';

// Popula difficulty_score (ponte entre o enum antigo beginner/intermediate/
// advanced/expert e o rating numérico real do Lichess) e gera o currículo
// da Jornada de Aprendizagem (learning_worlds/levels/stages) a partir da
// distribuição REAL de conteúdo publicado — nunca de números inventados.
// Script idempotente e re-executável: roda de novo sempre que o pool de
// exercícios mudar (ex. depois de importar mais táticas), sem duplicar nada
// (tudo por ON CONFLICT em chave natural).
//
// Ver docs/superpowers/specs/2026-07-27-jornada-de-aprendizagem-design.md
// (seções 2 e 3) para a justificativa dos números abaixo — em particular,
// por que não existe conteúdo real acima de rating ~2200 (confirmado por
// query direta em produção em 2026-07-27), e por que a ponte enum→score
// usa o centro de cada faixa observada do Lichess, não um chute.

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const sql = postgres(databaseUrl, { max: 1, prepare: false });

// Ponte enum -> difficulty_score para itens sem rating numérico do Lichess
// (desafios curados da migration 0011+, e qualquer exercício do livro que
// tenha o enum difficulty preenchido). Valores no centro de cada faixa
// real observada no pool do Lichess (ver seção 3 do design doc).
const ENUM_TO_SCORE = {
  beginner: 900,
  intermediate: 1300,
  advanced: 1700,
  expert: 2100,
} as const;

interface WorldConfig {
  position: number;
  title: string;
  description: string;
  difficultyMin: number;
  difficultyMax: number;
}

// 7 Mundos. Faixas ajustadas ao teto real observado (~2200) — não existe
// conteúdo tático catalogado acima disso, então o Mundo 7 é "mistura
// avançada" dentro da faixa expert real, não um patamar inventado maior.
const WORLDS: WorldConfig[] = [
  {
    position: 1,
    title: 'Primeiros Lances',
    description: 'Movimentação de peças, capturas simples e xeque básico.',
    difficultyMin: 0,
    difficultyMax: 800,
  },
  {
    position: 2,
    title: 'Peças em Ação',
    description: 'Peça indefesa, garfo simples, cravada básica.',
    difficultyMin: 800,
    difficultyMax: 1050,
  },
  {
    position: 3,
    title: 'Olho Tático',
    description: 'Reconhecimento de padrão misto: garfo, cravada, espeto, raio-x.',
    difficultyMin: 1050,
    difficultyMax: 1300,
  },
  {
    position: 4,
    title: 'Combinações',
    description: 'Sequências forçadas de 2-3 lances, sacrifícios.',
    difficultyMin: 1300,
    difficultyMax: 1550,
  },
  {
    position: 5,
    title: 'Ataque ao Rei',
    description: 'Mate em 2-3, xeque duplo, ataques ao rei.',
    difficultyMin: 1550,
    difficultyMax: 1800,
  },
  {
    position: 6,
    title: 'Defesa e Resistência',
    description: 'Defesa contra ameaças, zugzwang, finais táticos.',
    difficultyMin: 1800,
    difficultyMax: 2000,
  },
  {
    position: 7,
    title: 'Jogador em Formação',
    description: 'Mistura avançada, revisão cruzada de todos os temas táticos.',
    difficultyMin: 2000,
    difficultyMax: 2200,
  },
];

const STAGES_PER_LEVEL = 6;
const TARGET_LEVELS_PER_WORLD = 12;
const TARGET_STAGES_PER_WORLD = TARGET_LEVELS_PER_WORLD * STAGES_PER_LEVEL;

/** Amostra até `count` itens espalhados uniformemente por uma lista já ordenada. */
function evenSample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const stride = items.length / count;
  const sampled: T[] = [];
  for (let i = 0; i < count; i += 1) sampled.push(items[Math.floor(i * stride)]!);
  return sampled;
}

try {
  const scoreUpdate = await sql`
    UPDATE exercises
       SET difficulty_score = COALESCE(
         (import_metadata->>'rating')::numeric,
         CASE difficulty
           WHEN 'beginner' THEN ${ENUM_TO_SCORE.beginner}::numeric
           WHEN 'intermediate' THEN ${ENUM_TO_SCORE.intermediate}::numeric
           WHEN 'advanced' THEN ${ENUM_TO_SCORE.advanced}::numeric
           WHEN 'expert' THEN ${ENUM_TO_SCORE.expert}::numeric
           ELSE NULL
         END
       )
     WHERE status = 'published'
  `;
  process.stdout.write(`seed_learning_path.difficulty_score_updated=${scoreUpdate.count}\n`);

  await sql.begin(async (transaction) => {
    for (const world of WORLDS) {
      const [worldRow] = await transaction`
        INSERT INTO learning_worlds (position, title, description, difficulty_min, difficulty_max)
        VALUES (${world.position}, ${world.title}, ${world.description}, ${world.difficultyMin}, ${world.difficultyMax})
        ON CONFLICT (position) DO UPDATE SET
          title = EXCLUDED.title, description = EXCLUDED.description,
          difficulty_min = EXCLUDED.difficulty_min, difficulty_max = EXCLUDED.difficulty_max
        RETURNING id
      `;

      // The extra three filters below exclude exercises that can't
      // actually be played through the guided single-line board flow the
      // Jornada uses: free_text exercises have no move validation at all
      // (answer_format defaults to 'move_sequence' only when
      // import_metadata has no explicit value, same COALESCE the rest of
      // the exercises domain already uses), and a stage with no recorded
      // hints or solution line has nothing to show/validate against —
      // found as the root cause of a real "no hint, no move accepted"
      // report against a seeded stage.
      const pool = await transaction<{ id: string; difficultyScore: number }[]>`
        SELECT id, difficulty_score AS "difficultyScore"
          FROM exercises
         WHERE status = 'published'
           AND position_type = 'legal_position'
           AND difficulty_score IS NOT NULL
           AND difficulty_score >= ${world.difficultyMin}
           AND difficulty_score < ${world.difficultyMax}
           AND COALESCE(import_metadata->>'answerFormat', 'move_sequence') = 'move_sequence'
           AND jsonb_array_length(hints) > 0
           AND jsonb_array_length(solution_lines) > 0
         ORDER BY difficulty_score, id
      `;

      const chosen = evenSample(pool, TARGET_STAGES_PER_WORLD);
      const levelCount = Math.max(1, Math.ceil(chosen.length / STAGES_PER_LEVEL));

      process.stdout.write(
        `seed_learning_path.world="${world.title}" pool=${pool.length} chosen=${chosen.length} levels=${levelCount}\n`,
      );

      for (let levelIndex = 0; levelIndex < levelCount; levelIndex += 1) {
        const levelExercises = chosen.slice(
          levelIndex * STAGES_PER_LEVEL,
          (levelIndex + 1) * STAGES_PER_LEVEL,
        );
        if (levelExercises.length === 0) continue;

        const isLastLevelOfWorld = levelIndex === levelCount - 1;
        const levelPosition = levelIndex + 1;
        const levelDifficultyMin = levelExercises[0]!.difficultyScore;
        const levelDifficultyMax = levelExercises[levelExercises.length - 1]!.difficultyScore;

        const [levelRow] = await transaction`
          INSERT INTO learning_levels (
            world_id, position, title, difficulty_min, difficulty_max, challenge_count
          )
          VALUES (
            ${worldRow!.id}, ${levelPosition}, ${`Nível ${levelPosition}`},
            ${levelDifficultyMin}, ${levelDifficultyMax}, ${levelExercises.length}
          )
          ON CONFLICT (world_id, position) DO UPDATE SET
            title = EXCLUDED.title, difficulty_min = EXCLUDED.difficulty_min,
            difficulty_max = EXCLUDED.difficulty_max, challenge_count = EXCLUDED.challenge_count
          RETURNING id
        `;

        for (const [index, exercise] of levelExercises.entries()) {
          const isFinalStageOfLevel = index === levelExercises.length - 1;
          const stageType = isFinalStageOfLevel && isLastLevelOfWorld ? 'boss' : 'challenge';
          await transaction`
            INSERT INTO learning_stages (level_id, position, type, exercise_id)
            VALUES (${levelRow!.id}, ${index + 1}, ${stageType}, ${exercise.id})
            ON CONFLICT (level_id, position) DO UPDATE SET
              type = EXCLUDED.type, exercise_id = EXCLUDED.exercise_id
          `;
        }

        // A cada 4 níveis, uma Etapa de revisão extra — sem exercise_id fixo
        // de propósito (resolvida em runtime a partir da maestria de cada
        // usuário, FASE 8 do spec).
        if (levelPosition % 4 === 0) {
          await transaction`
            INSERT INTO learning_stages (level_id, position, type)
            VALUES (${levelRow!.id}, ${levelExercises.length + 1}, 'review')
            ON CONFLICT (level_id, position) DO UPDATE SET type = EXCLUDED.type
          `;
        }
      }
    }
  });
  process.stdout.write('seed_learning_path.done=true\n');
} finally {
  await sql.end({ timeout: 5 });
}
