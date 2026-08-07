import { aiVoiceOptionsSchema, synthesizeSpeechInputSchema } from '@xadrez/contracts';
import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { VoiceService } from './voice.service.js';

@Controller('voice')
@UseGuards(AccessTokenGuard)
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Get('options')
  async options() {
    return aiVoiceOptionsSchema.parse(await this.voice.options());
  }

  @Post('speech')
  @HttpCode(200)
  async speech(@Body() body: unknown, @Res() reply: FastifyReply) {
    const audio = await this.voice.synthesize(parseInput(synthesizeSpeechInputSchema, body));
    return reply
      .header('Cache-Control', 'private, no-store')
      .header('Content-Length', String(audio.length))
      .type('audio/mpeg')
      .send(audio);
  }
}
