import { librarySearchQuerySchema } from '@xadrez/contracts';
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { LibraryService } from './library.service.js';

const idSchema = z.string().uuid();

@UseGuards(AccessTokenGuard)
@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get('games')
  search(@Query() query: unknown) {
    return this.library.search(parseInput(librarySearchQuerySchema, query));
  }

  @Get('facets')
  facets() {
    return this.library.facets();
  }

  @Get('games/:gameId')
  game(@Param('gameId') gameId: string) {
    return this.library.getGame(parseInput(idSchema, gameId));
  }

  @Get('games/:gameId/review')
  review(@Param('gameId') gameId: string) {
    return this.library.getReview(parseInput(idSchema, gameId));
  }

  /** Idempotent: generates the AI review once; later calls return the stored one. */
  @Post('games/:gameId/review')
  requestReview(@Param('gameId') gameId: string) {
    return this.library.requestReview(parseInput(idSchema, gameId));
  }
}
