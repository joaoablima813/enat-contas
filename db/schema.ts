import { pgTable, serial, jsonb, timestamp, integer, text, index } from 'drizzle-orm/pg-core';
export const quotes = pgTable('quotes', {
  id: serial().primaryKey(),
  document: jsonb().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
// Follow-up of each sent quote: sent, opened by the client, PDF opened and the client's answers.
export const quoteEvents = pgTable('quote_events', {
  id: serial().primaryKey(),
  quoteId: integer('quote_id').notNull().references(() => quotes.id, { onDelete: 'cascade' }),
  kind: text().notNull(),
  note: text().notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
}, t => [index('quote_events_quote_idx').on(t.quoteId)]);
