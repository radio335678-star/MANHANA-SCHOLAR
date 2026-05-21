-- Dataset agent chat persistence (per master chart)

CREATE TABLE IF NOT EXISTS dataset_chat_messages (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  chart_id INTEGER NOT NULL REFERENCES master_charts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls_json JSONB,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dataset_chat_workspace ON dataset_chat_messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dataset_chat_chart ON dataset_chat_messages(chart_id);
CREATE INDEX IF NOT EXISTS idx_dataset_chat_created ON dataset_chat_messages(chart_id, created_at);

ALTER TABLE dataset_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY dataset_chat_tenant ON dataset_chat_messages FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM master_charts mc
      WHERE mc.id = dataset_chat_messages.chart_id
        AND (public.user_owns_workspace(mc.workspace_id) OR public.is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM master_charts mc
      WHERE mc.id = dataset_chat_messages.chart_id
        AND (public.user_owns_workspace(mc.workspace_id) OR public.is_admin())
    )
  );

REVOKE ALL ON TABLE dataset_chat_messages FROM anon;
