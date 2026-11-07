import type {
  GameStudyPlan,
  PlayerMetrics,
  RatingHistoryEntry,
  ClassroomDetail,
  ClassroomLive,
  ClassroomSummary,
  ChatgptOAuthStartInput,
  ChatgptOAuthStartResult,
  CourseTrailProgress,
  LibraryFacets,
  LibraryGame,
  LibraryReview,
  LibrarySearchResult,
  AiVoiceOptions,
  SynthesizeSpeechInput,
  AdminBotStats,
  AdminMetrics,
  AdminOnlineBot,
  AdminUser,
  AdminUserList,
  ModerateReportInput,
  ModerationReportDetail,
  ModerationReportList,
  AiProvider,
  AiProviderKey,
  AiProviderModelList,
  AiProviderTestResult,
  AssistedGameSettings,
  ListAiProviderModelsInput,
  UpdateAdminUserInput,
  UpdateAdminUserStatusInput,
  UpdateAiProviderActiveInput,
  UpdateAiProviderKeyInput,
  CreateBotGameInput,
  CreateChallengeInput,
  DirectChallengesView,
  CourseDetail,
  CourseProgress,
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
  ExerciseSummary,
  ExerciseTheme,
  ExerciseTrainingView,
  CompleteLearningStageResult,
  LearningBadge,
  LearningLevelDetail,
  LearningMap,
  LearningProgress,
  StartLearningStageResult,
  StartExerciseTrainingInput,
  SubmitExerciseAttemptInput,
  GameAnalysis,
  GameNarration,
  GameHistoryPage,
  GameMove,
  GameState,
  LiveNarrationRequest,
  LiveNarrationResult,
  LessonActionInput,
  LessonAttemptView,
  LessonOverview,
  JoinQueueInput,
  LoginInput,
  MercadoPagoConnectionTestResult,
  MercadoPagoSettings,
  MyReferralInfo,
  ReferralSettings,
  CheckoutResult,
  CreateCheckoutInput,
  SaveSubscriptionPlanInput,
  SubscriptionPaymentList,
  SubscriptionPlan,
  SubscriptionPlanList,
  UpdateReferralSettingsInput,
  UpdateSubscriptionPlanStatusInput,
  UserSubscription,
  PublicUser,
  QueueStatus,
  RatingPool,
  RatingProfile,
  RegisterInput,
  ResendVerificationInput,
  ReviewAnnotation,
  ReviewAnnotationInput,
  SendMessageInput,
  SendTestEmailInput,
  SmtpSettings,
  TokenPair,
  UpdateAssistedGameSettingsInput,
  UpdateMercadoPagoSettingsInput,
  UpdateSmtpSettingsInput,
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

const WEB_SESSION_MARKER = 'cookie-session-v1';
let memoryAccessToken: string | null = null;

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

function authHeaders(token?: string): HeadersInit {
  const accessToken = token === WEB_SESSION_MARKER ? memoryAccessToken : token;
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

const sessionKeys = [
  'xadrez.access_token',
  'xadrez.refresh_token',
  'xadrez.user_id',
  'xadrez.username',
] as const;

export function clearStoredSession() {
  memoryAccessToken = null;
  if (typeof window === 'undefined') return;
  for (const key of sessionKeys) window.localStorage.removeItem(key);
  window.dispatchEvent(new Event('xadrez-auth'));
}

export function establishWebSession(tokens: TokenPair, user: PublicUser) {
  if (typeof window === 'undefined') return;
  memoryAccessToken = tokens.accessToken;
  window.localStorage.setItem('xadrez.access_token', WEB_SESSION_MARKER);
  window.localStorage.removeItem('xadrez.refresh_token');
  window.localStorage.setItem('xadrez.user_id', user.id);
  window.localStorage.setItem('xadrez.username', user.username);
  window.dispatchEvent(new Event('xadrez-auth'));
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshStoredSession(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const marker = window.localStorage.getItem('xadrez.access_token');
    const legacyRefreshToken = window.localStorage.getItem('xadrez.refresh_token');
    if (!marker && !legacyRefreshToken) return null;
    try {
      const response = await fetch(webEnv.NEXT_PUBLIC_API_URL + '/auth/refresh', {
        body: JSON.stringify(legacyRefreshToken ? { refreshToken: legacyRefreshToken } : {}),
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Xadrez-Client': 'web',
          'X-Xadrez-CSRF': '1',
        },
        method: 'POST',
      });
      if (!response.ok) {
        clearStoredSession();
        return null;
      }
      const tokens = (await response.json()) as TokenPair;
      memoryAccessToken = tokens.accessToken;
      window.localStorage.setItem('xadrez.access_token', WEB_SESSION_MARKER);
      window.localStorage.removeItem('xadrez.refresh_token');
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

export function getStoredUserId() {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem('xadrez.user_id');
  if (stored) return stored;
  const token = window.localStorage.getItem('xadrez.access_token');
  const userId = token && token !== WEB_SESSION_MARKER ? accessTokenPayload(token)?.sub : null;
  if (typeof userId !== 'string') return null;
  window.localStorage.setItem('xadrez.user_id', userId);
  return userId;
}

export async function getRealtimeAccessToken(forceRefresh = false): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem('xadrez.access_token');
  if (!stored) return null;
  const token = stored === WEB_SESSION_MARKER ? memoryAccessToken : stored;
  if (!forceRefresh && token && !accessTokenExpiresSoon(token)) return token;
  return refreshStoredSession();
}

function fetchApi(path: string, token?: string, init?: RequestInit) {
  return fetch(webEnv.NEXT_PUBLIC_API_URL + path, {
    ...init,
    credentials: 'include',
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

async function requestBlob(
  path: string,
  input: SynthesizeSpeechInput,
  token: string,
): Promise<Blob> {
  const response = await responseWithRefresh(path, token, {
    body: JSON.stringify(input),
    headers: { Accept: 'audio/mpeg' },
    method: 'POST',
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiProblem(
      response.status,
      problem?.detail ?? 'Não foi possível gerar a voz por IA.',
    );
  }
  return response.blob();
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
    request<{ emailSent: boolean; user: PublicUser; verificationToken?: string }>(
      '/auth/register',
      undefined,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
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
      headers: { 'X-Xadrez-Client': 'web' },
    }),
  refresh: (refreshToken?: string) =>
    request<TokenPair>('/auth/refresh', undefined, {
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      headers: { 'X-Xadrez-Client': 'web', 'X-Xadrez-CSRF': '1' },
      method: 'POST',
    }),
  logout: (refreshToken?: string) =>
    request<void>('/auth/logout', undefined, {
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      headers: { 'X-Xadrez-Client': 'web', 'X-Xadrez-CSRF': '1' },
      method: 'POST',
    }),
  getMe: (token: string) => request<PublicUser>('/me', token),
  listAiVoices: (token: string) => request<AiVoiceOptions>('/voice/options', token),
  generateAiSpeech: (input: SynthesizeSpeechInput, token: string) =>
    requestBlob('/voice/speech', input, token),
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
  getMyMetrics: (token: string) => request<PlayerMetrics>('/me/metrics', token),
  getMyRatingHistory: (token: string) =>
    request<RatingHistoryEntry[]>('/ratings/me/history', token),
  listCourses: () => request<CourseSummary[]>('/courses'),
  getCourse: (slug: string) => request<CourseDetail>(`/courses/${encodeURIComponent(slug)}`),
  getCourseProgress: (slug: string, token: string) =>
    request<CourseProgress>(`/courses/${encodeURIComponent(slug)}/progress`, token),
  getLesson: (lessonId: string, token: string) =>
    request<LessonOverview>(`/lessons/${lessonId}`, token),
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
  listChallengeThemes: (token: string) =>
    request<ExerciseTheme[]>('/exercises/challenge-themes', token),
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
  getExerciseById: (exerciseId: string, token: string) =>
    request<ExerciseSummary>(`/exercises/${exerciseId}`, token),
  getLearningMap: (token: string) => request<LearningMap>('/learning-path/map', token),
  getLearningLevel: (levelId: string, token: string) =>
    request<LearningLevelDetail>(`/learning-path/levels/${levelId}`, token),
  getLearningProgress: (token: string) =>
    request<LearningProgress>('/learning-path/progress', token),
  getLearningBadges: (token: string) => request<LearningBadge[]>('/learning-path/badges', token),
  startLearningStage: (stageId: string, token: string) =>
    request<StartLearningStageResult>(`/learning-path/stages/${stageId}/start`, token, {
      method: 'POST',
    }),
  completeLearningStage: (stageId: string, token: string) =>
    request<CompleteLearningStageResult>(`/learning-path/stages/${stageId}/complete`, token, {
      method: 'POST',
    }),
  adminListUsers: (query: URLSearchParams, token: string) =>
    request<AdminUserList>(`/admin/users?${query.toString()}`, token),
  adminUpdateUserStatus: (userId: string, input: UpdateAdminUserStatusInput, token: string) =>
    request<AdminUser>(`/admin/users/${userId}/status`, token, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  adminUpdateUser: (userId: string, input: UpdateAdminUserInput, token: string) =>
    request<AdminUser>(`/admin/users/${userId}`, token, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  adminGetBotStats: (token: string) => request<AdminBotStats>('/admin/bots/stats', token),
  adminListOnlineBots: (token: string) => request<AdminOnlineBot[]>('/admin/bots/online', token),
  adminGetMetrics: (token: string) => request<AdminMetrics>('/admin/metrics', token),
  adminListReports: (query: URLSearchParams, token: string) =>
    request<ModerationReportList>(`/admin/reports?${query.toString()}`, token),
  adminGetReport: (reportId: string, token: string) =>
    request<ModerationReportDetail>(`/admin/reports/${reportId}`, token),
  adminModerateReport: (reportId: string, input: ModerateReportInput, token: string) =>
    request<ModerationReportDetail>(`/admin/reports/${reportId}`, token, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  adminGetSmtpSettings: (token: string) => request<SmtpSettings>('/admin/settings/smtp', token),
  adminUpdateSmtpSettings: (input: UpdateSmtpSettingsInput, token: string) =>
    request<SmtpSettings>('/admin/settings/smtp', token, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  adminSendSmtpTestEmail: (input: SendTestEmailInput, token: string) =>
    request<{ sent: boolean }>('/admin/settings/smtp/test-email', token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  adminGetMercadoPagoSettings: (token: string) =>
    request<MercadoPagoSettings>('/admin/settings/mercado-pago', token),
  adminUpdateMercadoPagoSettings: (input: UpdateMercadoPagoSettingsInput, token: string) =>
    request<MercadoPagoSettings>('/admin/settings/mercado-pago', token, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  adminTestMercadoPagoConnection: (token: string) =>
    request<MercadoPagoConnectionTestResult>(
      '/admin/settings/mercado-pago/test-connection',
      token,
      {
        method: 'POST',
      },
    ),
  adminGetAssistedGameSettings: (token: string) =>
    request<AssistedGameSettings>('/admin/settings/assisted-game', token),
  adminUpdateAssistedGameSettings: (input: UpdateAssistedGameSettingsInput, token: string) =>
    request<AssistedGameSettings>('/admin/settings/assisted-game', token, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  getAssistedGameSettings: (token: string) =>
    request<AssistedGameSettings>('/settings/assisted-game', token),
  adminListAiProviders: (token: string) => request<AiProviderKey[]>('/admin/ai-providers', token),
  adminListAiProviderModels: (
    provider: AiProvider,
    input: ListAiProviderModelsInput,
    token: string,
  ) =>
    request<AiProviderModelList>(`/admin/ai-providers/${provider}/models`, token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  adminTestAiProviderKey: (provider: AiProvider, token: string) =>
    request<AiProviderTestResult>(`/admin/ai-providers/${provider}/test`, token, {
      method: 'POST',
    }),
  adminUpdateAiProviderKey: (
    provider: AiProvider,
    input: UpdateAiProviderKeyInput,
    token: string,
  ) =>
    request<AiProviderKey>(`/admin/ai-providers/${provider}`, token, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  adminStartChatgptOAuth: (input: ChatgptOAuthStartInput, token: string) =>
    request<ChatgptOAuthStartResult>('/admin/ai-providers/chatgpt/oauth/start', token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  adminDisconnectChatgpt: (token: string) =>
    request<void>('/admin/ai-providers/chatgpt/oauth', token, { method: 'DELETE' }),
  adminSetAiProviderActive: (
    provider: AiProvider,
    input: UpdateAiProviderActiveInput,
    token: string,
  ) =>
    request<AiProviderKey>(`/admin/ai-providers/${provider}/active`, token, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  listSubscriptionPlans: (token: string) =>
    request<SubscriptionPlanList>('/subscription-plans', token),
  getMySubscription: (token: string) => request<UserSubscription>('/me/subscription', token),
  getMySubscriptionPayments: (token: string) =>
    request<SubscriptionPaymentList>('/me/subscription/payments', token),
  createSubscriptionCheckout: (input: CreateCheckoutInput, token: string) =>
    request<CheckoutResult>('/me/subscription/checkout', token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getMyReferral: (token: string) => request<MyReferralInfo>('/me/referral', token),
  adminGetReferralSettings: (token: string) =>
    request<ReferralSettings>('/admin/referral-settings', token),
  adminUpdateReferralSettings: (input: UpdateReferralSettingsInput, token: string) =>
    request<ReferralSettings>('/admin/referral-settings', token, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  adminListSubscriptionPlans: (token: string) =>
    request<SubscriptionPlanList>('/admin/subscription-plans', token),
  adminCreateSubscriptionPlan: (input: SaveSubscriptionPlanInput, token: string) =>
    request<SubscriptionPlan>('/admin/subscription-plans', token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  adminUpdateSubscriptionPlan: (planId: string, input: SaveSubscriptionPlanInput, token: string) =>
    request<SubscriptionPlan>(`/admin/subscription-plans/${planId}`, token, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  adminUpdateSubscriptionPlanStatus: (
    planId: string,
    input: UpdateSubscriptionPlanStatusInput,
    token: string,
  ) =>
    request<SubscriptionPlan>(`/admin/subscription-plans/${planId}/status`, token, {
      method: 'PUT',
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
  getGameAnalysis: (gameId: string, token: string) =>
    request<GameAnalysis>(`/games/${gameId}/analysis`, token),
  getGameNarration: (gameId: string, token: string) =>
    request<GameNarration>(`/games/${gameId}/narration`, token),
  searchLibraryGames: (query: URLSearchParams, token: string) =>
    request<LibrarySearchResult>(`/library/games?${query.toString()}`, token),
  getLibraryFacets: (token: string) => request<LibraryFacets>('/library/facets', token),
  getLibraryGame: (gameId: string, token: string) =>
    request<LibraryGame>(`/library/games/${gameId}`, token),
  listClassrooms: (token: string) => request<ClassroomSummary[]>('/classrooms', token),
  createClassroom: (name: string, token: string) =>
    request<ClassroomSummary>('/classrooms', token, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  getClassroom: (classroomId: string, token: string) =>
    request<ClassroomDetail>(`/classrooms/${classroomId}`, token),
  deleteClassroom: (classroomId: string, token: string) =>
    request<void>(`/classrooms/${classroomId}`, token, { method: 'DELETE' }),
  addClassroomMember: (classroomId: string, identifier: string, token: string) =>
    request<void>(`/classrooms/${classroomId}/members`, token, {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    }),
  removeClassroomMember: (classroomId: string, userId: string, token: string) =>
    request<void>(`/classrooms/${classroomId}/members/${userId}`, token, { method: 'DELETE' }),
  getClassroomLive: (classroomId: string, token: string) =>
    request<ClassroomLive>(`/classrooms/${classroomId}/live`, token),
  publishClassroomLive: (classroomId: string, path: string, token: string) =>
    request<void>(`/classrooms/${classroomId}/live`, token, {
      method: 'PUT',
      body: JSON.stringify({ path }),
    }),
  getGameStudyPlan: (gameId: string, token: string) =>
    request<GameStudyPlan>(`/games/${gameId}/study-plan`, token),
  getCourseTrailProgress: (token: string) =>
    request<CourseTrailProgress>('/course-trail/progress', token),
  completeCourseTrailActivity: (activityId: string, token: string) =>
    request<CourseTrailProgress>(`/course-trail/progress/${activityId}`, token, { method: 'PUT' }),
  getLibraryReview: (gameId: string, token: string) =>
    request<LibraryReview>(`/library/games/${gameId}/review`, token),
  requestLibraryReview: (gameId: string, token: string) =>
    request<LibraryReview>(`/library/games/${gameId}/review`, token, { method: 'POST' }),
  shareGameToLibrary: (gameId: string, token: string) =>
    request<{ libraryGameId: string }>(`/library/share/${gameId}`, token, { method: 'POST' }),
  getLiveNarration: (gameId: string, input: LiveNarrationRequest, token: string) =>
    request<LiveNarrationResult>(`/games/${gameId}/live-narration`, token, {
      body: JSON.stringify(input),
      method: 'POST',
    }),
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
  createDirectChallenge: (input: CreateChallengeInput, token: string) =>
    request<{ expiresAt?: string; gameId?: string; id: string; status: 'accepted' | 'pending' }>(
      '/matchmaking/challenges',
      token,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  listDirectChallenges: (token: string) =>
    request<DirectChallengesView>('/matchmaking/challenges', token),
  respondDirectChallenge: (challengeId: string, accept: boolean, token: string) =>
    request<{ gameId?: string; id: string; status: 'accepted' | 'declined' }>(
      `/matchmaking/challenges/${challengeId}/respond`,
      token,
      { method: 'POST', body: JSON.stringify({ accept }) },
    ),
  cancelDirectChallenge: (challengeId: string, token: string) =>
    request<void>(`/matchmaking/challenges/${challengeId}`, token, { method: 'DELETE' }),
  leaveQueue: (token: string) => request<void>('/matchmaking/queues', token, { method: 'DELETE' }),
  resign: (gameId: string, token: string) =>
    request<GameState>(`/games/${gameId}/resign`, token, { method: 'POST' }),
  offerDraw: (gameId: string, token: string) =>
    request<DrawOfferAction>(`/games/${gameId}/draw-offers`, token, { method: 'POST' }),
};
