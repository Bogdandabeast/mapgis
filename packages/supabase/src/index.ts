// @mapgis/supabase — shared Supabase client, auth provider, Drizzle schema
// Types live in @mapgis/shared (single source of truth)
export { supabase } from "./client";
export * from "./schema";
export { AuthProvider, useAuth } from "./auth/AuthProvider";
