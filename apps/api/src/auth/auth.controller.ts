import {
  forgotPasswordInputSchema,
  loginInputSchema,
  logoutInputSchema,
  refreshInputSchema,
  registerInputSchema,
  resetPasswordInputSchema,
  resendVerificationInputSchema,
  verifyEmailInputSchema,
} from '@xadrez/contracts';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { parseInput } from '../common/http/parse-input.js';
import { AuthService } from './auth.service.js';
import {
  clearRefreshCookie,
  isWebClient,
  readRefreshCookie,
  setRefreshCookie,
  staysSignedIn,
} from './web-session-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

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
  async login(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const userAgent = request.headers['user-agent'];
    const result = await this.authService.login(parseInput(loginInputSchema, body), {
      ip: request.ip ?? null,
      userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 1_024) : null,
    });
    if (isWebClient(request)) {
      setRefreshCookie(reply, result.tokens.refreshToken, this.config, staysSignedIn(request));
    }
    return result;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const cookieToken = readRefreshCookie(request, this.config);
    const refreshToken = cookieToken ?? parseInput(refreshInputSchema, body).refreshToken;
    const tokens = await this.authService.refresh(refreshToken);
    if (cookieToken || isWebClient(request)) {
      setRefreshCookie(reply, tokens.refreshToken, this.config, staysSignedIn(request));
    }
    return tokens;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const cookieToken = readRefreshCookie(request, this.config);
    if (!cookieToken && isWebClient(request)) {
      clearRefreshCookie(reply, this.config);
      return;
    }
    const refreshToken = cookieToken ?? parseInput(logoutInputSchema, body).refreshToken;
    await this.authService.logout(refreshToken);
    if (cookieToken || isWebClient(request)) clearRefreshCookie(reply, this.config);
  }
  @Post('password/forgot')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() body: unknown) {
    await this.authService.forgotPassword(parseInput(forgotPasswordInputSchema, body));
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() body: unknown) {
    await this.authService.resetPassword(parseInput(resetPasswordInputSchema, body));
  }
}
