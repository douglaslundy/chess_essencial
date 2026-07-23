import { ConfigService } from '@nestjs/config';
import { verify as verifyArgon } from 'argon2';
import { beforeEach, describe, expect, it } from 'vitest';

import type { UserSessionRow } from '../database/schema.js';
import type {
  IdentityUser,
  NewIdentityUser,
  NewSession,
  UsersRepository,
} from '../users/users.repository.js';
import { AuthService } from './auth.service.js';
import type { VerificationEmailService } from './verification-email.service.js';

class FakeUsersRepository {
  user: IdentityUser | null = null;
  session: UserSessionRow | null = null;
  lastPasswordHash = '';
  revoked = false;

  async findByIdentifier(identifier: string) {
    if (!this.user) return null;
    return this.user.email === identifier || this.user.username === identifier ? this.user : null;
  }

  async createUser(input: NewIdentityUser) {
    this.lastPasswordHash = input.passwordHash;
    const now = new Date();
    this.user = {
      createdAt: now,
      email: input.email,
      emailVerifiedAt: null,
      id: '018f47f4-7b2f-4d90-8a66-9abcdef01234',
      passwordHash: input.passwordHash,
      profile: {
        allowChallenges: true,
        allowFriendRequests: true,
        avatarUrl: null,
        bio: null,
        birthDate: null,
        boardTheme: 'classic',
        countryCode: null,
        createdAt: now,
        displayName: input.displayName,
        isProfilePublic: true,
        locale: 'pt-BR',
        timezone: 'UTC',
        updatedAt: now,
        userId: '018f47f4-7b2f-4d90-8a66-9abcdef01234',
      },
      status: 'pending',
      updatedAt: now,
      username: input.username,
    };
    return this.user;
  }

  async activateUser() {
    if (!this.user) return null;
    this.user = { ...this.user, emailVerifiedAt: new Date(), status: 'active' };
    return this.user;
  }

  async createSession(input: NewSession) {
    const now = new Date();
    this.session = { ...input, createdAt: now, revokedAt: null };
    return this.session;
  }

  async findSession(id: string) {
    return this.session?.id === id ? this.session : null;
  }

  async findById(id: string) {
    return this.user?.id === id ? this.user : null;
  }

  async rotateSession(id: string, previousHash: string, nextHash: string, expiresAt: Date) {
    if (
      !this.session ||
      this.session.id !== id ||
      this.session.refreshTokenHash !== previousHash ||
      this.session.revokedAt
    ) {
      return null;
    }
    this.session = { ...this.session, expiresAt, refreshTokenHash: nextHash };
    return this.session;
  }

  async resetPassword(userId: string, currentPasswordHash: string, nextPasswordHash: string) {
    if (!this.user || this.user.id !== userId || this.user.passwordHash !== currentPasswordHash) {
      return false;
    }
    this.lastPasswordHash = nextPasswordHash;
    this.user = { ...this.user, passwordHash: nextPasswordHash, updatedAt: new Date() };
    if (this.session && !this.session.revokedAt) {
      this.revoked = true;
      this.session = { ...this.session, revokedAt: new Date() };
    }
    return true;
  }
  async revokeSession(id: string) {
    if (this.session?.id === id && !this.session.revokedAt) {
      this.revoked = true;
      this.session = { ...this.session, revokedAt: new Date() };
    }
  }
}

const config = new ConfigService({
  AUTH_ACCESS_SECRET: 'test-access-secret-with-at-least-32-characters',
  AUTH_ACCESS_TTL_SECONDS: 900,
  AUTH_EXPOSE_VERIFICATION_TOKEN: true,
  AUTH_IP_HASH_SECRET: 'test-ip-hash-secret-with-at-least-32-chars',
  AUTH_PASSWORD_RESET_TTL_SECONDS: 1_800,
  AUTH_REFRESH_SECRET: 'test-refresh-secret-with-at-least-32-characters',
  AUTH_REFRESH_TTL_SECONDS: 86_400,
  AUTH_VERIFICATION_SECRET: 'test-verification-secret-at-least-32-characters',
  AUTH_VERIFICATION_TTL_SECONDS: 3_600,
});

const noopEmailService = {
  send: async () => undefined,
  sendPasswordReset: async () => undefined,
} as unknown as VerificationEmailService;

describe('AuthService security', () => {
  let repository: FakeUsersRepository;
  let service: AuthService;

  beforeEach(() => {
    repository = new FakeUsersRepository();
    service = new AuthService(config, repository as unknown as UsersRepository, noopEmailService);
  });

  it('hashes password with Argon2id and completes local verification', async () => {
    const registered = await service.register({
      displayName: 'Jogador Teste',
      email: 'PLAYER@example.com',
      password: 'correct horse battery staple',
      username: 'player_test',
    });

    expect(repository.lastPasswordHash).toMatch(/^\$argon2id\$/);
    await expect(
      verifyArgon(repository.lastPasswordHash, 'correct horse battery staple'),
    ).resolves.toBe(true);
    expect(registered).toHaveProperty('verificationToken');

    const verified = await service.verifyEmail({
      token: (registered as { verificationToken: string }).verificationToken,
    });
    expect(verified.user.status).toBe('active');
    expect(verified.user.email).toBe('player@example.com');
  });

  it('stores only the refresh hash, rotates it and revokes on reuse', async () => {
    const registered = await service.register({
      displayName: 'Jogador Teste',
      email: 'player@example.com',
      password: 'correct horse battery staple',
      username: 'player_test',
    });
    await service.verifyEmail({
      token: (registered as { verificationToken: string }).verificationToken,
    });

    const login = await service.login(
      { identifier: 'player@example.com', password: 'correct horse battery staple' },
      { ip: '192.0.2.10', userAgent: 'vitest' },
    );
    const firstRefresh = login.tokens.refreshToken;

    expect(repository.session?.refreshTokenHash).not.toBe(firstRefresh);
    expect(repository.session?.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.session?.ipHash).toMatch(/^[a-f0-9]{64}$/);

    const rotated = await service.refresh(firstRefresh);
    expect(rotated.refreshToken).not.toBe(firstRefresh);
    await expect(service.refresh(firstRefresh)).rejects.toThrow('Reutilização');
    expect(repository.revoked).toBe(true);
  });

  it('resends verification only for pending accounts without revealing existence', async () => {
    await service.register({
      displayName: 'Jogador Teste',
      email: 'player@example.com',
      password: 'correct horse battery staple',
      username: 'player_test',
    });
    const sent: string[] = [];
    const capturingEmailService = {
      send: async (message: { email: string }) => {
        sent.push(message.email);
      },
    } as unknown as VerificationEmailService;
    const resendService = new AuthService(
      config,
      repository as unknown as UsersRepository,
      capturingEmailService,
    );

    await resendService.resendVerification({ email: 'PLAYER@example.com' });
    await resendService.resendVerification({ email: 'missing@example.com' });

    expect(sent).toEqual(['player@example.com']);
  });

  it('returns the same generic error for an unknown account', async () => {
    await expect(
      service.login(
        { identifier: 'missing@example.com', password: 'incorrect password' },
        { ip: null, userAgent: null },
      ),
    ).rejects.toThrow('Credenciais inválidas');
  });
});
