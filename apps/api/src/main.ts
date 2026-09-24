import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: env.APP_URL, credentials: true });
  await app.listen(env.API_PORT);
  console.log(`Zenora API listening on :${env.API_PORT}`);
}

bootstrap();
