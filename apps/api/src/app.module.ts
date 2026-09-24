import { Module } from "@nestjs/common";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { ChannelsModule } from "./channels/channels.module";
import { HealthController } from "./health/health.controller";
import { InboxModule } from "./inbox/inbox.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";
import { QuickRepliesModule } from "./quick-replies/quick-replies.module";
import { RealtimeModule } from "./realtime/realtime.module";
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
    QuickRepliesModule,
    TemplatesModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
