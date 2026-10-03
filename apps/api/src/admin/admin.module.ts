import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { AdminController, AdminMeController, PublicConfigController } from "./admin.controller";
import { OwnerConsoleService } from "./owner-console.service";
import { PlatformSettingsService } from "./platform-settings.service";
import { SuperAdminGuard } from "./super-admin.guard";

@Module({
  imports: [BillingModule],
  controllers: [AdminController, AdminMeController, PublicConfigController],
  providers: [PlatformSettingsService, OwnerConsoleService, SuperAdminGuard]
})
export class AdminModule {}
