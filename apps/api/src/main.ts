import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";

async function bootstrap() {
  const env = loadEnv();
  // rawBody: true preserves the exact request bytes on req.rawBody, needed
  // to verify Meta's X-Hub-Signature-256 webhook signature.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(cookieParser());
  app.enableCors({ origin: env.APP_URL, credentials: true });
  await app.listen(env.API_PORT);
  console.log(`Zenora API listening on :${env.API_PORT}`);
}

bootstrap();
