import { BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';

export function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      detail: 'A requisição contém campos inválidos',
      errors: result.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join('.'),
      })),
    });
  }
  return result.data;
}
