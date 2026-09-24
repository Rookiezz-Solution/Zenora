import { Injectable, Logger } from "@nestjs/common";

// Phase 0 stub: logs the code instead of sending SMS/WhatsApp OTP.
// Swap for an MSG91 (or similar DLT-registered) client wired to
// OTP_PROVIDER_API_KEY before Phase 1 ships OTP-based login for real users.
@Injectable()
export class OtpSender {
  private readonly logger = new Logger(OtpSender.name);

  async send(target: string, code: string): Promise<void> {
    this.logger.warn(`[otp-stub] would send code ${code} to ${target}`);
  }
}
