-- Convert icon column from VARCHAR(32) to JSONB with proper JSON structure
-- Existing data formats:
--   - Emoji: raw unicode string like "🚀" -> {"type":"emoji","unicode":"🚀"}
--   - AffineIcon: JSON string like '{"type":"affine-icon",...}' -> parse as JSON

-- First, convert existing data to proper JSON format
UPDATE "workspace_spaces"
SET "icon" = CASE
  -- If it's already a JSON object string (starts with '{'), parse it
  WHEN "icon" LIKE '{%' THEN "icon"::jsonb
  -- Otherwise it's an emoji, wrap it in JSON structure
  WHEN "icon" IS NOT NULL THEN jsonb_build_object('type', 'emoji', 'unicode', "icon")
  ELSE NULL
END::text
WHERE "icon" IS NOT NULL;

-- Now convert the column type to JSONB
ALTER TABLE "workspace_spaces" ALTER COLUMN "icon" TYPE JSONB USING "icon"::jsonb;
