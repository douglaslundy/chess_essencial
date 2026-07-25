import { describe, expect, it } from 'vitest';

import {
  friendRequestsViewSchema,
  presenceSchema,
  publicProfileSchema,
  sendFriendRequestInputSchema,
} from './social.js';

describe('social contracts', () => {
  it('validates presence', () => {
    expect(presenceSchema.parse({ lastSeenAt: null, online: true })).toEqual({
      lastSeenAt: null,
      online: true,
    });
  });

  it('rejects usernames outside bounds', () => {
    expect(() => sendFriendRequestInputSchema.parse({ username: 'ab' })).toThrow();
    expect(sendFriendRequestInputSchema.parse({ username: 'valid_user' })).toEqual({
      username: 'valid_user',
    });
  });

  it('validates an empty friend requests view', () => {
    expect(friendRequestsViewSchema.parse({ incoming: [], outgoing: [] })).toEqual({
      incoming: [],
      outgoing: [],
    });
  });

  it('validates a public profile with friendship status', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    expect(
      publicProfileSchema.parse({
        avatarUrl: null,
        displayName: 'Player',
        friendshipStatus: 'friends',
        presence: { lastSeenAt: null, online: false },
        ratings: [{ pool: 'rapid', rating: 1200 }],
        userId: uuid,
        username: 'player',
      }),
    ).toMatchObject({ friendshipStatus: 'friends' });
  });
});
