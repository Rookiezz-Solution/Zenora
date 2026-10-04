import { Controller, Get, OnModuleDestroy, Res } from "@nestjs/common";
import { WORKER_HEARTBEAT_KEY } from "@zenora/shared";
import type { Response } from "express";
import IORedis from "ioredis";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

const CHECK_TIMEOUT_MS = 2_000;

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), CHECK_TIMEOUT_MS).unref())]);
}

@Controller("health")
export class HealthController implements OnModuleDestroy {
  // Its own connection with short timeouts, so a slow or dead Redis shows up as
  // "down" here instead of hanging the probe. (Commands wait for the connection
  // rather than failing straight away, so the first probe after boot is accurate.)
  private readonly redis = new IORedis(loadEnv().REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: CHECK_TIMEOUT_MS, commandTimeout: CHECK_TIMEOUT_MS });

  constructor(private readonly prisma: PrismaService) {
    this.redis.on("error", () => undefined); // reported through /health/ready, not as unhandled events
  }

  // Liveness: the process is up and serving. Never touches a dependency, so a
  // database outage does not make the orchestrator restart a healthy process.
  @Get()
  check() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  // Readiness: can this instance do real work? 503 when the database or Redis
  // is unreachable, so a load balancer stops sending it traffic. The worker is
  // reported but does not fail readiness (it is a separate process).
  @Get("ready")
  async ready(@Res({ passthrough: true }) res: Response) {
    const [db, redis, worker] = await Promise.all([
      withTimeout(this.prisma.client.$queryRaw`SELECT 1`).then(() => "up" as const).catch(() => "down" as const),
      withTimeout(this.redis.ping()).then(() => "up" as const).catch(() => "down" as const),
      this.workerStatus()
    ]);
    const ok = db === "up" && redis === "up";
    if (!ok) res.status(503);
    return { status: ok ? "ok" : "unavailable", checks: { database: db, redis, worker }, timestamp: new Date().toISOString() };
  }

  private async workerStatus(): Promise<"up" | "down" | "unknown"> {
    try {
      const beat = await withTimeout(this.redis.get(WORKER_HEARTBEAT_KEY));
      return beat ? "up" : "down";
    } catch {
      return "unknown";
    }
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}
