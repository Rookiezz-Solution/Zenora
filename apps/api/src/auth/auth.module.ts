import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpSender } from "./otp-sender";
import { PermissionsGuard } from "./guards/permissions.guard";
import { GoogleStrategy } from "./strategies/google.strategy";

@Module({
  imports: [PassportModule],
  controllers: [AuthController],
  providers: [AuthService, OtpSender, GoogleStrategy, PermissionsGuard],
  exports: [AuthService, PermissionsGuard]
})
export class AuthModule {}
