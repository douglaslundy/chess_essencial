import { randomUUID } from 'node:crypto';

import type {
  CreateBotGameInput,
  CreateGameInput,
  GameHistoryQuery,
  LiveNarrationRequest,
  ReviewAnnotationInput,
  SubmitMoveInput,
} from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { RatingsService } from '../../ratings/application/ratings.service.js';
import { sanitizeUserText } from '../../common/security/sanitize-user-text.js';
import { selectBotMoveWithEngine } from '../bot-engine.js';
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

  async createBotGame(userId: string, input: CreateBotGameInput) {
    const state = await this.games.createBotGame(userId, input);
    const opening = await this.commitBotMoveIfNeeded(state.id);
    return opening?.state ?? state;
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

  getAnalysis(gameId: string, userId: string) {
    return this.games.getAnalysis(gameId, userId);
  }

  getNarration(gameId: string, userId: string) {
    return this.games.getNarration(gameId, userId);
  }

  getLiveNarration(gameId: string, userId: string, input: LiveNarrationRequest) {
    return this.games.getLiveNarration(gameId, userId, input);
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
    const results = await this.commitMoveSequence(gameId, userId, input);
    const player = results[0]!;
    const latest = results.at(-1)!;
    return { move: player.move, state: latest.state };
  }

  async commitMoveSequence(gameId: string, userId: string, input: SubmitMoveInput) {
    try {
      const result = await this.games.commitMove(gameId, userId, input);
      if (result.state.status === 'finished') await this.ratings.processFinishedGame(gameId);
      const bot = await this.commitBotMoveIfNeeded(gameId);
      return bot ? [result, bot] : [result];
    } catch (error) {
      await this.ratings.processFinishedGame(gameId);
      throw error;
    }
  }

  async commitPlayerMove(gameId: string, userId: string, input: SubmitMoveInput) {
    try {
      const result = await this.games.commitMove(gameId, userId, input);
      if (result.state.status === 'finished') await this.ratings.processFinishedGame(gameId);
      return result;
    } catch (error) {
      await this.ratings.processFinishedGame(gameId);
      throw error;
    }
  }

  async commitBotMoveIfNeeded(gameId: string) {
    const turn = await this.games.botTurn(gameId);
    if (!turn) return null;
    const uci = await selectBotMoveWithEngine(turn.currentFen, turn.targetRating);
    const result = await this.games.commitMove(gameId, turn.botUserId, {
      clientMoveId: randomUUID(),
      expectedVersion: turn.version,
      uci,
    });
    if (result.state.status === 'finished') await this.ratings.processFinishedGame(gameId);
    return result;
  }
}
