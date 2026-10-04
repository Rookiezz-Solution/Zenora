import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";

async function bootstrap() {
  const env = loadEnv();
  // rawBody: true preserves the exact request bytes on req.rawBody, needed
  // to verify Meta's X-Hub-Signature-256 webhook signature.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Behind a load balancer every request would otherwise look like it came from
  // the proxy's address, which breaks per-IP rate limits. Set TRUST_PROXY to the
  // number of proxies in front of the API (and leave it unset if there are none:
  // trusting X-Forwarded-For with no proxy lets callers spoof their address).
  if (env.TRUST_PROXY) app.set("trust proxy", Number(env.TRUST_PROXY));
  app.disable("x-powered-by");
  app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    // The API only ever returns JSON, files and redirects, never a page to render.
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    next();
  });
  app.use(cookieParser());
  app.enableCors({ origin: env.APP_URL, credentials: true });
  await app.listen(env.API_PORT);
  console.log(`Zenora API listening on :${env.API_PORT}`);
}

bootstrap();
