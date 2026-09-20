import { randomUUID } from 'node:crypto';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// citext isn't a first-class drizzle-orm column type; this is a thin custom
// type so `email` compares case-insensitively at the DB level (section 6).
const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => randomUUID());

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

export const users = pgTable(
  'users',
  {
    id: id(),
    email: citext('email'),
    displayName: text('display_name'),
    timezone: text('timezone').notNull().default('America/Argentina/Buenos_Aires'),
    locale: text('locale').default('es-AR'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    termsVersion: text('terms_version'),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    // Soft-deleted users (deleted_at set) don't hold their email hostage —
    // otherwise DELETE /me followed by re-registering with the same email
    // hits a 500 on the unique constraint. See docs/decisions.md ADR-005.
    uniqueIndex('users_email_active_idx')
      .on(table.email)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const authProviderEnum = pgEnum('auth_provider', ['password', 'apple', 'google']);

export const authIdentities = pgTable(
  'auth_identities',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProviderEnum('provider').notNull(),
    providerSubject: text('provider_subject'),
    passwordHash: text('password_hash'),
    ...timestamps,
  },
  (table) => [uniqueIndex('auth_identities_user_provider_idx').on(table.userId, table.provider)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    deviceId: text('device_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedBy: uuid('replaced_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('refresh_tokens_user_idx').on(table.userId),
    index('refresh_tokens_family_idx').on(table.familyId),
  ],
);

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  dailySummaryEnabled: boolean('daily_summary_enabled').notNull().default(true),
  dailySummaryTime: time('daily_summary_time').notNull().default('07:30'),
  quietHoursStart: time('quiet_hours_start').notNull().default('22:00'),
  quietHoursEnd: time('quiet_hours_end').notNull().default('07:00'),
  maxPushPerDay: integer('max_push_per_day').notNull().default(6),
  defaultEventReminderMin: integer('default_event_reminder_min').notNull().default(30),
  defaultTaskReminderTime: time('default_task_reminder_time').notNull().default('09:00'),
});

export const categories = pgTable('categories', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  icon: text('icon'),
  isDefault: boolean('is_default').notNull().default(false),
  ...timestamps,
});

// Not part of the canonical model in spec section 6 — implementation detail
// for F01's rate limiting and password reset. See docs/decisions.md ADR-004.
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: id(),
    email: citext('email').notNull(),
    ip: text('ip').notNull(),
    succeededAt: timestamp('succeeded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('login_attempts_email_ip_created_idx').on(table.email, table.ip, table.createdAt),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('password_reset_tokens_user_idx').on(table.userId)],
);

export const usersRelations = relations(users, ({ many, one }) => ({
  authIdentities: many(authIdentities),
  refreshTokens: many(refreshTokens),
  categories: many(categories),
  settings: one(userSettings, { fields: [users.id], references: [userSettings.userId] }),
}));
