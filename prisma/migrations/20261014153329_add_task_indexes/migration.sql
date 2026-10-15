-- DropIndex
DROP INDEX "tasks_organizationId_idx";

-- CreateIndex
CREATE INDEX "tasks_organizationId_status_createdAt_idx" ON "tasks"("organizationId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "tasks_organizationId_projectId_idx" ON "tasks"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "tasks_organizationId_assigneeId_idx" ON "tasks"("organizationId", "assigneeId");
