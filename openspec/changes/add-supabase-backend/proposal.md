# Proposal: Supabase Backend Integration

## Intent

Give mapgis authentication, a Postgres database, real-time subscriptions, and file storage by integrating Supabase as a managed backend. The Ionic app talks directly to Supabase — no server middleman.

## Scope

### In Scope
- New `@mapgis/supabase` workspace package (client config, auth provider, generated DB types)
- Auth: email/password + Google OAuth with React context provider and auth gate
- Database: Postgres + RLS policies for per-user security at the data layer
- Realtime: Postgres change subscriptions via a custom `useRealtime()` hook
- Data access layer: TanStack React Query wrapping `supabase-js` calls
- Supabase CLI local dev environment (`supabase start`) and DB type generation
- Root `package.json` scripts: `db:start`, `db:stop`, `db:types`, `db:migrate`, `db:new`

### Out of Scope
- Server/BFF — `@mapgis/server` removed from the monorepo (placeholder, no longer needed)
- Apple OAuth (deferred to App Store prep phase)
- Storage (deferred to future change)
- Edge Functions (deferred to future change)
- Admin dashboard

## Capabilities

### New Capabilities
- `supabase-auth`: User sign-up, login, session management, auth gate component
- `supabase-database`: Postgres schema, RLS policies, CRUD queries via React Query
- `supabase-realtime`: WebSocket subscriptions for live data updates

### Modified Capabilities
None — all capabilities are new.

## Approach

Client-first architecture (Option A from exploration). The Ionic app uses `@supabase/supabase-js` directly. No server hops. All security enforced via Postgres RLS policies. A new `@mapgis/supabase` workspace package provides shared client config, generated types, and a React auth provider. TanStack React Query wraps data access for caching, refetching, and loading/error state management.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/supabase/` | New | Shared client, auth provider, DB types |
| `packages/mapgis/src/App.tsx` | Modified | Auth provider wrapper + route guards |
| `packages/mapgis/src/pages/` | New + Modified | Login page (new), feature pages replace stubs |
| `packages/mapgis/package.json` | Modified | + `@mapgis/supabase`, `@supabase/supabase-js`, `@tanstack/react-query` |
| `packages/shared/package.json` | Modified | + `@mapgis/supabase` for type re-exports |
| `supabase/` (root) | New | CLI config, migrations |
| `.env.example` | New | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Root `package.json` | Modified | + DB management scripts |

## Risks

| Risk | Level | Mitigation |
|------|-------|------------|
| RLS misconfiguration → data leak | High | RLS tests per role before merging policies |
| WebSocket drops on mobile → stale data | Medium | `useRealtime()` handles reconnect + polling fallback |
| Capacitor OAuth deep linking broken | Medium | Test on real devices early; use `appUrlOpen` listener |

## Rollback Plan

1. Remove `@mapgis/supabase` dependency from `packages/mapgis` and `packages/shared`
2. Remove Supabase provider wrappers from `App.tsx`; restore `ExploreContainer` stubs
3. Delete `packages/supabase/` directory
4. Delete `supabase/` directory
5. Run `bun install` to clean lockfile
App returns to current state: three static tab pages, no backend.

## Dependencies

- Supabase project created (free tier) with API keys
- Docker installed for local Supabase CLI

## Success Criteria

- [ ] User can sign up with email/password and Google OAuth
- [ ] Authenticated user sees protected pages; unauthenticated user redirected to login
- [ ] RLS policies prevent users from accessing other users' data
- [ ] `supabase gen types` produces a valid `Database` type from local schema
- [ ] `bun run db:start` launches local Supabase stack without errors
- [ ] Existing `bun run build` and `bun run test` still pass
