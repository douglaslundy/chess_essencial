import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/access-token.guard.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth?.userId;
    if (!userId) throw new ForbiddenException('Autenticação obrigatória');
    const [role] = await this.database.client<{ allowed: boolean }[]>`
      SELECT true AS allowed FROM user_roles WHERE user_id = ${userId} AND role = 'admin'
    `;
    if (!role) throw new ForbiddenException('Permissão de administrador obrigatória');
    return true;
  }
}
