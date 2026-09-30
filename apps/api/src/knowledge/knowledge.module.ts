import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { BillingModule } from "../billing/billing.module";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeService } from "./knowledge.service";

@Module({
  imports: [AiModule, BillingModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService]
})
export class KnowledgeModule {}
