import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema.js';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly client: Sql;
  readonly db: PostgresJsDatabase<typeof schema>;

  constructor(config: ConfigService) {
    this.client = postgres(config.getOrThrow<string>('DATABASE_URL'), {
      max: config.get<string>('NODE_ENV') === 'test' ? 2 : 10,
      prepare: false,
    });
    this.db = drizzle(this.client, { schema });
  }

  async onApplicationShutdown() {
    await this.client.end({ timeout: 5 });
  }
}
