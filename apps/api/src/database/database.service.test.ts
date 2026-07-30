import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseService } from './database.service.js';

let service: DatabaseService | null = null;

afterEach(async () => {
  await service?.onApplicationShutdown();
  service = null;
});

describe('DatabaseService raw type parsers', () => {
  it('keeps JSON/JSONB decoded and timestamps as Date after Drizzle initializes', () => {
    const config = {
      get: (key: string) => (key === 'NODE_ENV' ? 'test' : undefined),
      getOrThrow: () => 'postgresql://unused:unused@127.0.0.1:5432/unused',
    } as unknown as ConfigService;

    service = new DatabaseService(config);

    expect(service.client.options.parsers[114]!('{"ok":true}')).toEqual({ ok: true });
    expect(service.client.options.parsers[3802]!('["ok"]')).toEqual(['ok']);
    expect(service.client.options.parsers[1184]!('2026-07-30T12:00:00.000Z')).toBeInstanceOf(Date);
    expect(service.client.options.serializers[3802]!(JSON.stringify(['ok']))).toBe('["ok"]');
    expect(service.client.options.serializers[3802]!({ ok: true })).toBe('{"ok":true}');
  });
});
