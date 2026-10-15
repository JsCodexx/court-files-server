import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  email: text('email').notNull().unique(),
  barAddress: text('bar_address').notNull(),
  passwordHash: text('password_hash').notNull(),
  emailVerified: text('email_verified').notNull().default('false'),
  tokenVersion: text('token_version').notNull().default('0'),
  /** Guest checkout accounts must set a new password after first login. */
  mustChangePassword: text('must_change_password').notNull().default('false'),
  subscriptionExpiresAt: timestamp('subscription_expires_at', {
    withTimezone: true,
  }),
  /** Cron-maintained: none | free | active | grace | lapsed */
  subscriptionStatus: text('subscription_status').notNull().default('none'),
  /** When false, user cannot sign in or use the app API. */
  isActive: text('is_active').notNull().default('true'),
  /** Superadmin dashboard access (separate login at /api/admin). */
  isSuperadmin: text('is_superadmin').notNull().default('false'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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
  otpAttempts: text('otp_attempts').notNull().default('0'),
});

/** Clerk-owned directory of judges and advocates */
export const casePersons = pgTable(
  'case_persons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role').notNull(), // 'judge' | 'advocate'
    phone: text('phone').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_case_persons_user_id').on(table.userId),
    uniqueIndex('idx_case_persons_user_role_name').on(
      table.userId,
      table.role,
      sql`lower(trim(${table.name}))`
    ),
  ]
);

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
    judgePersonId: uuid('judge_person_id').references(() => casePersons.id, {
      onDelete: 'set null',
    }),
    party1AdvocateId: uuid('party1_advocate_id').references(
      () => casePersons.id,
      { onDelete: 'set null' }
    ),
    party2AdvocateId: uuid('party2_advocate_id').references(
      () => casePersons.id,
      { onDelete: 'set null' }
    ),
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
    judgeName: text('judge_name').notNull().default(''),
    party1Advocate: text('party1_advocate').notNull().default(''),
    party2Advocate: text('party2_advocate').notNull().default(''),
    judgePersonId: uuid('judge_person_id').references(() => casePersons.id, {
      onDelete: 'set null',
    }),
    party1AdvocateId: uuid('party1_advocate_id').references(
      () => casePersons.id,
      { onDelete: 'set null' }
    ),
    party2AdvocateId: uuid('party2_advocate_id').references(
      () => casePersons.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_hearings_case_id').on(table.caseId),
    index('idx_hearings_date').on(table.date),
  ]
);

/** History of judge/advocate assignments on a case (no case cloning) */
export const caseBenchHistory = pgTable(
  'case_bench_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    judgePersonId: uuid('judge_person_id').references(() => casePersons.id, {
      onDelete: 'set null',
    }),
    party1AdvocateId: uuid('party1_advocate_id').references(
      () => casePersons.id,
      { onDelete: 'set null' }
    ),
    party2AdvocateId: uuid('party2_advocate_id').references(
      () => casePersons.id,
      { onDelete: 'set null' }
    ),
    judgeName: text('judge_name').notNull().default(''),
    party1Advocate: text('party1_advocate').notNull().default(''),
    party2Advocate: text('party2_advocate').notNull().default(''),
    effectiveFrom: timestamp('effective_from', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_case_bench_history_case_id').on(table.caseId)]
);

export const userProceedings = pgTable(
  'user_proceedings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_user_proceedings_user_label').on(
      table.userId,
      sql`lower(trim(${table.label}))`
    ),
  ]
);

/** Private per-clerk city labels for case registration */
export const userCities = pgTable(
  'user_cities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_user_cities_user_label').on(
      table.userId,
      sql`lower(trim(${table.label}))`
    ),
  ]
);

export const passwordResets = pgTable('password_resets', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** RapidGateway payment records */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: text('plan_id').notNull(),
    amountPkr: text('amount_pkr').notNull(),
    currency: text('currency').notNull().default('PKR'),
    provider: text('provider').notNull().default('rapidgateway'),
    status: text('status').notNull().default('pending'),
    merchantOrderId: text('merchant_order_id').notNull().unique(),
    providerTxnId: text('provider_txn_id'),
    metadata: text('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_payments_user_id').on(table.userId),
    index('idx_payments_status').on(table.status),
  ]
);

/** Full subscription profile; users.subscription_* is the fast FE cache. */
export const subscriptions = pgTable(
  'subscriptions',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: text('plan_id').notNull(),
    source: text('source').notNull().default('payment'),
    status: text('status').notNull().default('active'),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', {
      withTimezone: true,
    }).notNull(),
    firstPaymentId: uuid('first_payment_id').references(() => payments.id, {
      onDelete: 'set null',
    }),
    lastPaymentId: uuid('last_payment_id').references(() => payments.id, {
      onDelete: 'set null',
    }),
    subscribedAt: timestamp('subscribed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_subscriptions_status').on(table.status),
    index('idx_subscriptions_period_end').on(table.currentPeriodEnd),
    index('idx_subscriptions_source').on(table.source),
  ]
);

export const usersRelations = relations(users, ({ many, one }) => ({
  cases: many(cases),
  casePersons: many(casePersons),
  payments: many(payments),
  subscription: one(subscriptions, {
    fields: [users.id],
    references: [subscriptions.userId],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
}));

export const casePersonsRelations = relations(casePersons, ({ one }) => ({
  user: one(users, {
    fields: [casePersons.userId],
    references: [users.id],
  }),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  user: one(users, {
    fields: [cases.userId],
    references: [users.id],
  }),
  hearings: many(hearings),
  benchHistory: many(caseBenchHistory),
}));

export const hearingsRelations = relations(hearings, ({ one }) => ({
  case: one(cases, {
    fields: [hearings.caseId],
    references: [cases.id],
  }),
}));

export const caseBenchHistoryRelations = relations(caseBenchHistory, ({ one }) => ({
  case: one(cases, {
    fields: [caseBenchHistory.caseId],
    references: [cases.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type CasePerson = typeof casePersons.$inferSelect;
export type NewCasePerson = typeof casePersons.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type Hearing = typeof hearings.$inferSelect;
export type NewHearing = typeof hearings.$inferInsert;
export type CaseBenchHistory = typeof caseBenchHistory.$inferSelect;
export type PendingOtp = typeof pendingOtps.$inferSelect;
export type UserProceeding = typeof userProceedings.$inferSelect;
export type NewUserProceeding = typeof userProceedings.$inferInsert;
export type UserCity = typeof userCities.$inferSelect;
export type NewUserCity = typeof userCities.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
