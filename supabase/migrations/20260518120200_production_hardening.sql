-- Production hardening: private helpers, storage upsert/delete, reference RLS, grants

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres, service_role, authenticated;

CREATE OR REPLACE FUNCTION private.user_owns_workspace(ws_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspaces w
    JOIN users u ON u.id = w.user_id
    WHERE w.id = ws_id
      AND u.supabase_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.supabase_user_id = auth.uid()
      AND u.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION private.user_owns_workspace(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.user_owns_workspace(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated, service_role;

-- Backward-compatible wrappers (policies reference public.*)
CREATE OR REPLACE FUNCTION public.user_owns_workspace(ws_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT private.user_owns_workspace(ws_id); $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT private.is_admin(); $$;

REVOKE ALL ON FUNCTION public.user_owns_workspace(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_owns_workspace(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- Storage: UPDATE for upsert, DELETE for cleanup (authenticated, workspace-scoped)
CREATE POLICY thesis_artifacts_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'thesis-artifacts'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  )
  WITH CHECK (
    bucket_id = 'thesis-artifacts'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  );

CREATE POLICY thesis_artifacts_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'thesis-artifacts'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  );

CREATE POLICY vault_uploads_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vault-uploads'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  )
  WITH CHECK (
    bucket_id = 'vault-uploads'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  );

CREATE POLICY vault_uploads_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'vault-uploads'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  );

CREATE POLICY thesis_exports_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'thesis-exports'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  )
  WITH CHECK (
    bucket_id = 'thesis-exports'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  );

CREATE POLICY thesis_exports_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'thesis-exports'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  );

-- Reference / template tables: read-only for authenticated users
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE universities ENABLE ROW LEVEL SECURITY;
ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE university_guideline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_section_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY domains_read ON domains FOR SELECT TO authenticated USING (true);
CREATE POLICY qualifications_read ON qualifications FOR SELECT TO authenticated USING (true);
CREATE POLICY universities_read ON universities FOR SELECT TO authenticated USING (true);
CREATE POLICY colleges_read ON colleges FOR SELECT TO authenticated USING (true);
CREATE POLICY university_guidelines_read ON university_guideline_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY domain_templates_read ON domain_section_templates FOR SELECT TO authenticated USING (true);

-- Admin write on templates (service role bypasses RLS for seeds)
CREATE POLICY university_guidelines_admin ON university_guideline_templates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY domain_templates_admin ON domain_section_templates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Users: allow insert for own row (onboarding edge cases; trigger is primary path)
CREATE POLICY users_insert_own ON users FOR INSERT TO authenticated
  WITH CHECK (supabase_user_id = auth.uid());

-- Activity events: enforce WITH CHECK on insert/update
DROP POLICY IF EXISTS activity_events_tenant ON activity_events;
CREATE POLICY activity_events_tenant ON activity_events FOR ALL TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.user_owns_workspace(workspace_id))
    OR user_id IN (SELECT id FROM users WHERE supabase_user_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE supabase_user_id = auth.uid())
    AND (
      workspace_id IS NULL
      OR public.user_owns_workspace(workspace_id)
    )
  );

-- Auth trigger: prefer app_metadata for provisioning defaults
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    supabase_user_id,
    email,
    full_name,
    domain,
    qualification,
    onboarding_complete
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_app_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(COALESCE(NEW.email, 'user'), '@', 1)
    ),
    COALESCE(NEW.raw_app_meta_data->>'domain', NEW.raw_user_meta_data->>'domain', 'allopathy'),
    COALESCE(NEW.raw_app_meta_data->>'qualification', NEW.raw_user_meta_data->>'qualification', 'pg'),
    false
  )
  ON CONFLICT (supabase_user_id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
  RETURN NEW;
END;
$$;

-- Revoke direct API access from anon on tenant tables
REVOKE ALL ON TABLE users, workspaces, sections, chat_messages, vault_resources,
  activity_events, workspace_state_transitions, pre_thesis_build_jobs,
  pre_thesis_sources, pre_thesis_conflicts, pre_thesis_lock_events,
  master_charts, master_chart_versions FROM anon;

GRANT SELECT ON TABLE domains, qualifications, universities, colleges,
  university_guideline_templates, domain_section_templates TO authenticated;
