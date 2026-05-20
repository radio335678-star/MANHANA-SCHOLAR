-- Section page targets and auto-complete workflow fields

ALTER TABLE sections ADD COLUMN IF NOT EXISTS target_pages integer;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS min_pages integer;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS max_pages integer;

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auto_complete_status text DEFAULT 'idle';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auto_complete_current_section integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_auto_complete_status_check'
  ) THEN
    ALTER TABLE workspaces ADD CONSTRAINT workspaces_auto_complete_status_check
      CHECK (auto_complete_status IN ('idle', 'running', 'completed', 'failed', 'cancelled'));
  END IF;
END $$;

-- Chat attachment metadata for section AI assistant
CREATE TABLE IF NOT EXISTS section_chat_attachments (
  id serial PRIMARY KEY,
  section_id integer NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text,
  storage_path text NOT NULL,
  extracted_text text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_section_chat_attachments_section
  ON section_chat_attachments(section_id);
