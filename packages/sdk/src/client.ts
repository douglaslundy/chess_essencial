import type { components } from './generated/openapi.js';

export type ForgotPasswordInput = components['schemas']['ForgotPasswordInput'];
export type LoginInput = components['schemas']['LoginInput'];
export type LoginResponse = components['schemas']['LoginResponse'];
export type ProblemDetails = components['schemas']['ProblemDetails'];
export type RefreshInput = components['schemas']['RefreshInput'];
export type ResetPasswordInput = components['schemas']['ResetPasswordInput'];
export type TokenPair = components['schemas']['TokenPair'];

export interface ApiClientOptions {
  accessToken?: string;
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

export class ApiProblem extends Error {
  readonly detail: string | undefined;
  readonly status: number;
  readonly type: string | undefined;

  constructor(status: number, problem?: Partial<ProblemDetails>) {
    super(problem?.detail ?? problem?.title ?? 'API request failed with status ' + status);
    this.name = 'ApiProblem';
    this.detail = problem?.detail;
    this.status = status;
    this.type = problem?.type;
  }
}

export class XadrezApiClient {
  private accessToken: string | undefined;
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.accessToken = options.accessToken;
  }

  setAccessToken(accessToken?: string) {
    this.accessToken = accessToken;
  }

  login(input: LoginInput) {
    return this.request<LoginResponse>('/auth/login', {
      body: JSON.stringify(input),
      method: 'POST',
    });
  }

  refresh(input: RefreshInput) {
    return this.request<TokenPair>('/auth/refresh', {
      body: JSON.stringify(input),
      method: 'POST',
    });
  }

  async logout(input: RefreshInput) {
    await this.request<void>('/auth/logout', {
      body: JSON.stringify(input),
      method: 'POST',
    });
  }

  async forgotPassword(input: ForgotPasswordInput) {
    await this.request<void>('/auth/password/forgot', {
      body: JSON.stringify(input),
      method: 'POST',
    });
  }

  async resetPassword(input: ResetPasswordInput) {
    await this.request<void>('/auth/password/reset', {
      body: JSON.stringify(input),
      method: 'POST',
    });
  }

  get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' }, true);
  }

  post<T>(path: string, body?: unknown) {
    const init: RequestInit = { method: 'POST' };
    if (body !== undefined) init.body = JSON.stringify(body);
    return this.request<T>(path, init, true);
  }

  private async request<T>(path: string, init: RequestInit, authenticated = false): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    if (authenticated && this.accessToken)
      headers.set('authorization', 'Bearer ' + this.accessToken);
    const response = await this.fetcher(this.baseUrl + path, { ...init, headers });
    if (!response.ok) {
      let problem: Partial<ProblemDetails> | undefined;
      try {
        problem = (await response.json()) as Partial<ProblemDetails>;
      } catch {
        problem = undefined;
      }
      throw new ApiProblem(response.status, problem);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
