import { z } from 'zod';

export const myReferralInfoSchema = z.object({
  code: z.string(),
  rewardedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
});

// Admin-configurable, optional: which plan (if any) a referrer is granted,
// and for how many days, once their referred friend verifies their email.
// Left unconfigured (rewardPlanId: null), referrals are still tracked but
// nothing is auto-granted — avoids inventing a reward policy nobody asked
// to run yet.
export const referralSettingsSchema = z.object({
  rewardDays: z.number().int().min(0),
  rewardPlanId: z.string().uuid().nullable(),
});

export const updateReferralSettingsInputSchema = z.object({
  rewardDays: z.number().int().min(0).max(365),
  rewardPlanId: z.string().uuid().nullable(),
});

export type MyReferralInfo = z.infer<typeof myReferralInfoSchema>;
export type ReferralSettings = z.infer<typeof referralSettingsSchema>;
export type UpdateReferralSettingsInput = z.infer<typeof updateReferralSettingsInputSchema>;
