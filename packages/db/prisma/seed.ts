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

  await prisma.waTemplate.upsert({
    where: { id: "seed-template-welcome" },
    update: {},
    create: {
      id: "seed-template-welcome",
      workspaceId: workspace.id,
      name: "welcome_followup",
      category: "utility",
      language: "en",
      bodyText: "Hi! Thanks for your interest — we'll follow up with details shortly.",
      metaStatus: "approved"
    }
  });

  await prisma.quickReply.upsert({
    where: { workspaceId_shortcut: { workspaceId: workspace.id, shortcut: "/price" } },
    update: {},
    create: { workspaceId: workspace.id, shortcut: "/price", body: "Here's our current pricing — happy to walk you through it on a quick call." }
  });

  // Public (workspaceId: null) starter-kit templates for the flow template
  // gallery — docs/ROADMAP.md Phase 1 item 6: "starter kits for 4
  // industries." A simple, realistic welcome-and-handover flow per
  // industry; {business_name} is filled in when a workspace uses one.
  const starterKits: Array<{ id: string; name: string; industry: string; welcomeBody: string; tagName: string }> = [
    {
      id: "seed-template-coaching",
      name: "New DM auto-responder",
      industry: "coaching",
      welcomeBody: "Hi! Thanks for reaching out to {business_name} 🙌 Want to book a free consultation call?",
      tagName: "new-lead"
    },
    {
      id: "seed-template-clinic",
      name: "Appointment inquiry responder",
      industry: "clinic",
      welcomeBody: "Hi! Thanks for contacting {business_name}. Would you like to book an appointment?",
      tagName: "appointment-inquiry"
    },
    {
      id: "seed-template-salon",
      name: "Booking inquiry responder",
      industry: "salon",
      welcomeBody: "Hi! Thanks for messaging {business_name} 💇 Which service are you interested in booking?",
      tagName: "booking-inquiry"
    },
    {
      id: "seed-template-real-estate",
      name: "Property inquiry responder",
      industry: "real_estate",
      welcomeBody: "Hi! Thanks for your interest in {business_name}'s listings. Which property caught your eye?",
      tagName: "property-inquiry"
    }
  ];
  for (const kit of starterKits) {
    await prisma.flowTemplate.upsert({
      where: { id: kit.id },
      update: {},
      create: {
        id: kit.id,
        workspaceId: null,
        name: kit.name,
        industry: kit.industry,
        scope: "public",
        graph: {
          startBlockId: "welcome",
          blocks: {
            welcome: { id: "welcome", type: "send_text", body: kit.welcomeBody, next: "tag" },
            tag: { id: "tag", type: "tag", tagName: kit.tagName, next: "handover" },
            handover: { id: "handover", type: "handover" }
          }
        },
        variables: { business_name: "Your business name" }
      }
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
