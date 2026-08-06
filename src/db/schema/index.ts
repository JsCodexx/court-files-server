import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  email: text('email').notNull().unique(),
  barAddress: text('bar_address').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pendingOtps = pgTable('pending_otps', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: text('phone').notNull().unique(),
  otp: text('otp').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  barAddress: text('bar_address').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const cases = pgTable(
  'cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    caseId: text('case_id').notNull(),
    category: text('category').notNull(),
    party1Name: text('party1_name').notNull(),
    party1IdCard: text('party1_id_card').notNull(),
    party1Phone: text('party1_phone').notNull(),
    party2Name: text('party2_name').notNull(),
    party2IdCard: text('party2_id_card').notNull(),
    party2Phone: text('party2_phone').notNull(),
    courtNumber: text('court_number'),
    city: text('city').notNull().default(''),
    judgeName: text('judge_name').notNull(),
    advocateFor: text('advocate_for').notNull(),
    party1Advocate: text('party1_advocate').notNull().default(''),
    party2Advocate: text('party2_advocate').notNull().default(''),
    nextDate: date('next_date').notNull(),
    proceeding: text('proceeding').notNull().default(''),
    remarks: text('remarks').notNull().default(''),
    status: text('status').notNull().default('pending'),
    statusRemarks: text('status_remarks').notNull().default(''),
    clientName: text('client_name').notNull().default(''),
    clientAddress: text('client_address').notNull().default(''),
    clientPhone: text('client_phone').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_cases_user_id').on(table.userId),
    index('idx_cases_next_date').on(table.nextDate),
    index('idx_cases_case_id').on(table.caseId),
  ]
);

export const hearings = pgTable(
  'hearings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    proceeding: text('proceeding').notNull().default(''),
    adjournmentReason: text('adjournment_reason').notNull().default(''),
    shortOrder: text('short_order').notNull().default(''),
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_hearings_case_id').on(table.caseId),
    index('idx_hearings_date').on(table.date),
  ]
);

export const passwordResets = pgTable('password_resets', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: text('phone').notNull().unique(),
  otp: text('otp').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  cases: many(cases),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  user: one(users, {
    fields: [cases.userId],
    references: [users.id],
  }),
  hearings: many(hearings),
}));

export const hearingsRelations = relations(hearings, ({ one }) => ({
  case: one(cases, {
    fields: [hearings.caseId],
    references: [cases.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type Hearing = typeof hearings.$inferSelect;
export type NewHearing = typeof hearings.$inferInsert;
export type PendingOtp = typeof pendingOtps.$inferSelect;
