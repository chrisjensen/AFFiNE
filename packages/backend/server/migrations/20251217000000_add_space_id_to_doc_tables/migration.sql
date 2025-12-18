-- Add space_id column to snapshots table
-- NULL = workspace root level (not in any space)
ALTER TABLE "snapshots" ADD COLUMN "space_id" VARCHAR;

-- Add space_id column to updates table
ALTER TABLE "updates" ADD COLUMN "space_id" VARCHAR;

-- Add space_id column to snapshot_histories table
ALTER TABLE "snapshot_histories" ADD COLUMN "space_id" VARCHAR;

-- Create index for space-scoped queries on snapshots
CREATE INDEX "snapshots_workspace_id_space_id_updated_at_idx" ON "snapshots"("workspace_id", "space_id", "updated_at");

-- Create index for space-scoped queries on updates
CREATE INDEX "updates_workspace_id_space_id_id_idx" ON "updates"("workspace_id", "space_id", "guid");

-- Create index for space-scoped queries on snapshot_histories
CREATE INDEX "snapshot_histories_workspace_id_space_id_id_idx" ON "snapshot_histories"("workspace_id", "space_id", "guid");
