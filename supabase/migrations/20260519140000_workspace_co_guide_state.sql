-- Co-guide and institution state on workspaces
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS co_guide_name text,
  ADD COLUMN IF NOT EXISTS state text;

COMMENT ON COLUMN workspaces.co_guide_name IS 'Co-guide or co-supervisor name';
COMMENT ON COLUMN workspaces.state IS 'Indian state or union territory of the institution';
