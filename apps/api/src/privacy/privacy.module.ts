import { Module } from "@nestjs/common";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";
import { WorkspaceExportService } from "./workspace-export.service";

@Module({
  controllers: [PrivacyController],
  providers: [PrivacyService, WorkspaceExportService]
})
export class PrivacyModule {}
