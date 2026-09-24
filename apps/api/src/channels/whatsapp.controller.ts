import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { connectWhatsappSchema } from "./dto/whatsapp.dto";
import { WhatsappService } from "./whatsapp.service";

@Controller("channels/whatsapp")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  // Called by the frontend once the WhatsApp Embedded Signup JS SDK flow
  // finishes (see apps/web's Connect channels page) — unlike Instagram this
  // is a same-page popup flow, not a server-side redirect.
  @Post("connect/:workspaceId")
  @RequirePermission("channels.manage")
  connect(
    @Param("workspaceId") workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(connectWhatsappSchema)) body: unknown
  ) {
    return this.whatsapp.connect(workspaceId, userId, body as never);
  }
}
