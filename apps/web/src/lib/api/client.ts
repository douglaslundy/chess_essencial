import type {
  CourseDetail,
  LessonVersion,
  SaveLessonInput,
  DrawOfferAction,
  GameHistoryPage,
  GameMove,
  GameState,
  ReviewAnnotation,
  ReviewAnnotationInput,
} from '@xadrez/contracts';

import type { components } from './openapi';
import { webEnv } from '@/env';

export type OpenApiGameState = components['schemas']['GameState'];
export type OpenApiGameMove = components['schemas']['GameMove'];
export type TimeControl = 'bullet_1_0' | 'blitz_3_0' | 'blitz_3_2' | 'rapid_10_0' | 'rapid_15_10';

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${webEnv.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...authHeaders(token),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiProblem(
      response.status,
      problem?.detail ?? 'Não foi possível concluir a operação.',
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function requestText(path: string, token: string): Promise<string> {
  const response = await fetch(`${webEnv.NEXT_PUBLIC_API_URL}${path}`, {
    headers: { Accept: 'application/x-chess-pgn', ...authHeaders(token) },
  });
  if (!response.ok) throw new ApiProblem(response.status, 'Não foi possível exportar o PGN.');
  return response.text();
}
export const api = {
  getCourseEditor: (courseId: string, token: string) =>
    request<CourseDetail>(`/courses/${courseId}/editor`, token),
  saveCourseLesson: (courseId: string, slug: string, input: SaveLessonInput, token: string) =>
    request<LessonVersion>(`/courses/${courseId}/lessons/${slug}`, token, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  publishCourse: (courseId: string, token: string) =>
    request(`/courses/${courseId}/publish`, token, { method: 'POST' }),
  getHistory: (query: URLSearchParams, token: string) =>
    request<GameHistoryPage>(`/games?${query.toString()}`, token),
  getPgn: (gameId: string, token: string) => requestText(`/games/${gameId}/pgn`, token),
  getReviewAnnotations: (gameId: string, token: string) =>
    request<ReviewAnnotation[]>(`/games/${gameId}/review-annotations`, token),
  saveReviewAnnotation: (gameId: string, input: ReviewAnnotationInput, token: string) =>
    request<ReviewAnnotation>(`/games/${gameId}/review-annotations`, token, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  getGame: (gameId: string, token: string) => request<GameState>(`/games/${gameId}`, token),
  getMoves: (gameId: string, token: string) => request<GameMove[]>(`/games/${gameId}/moves`, token),
  joinQueue: (timeControlCode: TimeControl, rated: boolean, token: string) =>
    request<{ status: string; gameId?: string }>('/matchmaking/queues', token, {
      method: 'POST',
      body: JSON.stringify({ timeControlCode, rated }),
    }),
  leaveQueue: (token: string) => request<void>('/matchmaking/queues', token, { method: 'DELETE' }),
  resign: (gameId: string, token: string) =>
    request<GameState>(`/games/${gameId}/resign`, token, { method: 'POST' }),
  offerDraw: (gameId: string, token: string) =>
    request<DrawOfferAction>(`/games/${gameId}/draw-offers`, token, { method: 'POST' }),
};
