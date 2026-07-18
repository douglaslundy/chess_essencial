import type { UpdateMeInput } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';
import { and, eq, isNull, or } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service.js';
import {
  userProfiles,
  userSessions,
  users,
  type UserProfileRow,
  type UserRow,
  type UserSessionRow,
} from '../database/schema.js';

export type IdentityUser = UserRow & { profile: UserProfileRow };

export interface NewIdentityUser {
  email: string;
  username: string;
  passwordHash: string;
  displayName: string;
}

export interface NewSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  userAgent: string | null;
  ipHash: string | null;
  expiresAt: Date;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  async createUser(input: NewIdentityUser): Promise<IdentityUser> {
    return this.database.db.transaction(async (transaction) => {
      const [user] = await transaction
        .insert(users)
        .values({
          email: input.email,
          passwordHash: input.passwordHash,
          username: input.username,
        })
        .returning();

      if (!user) {
        throw new Error('Failed to create user');
      }

      const [profile] = await transaction
        .insert(userProfiles)
        .values({
          displayName: input.displayName,
          userId: user.id,
        })
        .returning();

      if (!profile) {
        throw new Error('Failed to create user profile');
      }

      return { ...user, profile };
    });
  }

  async activateUser(userId: string): Promise<IdentityUser | null> {
    const [user] = await this.database.db
      .update(users)
      .set({
        emailVerifiedAt: new Date(),
        status: 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, userId), eq(users.status, 'pending')))
      .returning();

    if (!user) {
      return this.findById(userId);
    }

    const profile = await this.findProfile(user.id);
    return profile ? { ...user, profile } : null;
  }

  async findByIdentifier(identifier: string): Promise<IdentityUser | null> {
    const [row] = await this.database.db
      .select({ profile: userProfiles, user: users })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(or(eq(users.email, identifier), eq(users.username, identifier)))
      .limit(1);

    return row ? { ...row.user, profile: row.profile } : null;
  }

  async findById(userId: string): Promise<IdentityUser | null> {
    const [row] = await this.database.db
      .select({ profile: userProfiles, user: users })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);

    return row ? { ...row.user, profile: row.profile } : null;
  }

  async updateProfile(userId: string, input: UpdateMeInput): Promise<IdentityUser | null> {
    const [profile] = await this.database.db
      .update(userProfiles)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId))
      .returning();

    if (!profile) {
      return null;
    }

    const [user] = await this.database.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user ? { ...user, profile } : null;
  }

  async createSession(input: NewSession): Promise<UserSessionRow> {
    const [session] = await this.database.db
      .insert(userSessions)
      .values({
        ...input,
      })
      .returning();

    if (!session) {
      throw new Error('Failed to create session');
    }

    return session;
  }

  async findSession(sessionId: string): Promise<UserSessionRow | null> {
    const [session] = await this.database.db
      .select()
      .from(userSessions)
      .where(eq(userSessions.id, sessionId))
      .limit(1);

    return session ?? null;
  }

  async rotateSession(sessionId: string, previousHash: string, nextHash: string, expiresAt: Date) {
    const [session] = await this.database.db
      .update(userSessions)
      .set({
        expiresAt,
        refreshTokenHash: nextHash,
      })
      .where(
        and(
          eq(userSessions.id, sessionId),
          eq(userSessions.refreshTokenHash, previousHash),
          isNull(userSessions.revokedAt),
        ),
      )
      .returning();

    return session ?? null;
  }

  async resetPassword(userId: string, currentPasswordHash: string, nextPasswordHash: string) {
    return this.database.db.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(users)
        .set({ passwordHash: nextPasswordHash, updatedAt: new Date() })
        .where(and(eq(users.id, userId), eq(users.passwordHash, currentPasswordHash)))
        .returning({ id: users.id });
      if (!updated) return false;

      await transaction
        .update(userSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)));
      return true;
    });
  }

  async revokeSession(sessionId: string) {
    await this.database.db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(userSessions.id, sessionId), isNull(userSessions.revokedAt)));
  }

  private async findProfile(userId: string) {
    const [profile] = await this.database.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    return profile ?? null;
  }
}
