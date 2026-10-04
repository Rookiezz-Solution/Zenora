import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startHealthServer } from "./health-server";

let server: ReturnType<typeof startHealthServer> | undefined;
afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

async function get(path: string) {
  server = startHealthServer(0);
  await new Promise((r) => server!.once("listening", r));
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}${path}`);
}

describe("startHealthServer", () => {
  it("answers /health and / with ok", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "zenora-worker" });
  });

  it("answers anything else with 404", async () => {
    expect((await get("/admin")).status).toBe(404);
  });
});
