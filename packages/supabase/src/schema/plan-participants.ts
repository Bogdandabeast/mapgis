import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const planParticipants = pgTable(
  "plan_participants",
  {
    planId: uuid("plan_id").notNull(),
    userId: uuid("user_id").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.planId, table.userId] })],
);
