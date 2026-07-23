// Raw tagged-template queries (this.database.client`...`) can return
// timestamp columns as either a Date or a string depending on whether
// drizzle() has reconfigured the shared postgres.js client's type parsers
// (it does, globally, once constructed) — so callers must not assume Date.
export function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toIsoStringOrNull(value: Date | string | null | undefined): string | null {
  return value == null ? null : toIsoString(value);
}
