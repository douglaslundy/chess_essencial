import type {
  AdminUser,
  AdminUserList,
  UpdateAdminUserStatusInput,
  CreateBotGameInput,
  CourseDetail,
  CourseSummary,
  Conversation,
  DirectMessage,
  Friend,
  FriendRequest,
  FriendRequestsView,
  LeaderboardEntry,
  LessonVersion,
  CreatePostInput,
  Post,
  PublicProfile,
  SaveLessonInput,
  SendFriendRequestInput,
  DrawOfferAction,
  EvaluateExerciseLineInput,
  EvaluateExerciseLineResult,
  ExerciseAttemptResult,
  ExerciseHint,
  ExerciseMetrics,
  ExerciseSearchResult,
  ExerciseSolution,
  ExerciseStudyContext,
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
  SendMessageInput,
  TokenPair,
  UpdateMeInput,
  UploadAvatarInput,
  UploadPostPhotoInput,
  UploadPostPhotoResult,
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
      const userId = accessTokenPayload(tokens.accessToken)?.sub;
      if (typeof userId === 'string') window.localStorage.setItem('xadrez.user_id', userId);
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

function accessTokenPayload(token: string) {
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) return null;
  try {
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(window.atob(normalized)) as { exp?: unknown; sub?: unknown };
  } catch {
    return null;
  }
}

function accessTokenExpiresSoon(token: string) {
  const payload = accessTokenPayload(token);
  return typeof payload?.exp === 'number' && payload.exp * 1000 <= Date.now() + 30_000;
}

export function getStoredUserId() {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem('xadrez.user_id');
  if (stored) return stored;
  const token = window.localStorage.getItem('xadrez.access_token');
  const userId = token ? accessTokenPayload(token)?.sub : null;
  if (typeof userId !== 'string') return null;
  window.localStorage.setItem('xadrez.user_id', userId);
  return userId;
}

export async function getRealtimeAccessToken(forceRefresh = false): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const token = window.localStorage.getItem('xadrez.access_token');
  if (!token) return null;
  if (!forceRefresh && !accessTokenExpiresSoon(token)) return token;
  return refreshStoredSession();
}

function fetchApi(path: string, token?: string, init?: RequestInit) {
  return fetch(webEnv.NEXT_PUBLIC_API_URL + path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body === undefined || init.body === null
        ? {}
        : { 'Content-Type': 'application/json' }),
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
  uploadAvatar: (input: UploadAvatarInput, token: string) =>
    request<PublicUser>('/me/avatar', token, { method: 'POST', body: JSON.stringify(input) }),
  heartbeat: (token: string) => request<void>('/presence/heartbeat', token, { method: 'POST' }),
  listFriends: (token: string) => request<Friend[]>('/friends', token),
  listFriendRequests: (token: string) => request<FriendRequestsView>('/friends/requests', token),
  sendFriendRequest: (input: SendFriendRequestInput, token: string) =>
    request<FriendRequest>('/friends/requests', token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  acceptFriendRequest: (username: string, token: string) =>
    request<Friend>(`/friends/requests/${encodeURIComponent(username)}/accept`, token, {
      method: 'POST',
    }),
  declineFriendRequest: (username: string, token: string) =>
    request<void>(`/friends/requests/${encodeURIComponent(username)}/decline`, token, {
      method: 'POST',
    }),
  cancelFriendRequest: (username: string, token: string) =>
    request<void>(`/friends/requests/${encodeURIComponent(username)}`, token, {
      method: 'DELETE',
    }),
  removeFriend: (userId: string, token: string) =>
    request<void>(`/friends/${userId}`, token, { method: 'DELETE' }),
  getPublicProfile: (username: string, token: string) =>
    request<PublicProfile>(`/users/${encodeURIComponent(username)}`, token),
  listFeed: (token: string, before?: string) =>
    request<Post[]>(`/feed${before ? `?before=${encodeURIComponent(before)}` : ''}`, token),
  createPost: (input: CreatePostInput, token: string) =>
    request<Post>('/posts', token, { method: 'POST', body: JSON.stringify(input) }),
  uploadPostPhoto: (input: UploadPostPhotoInput, token: string) =>
    request<UploadPostPhotoResult>('/posts/photo', token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deletePost: (postId: string, token: string) =>
    request<void>(`/posts/${postId}`, token, { method: 'DELETE' }),
  likePost: (postId: string, token: string) =>
    request<Post>(`/posts/${postId}/like`, token, { method: 'POST' }),
  unlikePost: (postId: string, token: string) =>
    request<void>(`/posts/${postId}/like`, token, { method: 'DELETE' }),
  listConversations: (token: string) => request<Conversation[]>('/messages/conversations', token),
  listMessages: (friendUserId: string, token: string) =>
    request<DirectMessage[]>(`/messages/${friendUserId}`, token),
  sendMessage: (friendUserId: string, input: SendMessageInput, token: string) =>
    request<DirectMessage>(`/messages/${friendUserId}`, token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
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
  evaluateExerciseLine: (exerciseId: string, input: EvaluateExerciseLineInput, token: string) =>
    request<EvaluateExerciseLineResult>(`/exercises/${exerciseId}/evaluate-line`, token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getExerciseStudy: (exerciseId: string, token: string) =>
    request<ExerciseStudyContext>(`/exercises/${exerciseId}/study`, token),
  adminListUsers: (query: URLSearchParams, token: string) =>
    request<AdminUserList>(`/admin/users?${query.toString()}`, token),
  adminUpdateUserStatus: (userId: string, input: UpdateAdminUserStatusInput, token: string) =>
    request<AdminUser>(`/admin/users/${userId}/status`, token, {
      method: 'PATCH',
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
