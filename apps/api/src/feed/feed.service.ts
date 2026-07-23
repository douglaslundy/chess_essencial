import type { CreatePostInput, Post, UploadPostPhotoInput } from '@xadrez/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';

import { MAX_POST_PHOTO_BYTES, StorageService } from '../storage/storage.service.js';
import { FeedRepository } from './feed.repository.js';

@Injectable()
export class FeedService {
  constructor(
    private readonly feed: FeedRepository,
    private readonly storage: StorageService,
  ) {}

  createPost(authorId: string, input: CreatePostInput): Promise<Post> {
    return this.feed.createPost(authorId, input.body ?? null, input.photoUrl ?? null);
  }

  listFeed(viewerId: string, before?: string): Promise<Post[]> {
    return this.feed.listFeed(viewerId, before ?? null);
  }

  deletePost(userId: string, postId: string): Promise<void> {
    return this.feed.deletePost(userId, postId);
  }

  like(userId: string, postId: string): Promise<Post> {
    return this.feed.like(userId, postId);
  }

  unlike(userId: string, postId: string): Promise<void> {
    return this.feed.unlike(userId, postId);
  }

  async uploadPhoto(userId: string, input: UploadPostPhotoInput): Promise<{ photoUrl: string }> {
    if (!this.storage.enabled) {
      throw new BadRequestException('Upload de foto indisponível no momento.');
    }
    const data = Buffer.from(input.dataBase64, 'base64');
    if (data.byteLength === 0 || data.byteLength > MAX_POST_PHOTO_BYTES) {
      throw new BadRequestException('Imagem inválida ou muito grande (máx. 2 MB).');
    }
    try {
      const photoUrl = await this.storage.putPostPhoto(userId, input.contentType, data);
      return { photoUrl };
    } catch {
      throw new BadRequestException('Não foi possível salvar a foto.');
    }
  }
}
