import type {
  CreateBotGameInput,
  CreateChallengeInput,
  JoinQueueInput,
  RespondChallengeInput,
} from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';
import { GamesService } from '../../games/application/games.service.js';

import { MatchmakingRepository } from '../infrastructure/matchmaking.repository.js';

@Injectable()
export class MatchmakingService {
  constructor(
    private readonly matchmaking: MatchmakingRepository,
    private readonly games: GamesService,
  ) {}

  async join(userId: string, input: JoinQueueInput) {
    const result = await this.matchmaking.join(userId, input);
    if (result.status === 'queued' && input.fallbackToBot) {
      await this.matchmaking.leave(userId);
      const game = await this.games.createBotGame(userId, input);
      return { ...result, gameId: game.id, status: 'matched' as const };
    }
    return result;
  }

  createBotGame(userId: string, input: CreateBotGameInput) {
    return this.games.createBotGame(userId, input);
  }

  leave(userId: string) {
    return this.matchmaking.leave(userId);
  }

  createChallenge(userId: string, input: CreateChallengeInput) {
    return this.matchmaking.createChallenge(userId, input);
  }

  respondChallenge(userId: string, challengeId: string, input: RespondChallengeInput) {
    return this.matchmaking.respondChallenge(userId, challengeId, input);
  }
}
