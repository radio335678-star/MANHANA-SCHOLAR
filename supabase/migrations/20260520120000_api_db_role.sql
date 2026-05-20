-- Server-side API role for Drizzle (transaction pooler, port 6543).
-- Password is set out-of-band when provisioning; BYPASSRLS matches service-role API access.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'manthana_api') THEN
    CREATE ROLE manthana_api WITH LOGIN;
  END IF;
END $$;

ALTER ROLE manthana_api BYPASSRLS;

GRANT USAGE ON SCHEMA public TO manthana_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO manthana_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO manthana_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO manthana_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO manthana_api;
