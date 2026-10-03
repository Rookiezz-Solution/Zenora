import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ReferralsService } from "./referrals.service";

// A person's own refer-and-earn programme. Not tied to any workspace: the code
// belongs to the user.
@Controller("referrals")
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get("me")
  me(@CurrentUser() userId: string) {
    return this.referrals.overview(userId);
  }
}
