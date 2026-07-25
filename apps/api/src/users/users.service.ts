import type { PublicUser, UpdateMeInput, UploadAvatarInput } from '@xadrez/contracts';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { sanitizeUserText } from '../common/security/sanitize-user-text.js';
import { MAX_AVATAR_BYTES, StorageService } from '../storage/storage.service.js';
import { UsersRepository, type IdentityUser } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly storage: StorageService,
  ) {}

  async uploadAvatar(userId: string, input: UploadAvatarInput): Promise<PublicUser> {
    if (!this.storage.enabled) {
      throw new BadRequestException('Upload de avatar indisponível no momento.');
    }
    const data = Buffer.from(input.dataBase64, 'base64');
    if (data.byteLength === 0 || data.byteLength > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Imagem inválida ou muito grande (máx. 512 KB).');
    }
    let url: string;
    try {
      url = await this.storage.putAvatar(userId, input.contentType, data);
    } catch {
      throw new BadRequestException('Não foi possível salvar o avatar.');
    }
    const user = await this.users.updateProfile(userId, { avatarUrl: url });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.toPublicUser(user);
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.toPublicUser(user);
  }

  async updateMe(userId: string, input: UpdateMeInput): Promise<PublicUser> {
    const sanitized = {
      ...input,
      ...(input.displayName ? { displayName: sanitizeUserText(input.displayName) } : {}),
      ...(input.bio ? { bio: sanitizeUserText(input.bio) } : {}),
    };
    const user = await this.users.updateProfile(userId, sanitized);
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
        birthDate: user.profile.birthDate,
        boardTheme: user.profile.boardTheme,
        countryCode: user.profile.countryCode,
        displayName: user.profile.displayName,
        isProfilePublic: user.profile.isProfilePublic,
        locale: user.profile.locale,
        suggestMoveEnabled: user.profile.suggestMoveEnabled,
        timezone: user.profile.timezone,
      },
      status: user.status,
      username: user.username,
    };
  }
}
