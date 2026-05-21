-- RLS for master_chart_context_files (tenant isolation via parent master_charts)

ALTER TABLE master_chart_context_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS master_chart_context_files_tenant ON master_chart_context_files;

CREATE POLICY master_chart_context_files_tenant ON master_chart_context_files
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM master_charts mc
      WHERE mc.id = master_chart_context_files.chart_id
        AND (public.user_owns_workspace(mc.workspace_id) OR public.is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM master_charts mc
      WHERE mc.id = master_chart_context_files.chart_id
        AND (public.user_owns_workspace(mc.workspace_id) OR public.is_admin())
    )
  );
