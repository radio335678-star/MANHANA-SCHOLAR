-- Vision Reader Sessions: persist Kimi vision-read outputs per workspace
CREATE TABLE IF NOT EXISTS vision_reader_sessions (
  id            SERIAL PRIMARY KEY,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL,
  files_info    JSONB,
  output_text   TEXT,
  user_prompt   TEXT,
  model_used    TEXT,
  tokens_used   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vision_reader_sessions_workspace_id_idx ON vision_reader_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS vision_reader_sessions_user_id_idx      ON vision_reader_sessions(user_id);
CREATE INDEX IF NOT EXISTS vision_reader_sessions_created_at_idx   ON vision_reader_sessions(created_at DESC);

ALTER TABLE vision_reader_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY vision_reader_sessions_tenant ON vision_reader_sessions FOR ALL TO authenticated
  USING (public.user_owns_workspace(workspace_id) OR public.is_admin())
  WITH CHECK (public.user_owns_workspace(workspace_id) OR public.is_admin());

REVOKE ALL ON TABLE vision_reader_sessions FROM anon;
