# Design: Supabase Backend Integration

## Technical Approach

Client-first architecture where the Ionic app talks directly to Supabase via `@supabase/supabase-js`. Security at the Postgres level (RLS). Drizzle ORM provides the typed data layer with migrations managed by Drizzle Kit. Server-side logic runs in Supabase Edge Functions (Deno). No BFF server — `@mapgis/server` removed.

---

## 1. System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           MAPGIS SYSTEM                              │
│                                                                      │
│  ┌──────────────────────┐      ┌──────────────────────────────────┐ │
│  │   @mapgis/app        │      │     SUPABASE (managed)            │ │
│  │   (Ionic React +     │◀────▶│                                    │ │
│  │    Capacitor + Vite) │      │  ┌──────────┐  ┌──────────────┐  │ │
│  │                      │      │  │  Auth    │  │  Postgres    │  │ │
│  │  ┌────────────────┐  │      │  │  (JWT +  │  │  + PostGIS   │  │ │
│  │  │ React Context  │  │      │  │  PKCE)   │  │  + FTS       │  │ │
│  │  │ (Auth + State) │  │      │  └──────────┘  │  + RLS       │  │ │
│  │  └────────────────┘  │      │                └──────────────┘  │ │
│  │                      │      │                                    │ │
│  │  ┌────────────────┐  │      │  ┌──────────┐  ┌──────────────┐  │ │
│  │  │ React Query    │──┼──────┼─▶│ Realtime │  │Edge Functions│  │ │
│  │  │ (TanStack)     │  │      │  │(WebSocket│  │  (Deno)      │  │ │
│  │  └────────────────┘  │      │  │ channels)│  │              │  │ │
│  │                      │      │  └──────────┘  └──────────────┘  │ │
│  │  ┌────────────────┐  │      └──────────────────────────────────┘ │
│  │  │ Drizzle Client │──┼─ ─ ─ ─ ─ ─ ─ ┐                             │
│  │  │ (typed queries)│  │               │                             │
│  │  └────────────────┘  │      ┌────────▼─────────────────────────┐ │
│  │                      │      │  EXTERNAL SERVICES               │ │
│  │  ┌────────────────┐  │      │                                  │ │
│  │  │ Capacitor      │  │      │  Polar ──▶ Payments              │ │
│  │  │ (native layer) │  │      │  Resend ─▶ Transactional Email   │ │
│  │  └────────────────┘  │      │  Sentry ─▶ Error Monitoring      │ │
│  └──────────────────────┘      │  PostHog ─▶ Product Analytics    │ │
│     │                          │  Google Analytics ─▶ Web Traffic │ │
│     │                          └──────────────────────────────────┘ │
│     ▼                                                                │
│  ┌──────────────────────┐                                            │
│  │  DEPLOYMENT          │                                            │
│  │  ┌────────────────┐  │                                            │
│  │  │ Cloudflare CDN │──┼── PWA web assets (mapgis.app)              │
│  │  │ VPS (Nginx)    │──┼── Reverse proxy + static files             │
│  │  │ Google Play    │──┼── Android APK/AAB via GitHub Actions       │
│  │  └────────────────┘  │                                            │
│  └──────────────────────┘                                            │
└──────────────────────────────────────────────────────────────────────┘
```

**Data flow**: App queries Supabase Postgres via Drizzle ORM (wrapped by TanStack React Query for caching). Auth flows through Supabase Auth (PKCE). Realtime subscriptions push DB changes via WebSocket. Edge Functions handle webhooks from Polar/Resend and server-side business logic.

---

## 2. Package Structure & Responsibilities

| Package | Dir | Owns |
|---------|-----|------|
| `@mapgis/supabase` | `packages/supabase/src/` | Drizzle schema (`schema/`), migrations (`drizzle/`), generated DB types, Supabase client singleton, Auth provider (React context), typed query helpers |
| `@mapgis/app` | `packages/mapgis/src/` | Ionic React UI: pages, components, services (Drizzle query wrappers), hooks (`usePlan`, `useAuth`, `useRealtime`), Capacitor plugins |
| `@mapgis/shared` | `packages/shared/src/` | Domain types (`Plan`, `Category`, `Profile`, `Notification`), DTOs, Zod validation schemas, constants (`ROLES`, `PLAN_LIMITS`), no runtime deps on Supabase or Drizzle |
| Root `supabase/` | `supabase/` | Supabase CLI config, edge functions, seed data; migrations live in `packages/supabase/drizzle/` managed by Drizzle Kit |
| Root `.github/` | `.github/workflows/` | CI/CD: PR checks, preview deploy, production deploy, Play Store release |

**Why separate `@mapgis/supabase` and `@mapgis/shared`**: shared has zero dependencies — other packages can import domain types without pulling in Supabase or Drizzle. supabase owns the DB layer exclusively.

### 2.1 Provider Abstractions (Vendor Independence)

To avoid vendor lock-in for services likely to change, the design follows a **Provider Pattern**: interfaces in `@mapgis/shared` (zero deps), concrete implementations in `@mapgis/supabase` (with SDK deps).

```
@mapgis/shared/src/providers/
├── payment.ts         ← interface PaymentProvider
├── email.ts           ← interface EmailProvider
├── analytics.ts       ← interface AnalyticsProvider
└── map.ts             ← interface MapProvider

@mapgis/supabase/src/providers/
├── polar.ts           ← implements PaymentProvider (Polar SDK)
├── resend.ts          ← implements EmailProvider (Resend SDK)
├── posthog.ts         ← implements AnalyticsProvider (PostHog SDK)
└── leaflet.tsx        ← implements MapProvider (react-leaflet) ⚠️ pendiente
```

| Abstraction | Why | Interface Methods |
|---|---|---|
| `PaymentProvider` | Cambiar de Polar a Stripe/Lemon Squeezy es común | `createCheckout(userId)`, `handleWebhook(payload)`, `getSubscription(userId)` |
| `EmailProvider` | SMTP es commodity — SendGrid, SES, Postmark | `sendWelcome(email)`, `sendNotification(email, plan)` |
| `AnalyticsProvider` | Analytics se migra seguido — Amplitude, Mixpanel | `track(event, props)`, `identify(userId)`, `group(orgId)` |
| `MapProvider` | Leaflet → Google Maps/Mapbox/OpenLayers según necesidad GIS ⚠️ | Componente `<MapView>` genérico; el provider concreto define tiles, marcadores, interacciones |

**NOT abstracted**: Supabase Auth (leaky abstraction — el flujo de sesión es específico del proveedor), Supabase Realtime (protocolo WebSocket propietario), Drizzle ORM (ya es abstracción contra Postgres), Sentry (reemplazo es cambiar `init()` — no justifica capa).

---

## 3. Data Layer Design

### 3.1 Drizzle Schema

```
packages/supabase/src/schema/
├── index.ts              # re-exports all tables + relations
├── profiles.ts           # profiles table
├── categories.ts         # categories table
├── plans.ts              # plans table + geometry column
├── plan-participants.ts  # plan_participants join table
├── category-subscriptions.ts  # category_subscriptions join table
├── notifications.ts      # notifications table
└── relations.ts          # Drizzle relations definitions
```

**Domain entity mapping**:

| Entity | Table | Key Drizzle columns |
|--------|-------|---------------------|
| Profile | `profiles` | `id uuid PK DEFAULT gen_random_uuid()` → `auth.users`, `role text DEFAULT 'authenticated'`, `display_name text`, `avatar_url text`, `created_at`, `updated_at` |
| Category | `categories` | `id uuid PK`, `name text UNIQUE`, `slug text UNIQUE`, `icon text`, `created_at` |
| Plan | `plans` | `id uuid PK`, `creator_id uuid FK→profiles`, `title text`, `description text`, `location geometry(Point, 4326)` (PostGIS), `category_id uuid FK→categories`, `status text DEFAULT 'active'`, `is_recurring boolean DEFAULT false`, `is_featured boolean DEFAULT false`, `max_participants int`, `starts_at timestamptz`, `ends_at timestamptz`, `created_at`, `updated_at`, `deleted_at timestamptz` |
| PlanParticipant | `plan_participants` | `plan_id uuid FK→plans`, `user_id uuid FK→profiles`, `joined_at timestamptz DEFAULT now()`, composite PK (`plan_id`, `user_id`) |
| CategorySubscription | `category_subscriptions` | `user_id uuid FK→profiles`, `category_id uuid FK→categories`, `subscribed_at timestamptz DEFAULT now()`, composite PK (`user_id`, `category_id`) |
| Notification | `notifications` | `id uuid PK`, `user_id uuid FK→profiles`, `plan_id uuid FK→plans`, `type text`, `message text`, `read boolean DEFAULT false`, `created_at timestamptz DEFAULT now()` |

### 3.2 PostGIS with Drizzle

Drizzle supports PostGIS via `@drizzle-team/pg-geo`. Geometry columns are declared as:

```ts
import { geometry } from "@drizzle-team/pg-geo";

export const plans = pgTable("plans", {
  // ...
  location: geometry("location", { type: "point", srid: 4326 }).notNull(),
});
```

Spatial queries use raw SQL fragments wrapped in Drizzle's `sql` tagged template:

```ts
// Find plans within 10km radius
db.select()
  .from(plans)
  .where(
    sql`ST_DWithin(${plans.location}::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})`
  );
```

### 3.3 Postgres FTS Configuration

- **tsvector column on `plans`**: `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))) STORED`
- **GIN index**: `CREATE INDEX plans_search_idx ON plans USING GIN (search_vector);`
- **Trigger**: Automatically updates `search_vector` on INSERT/UPDATE of `title` or `description`
- **Query via Drizzle**:

```ts
db.select()
  .from(plans)
  .where(sql`search_vector @@ plainto_tsquery('english', ${query})`);
```

### 3.4 RLS + Drizzle

RLS policies live at the Postgres level (defined in migration SQL or `supabase/migrations/`). Drizzle queries see only what RLS allows — no special Drizzle configuration needed. The Supabase client injects the user's JWT via `auth.uid()`, which RLS policies use.

**RLS policy matrix**:

| Table | Visitor (anon) | Authenticated | Premium | Admin |
|-------|---------------|---------------|---------|-------|
| `profiles` | Read display_name, avatar_url | Read own fully; write own | Same | Full CRUD |
| `categories` | Read | Read | Read | Full CRUD |
| `plans` | Read active, non-deleted | CRUD own; read all active | CRUD own (no cap); read all active | Full CRUD |
| `plan_participants` | Read | Join/leave (own user_id) | Same | Full CRUD |
| `category_subscriptions` | — | CRUD own | Same | Full CRUD |
| `notifications` | — | Read own; mark read | Same | Full CRUD |

### 3.5 Migration Strategy

**Drizzle Kit** manages schema migrations (`drizzle-kit generate` → `drizzle-kit migrate`). Migrations output to `packages/supabase/drizzle/` as SQL files. For the local Supabase stack, run migrations via Drizzle Kit pointing at `localhost:54322`. For staging/production, migrations run as part of CI/CD (GitHub Actions step: `bun run db:migrate` against the Supabase project URL).

RLS policies and FTS triggers are custom SQL migrations (not auto-generated by Drizzle). They live alongside Drizzle-generated migrations in the same directory, prefixed manually (e.g., `0002_rls_policies.sql`).

---

## 4. API & Data Flow Design

### 4.1 Client-Side Data Flow

```
Component → Service (typed query fn) → Drizzle Client → Supabase Postgres
    │              │                         │
    ▼              ▼                         ▼
 React Query    useQuery/              pg driver via
 (cache,        useMutation            @supabase/supabase-js
  refetch)                              connection
```

**Layers**:
1. **Components** call hooks (e.g., `usePlansNearby(lat, lng, radius)`)
2. **Service hooks** wrap Drizzle queries in React Query: `useQuery({ queryKey: ['plans', lat, lng], queryFn: () => planService.findNearby(lat, lng, radius) })`
3. **Service modules** (`planService.ts`) contain pure Drizzle query functions that return typed results
4. **Drizzle Client** is a singleton created from `@mapgis/supabase/src/client.ts`

### 4.2 Auth Flow

```
Login Page → supabase.auth.signInWithPassword() → Supabase Auth
                                                       │
                                              ┌────────▼────────┐
                                              │ DB trigger       │
                                              │ creates profiles │
                                              │ row on sign-up   │
                                              └────────┬────────┘
                                                       │
App.tsx AuthProvider ←─ supabase.auth.onAuthStateChange()
    │
    ├── Navigation: authenticated → main tabs, visitor → /login
    └── Drizzle queries: JWT injected automatically via Supabase client
```

**AuthProvider** (React Context) exposes `session`, `user`, `profile` (from profiles table), and `role`. The provider calls `supabase.auth.getSession()` on mount for session restoration.

### 4.3 Realtime Flow

```
useRealtime('plans', { filter: 'category_id=eq.xxx' })
    │
    ▼
supabase.channel('custom-channel')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'plans', filter },
        (payload) => { ... })
    .subscribe()
    │
    ▼
React Query cache invalidation
    │
    ▼
UI re-renders with fresh data
```

**useRealtime hook pattern**: Takes table name, optional filter. On INSERT → invalidate relevant React Query keys. On UPDATE → update cache. On DELETE → remove from cache. Auto-reconnect handled by Supabase client. Channel lifecycle tied to component mount/unmount.

### 4.4 Edge Functions Design

**What runs server-side and why**:

| Edge Function | Trigger | Why Server-Side |
|---------------|---------|-----------------|
| `polar-webhook` | Polar checkout.session.completed | Uses `service_role` key to update `profiles.role = 'premium'`; must never expose service_role to client |
| `send-notification-email` | New plan in subscribed category | Calls Resend API with API key (secret); batches emails to avoid rate limits |
| `welcome-email` | `auth.users` INSERT trigger | Sends welcome email via Resend; secret API key |
| `recurring-plan-regenerator` | Cron (pg_cron or external) | Regenerates `is_recurring=true` plans; requires service_role to create plans as system |

Edge Functions use Deno runtime. They import `@supabase/supabase-js` with `service_role` key from environment variables. Each function is a single file in `supabase/functions/<name>/index.ts`.

---

## 5. UI Architecture

### 5.1 Route Tree

```
/ (redirect to /map or /login)
├── /login          — email/password form + Google OAuth button
├── /register       — email/password form + Google OAuth button
├── /map (main tab) — map view with plan pins + category filter
├── /plan/:id       — full plan details + join/leave + participants
├── /create-plan    — plan creation form (location picker, category, dates)
├── /profile        — user profile + plans created + plans joined
├── /profile/edit   — edit display_name, avatar
└── /admin          — (role: admin only) category CRUD, user moderation
```

### 5.2 Component Tree per Major Page

**Map Page (`/map`)**
```
MapPage
├── MapView (Leaflet/react-leaflet or Google Maps)
│   ├── PlanMarker[] (clickable pins; featured = highlighted)
│   └── LocationSearch (geocoding input)
├── CategoryFilter (horizontal scroll chips)
├── PlanListPanel (bottom sheet / side panel)
│   └── PlanCard[] (title, distance, creator, participants count)
└── FloatingActionButton → /create-plan
```

**Plan Detail (`/plan/:id`)**
```
PlanDetailPage
├── PlanHeader (title, category badge, featured badge)
├── PlanMap (single pin showing plan location)
├── PlanInfo (description, starts_at, ends_at, max_participants)
├── ParticipantList (avatars + count)
├── JoinButton / LeaveButton (gated: auth required)
└── ShareButton (Capacitor Share plugin)
```

**Create Plan (`/create-plan`)**
```
CreatePlanPage
├── TitleInput
├── DescriptionInput
├── CategoryPicker (dropdown / modal)
├── LocationPicker (interactive map + address search)
├── DateTimePicker (starts_at, ends_at)
├── MaxParticipantsInput
├── PremiumToggle[] (recurring, featured — hidden if not premium)
└── SubmitButton
```

### 5.3 State Management

| Concern | Tool | Rationale |
|---------|------|-----------|
| Server state | TanStack React Query | Cache plans, categories, notifications; auto-refetch; optimistic updates for join/leave |
| Auth + role | React Context (`AuthProvider`) | Session and profile needed everywhere; updates via `onAuthStateChange` |
| UI/local state | `useState` / `useReducer` | Form inputs, map viewport, filter selections |
| Realtime events | `useRealtime` hook | Push-based updates; invalidates React Query cache on DB change |

### 5.4 Loading, Empty, Error States

| Page | Loading | Empty | Error |
|------|---------|-------|-------|
| `/map` | Skeleton pins on map + shimmer cards in panel | "No plans nearby yet. Create one!" CTA | Toast: "Couldn't load plans. Pull to retry." |
| `/plan/:id` | Skeleton layout (title bar, map placeholder, text blocks) | N/A (invalid ID → 404 page) | "Plan not found or you don't have access." |
| `/create-plan` | Submit button spinner | N/A | Inline field errors + toast for network failure |
| `/profile` | Avatar skeleton + shimmer list | Empty state per tab: "No plans created" / "Haven't joined any plans" | Same error pattern as map |

### 5.5 Offline / Mobile Considerations

- **Capacitor**: Uses `@capacitor/preferences` for session token storage (persists across app restarts)
- **Offline**: React Query `staleTime` + `gcTime` (formerly `cacheTime`) for stale-while-revalidate. Map tiles cached by browser. Mutations queued when offline (future enhancement; MVP shows "No connection" banner)
- **Deep linking**: `capacitor://` custom scheme for dev, Universal Links / App Links for production. Capacitor `App.addListener('appUrlOpen')` catches OAuth redirects
- **Haptics**: `@capacitor/haptics` on join/leave/plan-created for tactile feedback

---

## 6. Premium & Payment Flow

### 6.1 Polar Integration

```
User taps "Upgrade" → Polar Checkout (hosted page)
    │
    ▼
Polar processes payment
    │
    ▼
Polar webhook → POST /supabase/functions/polar-webhook
    │
    ▼
Edge Function validates signature → updates profiles.role = 'premium'
    │
    ▼
AuthProvider detects role change → UI re-renders with premium features
```

**Webhook security**: Polar signs webhooks with a secret. Edge Function verifies HMAC before processing. Uses `service_role` key to update profiles table (RLS would block normal user from self-upgrading role).

### 6.2 Feature Gating

```ts
// @mapgis/shared/src/roles.ts
export const ROLES = { visitor: 'visitor', authenticated: 'authenticated', premium: 'premium', admin: 'admin' } as const;

// In components:
const { role } = useAuth();
const isPremium = role === 'premium' || role === 'admin';
```

| Feature | Gate |
|---------|------|
| Unlimited plans | `role === 'premium' \|\| role === 'admin'` |
| Recurring plans | Same; UI toggle hidden if not premium |
| Featured pin | Same; checkbox hidden if not premium |
| Admin panel | `role === 'admin'` |

### 6.3 Free Tier Enforcement

Two layers:
1. **UI check**: Before showing "Create Plan" button enabled, count user's active (non-deleted) plans via `planService.countActive(userId)`. If ≥3 and not premium, disable button + show "Upgrade for more" upsell.
2. **RLS enforcement**: A database-level policy rejects INSERT on `plans` when `(SELECT count(*) FROM plans WHERE creator_id = auth.uid() AND deleted_at IS NULL) >= 3 AND (SELECT role FROM profiles WHERE id = auth.uid()) != 'premium'`. Defense in depth.

---

## 7. Email & Notifications

### 7.1 Resend Integration

| Email | Trigger | Called From |
|-------|---------|-------------|
| Welcome | New `auth.users` INSERT (DB trigger → Edge Function) | Edge Function `welcome-email` |
| Email verification | Supabase Auth built-in | Supabase Auth (configured in Supabase dashboard to use Resend SMTP) |
| New plan in subscribed category | After plan INSERT (DB trigger → Edge Function) | Edge Function `send-notification-email` |
| Plan reminder | Cron Edge Function checks `starts_at` | Edge Function (future) |

**Resend API key** stored in Supabase secrets (`supabase secrets set RESEND_API_KEY=...`), accessed by Edge Functions via `Deno.env.get("RESEND_API_KEY")`.

### 7.2 Realtime vs Email

| Channel | What | Why |
|---------|------|-----|
| **Realtime** (WebSocket) | Instant in-app notification when plan created in subscribed category | User is actively using the app; immediate feedback |
| **Resend** (Email) | Email notification for plan in subscribed category (if user opted in) | User is offline/away; email reaches them anywhere |
| **Realtime** | Map pin appears/disappears | Collaborative map viewing needs instant visual updates |
| **Resend** | Welcome, verification, reminders | Transactional; email is the canonical delivery channel |

---

## 8. Monitoring & Analytics

### 8.1 Sentry (Error Monitoring)

**Instrumentation points**:
- **App**: `Sentry.init()` in `main.tsx` with React Error Boundary. Captures all unhandled React errors.
- **Edge Functions**: Each function wraps handler in try/catch → `Sentry.captureException()`.
- **Critical query paths**: `planService.findNearby()`, auth provider `getSession()` — manual spans for perf tracing.

**Configuration**: `SENTRY_DSN` as Vite env var (`VITE_SENTRY_DSN`) for app; Supabase secret for Edge Functions. Separate projects in Sentry: `mapgis-app`, `mapgis-edge`.

### 8.2 PostHog (Product Analytics)

**Events tracked**:
| Event | Properties | When |
|-------|-----------|------|
| `plan_created` | category, is_recurring, is_featured | Plan INSERT succeeds |
| `plan_joined` | plan_id, category | User joins a plan |
| `plan_left` | plan_id | User leaves a plan |
| `category_subscribed` | category | User subscribes |
| `category_unsubscribed` | category | User unsubscribes |
| `upgrade_clicked` | — | User taps "Upgrade" |
| `upgrade_completed` | plan_type | Polar webhook confirms payment |

**Init**: `posthog.init()` in `main.tsx` with `VITE_POSTHOG_KEY`. Feature flags for gradual rollout (future).

### 8.3 Google Analytics (Web Traffic)

Standard GA4 snippet in `index.html` via Vite's `transformIndexHtml`. Tracks page views only (privacy-first: no event-level user behavior in GA). PostHog handles product events.

### 8.4 Coexistence

Sentry loads first (error boundary), PostHog second, GA third. All initialized in `main.tsx`. No conflicts — they operate on different domains (errors, product events, page views).

---

## 9. Deployment Architecture

### 9.1 VPS Setup

**What runs on the VPS**:
- **Nginx reverse proxy**: Terminates TLS, serves PWA static assets (Vite build output), proxies `/api/*` to Supabase if any BFF routes remain (none in MVP)
- **Static files**: `@mapgis/app` Vite build → `dist/` → rsync'd or SCP'd to VPS via CI/CD
- **No Node/Bun runtime** on VPS for MVP — everything is static or on Supabase

**VPS spec**: 1GB RAM, 1vCPU, 25GB SSD. Ubuntu 24.04 LTS. Nginx + Certbot for LetsEncrypt auto-renewal.

### 9.2 Cloudflare CDN

```
User → Cloudflare Edge (global) → VPS Origin (if cache miss)
                │
                ▼
       Cached static assets:
       *.js, *.css, *.woff2, *.png, *.svg
```

**Cache strategy**: Aggressive for fingerprinted assets (Vite build produces `[name]-[hash].js`). Cache-Control: `public, max-age=31536000, immutable`. HTML: `public, max-age=0, must-revalidate` (to pick up new asset hashes).

### 9.3 Play Store Deployment

1. GitHub Actions build job runs `bun run build` → produces `dist/` web assets
2. `npx @capacitor/cli sync android` generates Android project
3. Android project opened by `./gradlew assembleRelease` → signed APK/AAB using keystore from GitHub Secrets
4. `r0adkll/upload-google-play@v1` GitHub Action uploads to Play Console internal track

### 9.4 Environment Separation

| Environment | Supabase | Domain | Purpose |
|-------------|----------|--------|---------|
| **Local** | `supabase start` (Docker) | `localhost:5173` | Development |
| **Staging** | Supabase project `mapgis-staging` | `staging.mapgis.app` | Integration testing, preview deploys |
| **Production** | Supabase project `mapgis-prod` | `mapgis.app` | Live users |

### 9.5 Secrets Management

| Secret | Dev | CI/CD | Production |
|--------|-----|-------|------------|
| `VITE_SUPABASE_URL` | `.env.local` | GitHub Actions secret | Injected at build time |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` | GitHub Actions secret | Injected at build time |
| `SUPABASE_SERVICE_ROLE_KEY` | N/A (local only) | GitHub Actions secret (migrations) | Supabase dashboard |
| `RESEND_API_KEY` | N/A | N/A | `supabase secrets set` |
| `POLAR_WEBHOOK_SECRET` | N/A | N/A | `supabase secrets set` |
| `SENTRY_DSN` | `.env.local` | GitHub Actions secret | Injected at build time |
| `POSTHOG_KEY` | `.env.local` | GitHub Actions secret | Injected at build time |
| Android keystore | N/A | GitHub Actions secret | GitHub Actions |

---

## 10. CI/CD Pipeline (GitHub Actions)

### 10.1 PR Checks (`pr.yml` — on pull_request to main)

```
Lint ──┬── Type Check ──┬── Unit Tests ──┬── Schema Diff
       │                │                │
       │                │                └── drizzle-kit check (detects drift)
       │                │
       │                └── tsc --noEmit (all packages)
       │
       └── eslint (all packages)
```

- **Schema diff**: `bun run db:diff` compares local Drizzle schema against staging Supabase. Fails PR if migrations are missing.
- **Tests**: Vitest unit tests; Cypress e2e runs on staging deploy only (not per-PR for speed).

### 10.2 Preview Deploy (`preview.yml` — on pull_request to main)

1. Build `@mapgis/app` with staging env vars
2. Deploy to VPS subdomain: `pr-{number}.staging.mapgis.app`
3. Comment PR with preview URL
4. Cypress e2e runs against preview URL

### 10.3 Production Deploy (`deploy.yml` — on push to main)

```
Build (web) ──┬── Deploy to VPS (rsync dist/ to /var/www/mapgis)
               │       │
               │       └── Purge Cloudflare cache (API call)
               │
               └── Build (Android) ──┬── Sign APK/AAB
                                     │
                                     └── Upload to Play Console (internal track)
```

- **Web deploy**: `rsync -avz --delete dist/ user@vps:/var/www/mapgis/` over SSH
- **Cache purge**: Cloudflare API `POST /zones/:id/purge_cache` for changed assets
- **Android**: Matrix build with `./gradlew bundleRelease` → `r0adkll/upload-google-play@v1`

### 10.4 Migration CI (`migrate.yml` — on push to main)

Before production deploy:
1. Run `bun run db:migrate` against staging Supabase
2. Verify migrations apply cleanly
3. If staging passes, run against production Supabase (with manual approval gate for production migrations)
4. On failure: roll back via `drizzle-kit drop` → re-apply last known good migration (automated rollback TBD; MVP: manual intervention)

---

## Architecture Decisions

| Decision | Choice | Alternatives Rejected | Rationale |
|----------|--------|----------------------|-----------|
| ORM | Drizzle ORM | Prisma (heavier, own migration system), raw supabase-js (no type-safe queries) | Drizzle is lightweight (no codegen runtime), first-class Postgres, works with Bun, has PostGIS support via `@drizzle-team/pg-geo` |
| Migrations | Drizzle Kit (SQL output) | supabase db push (no diff, no rollback), Prisma Migrate (vendor lock-in) | Drizzle Kit generates SQL files → version-controlled, reviewable, reversible. Compatible with Supabase Postgres. |
| Server runtime | Supabase Edge Functions (Deno) | Bun server (BFF pattern) | Client-first architecture eliminates BFF for MVP. Edge Functions handle the 20% that needs server-side: webhooks, secrets, cron. Same managed platform. |
| State management | TanStack React Query | Zustand (duplicates server state), Redux (overhead), useState only (no cache) | React Query is purpose-built for server state — cache, refetch, optimistic updates, loading/error states. Pairs with Drizzle queries naturally. |
| Validation | Zod (in @mapgis/shared) | Yup, Joi, custom validators | Zod is TypeScript-first, tree-shakeable, works in both browser and Deno edge functions. Shared package avoids duplication. |
| Map library | react-leaflet (Leaflet) ⚠️ pendiente | Google Maps (API key required, cost), Mapbox GL (pricing), OpenLayers (ver Open Questions) | Leaflet es free, open-source, ligero (40KB), mobile-first. PostGIS ya hace el trabajo GIS pesado en el backend. **Pendiente validación con ingeniero geoespacial** para descartar OpenLayers si hay requisitos GIS avanzados en el frontend. |
| Payments | Polar | Stripe (more complex setup) | Polar is open-source, simpler API for SaaS billing, handles subscription lifecycle. |
| Email | Resend | SendGrid, SES, Postmark | Resend has excellent React/TS DX, modern API, Supabase integration docs. |

---

## Open Questions

- [ ] **Leaflet vs OpenLayers — pendiente consulta con ingeniero geoespacial**:

| Criterio | Leaflet | OpenLayers |
|---|---|---|
| **Peso** | ~40 KB gzip | ~150 KB gzip |
| **Mobile / WebView** | Diseñado mobile-first, ligero en Capacitor Android/iOS | Pesado para WebView; más pensado para desktop GIS |
| **Renderizado** | DOM + CSS (sencillo, compatible) | Canvas + WebGL (más performante con miles de features) |
| **Casos de uso ideales** | Mostrar marcadores, popups, rutas simples, capas de tiles | GIS profesional: WMS, WFS, WMTS, reproyección de coordenadas, buffers, análisis espacial |
| **Proyecciones** | Solo EPSG:3857 (Web Mercator) nativo; Proj4js para otras | Soporte nativo de cualquier EPSG vía Proj4js integrado |
| **Formatos de datos** | GeoJSON nativo; plugins para KML, GPX | GeoJSON, KML, GPX, GML, TopoJSON, WKT — todo nativo |
| **React** | react-leaflet (maduro, 4.5k+ stars, mantenido) | rlayers (más nuevo, menos tracción, documentación escasa) |
| **Curva de aprendizaje** | Mínima — se entiende en horas | Alta — API extensa, mucha terminología GIS |
| **Plugins / ecosistema** | Amplio: clustering, heatmaps, dibujo, geocoding | Menos plugins; la funcionalidad viene en el core |
| **Licencia** | BSD 2-clause | BSD 2-clause |
| **Lo que NO hace bien** | GIS avanzado: buffers, intersecciones, reproyección compleja | UX simple: marcadores y popups requieren más código que Leaflet |

**Guía para la decisión:**

Usar **Leaflet** si:
- PostGIS ya hace el trabajo pesado (ST_DWithin, ST_Buffer, consultas espaciales)
- El frontend solo necesita **mostrar** resultados en un mapa con pins, popups y filtros
- La app corre en WebView móvil (Capacitor) — el peso y rendimiento importan
- No necesitás cambiar de proyección ni consumir servicios WMS/WFS

Usar **OpenLayers** si:
- Necesitás renderizar miles de features geoespaciales simultáneamente
- El usuario hace análisis espacial en el frontend (buffers, mediciones, intersecciones)
- Consumís servicios WMS/WFS/WMTS de un GeoServer o similar
- Trabajás con múltiples sistemas de coordenadas (no solo Web Mercator)
- Necesitás formatos GIS complejos (GML, WKT, TopoJSON) sin plugins

**Recomendación actual**: Leaflet — porque PostGIS cubre el GIS pesado en el backend, la app es mobile-first con Capacitor, y las necesidades del frontend son visualización (no análisis). **Pendiente validación del ingeniero geoespacial** para confirmar que no hay requisitos ocultos de GIS que inclinen la balanza hacia OpenLayers.

- [ ] **Drizzle Kit vs supabase db push coexistence**: If we use Drizzle Kit for schema management, should we still maintain `supabase/migrations/` for RLS policies and triggers? Likely yes — Drizzle Kit manages table structure, custom SQL files manage RLS and FTS. Need to document the handoff clearly.
- [ ] **Realtime filter by bounding box**: Supabase Realtime filters support `eq` on columns but not spatial predicates. Workaround: filter client-side or use a materialized view with pre-calculated grid cell IDs. Confirmed? Or accept client-side filtering for MVP.
- [ ] **Capacitor WebSocket on Android**: Some Android WebView versions have spotty WebSocket support. Need real-device testing. Fallback: HTTP polling via React Query `refetchInterval`.
- [ ] **Polar webhook idempotency**: Polar may deliver webhooks more than once. Edge Function must be idempotent — check if role already 'premium' before updating. Document this in the edge function spec.
- [ ] **Free tier cap edge case**: What if user creates 3 plans, deletes 1 (soft-delete), then creates another? RLS policy counts `deleted_at IS NULL` — works correctly. But what about "recently deleted" grace period? Not in MVP scope but worth flagging.
