-- Remove legacy Clerk column (auth is Supabase-only)
ALTER TABLE users DROP COLUMN IF EXISTS clerk_user_id;
