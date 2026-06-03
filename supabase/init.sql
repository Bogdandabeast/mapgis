-- MapGIS — Postgres Initialization
-- Runs on first container start

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Supabase Auth schema (required by GoTrue)
CREATE SCHEMA IF NOT EXISTS auth;
