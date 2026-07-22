import type { AdminUserSearchQuery, UpdateAdminUserStatusInput } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { AdminRepository } from './admin.repository.js';

@Injectable()
export class AdminService {
  constructor(private readonly admin: AdminRepository) {}

  listUsers(query: AdminUserSearchQuery) {
    return this.admin.listUsers(query);
  }

  updateUserStatus(actingUserId: string, targetUserId: string, input: UpdateAdminUserStatusInput) {
    return this.admin.updateStatus(actingUserId, targetUserId, input);
  }
}
