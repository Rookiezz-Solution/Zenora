import { describe, expect, it, vi } from "vitest";
import { WebhooksController } from "./webhooks.controller";
import type { WebhooksService } from "./webhooks.service";

function make(ingest: ReturnType<typeof vi.fn>) {
  const order: string[] = [];
  const res = {
    status: vi.fn().mockImplementation((code: number) => {
      order.push(`status:${code}`);
      return res;
    }),
    send: vi.fn()
  };
  const wrapped = vi.fn().mockImplementation(async (...args: unknown[]) => {
    order.push("ingest:start");
    await ingest(...args);
    order.push("ingest:done");
  });
  const controller = new WebhooksController({ ingest: wrapped } as unknown as WebhooksService);
  const req = (object: string) => ({ body: { object }, rawBody: Buffer.from("{}") }) as never;
  return { controller, res, order, wrapped, req };
}

describe("WebhooksController.receive", () => {
  it("stores the event first and only then acknowledges it", async () => {
    const { controller, res, order, req } = make(vi.fn().mockResolvedValue(undefined));
    await controller.receive(req("whatsapp_business_account"), res as never);
    expect(order).toEqual(["ingest:start", "ingest:done", "status:200"]);
  });

  it("answers 500 when the event could not be stored, so Meta retries instead of the event being lost", async () => {
    const { controller, res, order, req } = make(vi.fn().mockRejectedValue(new Error("pool timeout")));
    await controller.receive(req("instagram"), res as never);
    expect(order).toEqual(["ingest:start", "status:500"]);
    expect(res.send).toHaveBeenCalledWith("RETRY");
  });

  it("acknowledges and ignores a payload it will never handle, without storing it", async () => {
    const { controller, res, wrapped, req } = make(vi.fn());
    await controller.receive(req("page"), res as never);
    expect(wrapped).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
