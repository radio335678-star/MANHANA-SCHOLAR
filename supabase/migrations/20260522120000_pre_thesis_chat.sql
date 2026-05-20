-- Pre-thesis AI chat and document revision history

CREATE TABLE IF NOT EXISTS pre_thesis_chat_messages (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls_json JSONB,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pre_thesis_chat_workspace_created
  ON pre_thesis_chat_messages (workspace_id, created_at);

CREATE TABLE IF NOT EXISTS pre_thesis_document_revisions (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  result_json JSONB NOT NULL,
  draft_md TEXT NOT NULL,
  completeness_score INTEGER,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('build', 'ai', 'revalidate', 'undo')),
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_pre_thesis_revisions_workspace
  ON pre_thesis_document_revisions (workspace_id, revision DESC);

ALTER TABLE pre_thesis_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_thesis_document_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pre_thesis_chat_messages_tenant ON pre_thesis_chat_messages FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN users u ON u.id = w.user_id
      WHERE w.id = pre_thesis_chat_messages.workspace_id
        AND u.supabase_user_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN users u ON u.id = w.user_id
      WHERE w.id = pre_thesis_chat_messages.workspace_id
        AND u.supabase_user_id = auth.uid()
    )
  );

CREATE POLICY pre_thesis_document_revisions_tenant ON pre_thesis_document_revisions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN users u ON u.id = w.user_id
      WHERE w.id = pre_thesis_document_revisions.workspace_id
        AND u.supabase_user_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN users u ON u.id = w.user_id
      WHERE w.id = pre_thesis_document_revisions.workspace_id
        AND u.supabase_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON pre_thesis_chat_messages TO manthana_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON pre_thesis_document_revisions TO manthana_api;
GRANT USAGE, SELECT ON SEQUENCE pre_thesis_chat_messages_id_seq TO manthana_api;
GRANT USAGE, SELECT ON SEQUENCE pre_thesis_document_revisions_id_seq TO manthana_api;
