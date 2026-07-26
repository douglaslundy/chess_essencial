import {
  sendTestEmailInputSchema,
  updateAssistedGameSettingsInputSchema,
  updateMercadoPagoSettingsInputSchema,
  updateNarrationAiSettingsInputSchema,
  updateSmtpSettingsInputSchema,
} from '@xadrez/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { AdminGuard } from '../admin/admin.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { sendMail } from './mailer.js';
import { SettingsService } from './settings.service.js';

@UseGuards(AccessTokenGuard, AdminGuard)
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('smtp')
  getSmtp() {
    return this.settings.getSmtpSettings();
  }

  @Put('smtp')
  updateSmtp(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseInput(updateSmtpSettingsInputSchema, body);
    return this.settings.updateSmtpSettings(input, request.auth.userId);
  }

  @Post('smtp/test-email')
  async sendTestEmail(@Body() body: unknown) {
    const input = parseInput(sendTestEmailInputSchema, body);
    const smtp = await this.settings.resolveActiveSmtpConfig();
    if (!smtp) throw new BadRequestException('Configure o SMTP antes de enviar um teste.');
    try {
      await sendMail(smtp, {
        subject: 'Teste de SMTP — Xadrez Essencial',
        text: 'Se você recebeu esta mensagem, a configuração de SMTP está funcionando.',
        to: input.toEmail,
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : 'Não foi possível enviar o e-mail de teste.',
      );
    }
    return { sent: true };
  }

  @Get('mercado-pago')
  getMercadoPago() {
    return this.settings.getMercadoPagoSettings();
  }

  @Put('mercado-pago')
  updateMercadoPago(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseInput(updateMercadoPagoSettingsInputSchema, body);
    return this.settings.updateMercadoPagoSettings(input, request.auth.userId);
  }

  @Post('mercado-pago/test-connection')
  testMercadoPago() {
    return this.settings.testMercadoPagoConnection();
  }

  @Get('assisted-game')
  getAssistedGame() {
    return this.settings.getAssistedGameSettings();
  }

  @Put('assisted-game')
  updateAssistedGame(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseInput(updateAssistedGameSettingsInputSchema, body);
    return this.settings.updateAssistedGameSettings(input, request.auth.userId);
  }

  @Get('narration-ai')
  getNarrationAi() {
    return this.settings.getNarrationAiSettings();
  }

  @Put('narration-ai')
  updateNarrationAi(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseInput(updateNarrationAiSettingsInputSchema, body);
    return this.settings.updateNarrationAiSettings(input, request.auth.userId);
  }
}
