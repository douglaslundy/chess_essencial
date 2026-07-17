import type {
  CreateChallengeInput,
  JoinQueueInput,
  RespondChallengeInput,
} from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { MatchmakingRepository } from '../infrastructure/matchmaking.repository.js';

@Injectable()
export class MatchmakingService {
  constructor(private readonly matchmaking: MatchmakingRepository) {}

  join(userId: string, input: JoinQueueInput) {
    return this.matchmaking.join(userId, input);
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
