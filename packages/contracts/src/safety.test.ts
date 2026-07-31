import { describe, expect, it } from 'vitest';

import {
  createReportInputSchema,
  moderateReportInputSchema,
  moderationQueueQuerySchema,
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

  it('normalizes moderation filters and requires a terminal decision', () => {
    expect(moderationQueueQuerySchema.parse({ status: 'open' })).toEqual({
      limit: 50,
      offset: 0,
      status: 'open',
    });
    expect(moderateReportInputSchema.parse({ status: 'reviewing' })).toEqual({
      status: 'reviewing',
    });
    expect(moderateReportInputSchema.safeParse({ status: 'resolved' }).success).toBe(false);
    expect(
      moderateReportInputSchema.parse({
        note: 'Conteúdo confirmado e tratado',
        status: 'resolved',
      }),
    ).toMatchObject({ status: 'resolved' });
  });
});
