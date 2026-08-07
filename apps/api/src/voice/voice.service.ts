import type { AiVoiceId, AiVoiceOption, SynthesizeSpeechInput } from '@xadrez/contracts';
import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { AiProvidersService } from '../ai-providers/ai-providers.service.js';

const OPENAI_SPEECH_MODEL = 'tts-1';
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const AI_VOICES: readonly AiVoiceOption[] = [
  { id: 'openai:marin', label: 'Treinador IA · Marin', provider: 'openai' },
  { id: 'openai:cedar', label: 'Treinador IA · Cedar', provider: 'openai' },
];

function openAiVoiceName(voice: AiVoiceId): 'marin' | 'cedar' {
  return voice.slice('openai:'.length) as 'marin' | 'cedar';
}

@Injectable()
export class VoiceService {
  constructor(private readonly aiProviders: AiProvidersService) {}

  async options(): Promise<{ items: AiVoiceOption[] }> {
    const config = await this.aiProviders.resolveProviderConfig('openai');
    return { items: config ? [...AI_VOICES] : [] };
  }

  async synthesize(input: SynthesizeSpeechInput): Promise<Buffer> {
    const config = await this.aiProviders.resolveProviderConfig('openai');
    if (!config) {
      throw new ServiceUnavailableException(
        'A voz por IA ainda não foi configurada pelo administrador.',
      );
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      body: JSON.stringify({
        input: input.text,
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
      const detail = await response.text().catch(() => '');
      throw new BadGatewayException(
        `A síntese de voz por IA falhou (${response.status}): ${detail.slice(0, 300)}`,
      );
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length === 0 || audio.length > MAX_AUDIO_BYTES) {
      throw new BadGatewayException('A síntese de voz por IA retornou um áudio inválido.');
    }
    return audio;
  }
}
