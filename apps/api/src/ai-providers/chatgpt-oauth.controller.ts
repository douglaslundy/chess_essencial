import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';

import { AiProvidersService } from './ai-providers.service.js';

/**
 * OpenAI redirects the admin's browser here after consent. No bearer token rides along on a
 * browser redirect, so this route is public; the server-side PKCE state proves it belongs to
 * a connection an admin started.
 */
@Controller('ai-providers/chatgpt/oauth')
export class ChatgptOAuthCallbackController {
  constructor(
    private readonly aiProviders: AiProvidersService,
    private readonly config: ConfigService,
  ) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const target = new URL('/app/admin/ia', this.config.getOrThrow<string>('WEB_ORIGIN'));
    try {
      if (!code || !state)
        throw new Error(errorDescription ?? 'A OpenAI não devolveu a autorização.');
      await this.aiProviders.completeChatgptOAuth(code, state);
      target.searchParams.set('chatgpt', 'conectado');
    } catch (error) {
      target.searchParams.set('chatgpt', 'erro');
      target.searchParams.set(
        'detalhe',
        error instanceof Error ? error.message.slice(0, 300) : 'Falha ao conectar.',
      );
    }
    return reply.redirect(target.toString(), 302);
  }
}
