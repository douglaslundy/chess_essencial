import { Injectable } from '@nestjs/common';

import { RatingsRepository } from '../infrastructure/ratings.repository.js';

@Injectable()
export class RatingsService {
  constructor(private readonly ratings: RatingsRepository) {}

  processFinishedGame(gameId: string) {
    return this.ratings.processFinishedGame(gameId);
  }

  reverseGame(gameId: string, reason: string) {
    return this.ratings.reverseGame(gameId, reason);
  }

  profiles(userId: string) {
    return this.ratings.profiles(userId);
  }

  history(userId: string, pool?: string) {
    return this.ratings.history(userId, pool);
  }

  leaderboard(pool: string, limit: number) {
    return this.ratings.leaderboard(pool, limit);
  }
}
