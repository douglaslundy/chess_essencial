import {
  createGameInputSchema,
  gameHistoryQuerySchema,
  reviewAnnotationInputSchema,
  submitMoveInputSchema,
} from '@xadrez/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../../auth/access-token.guard.js';
import { parseInput } from '../../common/http/parse-input.js';
import { GamesService } from '../application/games.service.js';

import { GamesGateway } from './games.gateway.js';

const gameIdSchema = z.string().uuid();

@Controller('games')
@UseGuards(AccessTokenGuard)
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly gamesGateway: GamesGateway,
  ) {}

  @Get()
  history(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    return this.gamesService.history(
      request.auth.userId,
      parseInput(gameHistoryQuerySchema, query),
    );
  }
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

  @Get(':gameId/analysis')
  getAnalysis(@Req() request: AuthenticatedRequest, @Param('gameId') gameId: string) {
    return this.gamesService.getAnalysis(parseInput(gameIdSchema, gameId), request.auth.userId);
  }

  @Get(':gameId/narration')
  getNarration(@Req() request: AuthenticatedRequest, @Param('gameId') gameId: string) {
    return this.gamesService.getNarration(parseInput(gameIdSchema, gameId), request.auth.userId);
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

  @Post(':gameId/resign')
  @HttpCode(200)
  async resign(@Req() request: AuthenticatedRequest, @Param('gameId') gameId: string) {
    const parsedGameId = parseInput(gameIdSchema, gameId);
    const state = await this.gamesService.resign(parsedGameId, request.auth.userId);
    this.gamesGateway.notifyFinished(parsedGameId, state);
    return state;
  }

  @Post(':gameId/draw-offers')
  async offerDraw(@Req() request: AuthenticatedRequest, @Param('gameId') gameId: string) {
    const parsedGameId = parseInput(gameIdSchema, gameId);
    const result = await this.gamesService.offerDraw(parsedGameId, request.auth.userId);
    if (result.accepted) this.gamesGateway.notifyFinished(parsedGameId, result.state);
    else
      this.gamesGateway.notifyDrawOffered(
        parsedGameId,
        result.offerId,
        request.auth.userId,
        result.state,
      );
    return result;
  }

  @Get(':gameId/review-annotations')
  listReviewAnnotations(@Req() request: AuthenticatedRequest, @Param('gameId') gameId: string) {
    return this.gamesService.listReviewAnnotations(
      parseInput(gameIdSchema, gameId),
      request.auth.userId,
    );
  }

  @Put(':gameId/review-annotations')
  saveReviewAnnotation(
    @Req() request: AuthenticatedRequest,
    @Param('gameId') gameId: string,
    @Body() body: unknown,
  ) {
    return this.gamesService.saveReviewAnnotation(
      parseInput(gameIdSchema, gameId),
      request.auth.userId,
      parseInput(reviewAnnotationInputSchema, body),
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
