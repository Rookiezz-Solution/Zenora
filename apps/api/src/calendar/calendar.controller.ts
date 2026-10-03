import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermission } from "../auth/decorators/require-permission.decorator";
import { ZodValidationPipe } from "../auth/dto/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { signOAuthState, verifyOAuthState } from "../common/oauth-state";
import { loadEnv } from "../config/env";
import { appointmentTypeSchema, bookSchema, slotsQuerySchema, updateAppointmentTypeSchema } from "./calendar.dto";
import { CalendarService } from "./calendar.service";
import { GoogleCalendarClient } from "./google-calendar.client";

const DAY_MS = 86_400_000;

@Controller("calendar/:workspaceId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("leads.read")
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly google: GoogleCalendarClient
  ) {}

  // Browser navigation: sends the signed-in member to Google's consent screen.
  @Get("connect")
  @RequirePermission("leads.write")
  connect(@Param("workspaceId") workspaceId: string, @CurrentUser() userId: string, @Res() res: Response) {
    res.redirect(this.google.buildAuthUrl(signOAuthState({ workspaceId, userId })));
  }

  @Get("status")
  status(@Param("workspaceId") workspaceId: string, @CurrentUser() userId: string) {
    return this.calendar.status(workspaceId, userId);
  }

  @Delete("connection")
  @RequirePermission("leads.write")
  disconnect(@Param("workspaceId") workspaceId: string, @CurrentUser() userId: string) {
    return this.calendar.disconnect(workspaceId, userId);
  }

  @Get("appointments")
  appointments(@Param("workspaceId") workspaceId: string, @Query("from") from?: string, @Query("days") days?: string) {
    const start = from ? new Date(from) : new Date();
    const span = Math.min(Math.max(Number(days) || 14, 1), 62);
    return this.calendar.listAppointments(workspaceId, start, new Date(start.getTime() + span * DAY_MS));
  }

  @Get("types")
  types(@Param("workspaceId") workspaceId: string) {
    return this.calendar.listTypes(workspaceId);
  }

  @Post("types")
  @RequirePermission("settings.manage")
  createType(@Param("workspaceId") workspaceId: string, @Body(new ZodValidationPipe(appointmentTypeSchema)) body: unknown) {
    return this.calendar.createType(workspaceId, body as never);
  }

  @Patch("types/:id")
  @RequirePermission("settings.manage")
  updateType(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAppointmentTypeSchema)) body: unknown
  ) {
    return this.calendar.updateType(workspaceId, id, body as never);
  }

  @Delete("types/:id")
  @RequirePermission("settings.manage")
  removeType(@Param("workspaceId") workspaceId: string, @Param("id") id: string) {
    return this.calendar.removeType(workspaceId, id);
  }
}

// Public: Google redirects the browser here after the member approves (or
// denies) access. Identity comes from the signed `state`, not a cookie.
@Controller("calendar/google")
export class GoogleCalendarCallbackController {
  constructor(private readonly calendar: CalendarService) {}

  @Get("callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Query("error") error: string, @Res() res: Response) {
    const { APP_URL } = loadEnv();
    if (error || !code) {
      res.redirect(`${APP_URL}/calendar?google=denied`);
      return;
    }
    let payload: { workspaceId: string; userId: string };
    try {
      payload = verifyOAuthState(state);
    } catch {
      throw new BadRequestException("Invalid or expired OAuth state");
    }
    await this.calendar.handleCallback(code, payload.workspaceId, payload.userId);
    res.redirect(`${APP_URL}/calendar?google=connected`);
  }
}

// Unauthenticated on purpose: the booking page a business shares with guests.
@Controller("public/booking/:typeId")
export class PublicBookingController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  get(@Param("typeId") typeId: string) {
    return this.calendar.getPublicType(typeId);
  }

  @Get("slots")
  slots(@Param("typeId") typeId: string, @Query(new ZodValidationPipe(slotsQuerySchema)) query: unknown) {
    return this.calendar.getSlots(typeId, (query as { date: string }).date);
  }

  @Post("book")
  book(@Param("typeId") typeId: string, @Req() req: Request, @Body(new ZodValidationPipe(bookSchema)) body: unknown) {
    return this.calendar.book(typeId, req.ip ?? "unknown", body as never);
  }
}
