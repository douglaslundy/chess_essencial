import { ChessJsRules } from '@xadrez/chess-domain';
import type { ExerciseImportReport } from '@xadrez/contracts';
import type { Sql, TransactionSql } from 'postgres';

type JsonObject = Record<string, unknown>;

export type NormalizedExercise = {
  answerFormat: string;
  category: string | null;
  chapterNumber: number | null;
  difficulty: string | null;
  externalId: string;
  fen: string | null;
  hints: string[];
  metadata: JsonObject;
  lessonLinkPosition: number | null;
  moduleNumber: number | null;
  positionType: 'legal_position' | 'illustrative_diagram' | 'text_only';
  promptMd: string;
  sideToMove: 'white' | 'black' | null;
  solutionLines: string[][];
  solutionMd: string;
  sourceNumber: number;
  sourcePages: number[];
  tags: string[];
  title: string | null;
};

export type ExerciseRejection = { index: number; reason: string; sourceNumber: number | null };

export function isPlayableExercise(exercise: NormalizedExercise): boolean {
  return (
    exercise.positionType === 'legal_position' &&
    exercise.answerFormat === 'move_sequence' &&
    exercise.solutionLines.length > 0
  );
}
export type NormalizedExerciseDataset = {
  exercises: NormalizedExercise[];
  modules: { number: number; title: string }[];
  rejections: ExerciseRejection[];
  report: ExerciseImportReport;
};

const ALIASES = {
  category: ['category', 'categoria', 'theme', 'tema', 'tag'],
  chapter: ['chapterNumber', 'chapter_number', 'chapter', 'capitulo', 'cap\u00edtulo'],
  difficulty: ['difficulty', 'dificuldade', 'level', 'nivel', 'n\u00edvel'],
  fen: ['fen', 'position', 'posicao', 'posi\u00e7\u00e3o'],
  hints: ['hints', 'dicas', 'hint', 'dica'],
  module: ['moduleNumber', 'module_number', 'module', 'modulo', 'm\u00f3dulo'],
  pages: ['sourcePages', 'source_pages', 'pages', 'paginas', 'p\u00e1ginas', 'page', 'pagina'],
  prompt: ['promptMd', 'prompt_md', 'prompt', 'question', 'questao', 'quest\u00e3o', 'enunciado'],
  solution: ['solutionMd', 'solution_md', 'solution', 'solucao', 'solu\u00e7\u00e3o', 'answer'],
  solutionLines: ['solutionLines', 'solution_lines', 'lines', 'variations', 'variantes', 'moves'],
  sourceNumber: ['sourceNumber', 'source_number', 'number', 'numero', 'n\u00famero', 'id'],
  tags: ['tags', 'tag', 'etiquetas', 'keywords', 'palavras_chave'],
  title: ['title', 'titulo', 't\u00edtulo', 'name', 'nome', 'chapter_title'],
} as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getValue(object: JsonObject, aliases: readonly string[]): unknown {
  for (const alias of aliases) if (object[alias] !== undefined) return object[alias];
  return undefined;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = String(value).trim();
  return result.length > 0 ? result : null;
}

function asPositiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(asString(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function asStringArray(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];
  return values.map(asString).filter((item): item is string => item !== null);
}

function asSolutionLines(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  if (value.every((item) => typeof item === 'string')) {
    return [value.map((item) => item.trim()).filter(Boolean)];
  }
  return value
    .filter(Array.isArray)
    .map((line) => line.map(asString).filter((move): move is string => move !== null))
    .filter((line) => line.length > 0);
}

function asPages(value: unknown): number[] {
  if (isObject(value)) {
    const first = asPositiveInteger(value.first ?? value.start ?? value.inicio);
    const last = asPositiveInteger(value.last ?? value.end ?? value.fim);
    if (first !== null && last !== null && last >= first) {
      return Array.from({ length: last - first + 1 }, (_, index) => first + index);
    }
  }
  const values = Array.isArray(value) ? value : [value];
  return [
    ...new Set(values.map(asPositiveInteger).filter((page): page is number => page !== null)),
  ].sort((left, right) => left - right);
}

function extractItems(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (!isObject(input)) return [];
  for (const key of ['exercises', 'exercicios', 'exerc\u00edcios', 'items', 'data']) {
    if (Array.isArray(input[key])) return input[key];
  }
  return [];
}

function extractDiagrams(input: unknown): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  if (!isObject(input) || !Array.isArray(input.diagrams)) return result;
  for (const value of input.diagrams) {
    if (!isObject(value)) continue;
    const id = asString(value.id);
    if (id) result.set(id, value);
  }
  return result;
}

type ExerciseContext = {
  diagram: JsonObject | null;
  diagramId: string | null;
  fen: string | null;
  positionType: 'legal_position' | 'illustrative_diagram' | 'text_only';
  sideToMove: 'white' | 'black' | null;
};

function exerciseContext(item: JsonObject, diagrams: Map<string, JsonObject>): ExerciseContext {
  const firstPosition =
    Array.isArray(item.positions) && isObject(item.positions[0]) ? item.positions[0] : null;
  const firstDiagramRef = Array.isArray(item.diagram_refs) ? asString(item.diagram_refs[0]) : null;
  const diagramId = asString(firstPosition?.diagram_id) ?? firstDiagramRef;
  const diagram = diagramId ? (diagrams.get(diagramId) ?? null) : null;
  const fen =
    asString(getValue(item, ALIASES.fen)) ?? asString(firstPosition?.fen) ?? asString(diagram?.fen);
  const explicit = asString(
    item.positionType ?? item.position_type ?? item.tipo_posicao ?? diagram?.position_type,
  )?.toLowerCase();
  const illustrative =
    item.illustrative === true ||
    item.ilustrativo === true ||
    item.diagramOnly === true ||
    diagram?.legal_for_play === false ||
    explicit?.includes('illustr') ||
    explicit?.includes('ilustr');
  const positionType =
    fen === null ? 'text_only' : illustrative ? 'illustrative_diagram' : 'legal_position';
  const explicitSide = asString(
    item.sideToMove ??
      item.side_to_move ??
      item.lado ??
      firstPosition?.side_to_move ??
      diagram?.side_to_move,
  )?.toLowerCase();
  const fenSide = fen?.split(/\s+/)[1];
  const sideToMove =
    explicitSide === 'white' || explicitSide === 'brancas' || fenSide === 'w'
      ? 'white'
      : explicitSide === 'black' || explicitSide === 'pretas' || fenSide === 'b'
        ? 'black'
        : null;
  return { diagram, diagramId, fen, positionType, sideToMove };
}

function rejectionReason(item: JsonObject, context: ExerciseContext): string | null {
  if (asPositiveInteger(getValue(item, ALIASES.sourceNumber)) === null)
    return 'missing_source_number';
  if (asString(getValue(item, ALIASES.prompt)) === null) return 'missing_prompt';
  if (context.positionType === 'legal_position' && context.fen !== null) {
    try {
      new ChessJsRules(context.fen);
    } catch {
      return 'invalid_fen';
    }
  }
  const solution = asString(getValue(item, ALIASES.solution));
  const lines = asSolutionLines(getValue(item, ALIASES.solutionLines));
  return solution === null && lines.length === 0 ? 'missing_solution' : null;
}
export function normalizeExerciseDataset(
  input: unknown,
  sourceName: string,
): NormalizedExerciseDataset {
  const items = extractItems(input);
  const diagrams = extractDiagrams(input);
  const modules =
    isObject(input) && Array.isArray(input.modules)
      ? input.modules
          .filter(isObject)
          .map((module) => ({
            number: asPositiveInteger(module.number),
            title: asString(module.title),
          }))
          .filter(
            (module): module is { number: number; title: string } =>
              module.number !== null && module.title !== null,
          )
      : [];
  const schemaVersion = isObject(input) ? asString(input.schema_version) : null;
  const exercises: NormalizedExercise[] = [];
  const rejections: ExerciseRejection[] = [];

  items.forEach((rawItem, index) => {
    if (!isObject(rawItem)) {
      rejections.push({ index, reason: 'invalid_item', sourceNumber: null });
      return;
    }
    const sourceNumber = asPositiveInteger(getValue(rawItem, ALIASES.sourceNumber));
    const context = exerciseContext(rawItem, diagrams);
    const reason = rejectionReason(rawItem, context);
    if (reason !== null || sourceNumber === null) {
      rejections.push({ index, reason: reason ?? 'missing_source_number', sourceNumber });
      return;
    }

    const solutionLines = asSolutionLines(getValue(rawItem, ALIASES.solutionLines));
    const answerFormat =
      asString(rawItem.answer_format ?? rawItem.answerFormat) ??
      (solutionLines.length > 0 ? 'move_sequence' : 'free_text');
    exercises.push({
      answerFormat,
      category: asString(getValue(rawItem, ALIASES.category)),
      chapterNumber: asPositiveInteger(getValue(rawItem, ALIASES.chapter)),
      difficulty: asString(getValue(rawItem, ALIASES.difficulty)),
      externalId: asString(rawItem.id) ?? `xadrez-essencial-${sourceNumber}`,
      fen: context.fen,
      hints: asStringArray(getValue(rawItem, ALIASES.hints)),
      metadata: {
        answerFormat,
        checksumSha256: asString(rawItem.checksum_sha256),
        diagram: context.diagram
          ? {
              annotations: context.diagram.annotations ?? {},
              caption: asString(context.diagram.caption),
              id: context.diagramId,
              legalForPlay: context.diagram.legal_for_play === true,
              orientation: asString(context.diagram.orientation),
              sourcePositionType: asString(context.diagram.position_type),
            }
          : null,
        importedIndex: index,
        language: asString(rawItem.language),
        notation: asString(rawItem.notation),
        schemaVersion,
        source: isObject(rawItem.source) ? rawItem.source : null,
        sourceName,
      },
      lessonLinkPosition: null,
      moduleNumber: asPositiveInteger(getValue(rawItem, ALIASES.module)),
      positionType: context.positionType,
      promptMd: asString(getValue(rawItem, ALIASES.prompt))!,
      sideToMove: context.sideToMove,
      solutionLines,
      solutionMd:
        asString(getValue(rawItem, ALIASES.solution)) ??
        solutionLines.map((line) => line.join(' ')).join('\n'),
      sourceNumber,
      sourcePages: asPages(getValue(rawItem, ALIASES.pages)),
      tags: asStringArray(getValue(rawItem, ALIASES.tags)),
      title: asString(getValue(rawItem, ALIASES.title)),
    });
  });

  const chapterGroups = new Map<string, NormalizedExercise[]>();
  for (const exercise of exercises) {
    if (exercise.moduleNumber === null || exercise.chapterNumber === null) continue;
    const key = String(exercise.moduleNumber) + ':' + String(exercise.chapterNumber);
    const group = chapterGroups.get(key) ?? [];
    group.push(exercise);
    chapterGroups.set(key, group);
  }
  for (const group of chapterGroups.values())
    group
      .sort((left, right) => left.sourceNumber - right.sourceNumber)
      .forEach((exercise, index) => {
        exercise.lessonLinkPosition = index + 1;
      });

  const reasons: Record<string, number> = {};
  for (const rejection of rejections)
    reasons[rejection.reason] = (reasons[rejection.reason] ?? 0) + 1;
  return {
    exercises,
    modules,
    rejections,
    report: {
      importRunId: null,
      imported: exercises.length,
      reasons,
      rejected: rejections.length,
      sourceName,
      total: items.length,
    },
  };
}

async function associateExerciseWithLessons(
  transaction: TransactionSql,
  exerciseId: string,
  exercise: NormalizedExercise,
) {
  if (exercise.lessonLinkPosition === null || exercise.lessonLinkPosition > 12) return;
  const pages = transaction.array(exercise.sourcePages, 23);
  const lessonRows = await transaction<{ id: string }[]>`
    SELECT DISTINCT l.id
      FROM lessons l
      JOIN course_modules cm ON cm.id = l.module_id
      LEFT JOIN lesson_source_pages lsp ON lsp.lesson_id = l.id
     WHERE (${exercise.moduleNumber}::integer IS NULL OR cm.source_volume = ${exercise.moduleNumber})
       AND (${exercise.chapterNumber}::integer IS NULL OR l.position = ${exercise.chapterNumber})
       AND (${pages}::integer[] = '{}'::integer[] OR lsp.page = ANY(${pages}::integer[]))
  `;
  for (const lesson of lessonRows) {
    await transaction`
      INSERT INTO lesson_exercises (lesson_id, exercise_id, position)
      SELECT ${lesson.id}, ${exerciseId}, COALESCE(MAX(position), 0) + 1
        FROM lesson_exercises
       WHERE lesson_id = ${lesson.id}
      HAVING count(*) < 12
      ON CONFLICT (lesson_id, exercise_id) DO NOTHING
    `;
  }
}

export async function persistExerciseDataset(
  sql: Sql,
  dataset: NormalizedExerciseDataset,
): Promise<ExerciseImportReport> {
  return sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(hashtext('exercise_content_import'))`;
    const [run] = await transaction<{ id: string }[]>`
      INSERT INTO exercise_import_runs (
        source_name, total_count, imported_count, rejected_count, rejection_report
      ) VALUES (
        ${dataset.report.sourceName}, ${dataset.report.total}, ${dataset.report.imported},
        ${dataset.report.rejected}, ${JSON.stringify(dataset.rejections)}::text::jsonb
      ) RETURNING id
    `;
    if (!run) throw new Error('Exercise import run was not created');

    for (const module of dataset.modules) {
      await transaction`
        UPDATE course_modules cm
           SET title = ${module.title}
          FROM courses c
         WHERE c.id = cm.course_id
           AND c.slug = 'xadrez-essencial'
           AND cm.source_volume = ${module.number}
      `;
    }

    const persistedExercises: { exercise: NormalizedExercise; id: string }[] = [];
    for (const exercise of dataset.exercises) {
      const status = isPlayableExercise(exercise) ? 'published' : 'archived';
      const firstPage = exercise.sourcePages.at(0) ?? null;
      const lastPage = exercise.sourcePages.at(-1) ?? null;
      const sourceRange =
        firstPage === null || lastPage === null ? null : `[${firstPage},${lastPage + 1})`;
      const [row] = await transaction<{ id: string }[]>`
        INSERT INTO exercises (
          external_id, source_number, module_number, chapter_number, title, prompt_md,
          solution_md, difficulty, category, fen, side_to_move, solution_lines, hints,
          tags, source_pages, status, position_type, import_run_id, import_metadata, updated_at
        ) VALUES (
          ${exercise.externalId}, ${exercise.sourceNumber}, ${exercise.moduleNumber},
          ${exercise.chapterNumber}, ${exercise.title}, ${exercise.promptMd}, ${exercise.solutionMd},
          ${exercise.difficulty}, ${exercise.category}, ${exercise.fen}, ${exercise.sideToMove},
          ${JSON.stringify(exercise.solutionLines)}::text::jsonb,
          ${JSON.stringify(exercise.hints)}::text::jsonb, ${transaction.array(exercise.tags)},
          ${sourceRange}::int4range, ${status}::publication_status, ${exercise.positionType}, ${run.id},
          ${JSON.stringify(exercise.metadata)}::text::jsonb, now()
        )
        ON CONFLICT (source_number) DO UPDATE SET
          external_id = EXCLUDED.external_id, module_number = EXCLUDED.module_number,
          chapter_number = EXCLUDED.chapter_number, title = EXCLUDED.title,
          prompt_md = EXCLUDED.prompt_md, solution_md = EXCLUDED.solution_md,
          difficulty = EXCLUDED.difficulty, category = EXCLUDED.category, fen = EXCLUDED.fen,
          side_to_move = EXCLUDED.side_to_move, solution_lines = EXCLUDED.solution_lines,
          hints = EXCLUDED.hints, tags = EXCLUDED.tags, source_pages = EXCLUDED.source_pages,
          status = EXCLUDED.status, position_type = EXCLUDED.position_type,
          import_run_id = EXCLUDED.import_run_id, import_metadata = EXCLUDED.import_metadata,
          updated_at = now()
        RETURNING id
      `;
      if (!row) throw new Error(`Exercise ${exercise.sourceNumber} was not persisted`);
      persistedExercises.push({ exercise, id: row.id });
    }

    if (persistedExercises.length > 0) {
      const exerciseIds = transaction.array(
        persistedExercises.map(({ id }) => id),
        2950,
      );
      await transaction`
        DELETE FROM lesson_exercises
         WHERE exercise_id = ANY(${exerciseIds}::uuid[])
      `;
      for (const persisted of persistedExercises) {
        await associateExerciseWithLessons(transaction, persisted.id, persisted.exercise);
      }
    }

    return { ...dataset.report, importRunId: run.id };
  });
}
