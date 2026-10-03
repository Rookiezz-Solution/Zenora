-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "viaAgencyId" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "agencyId" TEXT;

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyMember" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgencyMember_userId_idx" ON "AgencyMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyMember_agencyId_userId_key" ON "AgencyMember"("agencyId", "userId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyMember" ADD CONSTRAINT "AgencyMember_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyMember" ADD CONSTRAINT "AgencyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

