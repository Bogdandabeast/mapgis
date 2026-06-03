-- MapGIS — Postgres Initialization
-- Runs on first container start, AFTER supabase/postgres init scripts.
-- La imagen supabase/postgres ya crea:
--   supabase_auth_admin, supabase_storage_admin, authenticator, anon
--   schema auth, schema _realtime, schema storage
-- Acá va solo lo específico de MapGIS.

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
