-- AlterTable
ALTER TABLE "PlatformAuditLog" ADD COLUMN     "detail" TEXT,
ADD COLUMN     "workspaceId" TEXT;

-- CreateTable
CREATE TABLE "WorkspaceLimitOverride" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contacts" INTEGER,
    "users" INTEGER,
    "instagramAccounts" INTEGER,
    "note" TEXT,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceLimitOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceLimitOverride_workspaceId_key" ON "WorkspaceLimitOverride"("workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceLimitOverride" ADD CONSTRAINT "WorkspaceLimitOverride_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

