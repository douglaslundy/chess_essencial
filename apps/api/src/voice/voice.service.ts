import type { AiVoiceId, AiVoiceOption, SynthesizeSpeechInput } from '@xadrez/contracts';
import { createHash } from 'node:crypto';
import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { AiProvidersService } from '../ai-providers/ai-providers.service.js';
import { DatabaseService } from '../database/database.service.js';

const OPENAI_SPEECH_MODEL = 'gpt-4o-mini-tts';
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const SPEECH_INSTRUCTIONS =
  'Fale em português do Brasil como um treinador de xadrez didático, claro e acolhedor.';
const AI_VOICES: readonly AiVoiceOption[] = [
  { id: 'openai:marin', label: 'Treinador IA · Marin', provider: 'openai' },
  { id: 'openai:cedar', label: 'Treinador IA · Cedar', provider: 'openai' },
];

function openAiVoiceName(voice: AiVoiceId): 'marin' | 'cedar' {
  return voice.slice('openai:'.length) as 'marin' | 'cedar';
}

@Injectable()
export class VoiceService {
  private readonly inflight = new Map<string, Promise<Buffer>>();

  constructor(
    private readonly aiProviders: AiProvidersService,
    private readonly database: DatabaseService,
  ) {}

  /** Content hash of everything that changes the audio; also usable as an HTTP ETag. */
  cacheKey(input: SynthesizeSpeechInput): string {
    const text = input.text.trim().replace(/\s+/g, ' ');
    return createHash('sha256')
      .update(`${OPENAI_SPEECH_MODEL}|${input.voice}|${SPEECH_INSTRUCTIONS}|${text}`)
      .digest('hex');
  }

  async options(): Promise<{ items: AiVoiceOption[] }> {
    const config = await this.aiProviders.resolveProviderConfig('openai');
    return { items: config ? [...AI_VOICES] : [] };
  }

  /** Serves stored audio when the same text/voice was already generated; otherwise generates once and stores it. */
  async synthesize(input: SynthesizeSpeechInput): Promise<Buffer> {
    const key = this.cacheKey(input);
    const sql = this.database.client;
    const [hit] = await sql<{ audio: Buffer }[]>`
      UPDATE voice_audio_cache SET hit_count = hit_count + 1, last_used_at = now()
      WHERE cache_key = ${key} RETURNING audio
    `;
    if (hit) return hit.audio;

    // Concurrent identical requests share one paid call.
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const generation = this.generate(input).then(async (audio) => {
      await sql`
        INSERT INTO voice_audio_cache (cache_key, voice, model, char_count, audio)
        VALUES (${key}, ${input.voice}, ${OPENAI_SPEECH_MODEL}, ${input.text.length}, ${audio})
        ON CONFLICT (cache_key) DO NOTHING
      `;
      return audio;
    });
    this.inflight.set(key, generation);
    try {
      return await generation;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async generate(input: SynthesizeSpeechInput): Promise<Buffer> {
    const config = await this.aiProviders.resolveProviderConfig('openai');
    if (!config) {
      throw new ServiceUnavailableException(
        'A voz por IA ainda não foi configurada pelo administrador.',
      );
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      body: JSON.stringify({
        input: input.text,
        instructions: SPEECH_INSTRUCTIONS,
        model: OPENAI_SPEECH_MODEL,
        response_format: 'mp3',
        speed: 1,
        voice: openAiVoiceName(input.voice),
      }),
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `A OpenAI não conseguiu gerar a voz por IA (${response.status}). Verifique a chave, o acesso ao modelo e tente novamente.`,
      );
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length === 0 || audio.length > MAX_AUDIO_BYTES) {
      throw new BadGatewayException('A síntese de voz por IA retornou um áudio inválido.');
    }
    return audio;
  }
}
