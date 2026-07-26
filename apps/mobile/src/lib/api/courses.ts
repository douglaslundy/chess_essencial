import type {
  CourseDetail,
  CourseSummary,
  LessonActionInput,
  LessonAttemptView,
  LessonOverview,
} from '@xadrez/contracts';

import { mobileEnv } from '@/lib/env';
import { getAccessToken } from '@/lib/api/session';
import { ApiProblem } from '@/lib/api/client';

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Deliberately simple: no 401-refresh-retry here (unlike client.ts's
// responseWithRefresh) — this is read-only course/lesson browsing, so a
// stale token just surfaces as an error message rather than silently
// retrying. Worth consolidating with client.ts's request() later.
async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(mobileEnv.EXPO_PUBLIC_API_URL + path, {
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

export const coursesApi = {
  listCourses: () => request<CourseSummary[]>('/courses'),
  getCourse: (slug: string) => request<CourseDetail>(`/courses/${encodeURIComponent(slug)}`),
  getLesson: async (lessonId: string) => {
    const token = await getAccessToken();
    return request<LessonOverview>(`/lessons/${lessonId}`, token ?? undefined);
  },
  startLessonAttempt: async (lessonId: string) => {
    const token = await getAccessToken();
    return request<LessonAttemptView>('/lesson-attempts', token ?? undefined, {
      method: 'POST',
      body: JSON.stringify({ lessonId }),
    });
  },
  submitLessonAction: async (attemptId: string, input: LessonActionInput) => {
    const token = await getAccessToken();
    return request<LessonAttemptView>(`/lesson-attempts/${attemptId}/actions`, token ?? undefined, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
