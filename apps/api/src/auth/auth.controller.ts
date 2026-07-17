import {
  loginInputSchema,
  logoutInputSchema,
  refreshInputSchema,
  registerInputSchema,
  resendVerificationInputSchema,
  verifyEmailInputSchema,
} from '@xadrez/contracts';
import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { parseInput } from '../common/http/parse-input.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown) {
    return this.authService.register(parseInput(registerInputSchema, body));
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendVerification(@Body() body: unknown) {
    await this.authService.resendVerification(parseInput(resendVerificationInputSchema, body));
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: unknown) {
    return this.authService.verifyEmail(parseInput(verifyEmailInputSchema, body));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown, @Req() request: FastifyRequest) {
    const userAgent = request.headers['user-agent'];
    return this.authService.login(parseInput(loginInputSchema, body), {
      ip: request.ip ?? null,
      userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 1_024) : null,
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown) {
    const input = parseInput(refreshInputSchema, body);
    return this.authService.refresh(input.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown) {
    const input = parseInput(logoutInputSchema, body);
    await this.authService.logout(input.refreshToken);
  }
}
