import type { PublicUser, UpdateMeInput } from '@xadrez/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';

import { UsersRepository, type IdentityUser } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.toPublicUser(user);
  }

  async updateMe(userId: string, input: UpdateMeInput): Promise<PublicUser> {
    const user = await this.users.updateProfile(userId, input);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.toPublicUser(user);
  }

  private toPublicUser(user: IdentityUser): PublicUser {
    return {
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      id: user.id,
      profile: {
        avatarUrl: user.profile.avatarUrl,
        bio: user.profile.bio,
        birthYear: user.profile.birthYear,
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
