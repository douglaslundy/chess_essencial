import type {
  CreateBotGameInput,
  CourseDetail,
  CourseSummary,
  LeaderboardEntry,
  LessonVersion,
  SaveLessonInput,
  DrawOfferAction,
  ExerciseAttemptResult,
  ExerciseHint,
  ExerciseMetrics,
  ExerciseSearchResult,
  ExerciseSolution,
  ExerciseTrainingView,
  StartExerciseTrainingInput,
  SubmitExerciseAttemptInput,
  GameHistoryPage,
  GameMove,
  GameState,
  LessonActionInput,
  LessonAttemptView,
  JoinQueueInput,
  LoginInput,
  PublicUser,
  QueueStatus,
  RatingPool,
  RatingProfile,
  RegisterInput,
  ResendVerificationInput,
  ReviewAnnotation,
  ReviewAnnotationInput,
  TokenPair,
  UpdateMeInput,
} from '@xadrez/contracts';

import type { components } from './openapi';
import { webEnv } from '@/env';

export type OpenApiGameState = components['schemas']['GameState'];
export type OpenApiGameMove = components['schemas']['GameMove'];

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

const sessionKeys = [
  'xadrez.access_token',
  'xadrez.refresh_token',
  'xadrez.user_id',
  'xadrez.username',
] as const;

export function clearStoredSession() {
  if (typeof window === 'undefined') return;
  for (const key of sessionKeys) window.localStorage.removeItem(key);
  window.dispatchEvent(new Event('xadrez-auth'));
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshStoredSession(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = window.localStorage.getItem('xadrez.refresh_token');
    if (!refreshToken) return null;
    try {
      const response = await fetch(webEnv.NEXT_PUBLIC_API_URL + '/auth/refresh', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        clearStoredSession();
        return null;
      }
      const tokens = (await response.json()) as TokenPair;
      window.localStorage.setItem('xadrez.access_token', tokens.accessToken);
      window.localStorage.setItem('xadrez.refresh_token', tokens.refreshToken);
      return tokens.accessToken;
    } catch {
      clearStoredSession();
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

function fetchApi(path: string, token?: string, init?: RequestInit) {
  return fetch(webEnv.NEXT_PUBLIC_API_URL + path, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...authHeaders(token),
      ...init?.headers,
    },
  });
}

async function responseWithRefresh(path: string, token?: string, init?: RequestInit) {
  const isStoredAccessToken =
    typeof window !== 'undefined' &&
    Boolean(token) &&
    token === window.localStorage.getItem('xadrez.access_token');
  let response = await fetchApi(path, token, init);

  if (response.status === 401 && isStoredAccessToken) {
    const refreshedToken = await refreshStoredSession();
    if (refreshedToken) response = await fetchApi(path, refreshedToken, init);
  }
  return response;
}

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await responseWithRefresh(path, token, init);
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
  const response = await responseWithRefresh(path, token, {
    headers: { Accept: 'application/x-chess-pgn' },
  });
  if (!response.ok) throw new ApiProblem(response.status, 'Não foi possível exportar o PGN.');
  return response.text();
}
export const api = {
  register: (input: RegisterInput) =>
    request<{ user: PublicUser; verificationToken?: string }>('/auth/register', undefined, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  resendVerification: (input: ResendVerificationInput) =>
    request<void>('/auth/resend-verification', undefined, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  verifyEmail: (token: string) =>
    request<{ user: PublicUser }>('/auth/verify', undefined, {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  login: (input: LoginInput) =>
    request<{ tokens: TokenPair; user: PublicUser }>('/auth/login', undefined, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  refresh: (refreshToken: string) =>
    request<TokenPair>('/auth/refresh', undefined, {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  logout: (refreshToken: string) =>
    request<void>('/auth/logout', undefined, {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  getMe: (token: string) => request<PublicUser>('/me', token),
  updateMe: (input: UpdateMeInput, token: string) =>
    request<PublicUser>('/me', token, { method: 'PATCH', body: JSON.stringify(input) }),
  getLeaderboard: (pool: RatingPool, token: string) =>
    request<LeaderboardEntry[]>(`/ratings/${pool}/leaderboard?limit=100`, token),
  getRatings: (token: string) => request<RatingProfile[]>('/ratings/me', token),
  listCourses: () => request<CourseSummary[]>('/courses'),
  getCourse: (slug: string) => request<CourseDetail>(`/courses/${encodeURIComponent(slug)}`),
  startLessonAttempt: (lessonId: string, token: string) =>
    request<LessonAttemptView>('/lesson-attempts', token, {
      method: 'POST',
      body: JSON.stringify({ lessonId }),
    }),
  getLessonAttempt: (attemptId: string, token: string) =>
    request<LessonAttemptView>(`/lesson-attempts/${attemptId}`, token),
  submitLessonAction: (attemptId: string, input: LessonActionInput, token: string) =>
    request<LessonAttemptView>(`/lesson-attempts/${attemptId}/actions`, token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getCourseEditor: (courseId: string, token: string) =>
    request<CourseDetail>(`/courses/${courseId}/editor`, token),
  saveCourseLesson: (courseId: string, slug: string, input: SaveLessonInput, token: string) =>
    request<LessonVersion>(`/courses/${courseId}/lessons/${slug}`, token, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  publishCourse: (courseId: string, token: string) =>
    request(`/courses/${courseId}/publish`, token, { method: 'POST' }),
  searchExercises: (query: URLSearchParams, token: string) =>
    request<ExerciseSearchResult>(`/exercises?${query.toString()}`, token),
  startExerciseTraining: (input: StartExerciseTrainingInput, token: string) =>
    request<ExerciseTrainingView>('/exercise-training-sessions', token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getExerciseTraining: (sessionId: string, token: string) =>
    request<ExerciseTrainingView>(`/exercise-training-sessions/${sessionId}`, token),
  revealExerciseHint: (sessionId: string, token: string) =>
    request<ExerciseHint>(`/exercise-training-sessions/${sessionId}/hints`, token, {
      method: 'POST',
    }),
  revealExerciseSolution: (sessionId: string, token: string) =>
    request<ExerciseSolution>(`/exercise-training-sessions/${sessionId}/solution`, token, {
      method: 'POST',
    }),
  submitExerciseAttempt: (exerciseId: string, input: SubmitExerciseAttemptInput, token: string) =>
    request<ExerciseAttemptResult>(`/exercises/${exerciseId}/attempts`, token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getExerciseMetrics: (token: string) => request<ExerciseMetrics>('/exercise-metrics', token),
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
  joinQueue: (input: JoinQueueInput, token: string) =>
    request<QueueStatus>('/matchmaking/queues', token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  createBotGame: (input: CreateBotGameInput, token: string) =>
    request<GameState>('/matchmaking/bot-games', token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  leaveQueue: (token: string) => request<void>('/matchmaking/queues', token, { method: 'DELETE' }),
  resign: (gameId: string, token: string) =>
    request<GameState>(`/games/${gameId}/resign`, token, { method: 'POST' }),
  offerDraw: (gameId: string, token: string) =>
    request<DrawOfferAction>(`/games/${gameId}/draw-offers`, token, { method: 'POST' }),
};
