import { relations } from "drizzle-orm";
import { profiles } from "./profiles";
import { categories } from "./categories";
import { plans } from "./plans";
import { planParticipants } from "./plan-participants";
import { categorySubscriptions } from "./category-subscriptions";
import { notifications } from "./notifications";

export const profilesRelations = relations(profiles, ({ many }) => ({
  plans: many(plans, { relationName: "creator" }),
  planParticipants: many(planParticipants),
  categorySubscriptions: many(categorySubscriptions),
  notifications: many(notifications),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  plans: many(plans),
  subscriptions: many(categorySubscriptions),
}));

export const plansRelations = relations(plans, ({ one, many }) => ({
  creator: one(profiles, {
    fields: [plans.creatorId],
    references: [profiles.id],
    relationName: "creator",
  }),
  category: one(categories, {
    fields: [plans.categoryId],
    references: [categories.id],
  }),
  participants: many(planParticipants),
  notifications: many(notifications),
}));

export const planParticipantsRelations = relations(planParticipants, ({ one }) => ({
  plan: one(plans, {
    fields: [planParticipants.planId],
    references: [plans.id],
  }),
  user: one(profiles, {
    fields: [planParticipants.userId],
    references: [profiles.id],
  }),
}));

export const categorySubscriptionsRelations = relations(categorySubscriptions, ({ one }) => ({
  user: one(profiles, {
    fields: [categorySubscriptions.userId],
    references: [profiles.id],
  }),
  category: one(categories, {
    fields: [categorySubscriptions.categoryId],
    references: [categories.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(profiles, {
    fields: [notifications.userId],
    references: [profiles.id],
  }),
  plan: one(plans, {
    fields: [notifications.planId],
    references: [plans.id],
  }),
}));
