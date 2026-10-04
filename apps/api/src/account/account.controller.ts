import { Body, Controller, Delete, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { loadEnv } from "../config/env";
import { AccountService } from "./account.service";

const deleteAccountSchema = z.object({ confirmEmail: z.string().min(3).max(320) });

@Controller("account")
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Delete()
  async delete(@CurrentUser() userId: string, @Body(new ZodValidationPipe(deleteAccountSchema)) body: unknown, @Res({ passthrough: true }) res: Response) {
    const result = await this.account.deleteAccount(userId, (body as z.infer<typeof deleteAccountSchema>).confirmEmail);
    res.clearCookie(loadEnv().SESSION_COOKIE_NAME);
    return result;
  }
}
