import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { loadEnv } from "../config/env";

// Phase 0 stub: there is no SMS/WhatsApp/email provider wired yet (a
// DLT-registered MSG91 client would go here). In development the code is
// logged so login can be tried; anywhere else it must NOT be logged — a code in
// a log is a working credential — and the request fails honestly instead of
// reporting a code as sent that nobody will ever receive.
@Injectable()
export class OtpSender {
  private readonly logger = new Logger(OtpSender.name);

  async send(target: string, code: string): Promise<void> {
    if (loadEnv().NODE_ENV !== "development") {
      throw new ServiceUnavailableException("Sign-in codes can't be sent yet. Please sign in with your password or Google.");
    }
    this.logger.warn(`[otp-stub] would send code ${code} to ${target}`);
  }
}
