import {
  bigint,
  bigserial,
  boolean,
  char,
  customType,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });

export const userStatusEnum = pgEnum('user_status', ['pending', 'active', 'suspended', 'deleted']);
export const gameStatusEnum = pgEnum('game_status', [
  'created',
  'waiting',
  'active',
  'finished',
  'aborted',
]);
export const gameResultEnum = pgEnum('game_result', ['white_win', 'black_win', 'draw', 'none']);
export const terminationReasonEnum = pgEnum('termination_reason', [
  'checkmate',
  'resignation',
  'timeout',
  'stalemate',
  'repetition',
  'fifty_move',
  'insufficient_material',
  'agreement',
  'abandonment',
  'admin',
  'none',
]);
export const colorSideEnum = pgEnum('color_side', ['white', 'black']);
export const boardThemeEnum = pgEnum('board_theme', ['classic', 'staunton_3d', 'wood']);
export const ratingPoolEnum = pgEnum('rating_pool', [
  'bullet',
  'blitz',
  'rapid',
  'classical',
  'correspondence',
]);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: citext('email').notNull().unique(),
  username: citext('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  status: userStatusEnum('status').notNull().default('pending'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: varchar('display_name', { length: 80 }).notNull(),
  avatarUrl: text('avatar_url'),
  countryCode: varchar('country_code', { length: 2 }),
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  locale: varchar('locale', { length: 10 }).notNull().default('pt-BR'),
  birthDate: date('birth_date', { mode: 'string' }),
  bio: varchar('bio', { length: 500 }),
  isProfilePublic: boolean('is_profile_public').notNull().default(true),
  allowChallenges: boolean('allow_challenges').notNull().default(true),
  allowFriendRequests: boolean('allow_friend_requests').notNull().default(true),
  boardTheme: boardThemeEnum('board_theme').notNull().default('classic'),
  suggestMoveEnabled: boolean('suggest_move_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userSessions = pgTable('user_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  userAgent: text('user_agent'),
  ipHash: text('ip_hash'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gameTimeControls = pgTable('game_time_controls', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  label: varchar('label', { length: 80 }).notNull(),
  pool: ratingPoolEnum('pool').notNull(),
  initialMs: integer('initial_ms').notNull(),
  incrementMs: integer('increment_ms').notNull().default(0),
  delayMs: integer('delay_ms').notNull().default(0),
  rated: boolean('rated').notNull().default(true),
  active: boolean('active').notNull().default(true),
});

export const games = pgTable('games', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: gameStatusEnum('status').notNull().default('created'),
  result: gameResultEnum('result').notNull().default('none'),
  termination: terminationReasonEnum('termination').notNull().default('none'),
  timeControlId: uuid('time_control_id')
    .notNull()
    .references(() => gameTimeControls.id),
  rated: boolean('rated').notNull(),
  coachMode: boolean('coach_mode').notNull().default(false),
  initialFen: text('initial_fen').notNull().default('startpos'),
  currentFen: text('current_fen').notNull(),
  sideToMove: colorSideEnum('side_to_move').notNull().default('white'),
  halfmoveClock: integer('halfmove_clock').notNull().default(0),
  fullmoveNumber: integer('fullmove_number').notNull().default(1),
  version: bigint('version', { mode: 'number' }).notNull().default(0),
  whiteClockMs: bigint('white_clock_ms', { mode: 'number' }).notNull(),
  blackClockMs: bigint('black_clock_ms', { mode: 'number' }).notNull(),
  activeClockStartedAt: timestamp('active_clock_started_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gamePlayers = pgTable(
  'game_players',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    color: colorSideEnum('color').notNull(),
    ratingBefore: integer('rating_before').notNull(),
    ratingAfter: integer('rating_after'),
    ratingDelta: integer('rating_delta'),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.color] })],
);

export const gameBots = pgTable('game_bots', {
  gameId: uuid('game_id')
    .primaryKey()
    .references(() => games.id, { onDelete: 'cascade' }),
  botUserId: uuid('bot_user_id')
    .notNull()
    .references(() => users.id),
  difficulty: varchar('difficulty', { length: 20 }).notNull(),
  targetRating: integer('target_rating').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gameMoves = pgTable('game_moves', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  gameId: uuid('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  ply: integer('ply').notNull(),
  color: colorSideEnum('color').notNull(),
  clientMoveId: uuid('client_move_id').notNull(),
  uci: varchar('uci', { length: 8 }).notNull(),
  san: varchar('san', { length: 32 }).notNull(),
  fromSquare: char('from_square', { length: 2 }).notNull(),
  toSquare: char('to_square', { length: 2 }).notNull(),
  promotion: char('promotion', { length: 1 }),
  fenBefore: text('fen_before').notNull(),
  fenAfter: text('fen_after').notNull(),
  clockBeforeMs: bigint('clock_before_ms', { mode: 'number' }).notNull(),
  clockAfterMs: bigint('clock_after_ms', { mode: 'number' }).notNull(),
  serverReceivedAt: timestamp('server_received_at', { withTimezone: true }).notNull(),
  committedAt: timestamp('committed_at', { withTimezone: true }).notNull().defaultNow(),
  thinkTimeMs: integer('think_time_ms').notNull().default(0),
  flags: jsonb('flags').$type<Record<string, unknown>>().notNull().default({}),
});

export const gamePgn = pgTable('game_pgn', {
  gameId: uuid('game_id')
    .primaryKey()
    .references(() => games.id, { onDelete: 'cascade' }),
  pgn: text('pgn').notNull(),
  checksumSha256: char('checksum_sha256', { length: 64 }).notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gameDrawOffers = pgTable('game_draw_offers', {
  id: uuid('id').defaultRandom().primaryKey(),
  gameId: uuid('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  offeredByUserId: uuid('offered_by_user_id')
    .notNull()
    .references(() => users.id),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const gameReviewAnnotations = pgTable(
  'game_review_annotations',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ply: integer('ply').notNull(),
    comment: varchar('comment', { length: 2000 }),
    arrows: jsonb('arrows')
      .$type<Array<{ color: string; from: string; to: string }>>()
      .notNull()
      .default([]),
    highlights: jsonb('highlights')
      .$type<Array<{ color: string; square: string }>>()
      .notNull()
      .default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.userId, table.ply] })],
);
export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  aggregateType: varchar('aggregate_type', { length: 60 }).notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
});

export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerUserId: uuid('blocker_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedUserId: uuid('blocked_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.blockerUserId, table.blockedUserId] })],
);

export const moderationReports = pgTable('moderation_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reporterUserId: uuid('reporter_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  reportedUserId: uuid('reported_user_id').references(() => users.id, { onDelete: 'set null' }),
  gameId: uuid('game_id').references(() => games.id, { onDelete: 'set null' }),
  category: varchar('category', { length: 30 }).notNull(),
  description: varchar('description', { length: 1000 }),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 80 }).notNull(),
  entityId: text('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type UserProfileRow = typeof userProfiles.$inferSelect;
export type UserSessionRow = typeof userSessions.$inferSelect;
export type UserBlockRow = typeof userBlocks.$inferSelect;
export type ModerationReportRow = typeof moderationReports.$inferSelect;
