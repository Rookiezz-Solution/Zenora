-- CreateTable
CREATE TABLE "LinkInBioPage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bio" TEXT,
    "whatsappPhone" TEXT,
    "brochureUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkInBioPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkInBioPage_workspaceId_key" ON "LinkInBioPage"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkInBioPage_slug_key" ON "LinkInBioPage"("slug");

-- AddForeignKey
ALTER TABLE "LinkInBioPage" ADD CONSTRAINT "LinkInBioPage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

