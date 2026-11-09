import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AdminOpeningLesson,
  AdminOpeningLessonInput,
  OpeningBranch,
  OpeningDetail,
  OpeningFamily,
  OpeningLesson,
  OpeningLine,
  TutorFrame,
} from '@xadrez/contracts';

import { AiProvidersService } from '../ai-providers/ai-providers.service.js';
import { DatabaseService } from '../database/database.service.js';
import { callLlm } from '../games/narration/llm-client.js';
import { parseStepsAnswer, buildStepsPrompt } from '../tutor/tutor-prompt.js';
import { movesToSteps } from '../tutor/tutor-script.js';
import {
  nextReview,
  OPENING_CHUNK_STEPS,
  OPENING_PROMPT_VERSION,
  OPENING_SYSTEM_PROMPT,
  overviewPrompt,
  pgnMoves,
  type OpeningContext,
} from './opening-study.js';

const STALE_GENERATING_MS = 10 * 60 * 1000;
const RETRIES = 2;
const MAX_RESULTS = 200;

interface LineRow {
  eco: string;
  family: string;
  id: string;
  name: string;
  pgn: string;
  ply_count: number;
  side: 'black' | 'white';
}

const toLine = (row: LineRow): OpeningLine => ({
  eco: row.eco,
  family: row.family,
  id: row.id,
  moves: pgnMoves(row.pgn),
  name: row.name,
  pgn: row.pgn,
  plyCount: row.ply_count,
  side: row.side,
});

type ActiveConfig = NonNullable<Awaited<ReturnType<AiProvidersService['resolveActiveConfig']>>>;

@Injectable()
export class OpeningsService {
  private readonly logger = new Logger(OpeningsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly aiProviders: AiProvidersService,
  ) {}

  private get sql() {
    return this.database.client;
  }

  async families(side?: 'black' | 'white'): Promise<OpeningFamily[]> {
    const rows = await this.sql<{ family: string; lines: number; side: 'black' | 'white' }[]>`
      SELECT family, count(*)::int AS lines, min(side) AS side
        FROM opening_lines
       WHERE ${side ? this.sql`side = ${side}` : this.sql`true`}
       GROUP BY family
       ORDER BY count(*) DESC, family
    `;
    return rows;
  }

  async search(input: {
    family?: string | undefined;
    q?: string | undefined;
  }): Promise<OpeningLine[]> {
    const rows = await this.sql<LineRow[]>`
      SELECT id, eco, name, family, pgn, ply_count, side FROM opening_lines
       WHERE ${input.family ? this.sql`family = ${input.family}` : this.sql`true`}
         AND ${input.q ? this.sql`name ILIKE ${`%${input.q}%`}` : this.sql`true`}
       ORDER BY eco, ply_count, name
       LIMIT ${MAX_RESULTS}
    `;
    return rows.map(toLine);
  }

  private async line(id: string): Promise<LineRow> {
    const [row] = await this.sql<LineRow[]>`
      SELECT id, eco, name, family, pgn, ply_count, side FROM opening_lines WHERE id = ${id}
    `;
    if (!row) throw new NotFoundException('Abertura não encontrada.');
    return row;
  }

  private async lesson(id: string): Promise<OpeningLesson> {
    const [row] = await this.sql<
      {
        frames: TutorFrame[];
        overview: string;
        reviewed: boolean;
        status: OpeningLesson['status'];
      }[]
    >`
      SELECT status, overview, frames, reviewed_at IS NOT NULL AS reviewed FROM opening_lessons
       WHERE opening_id = ${id} AND prompt_version = ${OPENING_PROMPT_VERSION}
    `;
    return row ?? { frames: [], overview: '', reviewed: false, status: 'none' };
  }

  async detail(id: string, userId: string): Promise<OpeningDetail> {
    const [line, lesson, config, progress] = await Promise.all([
      this.line(id),
      this.lesson(id),
      this.aiProviders.resolveActiveConfig(),
      this.sql<{ due_at: Date }[]>`
        SELECT due_at FROM opening_progress WHERE user_id = ${userId} AND opening_id = ${id}
      `,
    ]);
    return {
      aiAvailable: config !== null,
      dueAt: progress[0]?.due_at.toISOString() ?? null,
      lesson,
      line: toLine(line),
    };
  }

  /** Generates the lesson once; every later student gets the stored one with no AI cost. */
  async requestLesson(id: string, userId: string): Promise<OpeningDetail> {
    const row = await this.line(id);
    const current = await this.lesson(id);
    if (current.status !== 'completed') {
      const config = await this.aiProviders.resolveActiveConfig();
      if (!config) {
        throw new UnprocessableEntityException('Nenhuma IA está configurada para gerar a aula.');
      }
      const staleBefore = new Date(Date.now() - STALE_GENERATING_MS);
      const claimed = await this.sql`
        INSERT INTO opening_lessons (opening_id, prompt_version, status)
        VALUES (${id}, ${OPENING_PROMPT_VERSION}, 'generating')
        ON CONFLICT (opening_id, prompt_version) DO UPDATE
          SET status = 'generating', error = NULL, updated_at = now()
          WHERE opening_lessons.status = 'failed'
             OR (opening_lessons.status = 'generating' AND opening_lessons.updated_at < ${staleBefore})
        RETURNING 1
      `;
      if (claimed.length > 0) {
        void this.generate(row, config).catch((error: unknown) =>
          this.logger.error(`Aula da abertura ${id} falhou`, error),
        );
      }
    }
    return this.detail(id, userId);
  }

  private async alternatives(row: LineRow): Promise<string[]> {
    const [own] = await this.sql<{ uci: string }[]>`
      SELECT uci FROM opening_lines WHERE id = ${row.id}
    `;
    const parts = own?.uci.split(' ') ?? [];
    if (parts.length < 2) return [];
    const prefix = parts.slice(0, -1).join(' ');
    const siblings = await this.sql<{ name: string }[]>`
      SELECT name FROM opening_lines
       WHERE id <> ${row.id} AND ply_count = ${row.ply_count}
         AND uci LIKE ${`${prefix} %`}
       ORDER BY name LIMIT 8
    `;
    return siblings.map((sibling) => sibling.name);
  }

  private async retry<T>(run: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        last = error;
      }
    }
    throw last;
  }

  private async save(
    id: string,
    overview: string,
    frames: TutorFrame[],
    status: 'completed' | 'failed' | 'generating',
    error?: string,
  ) {
    await this.sql`
      UPDATE opening_lessons
         SET overview = ${overview}, frames = ${this.sql.json(frames as never)},
             status = ${status}, error = ${error ?? null}, updated_at = now()
       WHERE opening_id = ${id} AND prompt_version = ${OPENING_PROMPT_VERSION}
    `;
  }

  private async generate(row: LineRow, config: ActiveConfig) {
    const moves = pgnMoves(row.pgn);
    const context: OpeningContext = {
      alternatives: await this.alternatives(row),
      eco: row.eco,
      name: row.name,
      side: row.side,
    };
    const steps = movesToSteps(null, moves);
    const frames: TutorFrame[] = [];
    let overview = '';
    const ask = (prompt: string, maxTokens: number) =>
      callLlm(config, OPENING_SYSTEM_PROMPT, prompt, { maxTokens, timeoutMs: 60_000 });
    try {
      overview = (await this.retry(() => ask(overviewPrompt(context, moves), 700)))
        .trim()
        .slice(0, 900);
      await this.save(row.id, overview, frames, 'generating');
      const script = {
        context: `Abertura: ${row.name} (ECO ${row.eco}). Lado estudado: ${row.side === 'white' ? 'brancas' : 'pretas'}. Lances: ${moves.join(' ')}.`,
        steps,
        title: row.name,
      };
      for (let from = 0; from < steps.length; from += OPENING_CHUNK_STEPS) {
        const chunk = steps.slice(from, from + OPENING_CHUNK_STEPS);
        frames.push(
          ...(await this.retry(async () => {
            const parsed = parseStepsAnswer(
              await ask(buildStepsPrompt(script, chunk), 3000),
              chunk,
            );
            if (parsed.length === 0) throw new Error('Resposta da IA sem texto válido');
            return parsed;
          })),
        );
        await this.save(row.id, overview, frames, 'generating');
      }
      await this.save(row.id, overview, frames, 'completed');
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'erro desconhecido';
      this.logger.error(`Aula da abertura ${row.id}: ${message}`);
      await this.save(row.id, overview, frames, 'failed', message);
    }
  }

  /** Records a practice result and schedules the next review. */
  async practice(id: string, userId: string, correct: boolean): Promise<{ dueAt: string }> {
    await this.line(id);
    const [current] = await this.sql<
      { ease: string; interval_days: number; repetitions: number }[]
    >`
      SELECT ease, interval_days, repetitions FROM opening_progress
       WHERE user_id = ${userId} AND opening_id = ${id}
    `;
    const next = nextReview(
      {
        ease: Number(current?.ease ?? 2.5),
        intervalDays: current?.interval_days ?? 0,
        repetitions: current?.repetitions ?? 0,
      },
      correct,
      new Date(),
    );
    await this.sql`
      INSERT INTO opening_progress
        (user_id, opening_id, repetitions, ease, interval_days, due_at, last_result, updated_at)
      VALUES (${userId}, ${id}, ${next.repetitions}, ${next.ease}, ${next.intervalDays},
              ${next.dueAt}, ${correct ? 'correct' : 'wrong'}, now())
      ON CONFLICT (user_id, opening_id) DO UPDATE SET
        repetitions = EXCLUDED.repetitions, ease = EXCLUDED.ease,
        interval_days = EXCLUDED.interval_days, due_at = EXCLUDED.due_at,
        last_result = EXCLUDED.last_result, updated_at = now()
    `;
    return { dueAt: next.dueAt.toISOString() };
  }

  async adminLessons(reviewed?: boolean): Promise<AdminOpeningLesson[]> {
    const rows = await this.sql<
      {
        eco: string;
        family: string;
        name: string;
        opening_id: string;
        overview: string;
        reviewed: boolean;
        status: AdminOpeningLesson['status'];
      }[]
    >`
      SELECT l.opening_id, o.name, o.eco, o.family, l.status, l.overview,
             l.reviewed_at IS NOT NULL AS reviewed
        FROM opening_lessons l JOIN opening_lines o ON o.id = l.opening_id
       WHERE l.prompt_version = ${OPENING_PROMPT_VERSION}
         AND ${reviewed === undefined ? this.sql`true` : this.sql`(l.reviewed_at IS NOT NULL) = ${reviewed}`}
       ORDER BY l.updated_at DESC LIMIT 200
    `;
    return rows.map((row) => ({
      eco: row.eco,
      family: row.family,
      name: row.name,
      openingId: row.opening_id,
      overview: row.overview,
      reviewed: row.reviewed,
      status: row.status,
    }));
  }

  /** The administrator's corrected text replaces the AI's; a reviewed lesson is never rewritten. */
  async adminSaveLesson(id: string, adminId: string, input: AdminOpeningLessonInput) {
    await this.line(id);
    await this.sql`
      INSERT INTO opening_lessons
        (opening_id, prompt_version, status, overview, frames, reviewed_at, reviewed_by)
      VALUES (${id}, ${OPENING_PROMPT_VERSION}, 'completed', ${input.overview},
              ${this.sql.json(input.frames as never)},
              ${input.reviewed ? new Date() : null}, ${input.reviewed ? adminId : null})
      ON CONFLICT (opening_id, prompt_version) DO UPDATE SET
        status = 'completed', overview = EXCLUDED.overview, frames = EXCLUDED.frames,
        reviewed_at = EXCLUDED.reviewed_at, reviewed_by = EXCLUDED.reviewed_by, updated_at = now()
    `;
  }

  /** Writes the missing lessons of a family one after another, so the first student need not wait. */
  async adminPregenerate(family: string): Promise<{ started: number }> {
    const config = await this.aiProviders.resolveActiveConfig();
    if (!config) throw new UnprocessableEntityException('Nenhuma IA está configurada.');
    const rows = await this.sql<LineRow[]>`
      SELECT o.id, o.eco, o.name, o.family, o.pgn, o.ply_count, o.side FROM opening_lines o
       WHERE o.family = ${family}
         AND NOT EXISTS (
           SELECT 1 FROM opening_lessons l
            WHERE l.opening_id = o.id AND l.prompt_version = ${OPENING_PROMPT_VERSION}
              AND l.status IN ('completed', 'generating'))
       ORDER BY o.ply_count, o.name LIMIT 40
    `;
    void (async () => {
      for (const row of rows) {
        await this.sql`
          INSERT INTO opening_lessons (opening_id, prompt_version, status)
          VALUES (${row.id}, ${OPENING_PROMPT_VERSION}, 'generating')
          ON CONFLICT (opening_id, prompt_version) DO UPDATE SET status = 'generating', updated_at = now()
        `;
        await this.generate(row, config);
      }
    })().catch((error: unknown) => this.logger.error('Pré-geração das aberturas falhou', error));
    return { started: rows.length };
  }

  /** Book moves after `prefix` (space-separated UCI moves from the start), most played first. */
  async branches(prefix: string): Promise<OpeningBranch[]> {
    const played = prefix.trim() === '' ? 0 : prefix.trim().split(/\s+/).length;
    const rows = await this.sql<{ lines: number; name: string; opening_id: string; uci: string }[]>`
      SELECT split_part(uci, ' ', ${played + 1}) AS uci, count(*)::int AS lines,
             (array_agg(id ORDER BY ply_count, name))[1] AS opening_id,
             (array_agg(name ORDER BY ply_count, name))[1] AS name
        FROM opening_lines
       WHERE ply_count > ${played}
         AND ${played === 0 ? this.sql`true` : this.sql`uci LIKE ${`${prefix.trim()} %`}`}
       GROUP BY 1
       ORDER BY count(*) DESC, 1
    `;
    return rows.map((row) => ({
      lines: row.lines,
      name: row.name,
      openingId: row.opening_id,
      uci: row.uci,
    }));
  }

  /** Lines the student practised that are due for review, soonest first. */
  async due(userId: string): Promise<OpeningLine[]> {
    const rows = await this.sql<LineRow[]>`
      SELECT l.id, l.eco, l.name, l.family, l.pgn, l.ply_count, l.side
        FROM opening_progress p JOIN opening_lines l ON l.id = p.opening_id
       WHERE p.user_id = ${userId} AND p.due_at <= now()
       ORDER BY p.due_at LIMIT 50
    `;
    return rows.map(toLine);
  }
}
