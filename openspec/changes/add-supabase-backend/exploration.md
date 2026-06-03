# Exploration: Supabase Backend Integration for mapgis

## Current State

The monorepo is a freshly scaffolded skeleton — an Ionic React + Capacitor mobile app with three static tab pages and a minimal Bun HTTP placeholder server. **There is zero backend integration today.** No API calls, no state management, no authentication, no data persistence. The project is ready for a backend to be plugged in from scratch with no legacy constraints.

### @mapgis/app (packages/mapgis)

- **Architecture**: Ionic React v8 with Capacitor v8 for native mobile, bundled by Vite 5, using react-router v5 for tab-based navigation.
- **Pages**: Three identical tab pages (`Tab1`, `Tab2`, `Tab3`) that each render `ExploreContainer` — a static component that displays a title and a link to Ionic docs. No `useState`, no `useEffect`, no data fetching.
- **Components**: Single `ExploreContainer.tsx` that accepts a `name` prop and renders static HTML.
- **State Management**: None. No Context, no Zustand, no Redux, no React Query, no signals.
- **Services Layer**: None. No `api/`, `services/`, or `hooks/` directories exist.
- **Auth**: None. No login screen, no session management, no protected routes.
- **Networking**: No `fetch`, `axios`, or any HTTP calls anywhere in the codebase.
- **Testing**: Vitest (unit) + Cypress (e2e). `strict_tdd: true` per openspec config.
- **Key Dependencies**: React 19, Ionic React 8, Capacitor 8, react-router 5, Vite 5. No Supabase packages installed.

### @mapgis/server (packages/server)

- A single `Bun.serve()` on port 3000 that returns `"mapgis server running"` for every request.
- No routes, no middleware, no database connection, no authentication handling.
- Package scripts: `dev` (watch mode), `build` (bundle), `test`/`lint` (noop placeholders).
- **Currently acts as a placeholder** — ready to be replaced or expanded.

### @mapgis/shared (packages/shared)

- Single file with `APP_NAME` constant and a `greet()` function.
- Infrastructure exists for shared types/DTOs but currently empty.
- No database models, no API contracts, no auth types.

### Project-level

- **Bun workspaces** monorepo with ESM (`"type": "module"`), strict TypeScript.
- **OpenSpec** SDD framework initialized (`openspec/config.yaml`), empty `specs/`, no active changes, no archived changes.
- **Skill registry** at `.atl/skill-registry.md` — no Supabase-specific skills registered.
- No existing `supabase` directory, no migrations, no `.env` files with Supabase keys.

## Affected Areas

- `packages/mapgis/src/App.tsx` — needs auth gate, Supabase provider wrapper, route guards
- `packages/mapgis/src/main.tsx` — needs Supabase client initialization
- `packages/mapgis/src/pages/*.tsx` — all three pages will be replaced with real features
- `packages/mapgis/src/components/ExploreContainer.tsx` — removed or repurposed
- `packages/mapgis/package.json` — add `@supabase/supabase-js` and related deps
- `packages/mapgis/vite.config.ts` — may need env var handling for Supabase URL/keys
- `packages/server/src/index.ts` — expand into BFF routes, or replace with Supabase Edge Functions
- `packages/server/package.json` — add `@supabase/supabase-js` (server-side client)
- `packages/shared/src/index.ts` — add Supabase Database types, shared DTOs, API contracts
- `packages/shared/package.json` — may need `@supabase/supabase-js` for type imports
- **New directory**: `supabase/` at project root — migrations, config, seed data
- **New file**: `supabase/config.toml` — local development configuration
- **New file**: `.env` or `.env.local` — Supabase URL and anon key
- **Root `package.json`** — may add Supabase CLI as devDependency or rely on npx

## Supabase Features Most Relevant to mapgis

| Feature | Relevance | Why |
|---------|-----------|-----|
| **Auth** | **CRITICAL** | Email/password, OAuth (Google, Apple for mobile), magic links. PKCE flow is the default and secure for mobile/Capacitor. Deep linking support via Capacitor's `appUrlOpen`. |
| **Database (Postgres)** | **CRITICAL** | Auto-generated REST API via PostgREST. Row Level Security (RLS) enforces per-user access at the database level. No need to write API endpoints for CRUD. |
| **Type Generation** | **HIGH** | `supabase gen types typescript` generates a `Database` type from your schema. Inject into `createClient<Database>()` for end-to-end type safety from DB to UI. |
| **Realtime** | **HIGH** | Postgres changes subscriptions via WebSocket. Subscribe to INSERT/UPDATE/DELETE events on specific tables. Ideal for live map updates, chat, notifications. |
| **Storage** | **MEDIUM** | S3-compatible object storage with RLS policies. File uploads, profile avatars, map attachments. |
| **Edge Functions** | **MEDIUM** | Deno-based serverless functions. Could replace the Bun server for lightweight API logic. |
| **CLI Local Dev** | **HIGH** | `supabase start` runs a full local Supabase stack (Postgres, Auth, Storage) via Docker. `supabase db push` deploys migrations. |
| **RLS Policies** | **HIGH** | Declarative security — users can only see/modify their own data. Reduces backend code dramatically. |

## Architecture Approaches

### Option A: Client-First (App → Supabase directly)

```text
┌──────────────┐       ┌─────────────────────┐
│  Ionic App   │───◀──▶│   Supabase Backend   │
│ (supabase-js)│       │  Auth│DB│Storage│RT  │
└──────────────┘       └─────────────────────┘
```

The app uses `@supabase/supabase-js` directly for auth, database queries, storage, and realtime subscriptions. RLS policies enforce all security at the database level.

| Pros | Cons |
|------|------|
| Minimal complexity — no server to build, deploy, or maintain | All business logic lives in the mobile app (harder to share, update) |
| Fastest path to working features | Limited server-side validation beyond RLS |
| Leverages Supabase's managed infrastructure | Hard to implement complex multi-step workflows atomically |
| Supabase client handles auth state, token refresh, realtime connection management | Can't easily integrate external APIs or webhooks without a server |
| Ideal for mobile-first apps with user-scoped data | No caching layer between app and DB |

**Effort: Low**. Add a new `@mapgis/supabase` shared package with client config, add `@supabase/supabase-js` to app, create auth context, start querying.

### Option B: BFF Pattern (App → Server → Supabase)

```text
┌──────────────┐       ┌──────────────┐       ┌─────────────────────┐
│  Ionic App   │───◀──▶│  Bun Server   │───◀──▶│   Supabase Backend   │
│   (fetch)    │       │   (BFF)       │       │  Auth│DB│Storage│RT  │
└──────────────┘       └──────────────┘       └─────────────────────┘
```

The Bun server acts as a Backend For Frontend. The app sends requests to the server, which uses the Supabase `service_role` key (or passes through user JWT) to interact with Supabase. All business logic is centralized on the server.

| Pros | Cons |
|------|------|
| Centralized business logic — easier to test, audit, and change | Two network hops per operation (app→server→supabase) |
| Server can aggregate/cache/transform data before sending to client | More moving parts — server deployment, monitoring, scaling |
| Better for complex workflows, third-party API integrations, webhooks | Server is a single point of failure (mitigated by Supabase hosting) |
| Can use `service_role` for admin operations securely | Higher latency than direct Supabase access |
| Can enforce additional validation beyond RLS | More code to write and maintain |

**Effort: Medium-High**. Requires building Express-style routes on the Bun server, auth token passthrough or service_role usage, and a data access layer.

### Option C: Hybrid (Recommended)

```text
┌──────────────┐        ┌─────────────────────┐
│  Ionic App   │──◀───▶│   Supabase Backend   │
│ (supabase-js)│        │  Auth│DB│Storage│RT  │
│              │        └─────────────────────┘
│              │
│              │──◀───▶┌──────────────┐
│   (fetch)    │        │  Bun Server   │
└──────────────┘        │ (BFF — async) │
                        └──────────────┘
```

- **Auth**: Client-side via `@supabase/supabase-js` with PKCE flow. Capacitor handles deep linking for OAuth callbacks (`appUrlOpen` event).
- **Simple CRUD**: Direct from the app to Supabase, secured by RLS. No server needed. Use `supabase.from('table').select()` / `.insert()` / `.update()` / `.delete()`.
- **Realtime**: Direct WebSocket connection from the app to Supabase for live updates.
- **Complex operations**: Through the Bun server (BFF). The server receives the user's JWT from the app, verifies it, then performs multi-step operations, external API calls, file processing, etc.
- **Admin operations**: Server uses `service_role` key (never exposed to client) for privileged database access.

| Pros | Cons |
|------|------|
| Fast path for 80% of operations (direct to Supabase) | Requires clear architectural discipline — what goes direct vs. through server |
| Server handles the 20% that needs server-side logic | Two code paths for data access (needs documentation) |
| No server dependency for critical auth/realtime paths | More packages/config to set up (supabase-js in both app and server) |
| Scales naturally — Supabase handles the heavy DB/realtime lifting | |
| Server can be added incrementally — start with Option A, add BFF routes as needed | |

**Effort: Medium**. Start with Option A (client-first), add BFF capabilities incrementally. Most value delivered upfront.

## Package-Level Breakdown

### 1. New Package: `@mapgis/supabase` (packages/supabase)

Shared Supabase client configuration and generated types. This avoids duplicating client setup across app and server.

```text
packages/supabase/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # re-exports
    ├── client.ts             # createClient() singleton
    ├── database.types.ts     # generated by supabase gen types
    └── auth/
        └── context.tsx        # React AuthProvider + useAuth hook
```

**Dependencies**: `@supabase/supabase-js`

### 2. @mapgis/app Changes

- **Add dependency**: `@mapgis/supabase` (workspace), `@supabase/supabase-js` (if not hoisted via shared pkg)
- **New files**:
  - `src/hooks/useAuth.ts` — re-export from `@mapgis/supabase`
  - `src/components/AuthGate.tsx` — redirects unauthenticated users to login
  - `src/pages/Login.tsx` — email/password + OAuth login form
  - `src/pages/*` — replaced with real feature pages using Supabase queries
  - `src/services/` — optional: service layer wrapping Supabase calls (e.g., `mapService.ts`, `userService.ts`)
- **Modified files**:
  - `App.tsx` — wrap with `<AuthProvider>`, add `<AuthGate>`, add login/signup routes
  - `main.tsx` — no changes needed (client init is in the provider)

### 3. @mapgis/server Changes

- **Add dependency**: `@mapgis/supabase` (workspace), `@supabase/supabase-js`
- **New files**:
  - `src/routes/` — route handlers for BFF endpoints
  - `src/middleware/auth.ts` — validates Supabase JWT from `Authorization` header
- **Modified files**:
  - `src/index.ts` — route matching, JSON parsing, CORS headers, auth middleware

### 4. @mapgis/shared Changes

- **New exports**:
  - Re-export database types from `@mapgis/supabase` (or directly from `@supabase/supabase-js`)
  - API route paths as constants
  - Request/response DTOs for BFF endpoints

### 5. Root / Project-Level

- **New directory**: `supabase/`
  - `config.toml` — local Supabase configuration
  - `migrations/` — SQL migration files (YYYYMMDDHHMMSS_description.sql)
  - `seed.sql` — optional seed data
- **New file**: `.env.example` — template for `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- **New scripts** (in root `package.json`):
  - `db:start` — `supabase start` (local dev)
  - `db:stop` — `supabase stop`
  - `db:types` — `supabase gen types typescript --local > packages/supabase/src/database.types.ts`
  - `db:migrate` — `supabase db push`

## Key Decisions to Make

### 1. Auth Strategy

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Auth provider | Email/password, Google OAuth, Apple OAuth, magic link, or combination | **Email/password + Google OAuth** as MVP. Apple OAuth required for App Store compliance. |
| Session persistence | AsyncStorage (Capacitor Preferences), SecureStore, or in-memory | **Capacitor Preferences plugin** for token storage in mobile. `@supabase/supabase-js` manages refresh automatically. |
| Deep linking scheme | Custom URL scheme (`mapgis://`) or Universal Links / App Links | **Universal Links (iOS) + App Links (Android)** for production. Custom scheme for dev. Capacitor handles this. |

### 2. Data Access Pattern

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Query method | `supabase-js` client methods vs. custom hooks vs. React Query/TanStack Query | **React Query (TanStack Query)** layer wrapping `supabase-js`. Provides caching, refetching, optimistic updates, and loading/error states out of the box. |
| API abstraction | Direct `.from().select()` in components vs. service layer | **Service layer** (`src/services/`) for shared queries. Components use services, not raw Supabase calls. Easier to test and refactor. |
| Real-time approach | Direct subscriptions in components vs. centralized subscription manager | **Custom `useRealtime()` hook** that manages channel lifecycle properly (subscribe on mount, unsubscribe on unmount). |

### 3. Schema Design

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Schema organization | All tables in `public` vs. separate schemas | **Start with `public`** schema. Use separate schemas (`private`, `analytics`) only when complexity demands it. |
| User profiles | Separate `profiles` table vs. `auth.users` raw_meta_data | **Separate `profiles` table** linked to `auth.users.id`. Easier to query, index, and apply RLS policies. |
| Soft deletes | `deleted_at` column vs. hard deletes | **Soft deletes** (`deleted_at` timestamp). Safer for user data, enables undo, keeps referential integrity. |
| Enums | Postgres ENUM types vs. lookup tables vs. check constraints | **Lookup tables** for flexible enums (map categories, user roles). Postgres ENUMs are harder to evolve. |

### 4. RLS Policy Strategy

Supabase RLS is the primary security boundary. Every table MUST have RLS enabled with appropriate policies.

| Table | Insert | Select | Update | Delete |
|-------|--------|--------|--------|--------|
| `profiles` | Users can insert their own (`auth.uid() = id`) | Public can view | Users can update their own | Never (soft delete) |
| `user_data` | Authenticated users | Owner only (`auth.uid() = user_id`) | Owner only | Owner only |
| `public_data` | Authenticated users (with validation) | Anyone (authenticated or anon) | Owner or admin | Owner or admin |

**Policy naming convention**: `"Users can {action} their own {entity}"` — concise, self-documenting, debuggable.

### 5. Environment Management

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Environment separation | Separate Supabase projects (dev/staging/prod) vs. branches | **Separate projects**: `mapgis-dev`, `mapgis-prod`. Branches is Beta. |
| Secrets in monorepo | `.env` files vs. Capacitor config vs. environment-specific injection | **Vite env vars** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) for the app. **`SUPABASE_SERVICE_ROLE_KEY`** on server only (never exposed to client). |
| Local dev | Supabase CLI local stack vs. directly hitting a dev Supabase project | **Supabase CLI local stack** for development. Gives each dev an isolated DB, no risk of corrupting shared data. Use `supabase start` + Docker. |

## Risks and Unknowns

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **RLS misconfiguration** — accidentally exposing data to other users | High — data breach | Write RLS tests that verify policies per user role. Use `supabase-js` with `service_role` bypass to test as different users. |
| **Anon key exposure** — the `anon` key is visible in client-side JS and APK/IPA bundles | Medium — by design, RLS must be the real security | The anon key is PUBLIC by design. Never put `service_role` key in client code. All security relies on RLS + valid JWT. |
| **Realtime WebSocket disconnections** — mobile apps lose connectivity frequently | Medium — stale data or missed updates | Realtime subscriptions reconnect automatically. Combine with periodic polling as fallback. `useRealtime()` hook must handle reconnection state. |
| **Capacitor deep linking** — OAuth redirect handling between native/web views | Medium — broken auth flow on mobile | Test on real devices early. Use Capacitor's `App.addListener('appUrlOpen')` for URL interception. Supabase PKCE flow simplifies this. |
| **Docker dependency for local dev** — `supabase start` requires Docker | Low — Docker Desktop is standard | Document Docker requirement in README. Consider `supabase db push` to a shared dev project as fallback for devs without Docker. |
| **Bun vs. Deno (Edge Functions)** — Bun server and Supabase Edge Functions use different runtimes | Low — we control which we use | If using Edge Functions, they run on Deno. Our Bun server is separate. No runtime conflict. |
| **Monorepo package resolution** — Bun workspaces resolve `@mapgis/supabase` from local filesystem | Low — Bun workspaces are native | Verify `bun install` resolves the workspace package correctly. Set `"@mapgis/*": "packages/*"` in root `package.json` workspaces or trust the default `"packages/*"` glob. |

### Unknowns

1. **Does Capacitor's WebView support WebSocket connections for Supabase Realtime?** — WebSocket works in iOS WKWebView and Android WebView (both used by Capacitor). Testing on real devices needed to confirm no connection drops when app is backgrounded.
2. **How do Supabase sessions behave when the Capacitor app is backgrounded/terminated?** — `@supabase/supabase-js` persists the session in localStorage (or custom storage). Capacitor WebView preserves localStorage across app restarts. Token refresh should work transparently.
3. **What is the latency profile for direct Supabase queries from mobile (4G/5G)?** — PostgREST responses are compact JSON. Initial connection may have TLS overhead. Consider connection pooling for the server-side component.
4. **Does Supabase Auth PKCE flow work smoothly in Capacitor Ionic without native plugins?** — Yes, PKCE is the default for `@supabase/supabase-js`. For OAuth (Google/Apple), Capacitor's `appUrlOpen` listener handles the callback URL. May need the `@capacitor/browser` plugin for in-app browser flow.

### CapEx & OpEx Considerations

| Item | Cost |
|------|------|
| Supabase Free Tier | 2 projects, 500MB DB, 5GB bandwidth, 50MB storage, 50,000 MAU — sufficient for MVP and early production |
| Supabase Pro ($25/mo) | 100,000 MAU, 8GB DB, 50GB bandwidth, 100GB storage — needed at scale |
| Docker (local dev) | Free (Docker Desktop or Colima) |
| Bun server hosting | $5-10/mo VPS or Fly.io free tier (server is optional in Option A) |

## Recommendation

**Start with Hybrid Architecture (Option C) but implement incrementally:**

1. **Phase 1 — Client-First Foundation**: Set up `@mapgis/supabase` shared package, Supabase local dev, auth (email/password), and a `profiles` table. Build the core auth flow in the Ionic app (login, signup, auth gate). This gives you working auth + database in the app with minimal server code. **This is essentially Option A.**

2. **Phase 2 — Data Layer**: Add React Query + service layer. Design and migrate the core domain schema (whatever mapgis actually does — maps? GIS data? locations?). Implement RLS policies. This deepens the client-side Supabase usage.

3. **Phase 3 — BFF layer (only if needed)**: Expand the Bun server for operations that genuinely need server-side logic — complex aggregation queries, external API integrations, webhook handlers, admin endpoints using `service_role`. The server remains optional and focused.

This phased approach de-risks the integration. You get working features fast (Phase 1), build a solid data foundation (Phase 2), and only invest in server complexity when the use case demands it (Phase 3).

## Ready for Proposal

**Yes.** The codebase is a clean slate with zero backend integration — there are no conflicts, migrations, or refactors to worry about. The exploration has identified:

- The recommended architecture (Hybrid, starting client-first)
- All packages that need changes (all four — new `@mapgis/supabase`, plus app, server, shared)
- The key decisions that need stakeholder input (auth providers, schema specifics, RLS policy granularity)
- Risks and unknowns for the implementation phase

The next step should be **sdd-propose** to formalize the change proposal, define scope boundaries, establish the rollback plan, and get explicit sign-off on the key architectural decisions before writing specs.
