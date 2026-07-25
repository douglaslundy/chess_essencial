import { createHash, createHmac, randomUUID } from 'node:crypto';

import type {
  ForgotPasswordInput,
  LoginInput,
  PublicUser,
  RegisterInput,
  ResetPasswordInput,
  ResendVerificationInput,
  TokenPair,
  VerifyEmailInput,
} from '@xadrez/contracts';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { argon2id, hash as argonHash, verify as argonVerify } from 'argon2';
import { SignJWT, errors as joseErrors, jwtVerify, type JWTPayload } from 'jose';

import { AuditService } from '../observability/audit.service.js';
import { ReferralsService } from '../referrals/referrals.service.js';
import { UsersRepository, type IdentityUser } from '../users/users.repository.js';
import { VerificationEmailService } from './verification-email.service.js';

const TOKEN_ISSUER = 'xadrez-essencial-api';
const ACCESS_AUDIENCE = 'xadrez-essencial-web';
const REFRESH_AUDIENCE = 'xadrez-essencial-refresh';
const VERIFY_AUDIENCE = 'xadrez-essencial-email-verification';
const PASSWORD_RESET_AUDIENCE = 'xadrez-essencial-password-reset';

export interface ClientMetadata {
  ip: string | null;
  userAgent: string | null;
}

export interface AuthenticatedUser {
  sessionId: string;
  userId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersRepository,
    private readonly verificationEmail: VerificationEmailService,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly referrals?: ReferralsService,
  ) {}

  async register(input: RegisterInput) {
    const email = input.email.toLowerCase();
    const username = input.username;

    if (
      (await this.users.findByIdentifier(email)) ||
      (await this.users.findByIdentifier(username))
    ) {
      throw new ConflictException('E-mail ou nome de usuário já cadastrado');
    }

    const passwordHash = await this.hashPassword(input.password);
    let user: IdentityUser;
    try {
      user = await this.users.createUser({
        displayName: input.displayName,
        email,
        passwordHash,
        username,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('E-mail ou nome de usuário já cadastrado');
      }
      throw error;
    }

    await this.audit?.record(user.id, 'user.registered', 'user', user.id);
    if (input.referralCode) await this.referrals?.attribute(input.referralCode, user.id);
    const verificationToken = await this.signVerificationToken(user.id);
    // The account row is already committed at this point — don't fail the
    // whole registration if only the verification email couldn't be sent
    // (e.g. SMTP not configured yet). The learner keeps a normal 'pending'
    // account and can retry via resendVerification once SMTP is fixed,
    // instead of getting an opaque 503 with no account to show for it.
    let emailSent = true;
    try {
      await this.verificationEmail.send({ email: user.email, token: verificationToken });
    } catch {
      emailSent = false;
      await this.audit?.record(user.id, 'user.verification_email_failed', 'user', user.id);
    }
    const exposeToken = this.config.get<boolean>('AUTH_EXPOSE_VERIFICATION_TOKEN', false);
    return {
      emailSent,
      user: this.toPublicUser(user),
      ...(exposeToken ? { verificationToken } : {}),
    };
  }

  async resendVerification(input: ResendVerificationInput) {
    const user = await this.users.findByIdentifier(input.email.toLowerCase());
    if (!user || user.status !== 'pending') return;

    const verificationToken = await this.signVerificationToken(user.id);
    await this.verificationEmail.send({ email: user.email, token: verificationToken });
    await this.audit?.record(user.id, 'user.verification_resent', 'user', user.id);
  }

  async forgotPassword(input: ForgotPasswordInput) {
    const user = await this.users.findByIdentifier(input.email.toLowerCase());
    if (!user || user.status !== 'active') return;

    const token = await this.signPasswordResetToken(user);
    await this.verificationEmail.sendPasswordReset({ email: user.email, token });
    await this.audit?.record(user.id, 'user.password_reset_requested', 'user', user.id);
  }

  async resetPassword(input: ResetPasswordInput) {
    const payload = await this.verifyToken(
      input.token,
      this.secret('AUTH_VERIFICATION_SECRET'),
      PASSWORD_RESET_AUDIENCE,
      'reset_password',
    );
    const user = await this.users.findById(this.subject(payload));
    if (
      !user ||
      user.status !== 'active' ||
      payload.passwordHash !== this.passwordFingerprint(user.passwordHash)
    ) {
      throw new UnauthorizedException('Invalid or already used password reset token');
    }

    const nextHash = await this.hashPassword(input.newPassword);
    const changed = await this.users.resetPassword(user.id, user.passwordHash, nextHash);
    if (!changed) throw new UnauthorizedException('Invalid or already used password reset token');
    await this.audit?.record(user.id, 'user.password_reset', 'user', user.id);
  }

  async verifyEmail(input: VerifyEmailInput) {
    const payload = await this.verifyToken(
      input.token,
      this.secret('AUTH_VERIFICATION_SECRET'),
      VERIFY_AUDIENCE,
      'verify_email',
    );
    const user = await this.users.activateUser(this.subject(payload));
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Token de verificação inválido');
    }
    await this.audit?.record(user.id, 'user.email_verified', 'user', user.id);
    await this.referrals?.rewardReferrerIfPending(user.id);
    return { user: this.toPublicUser(user) };
  }

  async login(input: LoginInput, metadata: ClientMetadata) {
    const user = await this.users.findByIdentifier(input.identifier);
    if (!user) {
      await this.hashPassword(input.password);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!(await argonVerify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    if (user.status === 'pending') {
      throw new ForbiddenException('Verifique o e-mail antes de entrar');
    }
    if (user.status !== 'active') {
      throw new ForbiddenException('Conta indisponível');
    }

    const sessionId = randomUUID();
    const expiresAt = this.refreshExpirationDate();
    const refreshToken = await this.signRefreshToken(user, sessionId);
    await this.users.createSession({
      expiresAt,
      id: sessionId,
      ipHash: metadata.ip ? this.hashIp(metadata.ip) : null,
      refreshTokenHash: this.hashRefreshToken(refreshToken),
      userAgent: metadata.userAgent,
      userId: user.id,
    });

    await this.audit?.record(user.id, 'session.created', 'user_session', sessionId);
    return {
      tokens: await this.tokenPair(user, sessionId, refreshToken),
      user: this.toPublicUser(user),
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verifyToken(
      refreshToken,
      this.secret('AUTH_REFRESH_SECRET'),
      REFRESH_AUDIENCE,
      'refresh',
    );
    const sessionId = this.sessionId(payload);
    const session = await this.users.findSession(sessionId);
    const presentedHash = this.hashRefreshToken(refreshToken);

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Sessão inválida');
    }
    if (session.refreshTokenHash !== presentedHash) {
      await this.users.revokeSession(sessionId);
      await this.audit?.record(
        session.userId,
        'session.refresh_reuse_detected',
        'user_session',
        sessionId,
      );
      throw new UnauthorizedException('Reutilização de refresh token detectada');
    }

    const user = await this.users.findById(this.subject(payload));
    if (!user || user.status !== 'active' || user.id !== session.userId) {
      await this.users.revokeSession(sessionId);
      throw new UnauthorizedException('Sessão inválida');
    }

    const nextRefreshToken = await this.signRefreshToken(user, sessionId);
    const expiresAt = this.refreshExpirationDate();
    const rotated = await this.users.rotateSession(
      sessionId,
      presentedHash,
      this.hashRefreshToken(nextRefreshToken),
      expiresAt,
    );
    if (!rotated) {
      await this.users.revokeSession(sessionId);
      throw new UnauthorizedException('Sessão já utilizada');
    }

    await this.audit?.record(user.id, 'session.refreshed', 'user_session', sessionId);
    return this.tokenPair(user, sessionId, nextRefreshToken);
  }

  async logout(refreshToken: string) {
    try {
      const payload = await this.verifyToken(
        refreshToken,
        this.secret('AUTH_REFRESH_SECRET'),
        REFRESH_AUDIENCE,
        'refresh',
      );
      const sessionId = this.sessionId(payload);
      await this.users.revokeSession(sessionId);
      await this.audit?.record(this.subject(payload), 'session.revoked', 'user_session', sessionId);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) {
        throw error;
      }
    }
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const payload = await this.verifyToken(
      token,
      this.secret('AUTH_ACCESS_SECRET'),
      ACCESS_AUDIENCE,
      'access',
    );
    return { sessionId: this.sessionId(payload), userId: this.subject(payload) };
  }

  private async tokenPair(
    user: IdentityUser,
    sessionId: string,
    refreshToken: string,
  ): Promise<TokenPair> {
    const accessExpiresIn = this.config.get<number>('AUTH_ACCESS_TTL_SECONDS', 900);
    const refreshExpiresIn = this.config.get<number>('AUTH_REFRESH_TTL_SECONDS', 2_592_000);
    const accessToken = await new SignJWT({
      scope: 'access',
      sid: sessionId,
      username: user.username,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(TOKEN_ISSUER)
      .setAudience(ACCESS_AUDIENCE)
      .setIssuedAt()
      .setJti(randomUUID())
      .setExpirationTime(`${accessExpiresIn}s`)
      .sign(this.secret('AUTH_ACCESS_SECRET'));

    return {
      accessToken,
      accessTokenExpiresIn: accessExpiresIn,
      refreshToken,
      refreshTokenExpiresIn: refreshExpiresIn,
    };
  }

  private async signRefreshToken(user: IdentityUser, sessionId: string) {
    const ttl = this.config.get<number>('AUTH_REFRESH_TTL_SECONDS', 2_592_000);
    return new SignJWT({ scope: 'refresh', sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(TOKEN_ISSUER)
      .setAudience(REFRESH_AUDIENCE)
      .setIssuedAt()
      .setJti(randomUUID())
      .setExpirationTime(`${ttl}s`)
      .sign(this.secret('AUTH_REFRESH_SECRET'));
  }

  private async signVerificationToken(userId: string) {
    const ttl = this.config.get<number>('AUTH_VERIFICATION_TTL_SECONDS', 86_400);
    return new SignJWT({ scope: 'verify_email' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(TOKEN_ISSUER)
      .setAudience(VERIFY_AUDIENCE)
      .setIssuedAt()
      .setJti(randomUUID())
      .setExpirationTime(`${ttl}s`)
      .sign(this.secret('AUTH_VERIFICATION_SECRET'));
  }

  private async signPasswordResetToken(user: IdentityUser) {
    const ttl = this.config.get<number>('AUTH_PASSWORD_RESET_TTL_SECONDS', 1_800);
    return new SignJWT({
      passwordHash: this.passwordFingerprint(user.passwordHash),
      scope: 'reset_password',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(TOKEN_ISSUER)
      .setAudience(PASSWORD_RESET_AUDIENCE)
      .setIssuedAt()
      .setJti(randomUUID())
      .setExpirationTime(`${ttl}s`)
      .sign(this.secret('AUTH_VERIFICATION_SECRET'));
  }
  private async verifyToken(token: string, secret: Uint8Array, audience: string, scope: string) {
    try {
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
        audience,
        issuer: TOKEN_ISSUER,
      });
      if (payload.scope !== scope) {
        throw new UnauthorizedException('Token inválido');
      }
      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      if (error instanceof joseErrors.JOSEError) {
        throw new UnauthorizedException('Token inválido ou expirado');
      }
      throw error;
    }
  }

  private subject(payload: JWTPayload) {
    if (!payload.sub) throw new UnauthorizedException('Token sem sujeito');
    return payload.sub;
  }

  private sessionId(payload: JWTPayload) {
    if (typeof payload.sid !== 'string') throw new UnauthorizedException('Token sem sessão');
    return payload.sid;
  }

  private secret(name: string) {
    return new TextEncoder().encode(this.config.getOrThrow<string>(name));
  }

  private refreshExpirationDate() {
    const ttl = this.config.get<number>('AUTH_REFRESH_TTL_SECONDS', 2_592_000);
    return new Date(Date.now() + ttl * 1_000);
  }

  private passwordFingerprint(passwordHash: string) {
    return createHash('sha256').update(passwordHash).digest('hex');
  }
  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashIp(ip: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('AUTH_IP_HASH_SECRET'))
      .update(ip)
      .digest('hex');
  }

  private hashPassword(password: string) {
    return argonHash(password, { memoryCost: 19_456, parallelism: 1, timeCost: 2, type: argon2id });
  }

  private isUniqueViolation(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505'
    );
  }

  private toPublicUser(user: IdentityUser): PublicUser {
    return {
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      id: user.id,
      profile: {
        avatarUrl: user.profile.avatarUrl,
        bio: user.profile.bio,
        birthDate: user.profile.birthDate,
        boardTheme: user.profile.boardTheme,
        countryCode: user.profile.countryCode,
        displayName: user.profile.displayName,
        isProfilePublic: user.profile.isProfilePublic,
        locale: user.profile.locale,
        timezone: user.profile.timezone,
      },
      status: user.status,
      username: user.username,
    };
  }
}
