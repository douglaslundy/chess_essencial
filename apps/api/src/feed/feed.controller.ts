import { createPostInputSchema, uploadPostPhotoInputSchema } from '@xadrez/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { FeedService } from './feed.service.js';

@UseGuards(AccessTokenGuard)
@Controller()
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get('feed')
  listFeed(@Req() request: AuthenticatedRequest, @Query('before') before?: string) {
    return this.feed.listFeed(request.auth.userId, before);
  }

  @Post('posts/photo')
  uploadPhoto(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseInput(uploadPostPhotoInputSchema, body);
    return this.feed.uploadPhoto(request.auth.userId, input);
  }

  @Post('posts')
  createPost(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseInput(createPostInputSchema, body);
    return this.feed.createPost(request.auth.userId, input);
  }

  @Delete('posts/:postId')
  @HttpCode(204)
  async deletePost(@Req() request: AuthenticatedRequest, @Param('postId') postId: string) {
    await this.feed.deletePost(request.auth.userId, postId);
  }

  @Post('posts/:postId/like')
  like(@Req() request: AuthenticatedRequest, @Param('postId') postId: string) {
    return this.feed.like(request.auth.userId, postId);
  }

  @Delete('posts/:postId/like')
  @HttpCode(204)
  async unlike(@Req() request: AuthenticatedRequest, @Param('postId') postId: string) {
    await this.feed.unlike(request.auth.userId, postId);
  }
}
