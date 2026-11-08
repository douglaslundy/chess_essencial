import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TutorFrame, TutorKind, TutorLesson } from '@xadrez/contracts';

import { AiProvidersService } from '../ai-providers/ai-providers.service.js';
import { DatabaseService } from '../database/database.service.js';
import { callLlm } from '../games/narration/llm-client.js';
import {
  buildIntroPrompt,
  buildStepsPrompt,
  parseStepsAnswer,
  TUTOR_CHUNK_STEPS,
  TUTOR_PROMPT_VERSION,
  TUTOR_SYSTEM_PROMPT,
} from './tutor-prompt.js';
import { lessonSteps, movesToSteps, reviewNotes, type TutorScript } from './tutor-script.js';

const STALE_GENERATING_MS = 10 * 60 * 1000;
const RETRIES = 2;
const OVERVIEW_LABEL = 'Visão geral';

type ActiveConfig = NonNullable<Awaited<ReturnType<AiProvidersService['resolveActiveConfig']>>>;

@Injectable()
export class TutorService {
  private readonly logger = new Logger(TutorService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly aiProviders: AiProvidersService,
  ) {}

  private get sql() {
    return this.database.client;
  }

  /** Teachers and admins (the admin has every profile). */
  async isTeacher(userId: string): Promise<boolean> {
    const [row] = await this.sql<{ allowed: boolean }[]>`
      SELECT true AS allowed FROM user_roles
       WHERE user_id = ${userId} AND role IN ('admin', 'teacher') LIMIT 1
    `;
    return Boolean(row);
  }

  async requireTeacher(userId: string): Promise<void> {
    if (!(await this.isTeacher(userId))) {
      throw new ForbiddenException('Somente professores usam o Tutor de IA.');
    }
  }

  async get(kind: TutorKind, contentId: string): Promise<TutorLesson> {
    const [row] = await this.sql<
      { frames: TutorFrame[]; status: TutorLesson['status']; total_steps: number }[]
    >`
      SELECT status, frames, total_steps FROM tutor_lessons
       WHERE content_kind = ${kind} AND content_id = ${contentId}
         AND prompt_version = ${TUTOR_PROMPT_VERSION}
    `;
    return row
      ? { frames: row.frames, status: row.status, totalSteps: row.total_steps }
      : { frames: [], status: 'none', totalSteps: 0 };
  }

  /** Generates the lesson once; later calls get the stored one with no AI cost. */
  async request(
    userId: string,
    kind: TutorKind,
    contentId: string,
    steps: Array<{ say: string }> | undefined,
  ): Promise<TutorLesson> {
    const current = await this.get(kind, contentId);
    if (current.status === 'completed') return current;

    const config = await this.aiProviders.resolveActiveConfig();
    if (!config) {
      throw new UnprocessableEntityException('Nenhuma IA está configurada para gerar a aula.');
    }
    const script = await this.script(userId, kind, contentId, steps);
    const staleBefore = new Date(Date.now() - STALE_GENERATING_MS);
    const claimed = await this.sql`
      INSERT INTO tutor_lessons (content_kind, content_id, prompt_version, status, total_steps)
      VALUES (${kind}, ${contentId}, ${TUTOR_PROMPT_VERSION}, 'generating', ${script.steps.length})
      ON CONFLICT (content_kind, content_id, prompt_version) DO UPDATE
        SET status = 'generating', error = NULL, updated_at = now(),
            total_steps = ${script.steps.length}
        WHERE tutor_lessons.status = 'failed'
           OR (tutor_lessons.status = 'generating' AND tutor_lessons.updated_at < ${staleBefore})
      RETURNING 1
    `;
    if (claimed.length > 0) {
      void this.generate(kind, contentId, script, config).catch((error: unknown) =>
        this.logger.error(`Aula do tutor ${kind}/${contentId} falhou`, error),
      );
    }
    return this.get(kind, contentId);
  }

  private async script(
    userId: string,
    kind: TutorKind,
    contentId: string,
    lesson: Array<{ say: string }> | undefined,
  ): Promise<TutorScript> {
    if (kind === 'lesson') {
      if (!lesson?.length) throw new UnprocessableEntityException('Aula sem passos.');
      return {
        context: `Aula do curso de xadrez com ${lesson.length} passos. Cada passo já tem um texto de apoio; reescreva-o de forma simples para o professor.`,
        steps: lessonSteps(lesson),
        title: 'Aula do curso',
      };
    }
    if (!/^[0-9a-f-]{36}$/.test(contentId)) throw new NotFoundException('Conteúdo não encontrado.');
    if (kind === 'library') return this.libraryScript(contentId);
    if (kind === 'exercise') return this.exerciseScript(contentId);
    return this.reviewScript(userId, contentId);
  }

  private async libraryScript(id: string): Promise<TutorScript> {
    const [game] = await this.sql<
      {
        black: string;
        eco: string | null;
        event: string | null;
        moves_san: string;
        opening_name: string | null;
        played_on: string | null;
        result: string;
        white: string;
      }[]
    >`
      SELECT white, black, event, played_on, result, eco, opening_name, moves_san
        FROM library_games WHERE id = ${id}
    `;
    if (!game) throw new NotFoundException('Partida não encontrada.');
    const moves = game.moves_san.split(' ');
    return {
      context: `Partida da biblioteca de estudo: ${game.white} (brancas) x ${game.black} (pretas), ${game.event ?? 'evento n/d'}, ${game.played_on ?? 'data n/d'}, resultado ${game.result}. Abertura: ${game.opening_name ?? 'n/d'}${game.eco ? ` (${game.eco})` : ''}. Lances: ${moves.join(' ')}`,
      steps: movesToSteps(null, moves),
      title: `${game.white} x ${game.black}`,
    };
  }

  private async exerciseScript(id: string): Promise<TutorScript> {
    const [exercise] = await this.sql<
      {
        category: string | null;
        fen: string | null;
        prompt_md: string;
        side_to_move: string | null;
        solution_lines: string[][];
        tags: string[];
        title: string | null;
      }[]
    >`
      SELECT title, prompt_md, fen, side_to_move, solution_lines, tags, category
        FROM exercises WHERE id = ${id} AND status = 'published'
    `;
    if (!exercise?.fen) throw new NotFoundException('Exercício não encontrado.');
    const line = exercise.solution_lines[0] ?? [];
    const themes = [exercise.category, ...exercise.tags].filter(Boolean).join(', ') || 'n/d';
    return {
      context: `Exercício de xadrez: ${exercise.title ?? 'sem título'}. Enunciado: ${exercise.prompt_md}. Temas: ${themes}. Posição inicial (FEN): ${exercise.fen}; jogam as ${exercise.side_to_move === 'black' ? 'pretas' : 'brancas'}. Solução: ${line.join(' ')}. Os lances ímpares são do aluno (a resposta correta); os pares são a resposta do adversário.`,
      steps: movesToSteps(exercise.fen, line),
      title: exercise.title ?? 'Exercício',
    };
  }

  private async reviewScript(userId: string, gameId: string): Promise<TutorScript> {
    const [game] = await this.sql<{ black: string; result: string; white: string }[]>`
      SELECT g.result::text AS result,
             COALESCE(wp.display_name, 'Brancas') AS white,
             COALESCE(bp.display_name, 'Pretas') AS black
        FROM games g
        JOIN game_players mine ON mine.game_id = g.id AND mine.user_id = ${userId}
        JOIN game_players w ON w.game_id = g.id AND w.color = 'white'
        JOIN game_players b ON b.game_id = g.id AND b.color = 'black'
        LEFT JOIN user_profiles wp ON wp.user_id = w.user_id
        LEFT JOIN user_profiles bp ON bp.user_id = b.user_id
       WHERE g.id = ${gameId}
    `;
    if (!game) throw new NotFoundException('Partida não encontrada.');
    const moveRows = await this.sql<{ san: string }[]>`
      SELECT san FROM game_moves WHERE game_id = ${gameId} ORDER BY ply
    `;
    const moves = moveRows.map((move) => move.san);
    const analyses = await this.sql<
      { best_move_uci: string | null; ply: number; quality: string }[]
    >`
      SELECT ply, quality::text AS quality, best_move_uci
        FROM game_move_analyses WHERE game_id = ${gameId}
    `;
    return {
      context: `Partida jogada: ${game.white} (brancas) x ${game.black} (pretas), resultado ${game.result}. Lances: ${moves.join(' ')}. Cada lance traz a avaliação do motor de xadrez.`,
      steps: movesToSteps(null, moves, reviewNotes(moves, analyses)),
      title: `${game.white} x ${game.black}`,
    };
  }

  private llm(config: ActiveConfig, prompt: string, maxTokens: number): Promise<string> {
    return callLlm(config, TUTOR_SYSTEM_PROMPT, prompt, { maxTokens, timeoutMs: 60_000 });
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
    kind: TutorKind,
    contentId: string,
    frames: TutorFrame[],
    status: 'completed' | 'failed' | 'generating',
    error?: string,
  ) {
    await this.sql`
      UPDATE tutor_lessons
         SET frames = ${this.sql.json(frames as never)}, status = ${status},
             error = ${error ?? null}, updated_at = now()
       WHERE content_kind = ${kind} AND content_id = ${contentId}
         AND prompt_version = ${TUTOR_PROMPT_VERSION}
    `;
  }

  private async generate(
    kind: TutorKind,
    contentId: string,
    script: TutorScript,
    config: ActiveConfig,
  ) {
    const frames: TutorFrame[] = [];
    try {
      const overview = await this.retry(() => this.llm(config, buildIntroPrompt(script), 600));
      frames.push({ index: 0, label: OVERVIEW_LABEL, text: overview.trim().slice(0, 800) });
      await this.save(kind, contentId, frames, 'generating');
      for (let from = 0; from < script.steps.length; from += TUTOR_CHUNK_STEPS) {
        const chunk = script.steps.slice(from, from + TUTOR_CHUNK_STEPS);
        frames.push(
          ...(await this.retry(async () => {
            const parsed = parseStepsAnswer(
              await this.llm(config, buildStepsPrompt(script, chunk), 3000),
              chunk,
            );
            if (parsed.length === 0) throw new Error('Resposta da IA sem texto válido');
            return parsed;
          })),
        );
        await this.save(kind, contentId, frames, 'generating');
      }
      await this.save(kind, contentId, frames, 'completed');
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'erro desconhecido';
      this.logger.error(`Aula do tutor ${kind}/${contentId}: ${message}`);
      await this.save(kind, contentId, frames, 'failed', message);
    }
  }
}
