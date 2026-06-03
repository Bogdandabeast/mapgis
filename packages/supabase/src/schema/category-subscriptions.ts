import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const categorySubscriptions = pgTable(
  "category_subscriptions",
  {
    userId: uuid("user_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.categoryId] })],
);
