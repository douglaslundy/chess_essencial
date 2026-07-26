import type {
  CreateBotGameInput,
  CreateChallengeInput,
  DirectChallengesView,
  DrawOfferAction,
  GameMove,
  GameState,
  JoinQueueInput,
  QueueStatus,
  SubmitMoveInput,
} from '@xadrez/contracts';

import { mobileEnv } from '@/lib/env';
import { getAccessToken } from '@/lib/api/session';

export class GameApiProblem extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(mobileEnv.EXPO_PUBLIC_API_URL + path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new GameApiProblem(
      response.status,
      problem?.detail ?? 'Não foi possível concluir a operação.',
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// Not cryptographically strong, but this id only needs to be unique enough
// for the server to de-duplicate a resubmitted move — no extra dependency
// needed just for that.
export function randomMoveId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export const gameApi = {
  createBotGame: (input: CreateBotGameInput) =>
    request<GameState>('/matchmaking/bot-games', { method: 'POST', body: JSON.stringify(input) }),
  getGame: (gameId: string) => request<GameState>(`/games/${gameId}`),
  getMoves: (gameId: string) => request<GameMove[]>(`/games/${gameId}/moves`),
  submitMove: (gameId: string, input: SubmitMoveInput) =>
    request<{ move: GameMove; state: GameState }>(`/games/${gameId}/moves`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  resign: (gameId: string) => request<GameState>(`/games/${gameId}/resign`, { method: 'POST' }),
  offerDraw: (gameId: string) =>
    request<DrawOfferAction>(`/games/${gameId}/draw-offers`, { method: 'POST' }),
  // "Entrar ou renovar presença na fila" per the API spec: intended to be
  // called repeatedly while queued — each call either renews the queue slot
  // or reports a match found in the meantime.
  joinQueue: (input: JoinQueueInput) =>
    request<QueueStatus>('/matchmaking/queues', { method: 'POST', body: JSON.stringify(input) }),
  leaveQueue: () => request<void>('/matchmaking/queues', { method: 'DELETE' }),
  listChallenges: () => request<DirectChallengesView>('/matchmaking/challenges'),
  createChallenge: (input: CreateChallengeInput) =>
    request<{ expiresAt?: string; gameId?: string; id: string; status: 'accepted' | 'pending' }>(
      '/matchmaking/challenges',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  respondChallenge: (challengeId: string, accept: boolean) =>
    request<{ gameId?: string; id: string; status: 'accepted' | 'declined' }>(
      `/matchmaking/challenges/${challengeId}/respond`,
      { method: 'POST', body: JSON.stringify({ accept }) },
    ),
  cancelChallenge: (challengeId: string) =>
    request<void>(`/matchmaking/challenges/${challengeId}`, { method: 'DELETE' }),
};
