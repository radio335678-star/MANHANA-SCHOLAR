-- Persist pre-create dataset master-chart recommendations selected by the user.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS dataset_master_chart_plan JSONB;
