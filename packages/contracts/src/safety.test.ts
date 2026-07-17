import { describe, expect, it } from 'vitest';

import {
  createReportInputSchema,
  privacySettingsSchema,
  updatePrivacyInputSchema,
} from './safety.js';

describe('safety contracts', () => {
  it('requires a report target and bounded description', () => {
    expect(
      createReportInputSchema.safeParse({ category: 'harassment', description: 'abuso' }).success,
    ).toBe(false);
    expect(
      createReportInputSchema.parse({
        category: 'harassment',
        description: 'mensagem abusiva',
        reportedUserId: '018f47f4-7b2f-4d90-8a66-9abcdef01234',
      }).category,
    ).toBe('harassment');
  });

  it('accepts partial privacy updates but rejects empty input', () => {
    expect(updatePrivacyInputSchema.safeParse({}).success).toBe(false);
    expect(updatePrivacyInputSchema.parse({ allowChallenges: false })).toEqual({
      allowChallenges: false,
    });
    expect(
      privacySettingsSchema.parse({
        allowChallenges: false,
        allowFriendRequests: true,
        isProfilePublic: false,
      }),
    ).toBeDefined();
  });
});
