import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Readable } from 'node:stream';

import { AdminGuard } from '../admin/admin.guard.js';
import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { BackupService } from './backup.service.js';

/** Typed by the admin in the confirmation dialog: a restore wipes every current record. */
export const RESTORE_CONFIRMATION = 'APAGAR-E-RESTAURAR';

@UseGuards(AccessTokenGuard, AdminGuard)
@Controller('admin/backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get()
  async download(@Req() request: AuthenticatedRequest, @Res() reply: FastifyReply) {
    const { filename, stream } = await this.backup.export(request.auth.userId);
    return reply
      .header('content-type', 'application/gzip')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .header('cache-control', 'no-store')
      .send(stream);
  }

  /** Body: the raw .xebak file (application/octet-stream), streamed straight into the restore. */
  @Post('restore')
  restore(
    @Req() request: AuthenticatedRequest,
    @Headers('x-confirm-restore') confirmation: string | undefined,
  ) {
    if (confirmation !== RESTORE_CONFIRMATION) {
      throw new BadRequestException(
        `Confirme a restauração digitando ${RESTORE_CONFIRMATION}: ela apaga todos os dados atuais.`,
      );
    }
    const body = request.body as Readable | undefined;
    if (!body || typeof (body as Readable).pipe !== 'function') {
      throw new BadRequestException('Envie o arquivo .xebak como application/octet-stream.');
    }
    return this.backup.restore(body, request.auth.userId);
  }
}
