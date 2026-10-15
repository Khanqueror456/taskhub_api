-- This is an empty migration.

CREATE INDEX "tasks_fts_idx" ON "tasks"
USING GIN (to_tsvector('english', title || ' ' || coalesce(description, '')));