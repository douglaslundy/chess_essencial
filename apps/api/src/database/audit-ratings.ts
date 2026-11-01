import postgres from 'postgres';

// Read-only rating audit: for every human profile, explains where its current rating comes from
// (the 1200 seed, rated games, or an inconsistency) so an unexpected number can be traced.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const usernameFilter = process.argv[2] ?? null;

interface ProfileAudit {
  username: string;
  pool: string;
  rating: number;
  gamesCount: number;
  provisional: boolean;
  ratedFinished: number;
  unratedGames: number;
  transactions: number;
  lastTransactionRating: number | null;
}

function explain(row: ProfileAudit): string {
  if (row.transactions === 0 && row.rating === 1200) {
    return row.unratedGames > 0
      ? `valor inicial do cadastro (1200); as ${row.unratedGames} partidas deste ritmo não valem rating`
      : 'valor inicial do cadastro (1200); nenhuma partida neste ritmo';
  }
  if (row.transactions === 0)
    return 'INCONSISTENTE: rating diferente de 1200 sem nenhuma partida avaliada';
  if (row.lastTransactionRating !== row.rating) {
    return `INCONSISTENTE: última partida avaliada deixou ${row.lastTransactionRating}, perfil mostra ${row.rating}`;
  }
  if (row.gamesCount !== row.transactions) {
    return `INCONSISTENTE: perfil conta ${row.gamesCount} partidas, existem ${row.transactions} avaliadas`;
  }
  if (row.ratedFinished !== row.transactions) {
    return `INCONSISTENTE: ${row.ratedFinished} partidas avaliadas terminadas, ${row.transactions} com rating aplicado`;
  }
  return `resultado de ${row.transactions} partidas avaliadas`;
}

try {
  await sql`SET default_transaction_read_only = on`;
  const rows = await sql<ProfileAudit[]>`
    SELECT u.username, rp.pool::text AS pool, rp.rating, rp.games_count AS "gamesCount",
      rp.provisional,
      (SELECT count(*)::integer FROM game_players gp
        JOIN games g ON g.id = gp.game_id
        JOIN game_time_controls tc ON tc.id = g.time_control_id
        WHERE gp.user_id = u.id AND tc.pool = rp.pool AND g.rated AND g.status = 'finished'
      ) AS "ratedFinished",
      (SELECT count(*)::integer FROM game_players gp
        JOIN games g ON g.id = gp.game_id
        JOIN game_time_controls tc ON tc.id = g.time_control_id
        WHERE gp.user_id = u.id AND tc.pool = rp.pool AND NOT g.rated
      ) AS "unratedGames",
      (SELECT count(*)::integer FROM rating_transactions t
        WHERE t.user_id = u.id AND t.pool = rp.pool) AS transactions,
      (SELECT t.rating_after FROM rating_transactions t
        WHERE t.user_id = u.id AND t.pool = rp.pool
        ORDER BY t.created_at DESC LIMIT 1) AS "lastTransactionRating"
    FROM rating_profiles rp
    JOIN users u ON u.id = rp.user_id
    WHERE ${usernameFilter}::text IS NULL OR u.username = ${usernameFilter}
    ORDER BY u.username, rp.pool
  `;
  for (const row of rows) {
    console.log(
      `${row.username} | ${row.pool} | ${row.rating}${row.provisional ? ' (provisório)' : ''} | ${explain(row)}`,
    );
  }
  const problems = rows.filter((row) => explain(row).startsWith('INCONSISTENTE')).length;
  console.log(`\n${rows.length} perfis auditados, ${problems} inconsistentes.`);
  if (problems > 0) process.exitCode = 1;
} finally {
  await sql.end();
}
