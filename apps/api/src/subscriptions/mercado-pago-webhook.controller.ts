import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { SubscriptionsService } from './subscriptions.service.js';

interface MercadoPagoNotificationBody {
  data?: { id?: string };
  type?: string;
}

// Public endpoint — Mercado Pago calls this directly with no user session,
// so it's authenticated by the x-signature HMAC instead of AccessTokenGuard.
// Not exercised against a real Mercado Pago webhook from this environment;
// validate with their webhook simulator once sandbox credentials are set.
@Controller('webhooks/mercado-pago')
export class MercadoPagoWebhookController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() request: FastifyRequest,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Query('data.id') dataIdQuery: string | undefined,
  ) {
    const body = request.body as MercadoPagoNotificationBody | undefined;
    const dataId = body?.data?.id ?? dataIdQuery;
    if (!dataId) return { received: true };

    const verified = await this.subscriptions.verifyWebhookSignature(signature, requestId, dataId);
    if (!verified) throw new UnauthorizedException('Assinatura inválida');

    await this.subscriptions.processMercadoPagoNotification(body?.type, dataId);
    return { received: true };
  }
}
