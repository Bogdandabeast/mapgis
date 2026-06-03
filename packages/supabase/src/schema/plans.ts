import { pgTable, uuid, text, integer, boolean, timestamp, geometry, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    location: geometry("location", { type: "point", mode: "xy", srid: 4326 }).notNull(),
    locationName: text("location_name"),
    status: text("status").default("active").notNull(),
    isRecurring: boolean("is_recurring").default(false).notNull(),
    isFeatured: boolean("is_featured").default(false).notNull(),
    maxParticipants: integer("max_participants"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    searchVector: text("search_vector").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))`,
      { mode: "stored" },
    ),
  },
  (table) => [
    index("plans_location_idx").using("gist", table.location),
  ],
);
