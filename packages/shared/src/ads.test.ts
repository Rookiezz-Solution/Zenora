import { describe, expect, it } from "vitest";
import { buildAdsReport, extractAdReferral, parseSpendMinor, type AdLeadRow, type AdStatRow } from "./ads";

describe("parseSpendMinor", () => {
  it("converts Meta's decimal strings to minor units", () => {
    expect(parseSpendMinor("123.45")).toBe(12345);
    expect(parseSpendMinor("0.1")).toBe(10);
    expect(parseSpendMinor(7)).toBe(700);
  });
  it("treats missing, zero, negative or junk values as 0", () => {
    for (const v of [undefined, null, "", "abc", "-5", "0"]) expect(parseSpendMinor(v as never)).toBe(0);
  });
});

describe("extractAdReferral", () => {
  it("reads a WhatsApp click-to-chat ad", () => {
    expect(extractAdReferral({ source_type: "ad", source_id: "AD1", headline: "Diwali offer" }, "whatsapp")).toEqual({
      adId: "AD1",
      channel: "whatsapp",
      headline: "Diwali offer"
    });
  });
  it("ignores a WhatsApp referral that is a post or has no id", () => {
    expect(extractAdReferral({ source_type: "post", source_id: "P1" }, "whatsapp")).toBeNull();
    expect(extractAdReferral({ source_type: "ad" }, "whatsapp")).toBeNull();
  });
  it("reads an Instagram ad referral and its title", () => {
    expect(extractAdReferral({ ad_id: "AD2", ads_context_data: { ad_title: "Summer" } }, "instagram")).toEqual({
      adId: "AD2",
      channel: "instagram",
      headline: "Summer"
    });
  });
  it("returns null for anything that isn't an object", () => {
    for (const v of [null, undefined, "x", 3]) expect(extractAdReferral(v, "instagram")).toBeNull();
  });
});

const stat = (over: Partial<AdStatRow>): AdStatRow => ({
  adId: "a1",
  campaignId: "c1",
  campaignName: "Diwali",
  currency: "INR",
  spendMinor: 100_000,
  impressions: 1000,
  clicks: 50,
  ...over
});
const lead = (over: Partial<AdLeadRow>): AdLeadRow => ({ adId: null, source: "whatsapp", won: false, hasAppointment: false, ...over });

describe("buildAdsReport", () => {
  it("sums several days and ads into one campaign row", () => {
    const report = buildAdsReport([stat({}), stat({ spendMinor: 50_000 }), stat({ adId: "a2", spendMinor: 50_000 })], []);
    expect(report.campaigns).toHaveLength(1);
    expect(report.campaigns[0]).toMatchObject({ spendMinor: 200_000, impressions: 3000, clicks: 150 });
  });

  it("attributes leads to the campaign of the ad that opened their chat and computes cost per result", () => {
    const report = buildAdsReport(
      [stat({ spendMinor: 300_000 })],
      [lead({ adId: "a1", hasAppointment: true, won: true }), lead({ adId: "a1" }), lead({ adId: "a1", hasAppointment: true }), lead({ adId: "a1" })]
    );
    expect(report.campaigns[0]).toMatchObject({
      leads: 4,
      appointments: 2,
      won: 1,
      costPerLeadMinor: 75_000,
      costPerAppointmentMinor: 150_000,
      costPerWonMinor: 300_000
    });
  });

  it("gives null (not Infinity) for a cost when there are no results", () => {
    const row = buildAdsReport([stat({})], []).campaigns[0]!;
    expect([row.costPerLeadMinor, row.costPerAppointmentMinor, row.costPerWonMinor]).toEqual([null, null, null]);
  });

  it("counts ad leads that match no synced campaign separately", () => {
    const report = buildAdsReport([stat({})], [lead({ adId: "unknown-ad" }), lead({ adId: "a1" })]);
    expect(report.unmatchedAdLeads).toBe(1);
    expect(report.campaigns[0]!.leads).toBe(1);
  });

  it("orders campaigns by spend and keeps each campaign's currency", () => {
    const report = buildAdsReport([stat({ campaignId: "small", adId: "x", spendMinor: 10 }), stat({ campaignId: "big", adId: "y", spendMinor: 99, currency: "USD" })], []);
    expect(report.campaigns.map((c) => [c.campaignId, c.currency])).toEqual([
      ["big", "USD"],
      ["small", "INR"]
    ]);
  });

  it("groups leads by source, folding anything with an ad id into 'ad'", () => {
    const report = buildAdsReport(
      [],
      [lead({ adId: "a1" }), lead({ source: "link_in_bio" }), lead({ source: "link_in_bio" }), lead({ source: null }), lead({ source: "whatsapp" })]
    );
    expect(report.sources).toEqual([
      { source: "link_in_bio", leads: 2 },
      { source: "ad", leads: 1 },
      { source: "unknown", leads: 1 },
      { source: "whatsapp", leads: 1 }
    ]);
  });
});
