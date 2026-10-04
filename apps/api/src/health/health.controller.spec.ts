import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  instance: { on: vi.fn(), ping: vi.fn(), get: vi.fn(), quit: vi.fn().mockResolvedValue("OK") }
}));
vi.mock("ioredis", () => ({ default: function () { return redis.instance; } }));
vi.mock("../config/env", () => ({ loadEnv: () => ({ REDIS_URL: "redis://localhost:6379" }) }));

import type { PrismaService } from "../prisma/prisma.service";
import { HealthController } from "./health.controller";

function make(dbOk = true) {
  const queryRaw = vi.fn().mockImplementation(() => (dbOk ? Promise.resolve([{ "?column?": 1 }]) : Promise.reject(new Error("db down"))));
  const controller = new HealthController({ client: { $queryRaw: queryRaw } } as unknown as PrismaService);
  const res = { status: vi.fn() };
  return { controller, res, queryRaw };
}

beforeEach(() => {
  vi.clearAllMocks();
  redis.instance.ping.mockResolvedValue("PONG");
  redis.instance.get.mockResolvedValue(String(Date.now()));
});

describe("HealthController", () => {
  it("liveness never touches a dependency", () => {
    const { controller, queryRaw } = make(false);
    expect(controller.check().status).toBe("ok");
    expect(queryRaw).not.toHaveBeenCalled();
    expect(redis.instance.ping).not.toHaveBeenCalled();
  });

  it("is ready when the database and Redis answer, and reports the worker", async () => {
    const { controller, res } = make();
    const r = await controller.ready(res as never);
    expect(r).toMatchObject({ status: "ok", checks: { database: "up", redis: "up", worker: "up" } });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("answers 503 when the database is down", async () => {
    const { controller, res } = make(false);
    const r = await controller.ready(res as never);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(r).toMatchObject({ status: "unavailable", checks: { database: "down", redis: "up" } });
  });

  it("answers 503 when Redis is down", async () => {
    redis.instance.ping.mockRejectedValue(new Error("ECONNREFUSED"));
    const { controller, res } = make();
    const r = await controller.ready(res as never);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(r.checks.redis).toBe("down");
  });

  it("reports a missing worker heartbeat without failing readiness", async () => {
    redis.instance.get.mockResolvedValue(null);
    const { controller, res } = make();
    const r = await controller.ready(res as never);
    expect(r.checks.worker).toBe("down");
    expect(r.status).toBe("ok");
    expect(res.status).not.toHaveBeenCalled();
  });

  it("reports the worker as unknown when Redis cannot be asked", async () => {
    redis.instance.get.mockRejectedValue(new Error("boom"));
    const { controller, res } = make();
    expect((await controller.ready(res as never)).checks.worker).toBe("unknown");
  });
});
