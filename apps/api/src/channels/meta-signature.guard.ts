import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import * as crypto from "node:crypto";
import type { Request } from "express";
import { loadEnv } from "../config/env";

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

// Meta signs every webhook POST with the app secret (X-Hub-Signature-256).
// Verifying it stops anyone who finds the webhook URL from injecting fake
// lead/message events. Requires NestFactory.create(AppModule, { rawBody: true }).
@Injectable()
export class MetaSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest>();
    const { META_APP_SECRET, NODE_ENV } = loadEnv();
    const signatureHeader = req.headers["x-hub-signature-256"];

    if (!META_APP_SECRET) {
      // Without the app secret nothing can be verified, so in production every
      // webhook is refused (accepting them would let anyone who finds the URL
      // inject fake messages and leads). Only local development, before a Meta
      // app exists, lets unsigned events through.
      if (NODE_ENV === "production") throw new ForbiddenException("Webhook signing is not configured");
      return true;
    }
    if (typeof signatureHeader !== "string" || !req.rawBody) {
      throw new ForbiddenException("Missing webhook signature");
    }

    const expected =
      "sha256=" + crypto.createHmac("sha256", META_APP_SECRET).update(req.rawBody).digest("hex");
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new ForbiddenException("Invalid webhook signature");
    }
    return true;
  }
}
