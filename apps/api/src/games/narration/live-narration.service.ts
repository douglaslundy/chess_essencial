import type { LiveNarrationResult } from '@xadrez/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { AiProvidersService } from '../../ai-providers/ai-providers.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { callLlm } from './llm-client.js';
import {
  type AuthoritativeLiveNarrationRequest,
  buildLiveNarrationPrompt,
  composeAuthoritativeNarrative,
  LIVE_NARRATION_SYSTEM_PROMPT,
} from './prompts.js';

/** sha256(fen|uci|bestMoveUci|quality) — same scheme as the post-game review's move_narration_cache (apps/worker/src/narration/game-narration-job.ts#cacheKeyFor), reused as-is since it's the same table and the same "moment" shape. Only the 'quality' kind is cacheable: 'suggestion' has no quality/uci to key on, and re-suggesting the opening/a known tactic is rarer than re-hitting the exact same mistake across many games. */
function qualityCacheKey(
  input: Extract<AuthoritativeLiveNarrationRequest, { kind: 'quality' }>,
): string {
  return createHash('sha256')
    .update(`${input.fen}|${input.uci}|${input.bestMoveUci ?? ''}|${input.quality}`)
    .digest('hex');
}

@Injectable()
export class LiveNarrationService {
  private readonly logger = new Logger(LiveNarrationService.name);

  constructor(
    private readonly aiProviders: AiProvidersService,
    private readonly database: DatabaseService,
  ) {}

  async narrate(input: AuthoritativeLiveNarrationRequest): Promise<LiveNarrationResult> {
    const config = await this.aiProviders.resolveActiveConfig();
    if (!config) return { narrative: null };
    try {
      if (input.kind === 'quality') return { narrative: await this.narrateQuality(config, input) };
      const generatedReason = await callLlm(
        config,
        LIVE_NARRATION_SYSTEM_PROMPT,
        buildLiveNarrationPrompt(input),
      );
      return { narrative: composeAuthoritativeNarrative(input, generatedReason) };
    } catch (error) {
      // A narration failure must never disrupt a live game - the client
      // already has the instant template narration and just keeps it.
      this.logger.error(
        'Falha ao gerar narração ao vivo por IA; mantendo o texto-template',
        error instanceof Error ? error.stack : undefined,
      );
      return { narrative: null };
    }
  }

  private async narrateQuality(
    config: Parameters<typeof callLlm>[0],
    input: Extract<AuthoritativeLiveNarrationRequest, { kind: 'quality' }>,
  ): Promise<string> {
    const cacheKey = qualityCacheKey(input);
    const sql = this.database.client;
    const [cached] = await sql<{ narrative: string }[]>`
      SELECT narrative FROM move_narration_cache WHERE cache_key = ${cacheKey}
    `;
    if (cached) {
      await sql`
        UPDATE move_narration_cache SET hit_count = hit_count + 1, last_used_at = now()
        WHERE cache_key = ${cacheKey}
      `;
      return composeAuthoritativeNarrative(input, cached.narrative);
    }

    const generatedReason = await callLlm(
      config,
      LIVE_NARRATION_SYSTEM_PROMPT,
      buildLiveNarrationPrompt(input),
    );
    await sql`
      INSERT INTO move_narration_cache (
        cache_key, fen_before, move_uci, best_move_uci, quality, narrative
      ) VALUES (
        ${cacheKey}, ${input.fen}, ${input.uci}, ${input.bestMoveUci}, ${input.quality}::move_quality, ${generatedReason}
      )
      ON CONFLICT (cache_key) DO NOTHING
    `;
    return composeAuthoritativeNarrative(input, generatedReason);
  }
}
