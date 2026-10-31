// Platform backup file (.xebak): gzip text.
//   line 1: magic + format version
//   line 2: JSON header (migration the data belongs to, tables and columns, in load order)
//   then, per table: "-- TABLE <name>", the table's rows in PostgreSQL COPY text format,
//   and the standard COPY terminator line "\.".
// COPY text escapes newlines inside values, so every row is exactly one line and the framing
// stays line-based; it is also exact for every column type (json, bytea, arrays, timestamps).
export const BACKUP_MAGIC = 'XADREZ-BACKUP 1';
export const TABLE_MARKER = '-- TABLE ';
export const COPY_END = '\\.';

export interface BackupTable {
  columns: string[];
  name: string;
  rows?: number;
}

export interface BackupHeader {
  createdAt: string;
  migration: string;
  tables: BackupTable[];
}

/**
 * Tables left out of a backup: the migration ledger (the target database keeps its own and
 * the header pins the version instead) and the TTS audio cache (large, regenerated on demand).
 */
export const EXCLUDED_TABLES = new Set(['_xadrez_migrations', 'voice_audio_cache']);

/** Orders tables so every foreign-key parent loads before its children (cycles keep input order). */
export function loadOrder(
  tables: string[],
  edges: Array<{ child: string; parent: string }>,
): string[] {
  const parents = new Map(tables.map((table) => [table, new Set<string>()]));
  for (const { child, parent } of edges) {
    if (child !== parent && parents.has(child) && parents.has(parent))
      parents.get(child)!.add(parent);
  }
  const ordered: string[] = [];
  const placed = new Set<string>();
  while (ordered.length < tables.length) {
    const ready = tables.filter(
      (table) =>
        !placed.has(table) && [...parents.get(table)!].every((parent) => placed.has(parent)),
    );
    // A dependency cycle: take the next table anyway (FK checks are relaxed during restore).
    const batch = ready.length > 0 ? ready : [tables.find((table) => !placed.has(table))!];
    for (const table of batch) {
      placed.add(table);
      ordered.push(table);
    }
  }
  return ordered;
}

/** Problems that make a backup unusable on this database; empty when it can be restored. */
export function compatibilityProblems(
  header: BackupHeader,
  currentMigration: string,
  currentColumns: Map<string, string[]>,
): string[] {
  const problems: string[] = [];
  if (header.migration !== currentMigration) {
    problems.push(
      `O backup é da versão ${header.migration} do banco, e este servidor está na ${currentMigration}. Restaure em um servidor na mesma versão.`,
    );
  }
  for (const table of header.tables) {
    const columns = currentColumns.get(table.name);
    if (!columns) {
      problems.push(`A tabela ${table.name} do backup não existe neste banco.`);
      continue;
    }
    const missing = table.columns.filter((column) => !columns.includes(column));
    if (missing.length > 0)
      problems.push(`Colunas ausentes em ${table.name}: ${missing.join(', ')}.`);
  }
  return problems;
}
