-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('thesis-artifacts', 'thesis-artifacts', false, 52428800, NULL),
  ('vault-uploads', 'vault-uploads', false, 52428800, ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg','text/plain']),
  ('thesis-exports', 'thesis-exports', false, 52428800, ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- Helper: user owns workspace by integer workspace id
CREATE OR REPLACE FUNCTION public.user_owns_workspace(ws_id bigint)
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

CREATE OR REPLACE FUNCTION public.is_admin()
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

-- Storage RLS: workspace-scoped paths workspaces/{id}/...
CREATE POLICY thesis_artifacts_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'thesis-artifacts'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  );

CREATE POLICY thesis_artifacts_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'thesis-artifacts'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  );

CREATE POLICY vault_uploads_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'vault-uploads'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  );

CREATE POLICY vault_uploads_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vault-uploads'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  );

CREATE POLICY thesis_exports_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'thesis-exports'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND public.user_owns_workspace(((storage.foldername(name))[2])::bigint)
  );

-- Auth trigger: provision public.users row on signup
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
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, 'user'), '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'domain', 'allopathy'),
    COALESCE(NEW.raw_user_meta_data->>'qualification', 'pg'),
    false
  )
  ON CONFLICT (supabase_user_id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
