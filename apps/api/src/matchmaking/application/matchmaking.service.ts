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
    // A no-op unless the matched candidate turned out to be an online bot
    // persona sitting in the queue (see apps/worker/src/bots/queue-job.ts),
    // which may now need to make the opening move.
    if (result.status === 'matched' && result.gameId) {
      await this.games.commitBotMoveIfNeeded(result.gameId);
    }
    return result;
  }

  createBotGame(userId: string, input: CreateBotGameInput) {
    return this.games.createBotGame(userId, input);
  }

  leave(userId: string) {
    return this.matchmaking.leave(userId);
  }

  async createChallenge(userId: string, input: CreateChallengeInput) {
    const result = await this.matchmaking.createChallenge(userId, input);
    // A no-op unless the challenged user turned out to be a bot persona,
    // which auto-accepts inside matchmaking.createChallenge and may now
    // need to make the opening move.
    if (result.status === 'accepted' && result.gameId) {
      await this.games.commitBotMoveIfNeeded(result.gameId);
    }
    return result;
  }

  listChallenges(userId: string) {
    return this.matchmaking.listChallenges(userId);
  }

  cancelChallenge(userId: string, challengeId: string) {
    return this.matchmaking.cancelChallenge(userId, challengeId);
  }

  async respondChallenge(userId: string, challengeId: string, input: RespondChallengeInput) {
    const result = await this.matchmaking.respondChallenge(userId, challengeId, input);
    // A no-op unless the accepted opponent turned out to be a bot persona
    // (or the practice bot) whose turn it now is — see commitBotMoveIfNeeded.
    if (result.status === 'accepted' && result.gameId) {
      await this.games.commitBotMoveIfNeeded(result.gameId);
    }
    return result;
  }
}
