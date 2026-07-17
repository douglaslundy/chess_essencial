import { createGameInputSchema, submitMoveInputSchema } from '@xadrez/contracts';
import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../../auth/access-token.guard.js';
import { parseInput } from '../../common/http/parse-input.js';
import { GamesService } from '../application/games.service.js';

const gameIdSchema = z.string().uuid();

@Controller('games')
@UseGuards(AccessTokenGuard)
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.gamesService.create(request.auth.userId, parseInput(createGameInputSchema, body));
  }

  @Get(':gameId')
  getState(@Req() request: AuthenticatedRequest, @Param('gameId') gameId: string) {
    return this.gamesService.getState(parseInput(gameIdSchema, gameId), request.auth.userId);
  }

  @Get(':gameId/moves')
  listMoves(@Req() request: AuthenticatedRequest, @Param('gameId') gameId: string) {
    return this.gamesService.listMoves(parseInput(gameIdSchema, gameId), request.auth.userId);
  }

  @Post(':gameId/moves')
  commitMove(
    @Req() request: AuthenticatedRequest,
    @Param('gameId') gameId: string,
    @Body() body: unknown,
  ) {
    return this.gamesService.commitMove(
      parseInput(gameIdSchema, gameId),
      request.auth.userId,
      parseInput(submitMoveInputSchema, body),
    );
  }

  @Get(':gameId/pgn')
  async getPgn(
    @Req() request: AuthenticatedRequest,
    @Param('gameId') gameId: string,
    @Res() reply: FastifyReply,
  ) {
    const pgn = await this.gamesService.getPgn(
      parseInput(gameIdSchema, gameId),
      request.auth.userId,
    );
    return reply.type('application/x-chess-pgn; charset=utf-8').send(pgn);
  }
}
