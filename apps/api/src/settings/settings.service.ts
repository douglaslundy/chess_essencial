import type {
  MercadoPagoConnectionTestResult,
  MercadoPagoSettings,
  SmtpSettings,
  UpdateMercadoPagoSettingsInput,
  UpdateSmtpSettingsInput,
} from '@xadrez/contracts';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SettingsRepository } from './settings.repository.js';

const SMTP_SETTINGS_KEY = 'smtp';
const MERCADO_PAGO_SETTINGS_KEY = 'payment.mercado_pago';

export interface StoredSmtpConfig {
  fromAddress: string;
  fromName: string;
  host: string;
  password: string | null;
  port: number;
  secure: boolean;
  username: string | null;
}

export interface StoredMercadoPagoConfig {
  accessToken: string | null;
  environment: 'sandbox' | 'production';
  publicKey: string | null;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly config: ConfigService,
  ) {}

  async getSmtpSettings(): Promise<SmtpSettings> {
    const stored = await this.settings.get<StoredSmtpConfig>(SMTP_SETTINGS_KEY);
    return {
      fromAddress: stored?.fromAddress ?? null,
      fromName: stored?.fromName ?? null,
      hasPassword: Boolean(stored?.password),
      host: stored?.host ?? null,
      port: stored?.port ?? null,
      secure: stored?.secure ?? false,
      username: stored?.username ?? null,
    };
  }

  async updateSmtpSettings(input: UpdateSmtpSettingsInput, userId: string): Promise<SmtpSettings> {
    const existing = await this.settings.get<StoredSmtpConfig>(SMTP_SETTINGS_KEY);
    const next: StoredSmtpConfig = {
      fromAddress: input.fromAddress,
      fromName: input.fromName,
      host: input.host,
      password: input.password || existing?.password || null,
      port: input.port,
      secure: input.secure,
      username: input.username,
    };
    await this.settings.set(SMTP_SETTINGS_KEY, next, userId);
    return this.getSmtpSettings();
  }

  /**
   * The config actually used to send mail: the saved admin configuration if
   * present, otherwise the legacy SMTP_URL env var (kept for local/dev/CI
   * environments that never populated platform_settings).
   */
  async resolveActiveSmtpConfig(): Promise<StoredSmtpConfig | null> {
    const stored = await this.settings.get<StoredSmtpConfig>(SMTP_SETTINGS_KEY);
    if (stored) return stored;
    const smtpUrl = this.config.get<string>('SMTP_URL');
    if (!smtpUrl) return null;
    const url = new URL(smtpUrl);
    return {
      fromAddress: 'nao-responda@xadrez-essencial.local',
      fromName: 'Xadrez Essencial',
      host: url.hostname,
      password: url.password ? decodeURIComponent(url.password) : null,
      port: Number(url.port || 25),
      secure: url.searchParams.get('secure') === 'true',
      username: url.username ? decodeURIComponent(url.username) : null,
    };
  }

  async getMercadoPagoSettings(): Promise<MercadoPagoSettings> {
    const stored = await this.settings.get<StoredMercadoPagoConfig>(MERCADO_PAGO_SETTINGS_KEY);
    return {
      environment: stored?.environment ?? 'sandbox',
      hasAccessToken: Boolean(stored?.accessToken),
      publicKey: stored?.publicKey ?? null,
    };
  }

  async updateMercadoPagoSettings(
    input: UpdateMercadoPagoSettingsInput,
    userId: string,
  ): Promise<MercadoPagoSettings> {
    const existing = await this.settings.get<StoredMercadoPagoConfig>(MERCADO_PAGO_SETTINGS_KEY);
    const next: StoredMercadoPagoConfig = {
      accessToken: input.accessToken || existing?.accessToken || null,
      environment: input.environment,
      publicKey: input.publicKey,
    };
    await this.settings.set(MERCADO_PAGO_SETTINGS_KEY, next, userId);
    return this.getMercadoPagoSettings();
  }

  async testMercadoPagoConnection(): Promise<MercadoPagoConnectionTestResult> {
    const stored = await this.settings.get<StoredMercadoPagoConfig>(MERCADO_PAGO_SETTINGS_KEY);
    if (!stored?.accessToken)
      throw new BadRequestException('Configure o access token do Mercado Pago antes de testar.');
    let response: Response;
    try {
      response = await fetch('https://api.mercadopago.com/users/me', {
        headers: { Authorization: `Bearer ${stored.accessToken}` },
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? `Não foi possível contatar o Mercado Pago: ${error.message}`
          : 'Não foi possível contatar o Mercado Pago.',
      );
    }
    if (!response.ok)
      throw new ServiceUnavailableException(
        `Mercado Pago recusou as credenciais (HTTP ${response.status}). Verifique o access token e o ambiente (sandbox/produção).`,
      );
    const body = (await response.json()) as { email?: string };
    return { accountEmail: body.email ?? null, connected: true };
  }
}
