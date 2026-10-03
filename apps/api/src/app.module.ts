import { Module } from "@nestjs/common";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { AutomationsModule } from "./automations/automations.module";
import { BillingModule } from "./billing/billing.module";
import { BroadcastsModule } from "./broadcasts/broadcasts.module";
import { CalendarModule } from "./calendar/calendar.module";
import { ChannelsModule } from "./channels/channels.module";
import { CustomFieldsModule } from "./custom-fields/custom-fields.module";
import { FlowTemplatesModule } from "./flow-templates/flow-templates.module";
import { HealthController } from "./health/health.controller";
import { InboxModule } from "./inbox/inbox.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { LeadsModule } from "./leads/leads.module";
import { LinkInBioModule } from "./link-in-bio/link-in-bio.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PipelinesModule } from "./pipelines/pipelines.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";
import { QuickRepliesModule } from "./quick-replies/quick-replies.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { ReportsModule } from "./reports/reports.module";
import { RoutingModule } from "./routing/routing.module";
import { SequencesModule } from "./sequences/sequences.module";
import { TasksModule } from "./tasks/tasks.module";
import { TemplatesModule } from "./templates/templates.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    QueueModule,
    RealtimeModule,
    AuthModule,
    WorkspacesModule,
    ChannelsModule,
    InboxModule,
    LeadsModule,
    PipelinesModule,
    CustomFieldsModule,
    AutomationsModule,
    FlowTemplatesModule,
    QuickRepliesModule,
    TemplatesModule,
    BroadcastsModule,
    RoutingModule,
    TasksModule,
    SequencesModule,
    BillingModule,
    KnowledgeModule,
    NotificationsModule,
    ReportsModule,
    LinkInBioModule,
    CalendarModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
