import { pgTable, serial, jsonb, timestamp, integer, text, index, doublePrecision, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
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
// Products read automatically from the suppliers' online shops (Sanipower, Sanitop).
// `key` is the supplier's own article key; `pvp` the list price and `net` the price with ENAT's discount, both without VAT.
export const supplierProducts = pgTable('supplier_products', {
  id: serial().primaryKey(),
  supplier: text().notNull(),
  key: text().notNull(),
  ref: text().notNull().default(''),
  model: text().notNull().default(''),
  name: text().notNull(),
  brand: text().notNull().default(''),
  path: jsonb().$type<string[]>().notNull(),
  url: text().notNull().default(''),
  pvp: doublePrecision().notNull(),
  net: doublePrecision(),
  discount: doublePrecision(),
  stock: boolean(),
  prevPvp: doublePrecision('prev_pvp'),
  prevNet: doublePrecision('prev_net'),
  changedAt: timestamp('changed_at', { withTimezone: true }),
  netAt: timestamp('net_at', { withTimezone: true }),
  seenAt: timestamp('seen_at', { withTimezone: true }).defaultNow().notNull(),
  removed: boolean().notNull().default(false),
}, t => [uniqueIndex('supplier_products_key_idx').on(t.supplier, t.key), index('supplier_products_net_at_idx').on(t.supplier, t.netAt)]);
