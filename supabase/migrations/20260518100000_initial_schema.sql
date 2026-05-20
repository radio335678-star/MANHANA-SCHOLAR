-- MANTHANA-SCHOLER core schema (Supabase Postgres)

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  supabase_user_id uuid UNIQUE,
  role text NOT NULL DEFAULT 'scholar',
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  domain text NOT NULL,
  qualification text NOT NULL,
  college_name text,
  university_name text,
  guide_names text,
  city text,
  state text,
  onboarding_complete boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_uuid uuid,
  title text NOT NULL,
  description text,
  domain text NOT NULL,
  qualification text,
  guide_name text,
  college_name text,
  university_name text,
  status text NOT NULL DEFAULT 'active',
  workflow_state text NOT NULL DEFAULT 'init',
  pre_thesis_draft_md text,
  pre_thesis_locked_md text,
  pre_thesis_md_hash text,
  pre_thesis_checklist jsonb,
  research_notes text,
  last_live_verified_at timestamp,
  locked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sections (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL DEFAULT 'custom',
  content text,
  status text NOT NULL DEFAULT 'not_started',
  "order" integer NOT NULL DEFAULT 0,
  word_count integer,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id serial PRIMARY KEY,
  section_id integer NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  tokens_used integer,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vault_resources (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  content text,
  url text,
  authors text,
  year integer,
  journal text,
  doi text,
  tags text,
  storage_path text,
  mime_type text,
  processing_status text NOT NULL DEFAULT 'ready',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_events (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id integer REFERENCES workspaces(id) ON DELETE CASCADE,
  type text NOT NULL,
  description text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS domains (
  id serial PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL,
  color text
);

CREATE TABLE IF NOT EXISTS qualifications (
  id serial PRIMARY KEY,
  name text NOT NULL,
  abbreviation text NOT NULL,
  domain text NOT NULL,
  level text NOT NULL
);

CREATE TABLE IF NOT EXISTS universities (
  id serial PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  state text NOT NULL
);

CREATE TABLE IF NOT EXISTS colleges (
  id serial PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  domain text NOT NULL,
  university_id integer REFERENCES universities(id)
);

CREATE TABLE IF NOT EXISTS workspace_state_transitions (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_state text NOT NULL,
  to_state text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS university_guideline_templates (
  id serial PRIMARY KEY,
  university_name text NOT NULL,
  domain text NOT NULL,
  qualification_level text NOT NULL DEFAULT 'pg',
  rules_json jsonb NOT NULL,
  version text NOT NULL DEFAULT '1.0',
  effective_year integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS domain_section_templates (
  id serial PRIMARY KEY,
  domain text NOT NULL,
  qualification_level text NOT NULL DEFAULT 'pg',
  sections_json jsonb NOT NULL,
  page_limit_min integer,
  page_limit_max integer,
  font_spacing_notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pre_thesis_build_jobs (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  current_agent text,
  telemetry jsonb DEFAULT '[]',
  error text,
  idempotency_key text,
  started_at timestamp,
  completed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pre_thesis_sources (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  build_job_id integer REFERENCES pre_thesis_build_jobs(id) ON DELETE SET NULL,
  attribution text NOT NULL,
  url text,
  title text NOT NULL,
  snippet text,
  storage_path text,
  fetched_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pre_thesis_conflicts (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  build_job_id integer REFERENCES pre_thesis_build_jobs(id) ON DELETE SET NULL,
  field_key text NOT NULL,
  template_value text,
  live_value text,
  severity text NOT NULL DEFAULT 'warning',
  resolved boolean NOT NULL DEFAULT false,
  applied_value text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pre_thesis_lock_events (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  md_hash text NOT NULL,
  locked_by_user_id integer NOT NULL,
  source_snapshot_path text,
  unlocked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_charts (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  mode text NOT NULL,
  current_version integer NOT NULL DEFAULT 0,
  study_design jsonb,
  linked_section_id integer REFERENCES sections(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_chart_versions (
  id serial PRIMARY KEY,
  chart_id integer NOT NULL REFERENCES master_charts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  storage_path text NOT NULL,
  schema_json jsonb,
  stats_summary jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id ON users(supabase_user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_uuid ON workspaces(owner_uuid);
CREATE INDEX IF NOT EXISTS idx_sections_workspace_id ON sections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_vault_resources_workspace_id ON vault_resources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_section_id ON chat_messages(section_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_user_id ON activity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_workspace_id ON activity_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_state_transitions_workspace ON workspace_state_transitions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pre_thesis_build_jobs_workspace ON pre_thesis_build_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_master_charts_workspace ON master_charts(workspace_id);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('scholar', 'admin'));
