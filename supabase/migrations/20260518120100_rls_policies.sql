-- Row Level Security for tenant tables

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_state_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_thesis_build_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_thesis_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_thesis_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_thesis_lock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_chart_versions ENABLE ROW LEVEL SECURITY;

-- Users
CREATE POLICY users_select_own ON users FOR SELECT TO authenticated
  USING (supabase_user_id = auth.uid() OR public.is_admin());

CREATE POLICY users_update_own ON users FOR UPDATE TO authenticated
  USING (supabase_user_id = auth.uid())
  WITH CHECK (supabase_user_id = auth.uid());

-- Workspaces
CREATE POLICY workspaces_tenant ON workspaces FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = workspaces.user_id AND u.supabase_user_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = workspaces.user_id AND u.supabase_user_id = auth.uid())
  );

-- Sections
CREATE POLICY sections_tenant ON sections FOR ALL TO authenticated
  USING (public.user_owns_workspace(workspace_id) OR public.is_admin())
  WITH CHECK (public.user_owns_workspace(workspace_id));

-- Vault
CREATE POLICY vault_tenant ON vault_resources FOR ALL TO authenticated
  USING (public.user_owns_workspace(workspace_id) OR public.is_admin())
  WITH CHECK (public.user_owns_workspace(workspace_id));

-- Chat messages (via section)
CREATE POLICY chat_messages_tenant ON chat_messages FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sections s
      WHERE s.id = chat_messages.section_id
        AND public.user_owns_workspace(s.workspace_id)
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sections s
      WHERE s.id = chat_messages.section_id
        AND public.user_owns_workspace(s.workspace_id)
    )
  );

-- Activity events
CREATE POLICY activity_events_tenant ON activity_events FOR ALL TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.user_owns_workspace(workspace_id))
    OR user_id IN (SELECT id FROM users WHERE supabase_user_id = auth.uid())
    OR public.is_admin()
  );

-- Workflow transitions
CREATE POLICY workspace_transitions_tenant ON workspace_state_transitions FOR ALL TO authenticated
  USING (public.user_owns_workspace(workspace_id) OR public.is_admin())
  WITH CHECK (public.user_owns_workspace(workspace_id));

-- Pre-thesis tables
CREATE POLICY pre_thesis_jobs_tenant ON pre_thesis_build_jobs FOR ALL TO authenticated
  USING (public.user_owns_workspace(workspace_id) OR public.is_admin())
  WITH CHECK (public.user_owns_workspace(workspace_id));

CREATE POLICY pre_thesis_sources_tenant ON pre_thesis_sources FOR ALL TO authenticated
  USING (public.user_owns_workspace(workspace_id) OR public.is_admin())
  WITH CHECK (public.user_owns_workspace(workspace_id));

CREATE POLICY pre_thesis_conflicts_tenant ON pre_thesis_conflicts FOR ALL TO authenticated
  USING (public.user_owns_workspace(workspace_id) OR public.is_admin())
  WITH CHECK (public.user_owns_workspace(workspace_id));

CREATE POLICY pre_thesis_lock_events_tenant ON pre_thesis_lock_events FOR ALL TO authenticated
  USING (public.user_owns_workspace(workspace_id) OR public.is_admin())
  WITH CHECK (public.user_owns_workspace(workspace_id));

-- Master charts
CREATE POLICY master_charts_tenant ON master_charts FOR ALL TO authenticated
  USING (public.user_owns_workspace(workspace_id) OR public.is_admin())
  WITH CHECK (public.user_owns_workspace(workspace_id));

CREATE POLICY master_chart_versions_tenant ON master_chart_versions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM master_charts mc
      WHERE mc.id = master_chart_versions.chart_id
        AND public.user_owns_workspace(mc.workspace_id)
    )
    OR public.is_admin()
  );

-- Realtime publication for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE workspaces;
ALTER PUBLICATION supabase_realtime ADD TABLE sections;
ALTER PUBLICATION supabase_realtime ADD TABLE vault_resources;
ALTER PUBLICATION supabase_realtime ADD TABLE pre_thesis_build_jobs;

ALTER TABLE workspaces REPLICA IDENTITY FULL;
ALTER TABLE sections REPLICA IDENTITY FULL;
ALTER TABLE vault_resources REPLICA IDENTITY FULL;
ALTER TABLE pre_thesis_build_jobs REPLICA IDENTITY FULL;
