import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const sql = postgres(databaseUrl, { max: 1, prepare: false });

interface AuditSummary {
  badAssets: number;
  bossTopologyViolations: number;
  countMismatches: number;
  emptyReviews: number;
  invalidResolvedReviews: number;
  levelPositionGaps: number;
  levels: number;
  minReviewPool: number | null;
  publishedUnplayableExercises: number;
  rangeViolations: number;
  responseStepsWithoutBoard: number;
  reviewCadenceViolations: number;
  reviews: number;
  stagePositionGaps: number;
  stages: number;
  worldPositionGaps: number;
  worlds: number;
}

try {
  const [summary] = await sql<AuditSummary[]>`
    WITH review_levels AS (
      SELECT level.id, level.difficulty_min, level.difficulty_max
      FROM learning_levels level
      WHERE EXISTS (
        SELECT 1 FROM learning_stages stage
        WHERE stage.level_id = level.id AND stage.type = 'review'
      )
    ),
    review_pools AS (
      SELECT review_level.id, count(exercise.id)::integer AS candidates
      FROM review_levels review_level
      LEFT JOIN exercises exercise
        ON exercise.status = 'published'
       AND exercise.position_type = 'legal_position'
       AND exercise.difficulty_score BETWEEN review_level.difficulty_min AND review_level.difficulty_max
       AND COALESCE(exercise.import_metadata->>'answerFormat', 'move_sequence') = 'move_sequence'
       AND jsonb_array_length(exercise.solution_lines) > 0
      GROUP BY review_level.id
    ),
    bad_assets AS (
      SELECT stage.id
      FROM learning_stages stage
      LEFT JOIN exercises exercise ON exercise.id = stage.exercise_id
      LEFT JOIN lessons lesson ON lesson.id = stage.lesson_id
      WHERE (
        stage.type = 'lesson'
        AND (stage.lesson_id IS NULL OR stage.exercise_id IS NOT NULL OR lesson.id IS NULL OR lesson.status <> 'published')
      ) OR (
        stage.type = 'review'
        AND (stage.exercise_id IS NOT NULL OR stage.lesson_id IS NOT NULL)
      ) OR (
        stage.type IN ('challenge', 'checkpoint', 'boss')
        AND (
          stage.exercise_id IS NULL OR exercise.id IS NULL
          OR exercise.status <> 'published'
          OR exercise.position_type <> 'legal_position'
          OR COALESCE(exercise.import_metadata->>'answerFormat', 'move_sequence') <> 'move_sequence'
          OR jsonb_array_length(exercise.solution_lines) = 0
        )
      )
    ),
    level_position_gaps AS (
      SELECT world_id
      FROM learning_levels
      GROUP BY world_id
      HAVING min(position) <> 1 OR max(position) <> count(*)
    ),
    stage_position_gaps AS (
      SELECT level_id
      FROM learning_stages
      GROUP BY level_id
      HAVING min(position) <> 1 OR max(position) <> count(*)
    ),
    count_mismatches AS (
      SELECT level.id
      FROM learning_levels level
      LEFT JOIN learning_stages stage
        ON stage.level_id = level.id AND stage.type IN ('challenge', 'checkpoint', 'boss')
      GROUP BY level.id, level.challenge_count
      HAVING count(stage.id) <> level.challenge_count
    ),
    review_cadence_violations AS (
      SELECT level.id
      FROM learning_levels level
      LEFT JOIN learning_stages stage ON stage.level_id = level.id AND stage.type = 'review'
      GROUP BY level.id, level.position
      HAVING count(stage.id) <> CASE WHEN level.position % 4 = 0 THEN 1 ELSE 0 END
    ),
    boss_topology_violations AS (
      SELECT world.id
      FROM learning_worlds world
      JOIN learning_levels level ON level.world_id = world.id
      LEFT JOIN learning_stages stage ON stage.level_id = level.id AND stage.type = 'boss'
      GROUP BY world.id
      HAVING count(stage.id) <> 1
         OR max(level.position) FILTER (WHERE stage.id IS NOT NULL) <> max(level.position)
    ),
    invalid_resolved_reviews AS (
      SELECT completion.stage_id
      FROM user_stage_completions completion
      JOIN learning_stages stage ON stage.id = completion.stage_id AND stage.type = 'review'
      JOIN learning_levels level ON level.id = stage.level_id
      LEFT JOIN exercises exercise ON exercise.id = completion.resolved_exercise_id
      WHERE completion.resolved_exercise_id IS NOT NULL
        AND (
          exercise.id IS NULL OR exercise.status <> 'published'
          OR exercise.position_type <> 'legal_position'
          OR exercise.difficulty_score NOT BETWEEN level.difficulty_min AND level.difficulty_max
          OR COALESCE(exercise.import_metadata->>'answerFormat', 'move_sequence') <> 'move_sequence'
          OR jsonb_array_length(exercise.solution_lines) = 0
        )
    ),
    range_violations AS (
      SELECT level.id
      FROM learning_levels level
      JOIN learning_worlds world ON world.id = level.world_id
      WHERE level.difficulty_min > level.difficulty_max
         OR level.difficulty_min < world.difficulty_min
         OR level.difficulty_max > world.difficulty_max
    )
    SELECT
      (SELECT count(*)::integer FROM learning_worlds) AS "worlds",
      (SELECT count(*)::integer FROM learning_levels) AS "levels",
      (SELECT count(*)::integer FROM learning_stages) AS "stages",
      (SELECT count(*)::integer FROM review_pools) AS "reviews",
      (SELECT count(*)::integer FROM review_pools WHERE candidates = 0) AS "emptyReviews",
      (SELECT min(candidates)::integer FROM review_pools) AS "minReviewPool",
      (
        SELECT count(*)::integer FROM exercises
        WHERE status = 'published'
          AND (
            position_type <> 'legal_position'
            OR COALESCE(import_metadata->>'answerFormat', 'move_sequence') <> 'move_sequence'
            OR jsonb_array_length(solution_lines) = 0
          )
      ) AS "publishedUnplayableExercises",
      (
        SELECT count(*)::integer FROM lesson_steps
        WHERE jsonb_array_length(expected_actions) > 0 AND initial_fen IS NULL
      ) AS "responseStepsWithoutBoard",
      (SELECT count(*)::integer FROM bad_assets) AS "badAssets",
      (SELECT count(*)::integer FROM level_position_gaps) AS "levelPositionGaps",
      (SELECT count(*)::integer FROM stage_position_gaps) AS "stagePositionGaps",
      (SELECT count(*)::integer FROM count_mismatches) AS "countMismatches",
      (SELECT count(*)::integer FROM review_cadence_violations) AS "reviewCadenceViolations",
      (SELECT count(*)::integer FROM boss_topology_violations) AS "bossTopologyViolations",
      (SELECT count(*)::integer FROM invalid_resolved_reviews) AS "invalidResolvedReviews",
      (SELECT count(*)::integer FROM range_violations) AS "rangeViolations",
      (
        SELECT CASE WHEN min(position) = 1 AND max(position) = count(*) THEN 0 ELSE 1 END::integer
        FROM learning_worlds
      ) AS "worldPositionGaps"
  `;

  if (!summary) throw new Error('Learning path audit returned no summary');

  const violations = {
    badAssets: summary.badAssets,
    bossTopologyViolations: summary.bossTopologyViolations,
    countMismatches: summary.countMismatches,
    emptyReviews: summary.emptyReviews,
    invalidResolvedReviews: summary.invalidResolvedReviews,
    publishedUnplayableExercises: summary.publishedUnplayableExercises,
    levelPositionGaps: summary.levelPositionGaps,
    rangeViolations: summary.rangeViolations,
    responseStepsWithoutBoard: summary.responseStepsWithoutBoard,
    reviewCadenceViolations: summary.reviewCadenceViolations,
    stagePositionGaps: summary.stagePositionGaps,
    worldPositionGaps: summary.worldPositionGaps,
  };
  const failed = Object.entries(violations).filter(([, count]) => count !== 0);
  if (
    summary.worlds === 0 ||
    summary.levels === 0 ||
    summary.stages === 0 ||
    summary.reviews === 0
  ) {
    failed.push(['missingCurriculum', 1]);
  }

  process.stdout.write(`learning_path.audit=${JSON.stringify(summary)}\n`);
  if (failed.length > 0) {
    throw new Error(`Learning path audit failed: ${JSON.stringify(Object.fromEntries(failed))}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
