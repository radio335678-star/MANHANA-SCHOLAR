-- Add humaniser_intensity to workspaces (0 = Raw AI … 9 = Ghost Writer, default 4 = Scholar Voice)
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS humaniser_intensity INT NOT NULL DEFAULT 4
  CONSTRAINT humaniser_intensity_range CHECK (humaniser_intensity >= 0 AND humaniser_intensity <= 9);
