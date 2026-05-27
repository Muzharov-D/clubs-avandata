import { pgTable, uuid, text, integer, jsonb, timestamp, primaryKey, time, check, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { teams } from './teams.js';
import { players } from './players.js';
import { users } from './users.js';

export const trainings = pgTable(
  'trainings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    durationMin: integer('duration_min').notNull().default(90),
    venueId: text('venue_id'),
    venueText: text('venue_text'),
    type: text('type').notNull().default('training'),
    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check('trainings_type_chk', sql`${t.type} IN ('training','extra','warmup','recovery','meet')`),
    index('trainings_team_date_idx').on(t.teamId, t.startsAt),
  ],
);

export const trainingAttendance = pgTable(
  'training_attendance',
  {
    trainingId: uuid('training_id')
      .notNull()
      .references(() => trainings.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    responseStatus: text('response_status'),
    responseAt: timestamp('response_at', { withTimezone: true }),
    presenceStatus: text('presence_status'),
    presenceAt: timestamp('presence_at', { withTimezone: true }),
    markedBy: text('marked_by').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
  },
  (t) => [
    primaryKey({ columns: [t.trainingId, t.playerId] }),
    check('attendance_response_chk', sql`${t.responseStatus} IS NULL OR ${t.responseStatus} IN ('going','not_going')`),
    check('attendance_presence_chk', sql`${t.presenceStatus} IS NULL OR ${t.presenceStatus} IN ('present','late','excused','absent')`),
    index('training_attendance_player_idx').on(t.playerId),
    index('training_attendance_tenant_idx').on(t.tenantId),
  ],
);

export const trainingTemplates = pgTable(
  'training_templates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.slug, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    name: text('name'),
    weekdays: integer('weekdays').array().notNull(),
    startTime: time('start_time').notNull(),
    durationMin: integer('duration_min').notNull().default(90),
    venueId: text('venue_id'),
    venueText: text('venue_text'),
    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('training_templates_team_idx').on(t.teamId)],
);

export type Training = typeof trainings.$inferSelect;
export type TrainingInsert = typeof trainings.$inferInsert;
export type TrainingAttendance = typeof trainingAttendance.$inferSelect;
export type TrainingAttendanceInsert = typeof trainingAttendance.$inferInsert;
export type TrainingTemplate = typeof trainingTemplates.$inferSelect;
