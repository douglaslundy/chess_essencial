import type {
  MyReferralInfo,
  ReferralSettings,
  UpdateReferralSettingsInput,
} from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';

import { DatabaseService } from '../database/database.service.js';
import { SettingsRepository } from '../settings/settings.repository.js';

const REFERRAL_SETTINGS_KEY = 'referral.reward';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode() {
  let code = '';
  for (let index = 0; index < 8; index += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

interface StoredReferralSettings {
  rewardDays: number;
  rewardPlanId: string | null;
}

@Injectable()
export class ReferralsRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly settings: SettingsRepository,
  ) {}

  async getOrCreateCode(userId: string): Promise<string> {
    const [existing] = await this.database.client<{ referralCode: string | null }[]>`
      SELECT referral_code AS "referralCode" FROM user_profiles WHERE user_id = ${userId}
    `;
    if (existing?.referralCode) return existing.referralCode;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateCode();
      try {
        await this.database.client`
          UPDATE user_profiles SET referral_code = ${code} WHERE user_id = ${userId}
        `;
        return code;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error('Não foi possível gerar um código de indicação único');
  }

  /** Best-effort: an invalid/self-referral code is silently ignored. */
  async attribute(referralCode: string, referredUserId: string): Promise<void> {
    const [referrer] = await this.database.client<{ userId: string }[]>`
      SELECT user_id AS "userId" FROM user_profiles WHERE referral_code = ${referralCode}
    `;
    if (!referrer || referrer.userId === referredUserId) return;
    await this.database.client`
      INSERT INTO referrals (referrer_user_id, referred_user_id)
      VALUES (${referrer.userId}, ${referredUserId})
      ON CONFLICT (referred_user_id) DO NOTHING
    `;
  }

  /** Marks the referral rewarded and returns the referrer, if one is pending. */
  async resolvePendingReferrer(referredUserId: string): Promise<string | null> {
    const [row] = await this.database.client<{ referrerUserId: string }[]>`
      UPDATE referrals SET status = 'rewarded', rewarded_at = now()
      WHERE referred_user_id = ${referredUserId} AND status = 'pending'
      RETURNING referrer_user_id AS "referrerUserId"
    `;
    return row?.referrerUserId ?? null;
  }

  async myStats(userId: string): Promise<MyReferralInfo> {
    const code = await this.getOrCreateCode(userId);
    const [counts] = await this.database.client<{ rewarded: number; total: number }[]>`
      SELECT count(*)::integer AS total,
        count(*) FILTER (WHERE status = 'rewarded')::integer AS rewarded
      FROM referrals WHERE referrer_user_id = ${userId}
    `;
    return { code, rewardedCount: counts?.rewarded ?? 0, totalCount: counts?.total ?? 0 };
  }

  async getSettings(): Promise<ReferralSettings> {
    const stored = await this.settings.get<StoredReferralSettings>(REFERRAL_SETTINGS_KEY);
    return { rewardDays: stored?.rewardDays ?? 0, rewardPlanId: stored?.rewardPlanId ?? null };
  }

  async updateSettings(
    input: UpdateReferralSettingsInput,
    userId: string,
  ): Promise<ReferralSettings> {
    await this.settings.set(REFERRAL_SETTINGS_KEY, input, userId);
    return this.getSettings();
  }
}
