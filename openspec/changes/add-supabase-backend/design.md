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
│  │  │ Bare Metal      │──┼── Docker Compose: Supabase + Nginx         │
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

### 9.1 Bare Metal Server Setup

**What runs on the server**:

```
Bare Metal (Ubuntu 24.04 LTS)
│
├── Docker Compose stack
│   ├── supabase-postgres     (Postgres 15 + PostGIS + pg_cron)
│   ├── supabase-gotrue       (Auth — JWT, PKCE, OAuth)
│   ├── supabase-realtime     (WebSocket server)
│   ├── supabase-storage      (S3-compatible object storage)
│   ├── supabase-postgrest    (Auto-generated REST API)
│   ├── supabase-kong         (API gateway — routes to all services)
│   └── supabase-edge-functions (Deno runtime)
│
├── Nginx (host)
│   ├── Reverse proxy: /api/* → kong:8000, /rest/v1/* → postgrest:3000
│   ├── Static files: / → /var/www/mapgis/ (Vite build output)
│   └── TLS termination: Certbot + LetsEncrypt auto-renewal
│
└── System services
    ├── cron: pg_dump backups, log rotation
    ├── UFW firewall: only 80/443 open
    └── fail2ban: SSH brute-force protection
```

**Minimum spec**: 4GB RAM, 4 vCPU, 50GB SSD. Ubuntu 24.04 LTS. Docker + Docker Compose.

**Why 4GB not 1GB**: Supabase self-hosted runs 7 containers. Postgres alone needs ~512MB for shared_buffers. Auth + Realtime + Kong + PostgREST + Storage + Edge Functions consume ~2GB baseline.

### 9.2 Supabase Self-Hosted Setup

**Docker Compose** uses the official Supabase self-hosted repo as reference:

```yaml
# docker-compose.yml (simplified — full config from supabase/supabase)
services:
  postgres:
    image: supabase/postgres:15.6.1.140
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"

  gotrue:
    image: supabase/gotrue:v2.158.1
    environment:
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_DB_DATABASE_URL: postgres://...@postgres:5432/postgres
      GOTRUE_SITE_URL: https://mapgis.app
      GOTRUE_EXTERNAL_GOOGLE_ENABLED: "true"
    depends_on: [postgres]

  realtime:
    image: supabase/realtime:v2.30.42
    # ... env config

  postgrest:
    image: postgrest/postgrest:v12.2.0
    # ... env config

  kong:
    image: kong:3.6.1
    ports:
      - "8000:8000"   # API gateway (internal, proxied by Nginx)
    # ... env config + declarative config

volumes:
  postgres_data:
```

**Initialization**: `init.sql` enables PostGIS and pg_cron extensions on first boot:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

**Key differences from Supabase Cloud**:
- Edge Functions run locally (not on global edge network) — higher latency for distant users, mitigated by Cloudflare CDN for static assets
- Auth emails use SMTP (configured in `gotrue` env) instead of Supabase-managed email service
- Real-time is same WebSocket protocol — no code changes in the app
- Storage uses local filesystem or S3-compatible backend (MinIO) instead of Supabase-managed S3

### 9.3 Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name mapgis.app;

    ssl_certificate     /etc/letsencrypt/live/mapgis.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mapgis.app/privkey.pem;

    # Static PWA assets
    root /var/www/mapgis;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Supabase REST API (PostgREST)
    location /rest/v1/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }

    # Supabase Auth
    location /auth/v1/ {
        proxy_pass http://127.0.0.1:9999;
        proxy_set_header Host $host;
    }

    # Supabase Realtime WebSocket
    location /realtime/v1/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Supabase Storage
    location /storage/v1/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }
}
```

### 9.4 Cloudflare CDN

```
User → Cloudflare Edge (global) → Bare Metal (origin, if cache miss)
                │
                ▼
       Cached static assets:
       *.js, *.css, *.woff2, *.png, *.svg
```

**Cache strategy**: Same as before — fingerprinted assets (1yr), HTML (no-cache), manifest (1hr). Cloudflare provides DDoS protection, global edge caching, and hides the origin IP.

### 9.5 Play Store Deployment

Same as before — GitHub Actions builds Capacitor Android, signs APK/AAB, uploads to Play Console.

### 9.6 Environment Separation

| Environment | Supabase | Domain | Purpose |
|---|---|---|---|
| **Local** | `supabase start` (Docker, isolated) | `localhost:5173` | Development |
| **Staging** | Self-hosted Supabase on staging server or separate Docker Compose on same bare metal (different ports) | `staging.mapgis.app` | Integration testing, preview deploys |
| **Production** | Self-hosted Supabase on bare metal | `mapgis.app` | Live users |

### 9.7 Secrets Management

| Secret | Dev | CI/CD | Production |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` | GitHub Actions secret | Injected at build time (`https://mapgis.app`) |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` | GitHub Actions secret | Generated from `JWT_SECRET` in `docker-compose.yml` |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` (local only) | GitHub Actions secret (migrations) | Generated from `JWT_SECRET` |
| `JWT_SECRET` | `.env` (gitignored) | N/A | On server: `/etc/supabase/.env`, `chmod 600` |
| `POSTGRES_PASSWORD` | `.env` (gitignored) | N/A | On server: `/etc/supabase/.env` |
| `RESEND_API_KEY` | `.env` | N/A | On server: `/etc/supabase/.env` (read by Edge Functions) |
| `POLAR_WEBHOOK_SECRET` | `.env` | N/A | On server: `/etc/supabase/.env` |
| `GOOGLE_CLIENT_ID/SECRET` | `.env` | N/A | On server: `/etc/supabase/.env` (for OAuth) |
| `SENTRY_DSN` | `.env.local` | GitHub Actions secret | Injected at build time |
| `POSTHOG_KEY` | `.env.local` | GitHub Actions secret | Injected at build time |
| Android keystore | N/A | GitHub Actions secret | GitHub Actions |

**Secrets on bare metal**: All server-side secrets live in `/etc/supabase/.env` with `chmod 600`. Docker Compose reads them via `env_file`. Never committed to git. Manual deployment via SSH or automated via GitHub Actions `ssh` action.

### 9.8 Backups

| What | Method | Frequency | Retention |
|---|---|---|---|
| Postgres | `pg_dump -Fc` → S3 / external disk | Daily (cron) | 7 daily + 4 weekly + 3 monthly |
| Uploaded files | `rclone sync` storage volume → S3 | Daily | 30 days |
| Docker config | Git repo (`supabase/` directory) | On change | Full git history |

**Restore test**: Monthly — restore latest backup to staging environment and run integration tests.

### 9.9 Maintenance & Updates

| Task | Frequency | Procedure |
|---|---|---|
| Supabase container updates | Monthly | `docker compose pull` → check changelog → `docker compose up -d` |
| OS security patches | Weekly | `unattended-upgrades` (auto) + manual audit monthly |
| SSL certificate renewal | Auto (Certbot) | `certbot renew --dry-run` monthly to verify |
| Backup verification | Monthly | Restore to staging, run test suite |
| Log rotation | Auto (logrotate) | 30 days retention for Nginx, Docker, system logs |

---

## 10. Scalability & Growth Plan

### 10.1 Growth Stages

| Stage | Users | Hardware | Setup | Monthly Cost |
|---|---|---|---|---|
| **MVP** | 0–2K | 4GB RAM, 4 vCPU, 50GB SSD | Single bare metal + Cloudflare Free | ~$30–50 (hosting) |
| **Growth** | 2K–20K | 8GB RAM, 8 vCPU, 200GB SSD | Bare metal upgrade + Cloudflare Pro ($20) | ~$80–120 |
| **Scale** | 20K–100K | 16GB RAM, 16 vCPU, 500GB NVMe | Bare metal upgrade OR add read replica (second server) + Cloudflare Business | ~$200–400 |
| **Enterprise** | 100K+ | 32GB+ RAM, dedicated Postgres read replicas, load-balanced Nginx + HAProxy | Multiple bare metal servers + Cloudflare Enterprise | Custom |

**When to scale vertically vs horizontally**:
- **Vertical** (upgrade single server): up to 16GB/16vCPU. Postgres benefits most from RAM (shared_buffers) and fast disk (NVMe).
- **Horizontal** (add servers): Add a read replica Postgres for heavy SELECT queries (map browsing). Add a second Nginx + HAProxy for load balancing if serving >10K concurrent static asset requests. Keep a single write master.
- **Edge Functions**: Self-hosted edge functions run on the same bare metal. For heavy usage (>50K invocations/day), deploy a dedicated Deno server on a second machine and point Kong to it.

### 10.2 Per-Service Limits & Breakpoints

Since Supabase is self-hosted, limits are defined by YOUR hardware, not a pricing plan.

| Resource | MVP Limit (4GB) | When to Upgrade | Upgrade Action |
|---|---|---|---|
| **Postgres connections** | ~100 concurrent (PgBouncer pool) | >80 sustained connections | Increase pool size; add read replica |
| **Postgres storage** | 50GB SSD | >40GB (80%) | Add disk or migrate to larger volume |
| **RAM (shared_buffers)** | 1GB allocated to Postgres | Cache hit ratio <95% | Increase RAM → increase shared_buffers |
| **CPU** | 4 vCPU | >70% sustained 10min | Vertical upgrade (8+ vCPU) |
| **Realtime WebSocket** | ~500–1K concurrent | >400 sustained | Increase `realtime.max_connections`; add second realtime node |
| **Edge Functions** | ~100 req/s (single Deno process) | >70 req/s sustained | Deploy second Edge Function node; add load balancing |
| **Disk I/O** | SATA SSD: ~500 MB/s | iowait >10% | Upgrade to NVMe |
| **Bandwidth** | 1 Gbps typical | >800 Mbps sustained | Add second NIC or upgrade hosting plan |
| **Cloudflare CDN** | Unlimited (Free plan) | Need WAF, image optimization, Argo routing | Pro ($20/mo) |
| **PostHog** | 1M events/mo free | >800K events/mo | PostHog Cloud or self-hosted on separate instance |

**Self-hosted advantage**: No artificial caps. No "you've hit the free tier limit." Your hardware IS your limit. Scales linearly with investment.
**Self-hosted responsibility**: YOU monitor these metrics. No Supabase dashboard, no automatic alerts. Monitor via Prometheus + Grafana (see 10.6).

### 10.3 Database Performance Strategy

**Indexes (MVP — created in initial migration)**:

```sql
-- Spatial queries: near me
CREATE INDEX plans_location_idx ON plans USING GIST (location);

-- Filtering: active plans by category
CREATE INDEX plans_category_status_idx ON plans (category_id, status) WHERE deleted_at IS NULL;

-- FTS: search plans
CREATE INDEX plans_search_idx ON plans USING GIN (search_vector);

-- User's plans (for cap enforcement)
CREATE INDEX plans_creator_active_idx ON plans (creator_id) WHERE deleted_at IS NULL AND status = 'active';

-- Notifications: unread by user
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, created_at) WHERE read = false;
```

**Connection pooling**: PgBouncer runs as part of the Supabase self-hosted stack. Default pool size: 15 per database. Configure via `pgbouncer.ini` in the Docker volume. Drizzle connects through PgBouncer (port `6543`). Increase `default_pool_size` to 50 when scaling.

**Query optimization** (pre-scale checklist):
- All queries wrapped in React Query with `staleTime: 30_000` (map queries), `staleTime: 300_000` (categories)
- Paginate plan results (cursor-based, 20 per page) — never `SELECT *` without LIMIT
- `ST_DWithin` radius capped at 50km (prevents accidental full-table spatial scans)
- FTS queries use `plainto_tsquery` (sanitizes user input) + LIMIT 20

### 10.4 Realtime Scaling

| Concern | Mitigation |
|---|---|
| Concurrent WebSocket connections hit limit | `useRealtime` hook destroys channel on page unmount. Map viewport filter reduces events. Subscribe only to visible categories + bounding box. |
| Message volume spikes (many plan creates at once) | Client-side debounce (500ms batch). React Query `queryClient.invalidateQueries` with `refetchType: 'active'` only refetches what's on screen. |
| Mobile data usage | Filtered subscriptions reduce payload. GeoJSON response is compact. Map tiles from OSM CDN (not our infra). |

### 10.5 CDN & Static Asset Strategy

```
                    ┌─────────────┐
User (Buenos Aires) │ Cloudflare  │
         │          │ Buenos Aires│──── cache HIT ──▶ Served from edge (5ms)
         │          └─────────────┘
         │                 │
         │           cache MISS
         │                 │
         │          ┌──────▼──────┐
         └─────────▶│   VPS (AMS)  │──── origin fetch (80ms)
                    └─────────────┘
```

**Cache rules**:

| Asset | Cache-Control | CDN TTL | Notes |
|---|---|---|---|
| `*.js`, `*.css` (hashed) | `public, max-age=31536000, immutable` | 1 year | Vite content hashing → new hash = new URL, no purge needed |
| `*.png`, `*.svg`, `*.woff2` | `public, max-age=2592000` | 30 days | Immutable assets, fingerprint if possible |
| `index.html` | `public, max-age=0, must-revalidate` | Bypass | Always fetch latest to pick up new asset hashes |
| `manifest.json` | `public, max-age=3600` | 1 hour | PWA manifest, changes rarely |
| `/api/*` | `no-store` | Bypass | API routes proxied to self-hosted Supabase |

### 10.6 Monitoring & Alerting Thresholds

**Self-hosted monitoring stack**: Prometheus (metrics collection) + Grafana (dashboards) + Node Exporter (system metrics) + Postgres Exporter (DB metrics). All run as Docker containers alongside Supabase.

| Metric | Source | Warning | Critical | Action |
|---|---|---|---|---|
| DB CPU | Postgres Exporter → Grafana | >50% sustained 10min | >80% sustained 5min | Optimize queries; increase vCPU |
| DB size | Postgres Exporter | >30GB | >40GB (80% disk) | Archive old notifications; add disk |
| DB cache hit ratio | Postgres Exporter | <95% | <90% | Increase `shared_buffers` (more RAM) |
| Edge Function errors | Sentry | >5% error rate | >10% error rate | Check logs, rollback deployment |
| WebSocket disconnections | PostHog event `realtime_disconnected` | >10% of sessions | >25% of sessions | Investigate mobile WebView issues |
| Payment failures | Polar dashboard + Sentry | Any failure | >3 failures/hour | Check webhook idempotency, alert admin |
| Page load time | PostHog / Sentry perf | >3s p75 | >5s p75 | Check bundle size, CDN cache hit ratio |
| Server health (CPU/RAM/disk) | Node Exporter → Grafana | CPU >70%, RAM >80% | CPU >90%, RAM >95% | Scale up hardware or add server |
| Docker container health | `docker ps` health checks → Prometheus | Any container restarting | Any container down >1min | Alert via UptimeRobot, restart via systemd |

### 10.7 Disaster Recovery

| Scenario | Recovery | RPO | RTO |
|---|---|---|---|
| Bare metal goes down (hardware failure) | Cloudflare serves stale `index.html` from cache (5min TTL). Static assets still cached (1yr). Users see "reconnecting" banner. Restore latest backup to new/staging server. | 24h (daily pg_dump) | ~2–4hr (provision new server, restore backup, update DNS) |
| Postgres corruption | Restore from latest `pg_dump` backup (S3/external disk). Apply WAL segments if available. | 24h (daily backup) or <1hr if WAL archiving enabled | ~1hr |
| Docker container failure | `docker compose up -d` re-creates containers. Data persists in volumes. | 0 (volumes survive) | ~2min (container restart) |
| Accidental data deletion | Soft deletes on all tables — no hard deletes. Restore from backup for point-in-time. | Seconds (soft deletes keep data) | ~5min (un-delete via admin panel) |
| DNS / domain issue | Cloudflare DNS secondary nameserver. Fallback domain: `mapgis.pages.dev` (Cloudflare Pages backup). | 0 | ~5min (DNS propagation) |
| Disk full | Log rotation (logrotate) + auto-cleanup cron. Alert at 80% disk. Emergency: `docker system prune -a`. | Preventable | ~15min (cleanup + expand disk) |

**RPO/RTO targets for self-hosted**:
- RPO (Recovery Point Objective): 24 hours (daily backups). Improve to 1 hour by enabling WAL archiving + continuous backup to S3.
- RTO (Recovery Time Objective): 4 hours (provision new server + restore). Improve to 30min with a standby server and automated failover (Growth stage).

---

## 11. CI/CD Pipeline (GitHub Actions)

### 11.1 PR Checks (`pr.yml` — on pull_request to main)

```
Lint ──┬── Type Check ──┬── Unit Tests ──┬── Schema Diff
       │                │                │
       │                │                └── drizzle-kit check (detects drift)
       │                │
       │                └── tsc --noEmit (all packages)
       │
       └── eslint (all packages)
```

- **Schema diff**: `bun run db:diff` compares local Drizzle schema against staging Postgres. Fails PR if migrations are missing.
- **Tests**: Vitest unit tests; Cypress e2e runs on staging deploy only (not per-PR for speed).

### 11.2 Preview Deploy (`preview.yml` — on pull_request to main)

1. Build `@mapgis/app` with staging env vars
2. Deploy to staging subdomain: `pr-{number}.staging.mapgis.app` via rsync to bare metal
3. Comment PR with preview URL
4. Cypress e2e runs against preview URL

### 11.3 Production Deploy (`deploy.yml` — on push to main)

```
Build (web) ──┬── Deploy to Bare Metal (rsync dist/ to /var/www/mapgis)
               │       │
               │       └── Purge Cloudflare cache (API call)
               │
               └── Build (Android) ──┬── Sign APK/AAB
                                     │
                                     └── Upload to Play Console (internal track)
```

- **Web deploy**: `rsync -avz --delete dist/ user@bare-metal:/var/www/mapgis/` over SSH
- **Cache purge**: Cloudflare API `POST /zones/:id/purge_cache` for changed assets
- **Android**: Matrix build with `./gradlew bundleRelease` → `r0adkll/upload-google-play@v1`

### 11.4 Migration CI (`migrate.yml` — on push to main)

Before production deploy:
1. Run `bun run db:migrate` against staging Postgres (self-hosted, different port or server)
2. Verify migrations apply cleanly
3. If staging passes, run against production Postgres (with manual approval gate for production migrations)
4. On failure: roll back via `drizzle-kit drop` → re-apply last known good migration (automated rollback TBD; MVP: manual intervention)

---

## Architecture Decisions

| Decision | Choice | Alternatives Rejected | Rationale |
|----------|--------|----------------------|-----------|
| ORM | Drizzle ORM | Prisma (heavier, own migration system), raw supabase-js (no type-safe queries) | Drizzle is lightweight (no codegen runtime), first-class Postgres, works with Bun, has PostGIS support via `@drizzle-team/pg-geo` |
| Migrations | Drizzle Kit (SQL output) | supabase db push (no diff, no rollback), Prisma Migrate (vendor lock-in) | Drizzle Kit generates SQL files → version-controlled, reviewable, reversible. Compatible with Supabase Postgres. |
| Server runtime | Supabase Edge Functions (Deno, self-hosted) | Bun server (BFF pattern) | Client-first architecture. Edge Functions handle the 20% that needs server-side: webhooks, secrets, cron. Self-hosted on bare metal — no vendor lock-in. |
| State management | TanStack React Query | Zustand (duplicates server state), Redux (overhead), useState only (no cache) | React Query is purpose-built for server state — cache, refetch, optimistic updates, loading/error states. Pairs with Drizzle queries naturally. |
| Validation | Zod (in @mapgis/shared) | Yup, Joi, custom validators | Zod is TypeScript-first, tree-shakeable, works in both browser and Deno edge functions. Shared package avoids duplication. |
| Map library | react-leaflet (Leaflet) ⚠️ pendiente | Google Maps (API key required, cost), Mapbox GL (pricing), OpenLayers (ver Open Questions) | Leaflet es free, open-source, ligero (40KB), mobile-first. PostGIS ya hace el trabajo GIS pesado en el backend. **Pendiente validación con ingeniero geoespacial** para descartar OpenLayers si hay requisitos GIS avanzados en el frontend. |
| Payments | Polar | Stripe (more complex setup) | Polar is open-source, simpler API for SaaS billing, handles subscription lifecycle. |
| Email | Resend | SendGrid, SES, Postmark | Resend has excellent React/TS DX, modern API, Supabase integration docs. |
| Supabase deployment | Self-hosted (Docker on bare metal) | Supabase Cloud (Free/Pro/Team/Enterprise) | Full data sovereignty, no vendor lock-in, no artificial rate limits. Cost is hardware, not per-MAU. Tradeoff: operational responsibility (backups, monitoring, updates). |
| Provider abstractions | Interface in @mapgis/shared, impl in @mapgis/supabase | Vendor-specific SDKs called directly | Switching Polar→Stripe or Resend→SES requires changing only the implementation. Core domain logic never touches third-party SDKs. Not applied to Auth/Realtime/Drizzle — those are too coupled to abstract usefully. |

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
- [ ] **Supabase self-hosted version pinning**: Supabase releases new versions monthly. Should we pin specific Docker image tags (e.g., `supabase/postgres:15.6.1.140`) or follow `:latest`? **Decision**: Pin specific versions in `docker-compose.yml` for reproducibility. Update monthly after reviewing changelog. Test on staging first.
- [ ] **Self-hosted auth email deliverability**: Supabase Cloud handles email delivery automatically. Self-hosted `gotrue` needs SMTP configured manually. Resend SMTP is recommended. Need to verify email deliverability (SPF, DKIM, DMARC DNS records) before production.
- [ ] **Edge Functions cold start on self-hosted**: Supabase Cloud Edge Functions run on a global edge network (low latency everywhere). Self-hosted Edge Functions run on YOUR bare metal. Users far from the server will experience higher latency. Mitigation: Cloudflare CDN for static assets. Edge Function calls are rare (webhooks only) — acceptable for MVP. Re-evaluate if Edge Functions become user-facing.
