import { describe, expect, it, vi } from 'vitest';

import type { RedisService } from '../redis/redis.service.js';
import type { SocialRepository } from './social.repository.js';
import { SocialService } from './social.service.js';

const friend = {
  avatarUrl: null,
  displayName: 'Jogador',
  presence: { lastSeenAt: null, online: false },
  userId: '00000000-0000-4000-8000-000000000001',
  username: 'jogador',
};

function createService(redisClient: object, socialRepository: object) {
  return new SocialService(
    socialRepository as SocialRepository,
    { client: redisClient } as RedisService,
  );
}

describe('SocialService Redis degradation', () => {
  it('accepts a friendship and reports offline when Redis is unavailable', async () => {
    const service = createService(
      { exists: vi.fn().mockRejectedValue(new Error('Redis unavailable')) },
      { respondToRequest: vi.fn().mockResolvedValue(friend) },
    );

    await expect(service.acceptRequest('target-id', 'requester')).resolves.toEqual(friend);
  });

  it('persists heartbeat time even when Redis is unavailable', async () => {
    const touchLastSeen = vi.fn().mockResolvedValue(undefined);
    const service = createService(
      { set: vi.fn().mockRejectedValue(new Error('Redis unavailable')) },
      { touchLastSeen },
    );

    await expect(service.heartbeat('user-id')).resolves.toBeUndefined();
    expect(touchLastSeen).toHaveBeenCalledWith('user-id');
  });
});
