import { Global, Module } from "@nestjs/common";
import { ReferralsController } from "./referrals.controller";
import { ReferralsService } from "./referrals.service";

// Global so billing (accrual) and workspaces (attribution) can use it without
// importing each other.
@Global()
@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService]
})
export class ReferralsModule {}
