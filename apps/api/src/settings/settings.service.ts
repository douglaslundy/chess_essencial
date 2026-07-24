import type { SmtpSettings, UpdateSmtpSettingsInput } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SettingsRepository } from './settings.repository.js';

const SMTP_SETTINGS_KEY = 'smtp';

export interface StoredSmtpConfig {
  fromAddress: string;
  fromName: string;
  host: string;
  password: string | null;
  port: number;
  secure: boolean;
  username: string | null;
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
}
