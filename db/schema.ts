import { pgTable, serial, jsonb, timestamp } from 'drizzle-orm/pg-core';
export const quotes = pgTable('quotes', {
  id: serial().primaryKey(),
  document: jsonb().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
