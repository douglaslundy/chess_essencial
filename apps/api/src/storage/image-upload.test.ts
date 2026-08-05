import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { InvalidImageUploadError, normalizeImageUpload } from './image-upload.js';

async function image(format: 'jpeg' | 'png' | 'webp', width = 32, height = 24) {
  const pipeline = sharp({
    create: { background: '#31572c', channels: 3, height, width },
  });
  return pipeline[format]().toBuffer();
}

describe('normalizeImageUpload', () => {
  it('decodes, bounds and normalizes a valid image to metadata-free WebP', async () => {
    const input = await image('jpeg', 2_000, 1_000);
    const normalized = await normalizeImageUpload('image/jpeg', input.toString('base64'), {
      maxBytes: 512 * 1024,
      maxDimension: 1_024,
    });
    const metadata = await sharp(normalized.data).metadata();

    expect(normalized.contentType).toBe('image/webp');
    expect(metadata).toMatchObject({ format: 'webp', height: 512, width: 1_024 });
    expect(metadata.exif).toBeUndefined();
    expect(normalized.data.byteLength).toBeLessThanOrEqual(512 * 1024);
  });

  it('rejects bytes that do not match the declared MIME type', async () => {
    const input = await image('jpeg');
    await expect(
      normalizeImageUpload('image/png', input.toString('base64'), {
        maxBytes: 512 * 1024,
        maxDimension: 1_024,
      }),
    ).rejects.toBeInstanceOf(InvalidImageUploadError);
  });

  it.each(['not base64!', '====', 'AA=A'])('rejects malformed base64: %s', async (payload) => {
    await expect(
      normalizeImageUpload('image/jpeg', payload, {
        maxBytes: 512 * 1024,
        maxDimension: 1_024,
      }),
    ).rejects.toBeInstanceOf(InvalidImageUploadError);
  });

  it('rejects non-image content even with an allowed MIME type', async () => {
    await expect(
      normalizeImageUpload('image/webp', Buffer.from('RIFF fake WEBP').toString('base64'), {
        maxBytes: 512 * 1024,
        maxDimension: 1_024,
      }),
    ).rejects.toBeInstanceOf(InvalidImageUploadError);
  });

  it('rejects the decoded payload before processing when it exceeds the byte limit', async () => {
    await expect(
      normalizeImageUpload('image/png', Buffer.alloc(11).toString('base64'), {
        maxBytes: 10,
        maxDimension: 1_024,
      }),
    ).rejects.toBeInstanceOf(InvalidImageUploadError);
  });
});
