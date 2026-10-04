import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { FlowTemplatesModule } from "../flow-templates/flow-templates.module";
import { AdminController, AdminMeController, PublicConfigController, PublicPlansController } from "./admin.controller";
import { OwnerConsoleService } from "./owner-console.service";
import { PlatformSettingsService } from "./platform-settings.service";
import { SuperAdminGuard } from "./super-admin.guard";

@Module({
  imports: [BillingModule, FlowTemplatesModule],
  controllers: [AdminController, AdminMeController, PublicConfigController, PublicPlansController],
  providers: [PlatformSettingsService, OwnerConsoleService, SuperAdminGuard]
})
export class AdminModule {}
