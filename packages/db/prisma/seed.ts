import { PrismaClient } from "@prisma/client";

// Mirrors @zenora/shared's FEATURE_FLAGS. Inlined (not imported) so this
// script only depends on a generated Prisma client, not a built @zenora/shared
// dist — keeps `pnpm db:seed` runnable without a full workspace build first.
const FEATURE_FLAGS = [
  "ai_replies",
  "meeting_bot",
  "telephony",
  "broadcasts",
  "agency_workspaces",
  "audience_sync"
] as const;

const prisma = new PrismaClient();

async function main() {
  for (const key of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: {},
      create: { key, enabledByDefault: false }
    });
  }

  const owner = await prisma.user.upsert({
    where: { email: "owner@zenora.dev" },
    update: {},
    create: {
      email: "owner@zenora.dev",
      name: "Demo Owner",
      emailVerifiedAt: new Date()
    }
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: "seed-workspace" },
    update: {},
    create: {
      id: "seed-workspace",
      name: "Demo Business",
      mode: "team",
      industry: "coaching"
    }
  });

  await prisma.membership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: owner.id, role: "owner" }
  });

  await prisma.subscription.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: { workspaceId: workspace.id, planId: "free", status: "active" }
  });

  const pipeline = await prisma.pipeline.upsert({
    where: { id: "seed-pipeline" },
    update: {},
    create: { id: "seed-pipeline", workspaceId: workspace.id, name: "Sales Pipeline", isDefault: true }
  });

  const stages = [
    { name: "New", type: "open" as const, order: 0 },
    { name: "Contacted", type: "open" as const, order: 1 },
    { name: "Qualified", type: "open" as const, order: 2 },
    { name: "Won", type: "won" as const, order: 3 },
    { name: "Lost", type: "lost" as const, order: 4 }
  ];
  for (const stage of stages) {
    await prisma.stage.upsert({
      where: { id: `seed-stage-${stage.order}` },
      update: {},
      create: { id: `seed-stage-${stage.order}`, pipelineId: pipeline.id, ...stage }
    });
  }

  console.log(`Seeded workspace "${workspace.name}" (${workspace.id}) with owner ${owner.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
