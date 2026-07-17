import { ChessJsRules } from '@xadrez/chess-domain';
import type { ExerciseImportReport } from '@xadrez/contracts';
import type { Sql, TransactionSql } from 'postgres';

type JsonObject = Record<string, unknown>;

export type NormalizedExercise = {
  category: string | null;
  chapterNumber: number | null;
  difficulty: string | null;
  externalId: string;
  fen: string | null;
  hints: string[];
  metadata: JsonObject;
  moduleNumber: number | null;
  positionType: 'legal_position' | 'illustrative_diagram';
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
export type NormalizedExerciseDataset = {
  exercises: NormalizedExercise[];
  rejections: ExerciseRejection[];
  report: ExerciseImportReport;
};

const ALIASES = {
  category: ['category', 'categoria', 'theme', 'tema'],
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
  tags: ['tags', 'etiquetas', 'keywords', 'palavras_chave'],
  title: ['title', 'titulo', 't\u00edtulo', 'name', 'nome'],
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

function inferPositionType(item: JsonObject): 'legal_position' | 'illustrative_diagram' {
  const explicit = asString(
    item.positionType ?? item.position_type ?? item.tipo_posicao,
  )?.toLowerCase();
  const illustrative =
    item.illustrative === true || item.ilustrativo === true || item.diagramOnly === true;
  return illustrative || explicit?.includes('illustr') || explicit?.includes('ilustr')
    ? 'illustrative_diagram'
    : 'legal_position';
}

function rejectionReason(item: JsonObject): string | null {
  if (asPositiveInteger(getValue(item, ALIASES.sourceNumber)) === null)
    return 'missing_source_number';
  if (asString(getValue(item, ALIASES.prompt)) === null) return 'missing_prompt';
  const positionType = inferPositionType(item);
  const fen = asString(getValue(item, ALIASES.fen));
  if (positionType === 'legal_position' && fen === null) return 'missing_fen';
  if (positionType === 'legal_position' && fen !== null) {
    try {
      new ChessJsRules(fen);
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
  const exercises: NormalizedExercise[] = [];
  const rejections: ExerciseRejection[] = [];

  items.forEach((rawItem, index) => {
    if (!isObject(rawItem)) {
      rejections.push({ index, reason: 'invalid_item', sourceNumber: null });
      return;
    }
    const sourceNumber = asPositiveInteger(getValue(rawItem, ALIASES.sourceNumber));
    const reason = rejectionReason(rawItem);
    if (reason !== null || sourceNumber === null) {
      rejections.push({ index, reason: reason ?? 'missing_source_number', sourceNumber });
      return;
    }

    const fen = asString(getValue(rawItem, ALIASES.fen));
    const positionType = inferPositionType(rawItem);
    const solutionLines = asSolutionLines(getValue(rawItem, ALIASES.solutionLines));
    const explicitSide = asString(
      rawItem.sideToMove ?? rawItem.side_to_move ?? rawItem.lado,
    )?.toLowerCase();
    const fenSide = fen?.split(/\s+/)[1];
    const sideToMove =
      explicitSide === 'white' || explicitSide === 'brancas' || fenSide === 'w'
        ? 'white'
        : explicitSide === 'black' || explicitSide === 'pretas' || fenSide === 'b'
          ? 'black'
          : null;
    exercises.push({
      category: asString(getValue(rawItem, ALIASES.category)),
      chapterNumber: asPositiveInteger(getValue(rawItem, ALIASES.chapter)),
      difficulty: asString(getValue(rawItem, ALIASES.difficulty)),
      externalId: `xadrez-essencial-${sourceNumber}`,
      fen,
      hints: asStringArray(getValue(rawItem, ALIASES.hints)),
      metadata: { importedIndex: index, sourceName },
      moduleNumber: asPositiveInteger(getValue(rawItem, ALIASES.module)),
      positionType,
      promptMd: asString(getValue(rawItem, ALIASES.prompt))!,
      sideToMove,
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

  const reasons: Record<string, number> = {};
  for (const rejection of rejections)
    reasons[rejection.reason] = (reasons[rejection.reason] ?? 0) + 1;
  return {
    exercises,
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
      ON CONFLICT (lesson_id, exercise_id) DO NOTHING
    `;
  }
}

export async function persistExerciseDataset(
  sql: Sql,
  dataset: NormalizedExerciseDataset,
): Promise<ExerciseImportReport> {
  return sql.begin(async (transaction) => {
    const [run] = await transaction<{ id: string }[]>`
      INSERT INTO exercise_import_runs (
        source_name, total_count, imported_count, rejected_count, rejection_report
      ) VALUES (
        ${dataset.report.sourceName}, ${dataset.report.total}, ${dataset.report.imported},
        ${dataset.report.rejected}, ${JSON.stringify(dataset.rejections)}::text::jsonb
      ) RETURNING id
    `;
    if (!run) throw new Error('Exercise import run was not created');

    for (const exercise of dataset.exercises) {
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
          ${sourceRange}::int4range, 'published', ${exercise.positionType}, ${run.id},
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
      await associateExerciseWithLessons(transaction, row.id, exercise);
    }

    return { ...dataset.report, importRunId: run.id };
  });
}
