import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { PassThrough, type Readable } from 'node:stream';
import { createGunzip, createGzip } from 'node:zlib';

import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../observability/audit.service.js';
import {
  BACKUP_MAGIC,
  compatibilityProblems,
  COPY_END,
  EXCLUDED_TABLES,
  loadOrder,
  TABLE_MARKER,
  type BackupHeader,
} from './backup-format.js';

export interface RestoreReport {
  migration: string;
  rows: number;
  tables: number;
}

@Injectable()
export class BackupService {
  constructor(
    private readonly database: DatabaseService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private get sql() {
    return this.database.client;
  }

  private async currentMigration(): Promise<string> {
    const [row] = await this.sql<{ name: string | null }[]>`
      SELECT max(name) AS name FROM _xadrez_migrations
    `;
    return row?.name ?? '';
  }

  /** Every data table of the public schema with its copyable columns (no generated ones). */
  private async currentColumns(): Promise<Map<string, string[]>> {
    const rows = await this.sql<{ column: string; table: string }[]>`
      SELECT c.relname AS "table", a.attname AS "column"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
      ORDER BY c.relname, a.attnum
    `;
    const columns = new Map<string, string[]>();
    for (const row of rows) {
      if (EXCLUDED_TABLES.has(row.table)) continue;
      columns.set(row.table, [...(columns.get(row.table) ?? []), row.column]);
    }
    return columns;
  }

  private async orderedTables(columns: Map<string, string[]>): Promise<string[]> {
    const edges = await this.sql<{ child: string; parent: string }[]>`
      SELECT child.relname AS child, parent.relname AS parent
      FROM pg_constraint k
      JOIN pg_class child ON child.oid = k.conrelid
      JOIN pg_class parent ON parent.oid = k.confrelid
      JOIN pg_namespace n ON n.oid = child.relnamespace
      WHERE k.contype = 'f' AND n.nspname = 'public'
    `;
    return loadOrder([...columns.keys()].sort(), edges);
  }

  /** Streams the whole platform database as a gzip .xebak file. */
  async export(actorUserId: string): Promise<{ filename: string; stream: Readable }> {
    const columns = await this.currentColumns();
    const tables = await this.orderedTables(columns);
    const header: BackupHeader = {
      createdAt: new Date().toISOString(),
      migration: await this.currentMigration(),
      tables: tables.map((name) => ({ columns: columns.get(name)!, name })),
    };
    const out = new PassThrough();
    const gzip = createGzip();
    gzip.pipe(out);

    const sql = this.sql;
    void (async () => {
      try {
        gzip.write(`${BACKUP_MAGIC}\n${JSON.stringify(header)}\n`);
        for (const table of header.tables) {
          gzip.write(`${TABLE_MARKER}${table.name}\n`);
          const source = await sql`
            COPY ${sql(table.name)} (${sql(table.columns)}) TO STDOUT
          `.readable();
          for await (const chunk of source) {
            if (!gzip.write(chunk)) await once(gzip, 'drain');
          }
          // shortcut: postgres.js 3.4 pauses the socket when the COPY stream buffer fills and only its
          // read() resumes it; if the table ends right then, the connection stays paused and the next
          // COPY hangs forever. Calling read() resumes it. Drop this when upgrading to postgres 4.
          source._read(0);
          gzip.write(`${COPY_END}\n`);
        }
        gzip.end();
      } catch (error) {
        out.destroy(error instanceof Error ? error : new Error('Falha ao gerar o backup.'));
      }
    })();

    await this.audit?.record(actorUserId, 'admin.backup_exported', 'platform', 'database', {
      migration: header.migration,
      tables: header.tables.length,
    });
    const stamp = header.createdAt.slice(0, 19).replace(/[:T]/g, '-');
    return { filename: `xadrez-backup-${stamp}.xebak`, stream: out };
  }

  /**
   * Replaces all platform data with the backup's, in one transaction: the version and schema
   * are checked before anything is touched, and any failure rolls everything back.
   */
  async restore(upload: Readable, actorUserId: string): Promise<RestoreReport> {
    const lines = createInterface({ crlfDelay: Infinity, input: upload.pipe(createGunzip()) });
    const iterator = lines[Symbol.asyncIterator]();
    const next = async () => {
      const { done, value } = await iterator.next();
      return done ? null : value;
    };

    try {
      if ((await next()) !== BACKUP_MAGIC) {
        throw new BadRequestException('Arquivo inválido: não é um backup da plataforma (.xebak).');
      }
      let header: BackupHeader;
      try {
        header = JSON.parse((await next()) ?? '') as BackupHeader;
      } catch {
        throw new BadRequestException('Cabeçalho do backup corrompido.');
      }
      const problems = compatibilityProblems(
        header,
        await this.currentMigration(),
        await this.currentColumns(),
      );
      if (problems.length > 0) throw new BadRequestException(problems.join(' '));

      let rows = 0;
      await this.sql.begin(async (tx) => {
        // FK checks off while loading (rows reference each other in any order); needs the
        // database owner role, which the platform uses. Without it, load order still holds.
        await tx`SET LOCAL session_replication_role = replica`.catch(() => undefined);
        await tx`TRUNCATE ${tx(header.tables.map((table) => table.name))} RESTART IDENTITY CASCADE`;

        for (;;) {
          const line = await next();
          if (line === null) break;
          if (!line.startsWith(TABLE_MARKER)) continue;
          const name = line.slice(TABLE_MARKER.length);
          const table = header.tables.find((candidate) => candidate.name === name);
          if (!table) throw new BadRequestException(`Tabela inesperada no backup: ${name}.`);
          const sink = await tx`
            COPY ${tx(table.name)} (${tx(table.columns)}) FROM STDIN
          `.writable();
          for (;;) {
            const row = await next();
            if (row === null) throw new BadRequestException(`Backup truncado na tabela ${name}.`);
            if (row === COPY_END) break;
            rows += 1;
            if (!sink.write(`${row}\n`)) await once(sink, 'drain');
          }
          sink.end();
          // shortcut: postgres.js 3.4 drops a COPY error that arrives after end(), so a row the
          // database rejects would leave this waiting; the schema check above keeps rows compatible.
          await once(sink, 'finish');
        }

        // Serial/identity sequences continue after the restored ids.
        await tx`
          SELECT setval(seq.seq, COALESCE(seq.max_value, 0) + 1, false)
          FROM (
            SELECT s.oid::regclass AS seq,
              (xpath('/row/m/text()', query_to_xml(
                format('SELECT max(%I) AS m FROM %I.%I', a.attname, n.nspname, t.relname),
                false, true, ''
              )))[1]::text::bigint AS max_value
            FROM pg_class s
            JOIN pg_depend d ON d.objid = s.oid AND d.deptype IN ('a', 'i')
            JOIN pg_class t ON t.oid = d.refobjid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
            WHERE s.relkind = 'S' AND n.nspname = 'public'
          ) seq
        `;
      });

      // The restored data may not contain the acting admin anymore; the restore stands either way.
      await this.audit
        ?.record(actorUserId, 'admin.backup_restored', 'platform', 'database', {
          migration: header.migration,
          rows,
          tables: header.tables.length,
        })
        .catch(() => undefined);
      return { migration: header.migration, rows, tables: header.tables.length };
    } finally {
      lines.close();
    }
  }
}
