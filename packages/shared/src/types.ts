// @mapgis/shared — Domain types, DTOs, constants

// ── Roles ──
export const ROLES = {
  visitor: "visitor",
  authenticated: "authenticated",
  premium: "premium",
  admin: "admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// ── Plan limits ──
export const PLAN_LIMITS = {
  FREE_MAX_ACTIVE: 3,
} as const;

// ── Domain types ──
export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: Role;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

export interface Plan {
  id: string;
  creator_id: string;
  category_id: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  location_name: string | null;
  starts_at: string;
  ends_at: string | null;
  max_participants: number | null;
  status: "active" | "cancelled" | "completed";
  is_recurring: boolean;
  is_featured: boolean;
  deleted_at: string | null;
  created_at: string;
  // Joined fields
  creator?: Profile;
  category?: Category;
  participant_count?: number;
  distance?: number;
}

export interface PlanParticipant {
  plan_id: string;
  user_id: string;
  joined_at: string;
  user?: Profile;
}

export interface CategorySubscription {
  user_id: string;
  category_id: string;
  subscribed_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  plan_id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  plan?: Plan;
}
