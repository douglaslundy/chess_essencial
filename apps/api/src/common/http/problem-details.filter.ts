import { STATUS_CODES } from 'node:http';

import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const reply = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const response = exception instanceof HttpException ? exception.getResponse() : null;
    const details = this.details(response, status);

    reply
      .status(status)
      .type('application/problem+json')
      .send({
        type: `https://xadrez-essencial.local/problems/${status}`,
        title: details.title,
        status,
        detail: details.detail,
        instance: request.url,
        ...(details.errors ? { errors: details.errors } : {}),
      });
  }

  private details(response: string | object | null, status: number) {
    const fallbackTitle = STATUS_CODES[status] ?? 'Error';
    if (typeof response === 'string') {
      return { detail: response, title: fallbackTitle };
    }
    if (response && 'detail' in response) {
      const value = response as { detail?: unknown; errors?: unknown; title?: unknown };
      return {
        detail: typeof value.detail === 'string' ? value.detail : fallbackTitle,
        errors: Array.isArray(value.errors) ? value.errors : undefined,
        title: typeof value.title === 'string' ? value.title : fallbackTitle,
      };
    }
    if (response && 'message' in response) {
      const value = response as { message?: unknown; error?: unknown };
      return {
        detail: typeof value.message === 'string' ? value.message : fallbackTitle,
        title: typeof value.error === 'string' ? value.error : fallbackTitle,
      };
    }
    return {
      detail: status === 500 ? 'Ocorreu um erro interno' : fallbackTitle,
      title: fallbackTitle,
    };
  }
}
