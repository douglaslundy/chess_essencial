import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';

const ALLOWED = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export const MAX_AVATAR_BYTES = 512 * 1024;
export const MAX_POST_PHOTO_BYTES = 2 * 1024 * 1024;

@Injectable()
export class StorageService {
  private readonly client: MinioClient | null;
  private readonly bucket: string;
  private readonly publicUrl: string | null;

  constructor(config: ConfigService) {
    const endPoint = config.get<string>('MINIO_ENDPOINT');
    const accessKey = config.get<string>('MINIO_ACCESS_KEY');
    const secretKey = config.get<string>('MINIO_SECRET_KEY');
    this.bucket = config.get<string>('MINIO_BUCKET') ?? 'avatars';
    this.publicUrl = config.get<string>('MINIO_PUBLIC_URL') ?? null;
    this.client =
      endPoint && accessKey && secretKey
        ? new MinioClient({
            accessKey,
            endPoint,
            port: config.get<number>('MINIO_PORT') ?? 9000,
            secretKey,
            useSSL: config.get<boolean>('MINIO_USE_SSL') ?? false,
          })
        : null;
  }

  get enabled(): boolean {
    return this.client !== null && this.publicUrl !== null;
  }

  /** Every stored image (avatars and post photos), read one at a time. */
  async *listFiles(): AsyncGenerator<{ contentType: string; data: Buffer; name: string }> {
    if (!this.client) return;
    for await (const object of this.client.listObjectsV2(this.bucket, '', true)) {
      if (!object.name) continue;
      const stat = await this.client.statObject(this.bucket, object.name);
      const stream = await this.client.getObject(this.bucket, object.name);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      yield {
        contentType: String(stat.metaData?.['content-type'] ?? 'application/octet-stream'),
        data: Buffer.concat(chunks),
        name: object.name,
      };
    }
  }

  /** Store an avatar image and return its public URL. */
  async putAvatar(ownerId: string, contentType: string, data: Buffer): Promise<string> {
    if (!this.client || !this.publicUrl) throw new Error('Object storage is not configured');
    const extension = ALLOWED.get(contentType);
    if (!extension) throw new Error('Unsupported image type');
    if (data.byteLength > MAX_AVATAR_BYTES) throw new Error('Image is too large');
    const objectName = `avatar-${ownerId}-${randomUUID()}.${extension}`;
    await this.client.putObject(this.bucket, objectName, data, data.byteLength, {
      'Content-Type': contentType,
    });
    return `${this.publicUrl.replace(/\/+$/, '')}/${objectName}`;
  }

  /** Store a feed post photo and return its public URL. */
  async putPostPhoto(ownerId: string, contentType: string, data: Buffer): Promise<string> {
    if (!this.client || !this.publicUrl) throw new Error('Object storage is not configured');
    const extension = ALLOWED.get(contentType);
    if (!extension) throw new Error('Unsupported image type');
    if (data.byteLength > MAX_POST_PHOTO_BYTES) throw new Error('Image is too large');
    const objectName = `post-${ownerId}-${randomUUID()}.${extension}`;
    await this.client.putObject(this.bucket, objectName, data, data.byteLength, {
      'Content-Type': contentType,
    });
    return `${this.publicUrl.replace(/\/+$/, '')}/${objectName}`;
  }
}
