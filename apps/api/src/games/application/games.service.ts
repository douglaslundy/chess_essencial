import type { CreateGameInput, SubmitMoveInput } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { RatingsService } from '../../ratings/application/ratings.service.js';
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
