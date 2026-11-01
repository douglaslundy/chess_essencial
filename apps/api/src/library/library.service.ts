import type {
  LibraryFacets,
  LibraryGame,
  LibraryGameSummary,
  LibraryReview,
  LibraryReviewEntry,
  LibrarySearchQuery,
  LibrarySearchResult,
} from '@xadrez/contracts';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { AiProvidersService } from '../ai-providers/ai-providers.service.js';
import { callLlm } from '../games/narration/llm-client.js';
import { withBrazilianNotation } from './brazilian-notation.js';
import {
  buildChunkPrompt,
  chunkEnd,
  LIBRARY_REVIEW_SYSTEM_PROMPT,
  parseChunkResponse,
} from './library-review-prompt.js';
import { LibraryRepository, type LibraryGameRow } from './library.repository.js';

const FACETS_TTL_MS = 10 * 60 * 1000;
const CHUNK_RETRIES = 2;

type ActiveConfig = NonNullable<Awaited<ReturnType<AiProvidersService['resolveActiveConfig']>>>;

function toSummary(row: LibraryGameRow): LibraryGameSummary {
  return {
    black: row.black,
    blackElo: row.black_elo,
    eco: row.eco,
    event: row.event,
    id: row.id,
    openingFamily: row.opening_family,
    openingName: row.opening_name,
    playedOn: row.played_on,
    plyCount: row.ply_count,
    result: row.result,
    white: row.white,
    whiteElo: row.white_elo,
  };
}

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);
  private facetsCache: { at: number; value: LibraryFacets } | null = null;

  constructor(
    private readonly repository: LibraryRepository,
    private readonly aiProviders: AiProvidersService,
  ) {}

  async search(query: LibrarySearchQuery): Promise<LibrarySearchResult> {
    const { rows, total } = await this.repository.search(query);
    return { items: rows.map(toSummary), total };
  }

  async facets(): Promise<LibraryFacets> {
    if (this.facetsCache && Date.now() - this.facetsCache.at < FACETS_TTL_MS) {
      return this.facetsCache.value;
    }
    const value = await this.repository.facets();
    this.facetsCache = { at: Date.now(), value };
    return value;
  }

  async getGame(id: string): Promise<LibraryGame> {
    const row = await this.repository.getGame(id);
    if (!row) throw new NotFoundException('Partida da biblioteca não encontrada');
    return {
      ...toSummary(row),
      movesSan: row.moves_san.split(' '),
      round: row.round,
      site: row.site,
    };
  }

  async getReview(id: string): Promise<LibraryReview> {
    const game = await this.repository.getGame(id);
    if (!game) throw new NotFoundException('Partida da biblioteca não encontrada');
    const [review, config] = await Promise.all([
      this.repository.getReview(id),
      this.aiProviders.resolveActiveConfig(),
    ]);
    return {
      aiAvailable: config !== null,
      entries: (review?.entries ?? []).map(withBrazilianNotation),
      status: review?.status ?? 'none',
      totalPlies: game.ply_count,
    };
  }

  /** Starts generation once per game; later callers receive the stored review without any AI cost. */
  async requestReview(id: string): Promise<LibraryReview> {
    const game = await this.repository.getGame(id);
    if (!game) throw new NotFoundException('Partida da biblioteca não encontrada');
    const existing = await this.repository.getReview(id);
    if (existing?.status !== 'completed') {
      const config = await this.aiProviders.resolveActiveConfig();
      if (config && (await this.repository.claimReview(id))) {
        void this.generate(game, existing?.entries ?? [], config).catch((error: unknown) =>
          this.logger.error(
            `Falha inesperada na revisão ${id}`,
            error instanceof Error ? error.stack : undefined,
          ),
        );
      }
    }
    return this.getReview(id);
  }

  private async generate(game: LibraryGameRow, done: LibraryReviewEntry[], config: ActiveConfig) {
    const moves = game.moves_san.split(' ');
    const header = {
      black: game.black,
      event: game.event,
      openingName: game.opening_name,
      playedOn: game.played_on,
      result: game.result,
      white: game.white,
    };
    const entries = [...done];
    const meta = { model: config.model, provider: config.provider };
    try {
      let from = (entries.at(-1)?.ply ?? 0) + 1;
      while (from <= moves.length) {
        const to = chunkEnd(moves.length, from);
        entries.push(...(await this.generateChunk(config, header, moves, from, to)));
        // Advance even if the model skipped plies: those show without commentary.
        from = to + 1;
        await this.repository.saveProgress(game.id, entries, 'generating', meta);
      }
      await this.repository.saveProgress(game.id, entries, 'completed', meta);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'erro desconhecido';
      this.logger.error(`Revisão da partida ${game.id} falhou: ${message}`);
      await this.repository.saveProgress(game.id, entries, 'failed', { ...meta, error: message });
    }
  }

  private async generateChunk(
    config: ActiveConfig,
    header: Parameters<typeof buildChunkPrompt>[0],
    moves: string[],
    from: number,
    to: number,
  ) {
    let lastError: unknown;
    for (let attempt = 0; attempt <= CHUNK_RETRIES; attempt += 1) {
      try {
        const raw = await callLlm(
          config,
          LIBRARY_REVIEW_SYSTEM_PROMPT,
          buildChunkPrompt(header, moves, from),
          { maxTokens: 3000, timeoutMs: 60_000 },
        );
        const entries = parseChunkResponse(raw, moves, from, to);
        if (entries.length > 0) return entries;
        lastError = new Error('Resposta da IA sem comentários válidos');
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}
