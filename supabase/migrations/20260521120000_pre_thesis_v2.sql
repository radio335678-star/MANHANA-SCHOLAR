-- Pre-Thesis V2: departments catalog, workspace fields, build job result_json

CREATE TABLE IF NOT EXISTS departments (
  id serial PRIMARY KEY,
  domain text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  qualification_levels text[] NOT NULL DEFAULT ARRAY['pg']::text[],
  regulatory_body text NOT NULL DEFAULT 'NMC',
  UNIQUE (domain, slug)
);

CREATE TABLE IF NOT EXISTS department_thesis_templates (
  id serial PRIMARY KEY,
  department_id integer NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  qualification_level text NOT NULL DEFAULT 'pg',
  preliminary_pages_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  chapters_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  annexures_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_page_limit_min integer,
  default_page_limit_max integer,
  chapter_blueprint_seed_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (department_id, qualification_level)
);

CREATE TABLE IF NOT EXISTS university_department_overrides (
  id serial PRIMARY KEY,
  university_name text NOT NULL,
  department_id integer NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  qualification_level text NOT NULL DEFAULT 'pg',
  override_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (university_name, department_id, qualification_level)
);

CREATE TABLE IF NOT EXISTS guideline_search_cache (
  id serial PRIMARY KEY,
  cache_key text NOT NULL UNIQUE,
  results_json jsonb NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departments_domain ON departments(domain);
CREATE INDEX IF NOT EXISTS idx_guideline_search_cache_expires ON guideline_search_cache(expires_at);

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS department_id integer REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS candidate_name text,
  ADD COLUMN IF NOT EXISTS hod_name text,
  ADD COLUMN IF NOT EXISTS synopsis_text text,
  ADD COLUMN IF NOT EXISTS synopsis_storage_path text,
  ADD COLUMN IF NOT EXISTS study_type text,
  ADD COLUMN IF NOT EXISTS pre_thesis_build_version integer DEFAULT 1;

ALTER TABLE pre_thesis_build_jobs
  ADD COLUMN IF NOT EXISTS build_version integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS result_json jsonb,
  ADD COLUMN IF NOT EXISTS warnings jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completeness_score integer;

ALTER TABLE pre_thesis_sources
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS source_type text;

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_thesis_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE university_department_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE guideline_search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY departments_read ON departments FOR SELECT TO authenticated USING (true);
CREATE POLICY department_templates_read ON department_thesis_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY university_dept_overrides_read ON university_department_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY guideline_cache_read ON guideline_search_cache FOR SELECT TO authenticated USING (true);

GRANT SELECT ON departments, department_thesis_templates, university_department_overrides TO authenticated;
