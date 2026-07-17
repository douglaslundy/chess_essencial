import type {
  CreateGameInput,
  GameHistoryQuery,
  ReviewAnnotationInput,
  SubmitMoveInput,
} from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { RatingsService } from '../../ratings/application/ratings.service.js';
import { sanitizeUserText } from '../../common/security/sanitize-user-text.js';
import { GamesRepository } from '../infrastructure/games.repository.js';

@Injectable()
export class GamesService {
  constructor(
    private readonly games: GamesRepository,
    private readonly ratings: RatingsService,
  ) {}

  create(userId: string, input: CreateGameInput) {
    return this.games.create(userId, input);
  }

  history(userId: string, input: GameHistoryQuery) {
    return this.games.history(userId, input);
  }

  listReviewAnnotations(gameId: string, userId: string) {
    return this.games.listReviewAnnotations(gameId, userId);
  }

  saveReviewAnnotation(gameId: string, userId: string, input: ReviewAnnotationInput) {
    return this.games.saveReviewAnnotation(gameId, userId, {
      ...input,
      ...(input.comment ? { comment: sanitizeUserText(input.comment) } : {}),
    });
  }
  getState(gameId: string, userId: string) {
    return this.games.getState(gameId, userId);
  }

  listMoves(gameId: string, userId: string) {
    return this.games.listMoves(gameId, userId);
  }

  realtimeSnapshot(gameId: string, userId: string, lastKnownVersion: number) {
    return this.games.realtimeSnapshot(gameId, userId, lastKnownVersion);
  }

  setConnection(gameId: string, userId: string, connected: boolean) {
    return this.games.setConnection(gameId, userId, connected);
  }

  async expireOnTime(gameId: string) {
    const state = await this.games.expireOnTime(gameId);
    if (state?.status === 'finished') await this.ratings.processFinishedGame(gameId);
    return state;
  }

  getPgn(gameId: string, userId: string) {
    return this.games.getPgn(gameId, userId);
  }

  async resign(gameId: string, userId: string) {
    const state = await this.games.resign(gameId, userId);
    await this.ratings.processFinishedGame(gameId);
    return state;
  }

  async offerDraw(gameId: string, userId: string) {
    const result = await this.games.offerDraw(gameId, userId);
    if (result.accepted) await this.ratings.processFinishedGame(gameId);
    return result;
  }

  async commitMove(gameId: string, userId: string, input: SubmitMoveInput) {
    try {
      const result = await this.games.commitMove(gameId, userId, input);
      if (result.state.status === 'finished') await this.ratings.processFinishedGame(gameId);
      return result;
    } catch (error) {
      await this.ratings.processFinishedGame(gameId);
      throw error;
    }
  }
}
