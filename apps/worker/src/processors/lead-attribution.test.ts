import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ lead: { updateMany: vi.fn() } }));
vi.mock("@zenora/db", () => ({ prisma: prismaMock }));

import { recordAdReferral } from "./lead-attribution";

beforeEach(() => vi.clearAllMocks());

describe("recordAdReferral", () => {
  it("stamps the ad on a lead that has none yet (first touch wins)", async () => {
    await recordAdReferral("lead_1", { source_type: "ad", source_id: "ad_9", headline: "Diwali offer" }, "whatsapp");

    expect(prismaMock.lead.updateMany).toHaveBeenCalledWith({
      where: { id: "lead_1", adId: null },
      data: { adId: "ad_9", adReferral: { adId: "ad_9", channel: "whatsapp", headline: "Diwali offer" } }
    });
  });

  it("does nothing for a message that didn't come from an ad", async () => {
    await recordAdReferral("lead_1", undefined, "whatsapp");
    await recordAdReferral("lead_1", { source_type: "post", source_id: "p1" }, "whatsapp");
    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
  });
});
