import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema.js';

const rawJsonType = {
  from: [114, 3802],
  parse: (value: string): unknown => JSON.parse(value),
  // Raw repositories already pass JSON.stringify(...) in tagged-template
  // parameters. Preserve those strings instead of encoding them a second
  // time; still support object values supplied through sql.json(...).
  serialize: (value: unknown): string =>
    typeof value === 'string' ? value : JSON.stringify(value),
  to: 114,
};

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly client: Sql;
  readonly db: PostgresJsDatabase<typeof schema>;
  private readonly drizzleClient: Sql;

  constructor(config: ConfigService) {
    const databaseUrl = config.getOrThrow<string>('DATABASE_URL');
    const max = config.get<string>('NODE_ENV') === 'test' ? 2 : 10;
    // Keep JSON/JSONB decoding explicit on the raw-query client. The
    // database CI caught these values leaking out as serialized strings
    // after the Drizzle connection was split off; owning this handler keeps
    // the raw repository boundary stable alongside the explicit Date parser.
    this.client = postgres(databaseUrl, {
      max,
      prepare: false,
      types: { json: rawJsonType },
    });
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
