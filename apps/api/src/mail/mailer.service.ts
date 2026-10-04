import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { loadEnv } from "../config/env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

// Sends email through any SMTP server (Amazon SES, ZeptoMail, Brevo, a company
// mail server...). The connection details are entered by a super admin under
// Integrations → Email, not in .env; until they are, nothing is sent and the
// callers say so honestly instead of pretending.
@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);
  private cached: { key: string; transport: Transporter } | null = null;

  isConfigured(): boolean {
    const env = loadEnv();
    return Boolean(env.SMTP_HOST && env.SMTP_FROM);
  }

  async send(message: OutgoingEmail): Promise<void> {
    if (!this.isConfigured()) throw new ServiceUnavailableException("Email isn't set up yet.");
    const env = loadEnv();
    try {
      await this.transport().sendMail({ from: env.SMTP_FROM, to: message.to, subject: message.subject, text: message.text });
    } catch (err) {
      // The reason (bad password, blocked port...) is for the logs, never for the caller.
      this.logger.error(`Could not send email: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException("We couldn't send the email. Please try again shortly.");
    }
  }

  // Rebuilt when the settings change (they can be edited at runtime).
  private transport(): Transporter {
    const env = loadEnv();
    const port = env.SMTP_PORT ?? 587;
    const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
    const key = JSON.stringify([env.SMTP_HOST, port, secure, env.SMTP_USER, env.SMTP_PASS]);
    if (this.cached?.key === key) return this.cached.transport;
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000
    });
    this.cached = { key, transport };
    return transport;
  }
}
