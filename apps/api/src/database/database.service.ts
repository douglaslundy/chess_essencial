import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema.js';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly client: Sql;
  readonly db: PostgresJsDatabase<typeof schema>;
  private readonly drizzleClient: Sql;

  constructor(config: ConfigService) {
    const databaseUrl = config.getOrThrow<string>('DATABASE_URL');
    const max = config.get<string>('NODE_ENV') === 'test' ? 2 : 10;
    this.client = postgres(databaseUrl, { max, prepare: false });
    // A separate connection for Drizzle, not this.client: drizzle-orm's
    // postgres-js adapter reconfigures the Sql instance's global type
    // parsers for timestamp columns (so it can apply its own per-column
    // date/string mode) as a side effect of wrapping it. On a shared
    // client that silently turns every raw tagged-template query
    // (`this.client\`...\``) across the whole app into returning
    // timestamp/timestamptz columns as plain strings instead of Date
    // objects the moment a column stopped being NULL — reproduced against
    // production's ai_provider_keys.last_validated_at, which crashed
    // AiProvidersService.toPublic()'s `row.lastValidatedAt.toISOString()`
    // with "not a function" once a key was actually saved.
    this.drizzleClient = postgres(databaseUrl, { max, prepare: false });
    this.db = drizzle(this.drizzleClient, { schema });
  }

  async onApplicationShutdown() {
    await Promise.all([this.client.end({ timeout: 5 }), this.drizzleClient.end({ timeout: 5 })]);
  }
}
