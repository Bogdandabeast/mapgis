# Supabase Database Specification

## Purpose

Postgres schema and RLS for mapgis. Ionic app queries Supabase directly — RLS is the sole security boundary.

## Schema

| Table | Key Columns | Notes |
|-------|-------------|-------|
| profiles | id (uuid PK→auth.users), role (default 'authenticated'), display_name, avatar_url, timestamps | Created on sign-up |
| categories | id (uuid PK), name (unique), slug (unique), icon, timestamps | Admin-managed |
| plans | id (uuid PK), creator_id→profiles, title, description, location (geometry Point 4326), category_id→categories, status, is_recurring, is_featured, max_participants, starts_at, ends_at, timestamps, deleted_at | Soft-delete; free cap=3 active |
| plan_participants | plan_id→plans, user_id→profiles, joined_at, PK(plan_id,user_id) | Join/leave |
| category_subscriptions | user_id→profiles, category_id→categories, subscribed_at, PK(user_id,category_id) | Subscribe/unsubscribe |
| notifications | id (uuid PK), user_id→profiles, plan_id→plans, type, message, read (default false), created_at | Triggered on plan create |

## Requirements

### Requirement: Profiles

Row MUST be created on sign-up. RLS: owner full access, public read-only on display_name/avatar_url.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Auto-created | New auth user created | Sign-up completes | Row exists with role `authenticated` |
| Cross-user privacy | User A authenticated | Queries user B profile | Only display_name/avatar_url returned |

### Requirement: Categories

Admins only MAY insert/update/delete. All roles MAY read.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Admin creates | Admin user | Inserts "Hiking" | Persists, visible to all |
| Non-admin blocked | Authenticated non-admin | Attempts insert | Rejected by RLS |

### Requirement: Plans

Free users SHALL be capped at 3 active plans. Premium users SHALL have no cap and MAY create recurring (auto-regenerated) and featured (different map marker) plans.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Create under cap | Authenticated, <3 active plans | Inserts plan | Persists, status='active' |
| Free cap blocks | Authenticated, 3 active plans | Inserts fourth | Rejected |
| Premium unlimited | Premium, 3+ active | Creates another | Succeeds |
| Recurring plan | Premium | is_recurring=true | Persists; SHALL regenerate |
| Featured pin | Premium | is_featured=true | Marker shows featured style |
| Soft delete | Plan owner | Deletes | deleted_at=now(); excluded |
| Non-owner blocked | User B | Updates user A plan | Rejected by RLS |

### Requirement: Plan Participants

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Join | Authenticated, viewing another's plan | Joins | Row inserted |
| Leave | Participant | Leaves | Row deleted |

### Requirement: Category Subscriptions

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Subscribe | Authenticated | Subscribes to category | Row inserted |
| Unsubscribe | Subscribed | Unsubscribes | Row deleted |

### Requirement: Notifications

Notifications MUST be inserted per category subscriber when a plan is created in their subscribed category.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Trigger on create | Plan in "Cycling"; subscribers exist | Insert succeeds | 1 notification per subscriber |

### Requirement: Spatial Queries

PostGIS `ST_DWithin` MUST find active, non-deleted plans within radius. Soft-deleted plans MUST be excluded.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Nearby plans | Map at (lat,lng) | Query 10km radius | Only active plans in radius |
| Deleted excluded | Soft-deleted plan in radius | Spatial query | Not returned |

### Requirement: Local Development Environment

The system MUST provide a Docker-based local Supabase stack via the Supabase CLI. Developers MUST be able to start, stop, generate types, and run migrations without a remote Supabase project.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Start local stack | Docker running | `supabase start` | Postgres, Auth, Storage available on localhost |
| Stop local stack | Local stack running | `supabase stop` | All containers stopped |
| Generate types | Local DB with schema | `supabase gen types typescript --local` | `database.types.ts` with all tables and columns |
| Run migrations | New migration file in `supabase/migrations/` | `supabase db push` | Schema applied to local DB |
| Create migration | Developer needs new migration | `supabase migration new <name>` | Timestamped SQL file created in `supabase/migrations/` |
| Workspace scripts | Monorepo configured | `bun run db:start` | Equivalent to `supabase start` from project root |

### Requirement: RLS Policies

Every table MUST have RLS enabled. Visitors (anon) MAY read active plans and categories, MUST NOT write. Authenticated users MAY CRUD own rows. Premium SHALL bypass active-plan cap. Admins MAY CRUD any row.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Visitor reads | Unauthenticated | Queries plans | Active plans returned |
| Visitor write blocked | Unauthenticated | INSERTS plan | Rejected |
| Admin full CRUD | Admin | Updates any category | Succeeds |
