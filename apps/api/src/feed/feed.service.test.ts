import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import type { StorageService } from '../storage/storage.service.js';
import type { FeedRepository } from './feed.repository.js';
import { FeedService } from './feed.service.js';

describe('FeedService photo upload', () => {
  it('stores only the server-normalized WebP image', async () => {
    const input = await sharp({
      create: { background: '#31572c', channels: 3, height: 24, width: 32 },
    })
      .png()
      .toBuffer();
    const putPostPhoto = vi.fn(async () => 'https://assets.example/post.webp');
    const service = new FeedService(
      {} as FeedRepository,
      { enabled: true, putPostPhoto } as unknown as StorageService,
    );

    await expect(
      service.uploadPhoto('player-id', {
        contentType: 'image/png',
        dataBase64: input.toString('base64'),
      }),
    ).resolves.toEqual({ photoUrl: 'https://assets.example/post.webp' });
    expect(putPostPhoto).toHaveBeenCalledWith('player-id', 'image/webp', expect.any(Buffer));
  });
});
