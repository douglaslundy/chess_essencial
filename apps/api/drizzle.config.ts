import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://chess:chess@localhost:5432/chess',
  },
  out: '../../database/drizzle',
  schema: './src/database/schema.ts',
  strict: true,
  verbose: true,
});
