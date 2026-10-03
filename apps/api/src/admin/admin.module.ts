import { Module } from "@nestjs/common";
import { AdminController, AdminMeController, PublicConfigController } from "./admin.controller";
import { PlatformSettingsService } from "./platform-settings.service";
import { SuperAdminGuard } from "./super-admin.guard";

@Module({
  controllers: [AdminController, AdminMeController, PublicConfigController],
  providers: [PlatformSettingsService, SuperAdminGuard]
})
export class AdminModule {}
