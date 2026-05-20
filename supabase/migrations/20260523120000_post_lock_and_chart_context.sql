-- Post-lock vault jobs + master chart context files + vault linkage on chart versions

CREATE TABLE IF NOT EXISTS post_lock_jobs (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('upload_locked_pre_thesis_docx')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  vault_resource_id INTEGER,
  metadata JSONB,
  next_retry_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_lock_jobs_workspace ON post_lock_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_post_lock_jobs_status_retry ON post_lock_jobs(status, next_retry_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS master_chart_context_files (
  id SERIAL PRIMARY KEY,
  chart_id INTEGER NOT NULL REFERENCES master_charts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  extracted_text TEXT,
  storage_path TEXT,
  vault_resource_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_chart_context_chart ON master_chart_context_files(chart_id);

ALTER TABLE master_chart_versions
  ADD COLUMN IF NOT EXISTS vault_resource_id INTEGER,
  ADD COLUMN IF NOT EXISTS model_used TEXT;
