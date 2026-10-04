-- CreateTable
CREATE TABLE "PlanConfigOverride" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanConfigOverride_pkey" PRIMARY KEY ("id")
);

