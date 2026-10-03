import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { RoutingModule } from "../routing/routing.module";
import { CalendarController, GoogleCalendarCallbackController, PublicBookingController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
import { GoogleCalendarClient } from "./google-calendar.client";

@Module({
  imports: [RoutingModule, NotificationsModule],
  // The callback controller is listed first so "calendar/google/callback" is
  // never matched as "calendar/:workspaceId/<something>".
  controllers: [GoogleCalendarCallbackController, CalendarController, PublicBookingController],
  providers: [CalendarService, GoogleCalendarClient]
})
export class CalendarModule {}
