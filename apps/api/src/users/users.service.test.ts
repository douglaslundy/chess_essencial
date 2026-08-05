import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import type { StorageService } from '../storage/storage.service.js';
import { UsersService } from './users.service.js';
import type { UsersRepository } from './users.repository.js';

async function jpegBase64() {
  return (
    await sharp({ create: { background: '#31572c', channels: 3, height: 24, width: 24 } })
      .jpeg()
      .toBuffer()
  ).toString('base64');
}

describe('UsersService avatar upload', () => {
  it('stores only the server-normalized WebP image', async () => {
    const putAvatar = vi.fn(async () => 'https://assets.example/avatar.webp');
    const updateProfile = vi.fn(async () => ({
      email: 'player@example.com',
      emailVerifiedAt: null,
      id: 'player-id',
      profile: {},
      status: 'active',
      username: 'player',
    }));
    const service = new UsersService(
      { updateProfile } as unknown as UsersRepository,
      { enabled: true, putAvatar } as unknown as StorageService,
    );

    await service.uploadAvatar('player-id', {
      contentType: 'image/jpeg',
      dataBase64: await jpegBase64(),
    });

    expect(putAvatar).toHaveBeenCalledWith('player-id', 'image/webp', expect.any(Buffer));
    expect(updateProfile).toHaveBeenCalledWith('player-id', {
      avatarUrl: 'https://assets.example/avatar.webp',
    });
  });

  it('rejects invalid image content before object storage', async () => {
    const putAvatar = vi.fn();
    const service = new UsersService(
      {} as UsersRepository,
      { enabled: true, putAvatar } as unknown as StorageService,
    );

    await expect(
      service.uploadAvatar('player-id', {
        contentType: 'image/jpeg',
        dataBase64: Buffer.from('not an image').toString('base64'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(putAvatar).not.toHaveBeenCalled();
  });
});
