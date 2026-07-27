import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/access-token.guard.js';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * Gates the "social" bucket (área 6): feed, friends, direct messages, and
 * the ranking leaderboard — treated as a single resource per explicit
 * product decision, not one gate per sub-feature. Applied per-route (not
 * per-controller) where a controller mixes social and non-social endpoints
 * (e.g. SocialController also has presence heartbeat and public profile
 * viewing, which stay ungated).
 */
@Injectable()
export class SocialAccessGuard implements CanActivate {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth?.userId;
    if (!userId) throw new ForbiddenException('Autenticação obrigatória');
    const entitlement = await this.subscriptions.checkEntitlement(userId, 'social_access');
    if (!entitlement.allowed) {
      throw new ForbiddenException(
        'A rede social não está disponível no seu plano atual. Assine um plano com esse recurso.',
      );
    }
    return true;
  }
}
