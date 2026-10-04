import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { loadEnv } from "../config/env";
import { Mailer } from "../mail/mailer.service";

const PURPOSE_TEXT: Record<string, string> = {
  password_reset: "reset your Zenora password",
  login: "sign in to Zenora",
  signup: "finish creating your Zenora account",
  phone_verify: "verify your phone number"
};

// Codes go to an email address through the configured email server. There is no
// SMS provider wired yet (a DLT-registered MSG91 client would go here), so a code
// for a phone number — and a code for an email when email isn't set up — is only
// logged in development. Anywhere else it must NOT be logged (a code in a log is a
// working credential), and the request fails honestly instead of reporting a code
// as sent that nobody will ever receive.
@Injectable()
export class OtpSender {
  private readonly logger = new Logger(OtpSender.name);

  constructor(private readonly mailer: Mailer) {}

  // Whether a code could actually reach this target right now.
  canDeliver(target: string): boolean {
    return (target.includes("@") && this.mailer.isConfigured()) || loadEnv().NODE_ENV === "development";
  }

  async send(target: string, code: string, purpose = "login"): Promise<void> {
    if (target.includes("@") && this.mailer.isConfigured()) {
      await this.mailer.send({
        to: target,
        subject: "Your Zenora verification code",
        text: `Your code to ${PURPOSE_TEXT[purpose] ?? "continue"} is ${code}.\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email: nothing changes unless the code is used.`
      });
      return;
    }
    if (loadEnv().NODE_ENV !== "development") {
      throw new ServiceUnavailableException("Verification codes can't be sent yet. Please sign in with your password or Google.");
    }
    this.logger.warn(`[otp-stub] would send code ${code} to ${target}`);
  }
}
