import { randomUUID } from 'node:crypto';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
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

// --- M2: dominio base (personas, tareas, eventos, inbox, recordatorios) ---

export const relationshipEnum = pgEnum('relationship', [
  'child',
  'partner',
  'family',
  'friend',
  'other',
]);

export const people = pgTable('people', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  relationship: relationshipEnum('relationship').notNull(),
  aliases: text('aliases')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  birthday: date('birthday'),
  notes: text('notes'),
  ...timestamps,
});

export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'in_progress',
  'completed',
  'postponed',
  'cancelled',
]);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high']);
export const taskSourceEnum = pgEnum('task_source', ['manual', 'ai', 'device_calendar']);

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: taskStatusEnum('status').notNull().default('pending'),
    priority: priorityEnum('priority').notNull().default('medium'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    locationText: text('location_text'),
    dueDate: date('due_date'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    estimatedMinutes: integer('estimated_minutes'),
    postponedUntil: timestamp('postponed_until', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    recurrenceRule: text('recurrence_rule'),
    seriesId: uuid('series_id'),
    source: taskSourceEnum('source').notNull().default('manual'),
    aiInteractionId: uuid('ai_interaction_id'),
    ...timestamps,
  },
  (table) => [
    index('tasks_user_status_due_date_idx').on(table.userId, table.status, table.dueDate),
    index('tasks_user_updated_idx').on(table.userId, table.updatedAt),
  ],
);

export const eventSourceEnum = pgEnum('event_source', ['app', 'device_calendar']);

export const events = pgTable(
  'events',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    allDay: boolean('all_day').notNull().default(false),
    startDate: date('start_date'),
    timezone: text('timezone'),
    locationText: text('location_text'),
    personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    recurrenceRule: text('recurrence_rule'),
    source: eventSourceEnum('source').notNull().default('app'),
    externalCalendarId: text('external_calendar_id'),
    externalEventId: text('external_event_id'),
    aiInteractionId: uuid('ai_interaction_id'),
    ...timestamps,
  },
  (table) => [
    index('events_user_start_at_idx').on(table.userId, table.startAt),
    index('events_user_updated_idx').on(table.userId, table.updatedAt),
  ],
);

export const inboxStatusEnum = pgEnum('inbox_status', ['unprocessed', 'processed', 'discarded']);

export const inboxItems = pgTable(
  'inbox_items',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rawText: text('raw_text').notNull(),
    status: inboxStatusEnum('status').notNull().default('unprocessed'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    aiInteractionId: uuid('ai_interaction_id'),
    ...timestamps,
  },
  (table) => [index('inbox_items_user_status_idx').on(table.userId, table.status)],
);

export const itemTypeEnum = pgEnum('item_type', ['task', 'event', 'shopping_item']);
export const relationTypeEnum = pgEnum('relation_type', ['after', 'before', 'related']);

export const itemRelations = pgTable(
  'item_relations',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromType: itemTypeEnum('from_type').notNull(),
    fromId: uuid('from_id').notNull(),
    toType: itemTypeEnum('to_type').notNull(),
    toId: uuid('to_id').notNull(),
    relationType: relationTypeEnum('relation_type').notNull(),
    ...timestamps,
  },
  (table) => [index('item_relations_user_from_idx').on(table.userId, table.fromType, table.fromId)],
);

export const reminderTargetTypeEnum = pgEnum('reminder_target_type', ['task', 'event']);
export const reminderTriggerTypeEnum = pgEnum('reminder_trigger_type', [
  'absolute',
  'relative_to_start',
  'location',
]);
export const reminderStatusEnum = pgEnum('reminder_status', [
  'scheduled',
  'sent',
  'dismissed',
  'cancelled',
]);

export const reminders = pgTable(
  'reminders',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: reminderTargetTypeEnum('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    triggerType: reminderTriggerTypeEnum('trigger_type').notNull(),
    triggerAt: timestamp('trigger_at', { withTimezone: true }),
    offsetMinutes: integer('offset_minutes'),
    status: reminderStatusEnum('status').notNull().default('scheduled'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('reminders_status_trigger_at_idx').on(table.status, table.triggerAt)],
);

export const usersRelations = relations(users, ({ many, one }) => ({
  authIdentities: many(authIdentities),
  refreshTokens: many(refreshTokens),
  categories: many(categories),
  people: many(people),
  tasks: many(tasks),
  events: many(events),
  settings: one(userSettings, { fields: [users.id], references: [userSettings.userId] }),
}));
