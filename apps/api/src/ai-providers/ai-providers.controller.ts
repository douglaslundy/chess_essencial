import {
  aiProviderSchema,
  chatgptOAuthStartInputSchema,
  listAiProviderModelsInputSchema,
  updateAiProviderActiveInputSchema,
  updateAiProviderKeyInputSchema,
} from '@xadrez/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AdminGuard } from '../admin/admin.guard.js';
import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { AiProvidersService } from './ai-providers.service.js';

@UseGuards(AccessTokenGuard, AdminGuard)
@Controller('admin/ai-providers')
export class AiProvidersController {
  constructor(
    private readonly aiProviders: AiProvidersService,
    private readonly config: ConfigService,
  ) {}

  /** ChatGPT (OAuth): returns OpenAI's consent URL; the browser comes back to the public callback. */
  @Post('chatgpt/oauth/start')
  startChatgptOAuth(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseInput(chatgptOAuthStartInputSchema, body);
    const apiBase =
      this.config.get<string>('API_PUBLIC_URL') ??
      `${request.protocol}://${request.headers.host}/v1`;
    return this.aiProviders.startChatgptOAuth(
      input.clientId,
      `${apiBase.replace(/\/$/, '')}/ai-providers/chatgpt/oauth/callback`,
      request.auth.userId,
    );
  }

  @Delete('chatgpt/oauth')
  @HttpCode(204)
  async disconnectChatgpt(@Req() request: AuthenticatedRequest) {
    await this.aiProviders.disconnectChatgpt(request.auth.userId);
  }

  @Get()
  list() {
    return this.aiProviders.list();
  }

  @Post(':provider/models')
  async listModels(@Param('provider') provider: string, @Body() body: unknown) {
    const input = parseInput(listAiProviderModelsInputSchema, body);
    const models = await this.aiProviders.listModels(
      parseInput(aiProviderSchema, provider),
      input.apiKey,
    );
    return { models };
  }

  @Post(':provider/test')
  test(@Param('provider') provider: string) {
    return this.aiProviders.test(parseInput(aiProviderSchema, provider));
  }

  @Put(':provider')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('provider') provider: string,
    @Body() body: unknown,
  ) {
    return this.aiProviders.update(
      parseInput(aiProviderSchema, provider),
      parseInput(updateAiProviderKeyInputSchema, body),
      request.auth.userId,
    );
  }

  @Put(':provider/active')
  setActive(
    @Req() request: AuthenticatedRequest,
    @Param('provider') provider: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(updateAiProviderActiveInputSchema, body);
    return this.aiProviders.setActive(
      parseInput(aiProviderSchema, provider),
      input.isActive,
      request.auth.userId,
    );
  }
}
