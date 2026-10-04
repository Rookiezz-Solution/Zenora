import { describe, expect, it } from "vitest";
import { buildAdsReport, isQualifiedLead, type AdLeadRow, type AdStatRow } from "./ads";

const lead = (won: boolean, stageCountsAsQualified: boolean, score: number) => ({ won, stageCountsAsQualified, score });

describe("isQualifiedLead", () => {
  it("counts a won lead and a lead in a qualified stage, whatever the score rule", () => {
    expect(isQualifiedLead(lead(true, false, 0), null)).toBe(true);
    expect(isQualifiedLead(lead(false, true, 0), null)).toBe(true);
    expect(isQualifiedLead(lead(true, false, 0), 80)).toBe(true);
  });

  it("counts a lead whose score has reached the workspace's minimum", () => {
    expect(isQualifiedLead(lead(false, false, 60), 60)).toBe(true);
    expect(isQualifiedLead(lead(false, false, 95), 60)).toBe(true);
    expect(isQualifiedLead(lead(false, false, 59), 60)).toBe(false);
  });

  it("with no minimum set, a high score alone never qualifies", () => {
    expect(isQualifiedLead(lead(false, false, 999), null)).toBe(false);
    expect(isQualifiedLead(lead(false, false, 999), undefined)).toBe(false);
    expect(isQualifiedLead(lead(false, false, 999), 0)).toBe(false);
  });
});

describe("buildAdsReport qualified column", () => {
  const stat: AdStatRow = { adId: "a1", campaignId: "c1", campaignName: "Diwali", currency: "INR", spendMinor: 300_000, impressions: 1000, clicks: 50 };
  const row = (over: Partial<AdLeadRow>): AdLeadRow => ({ adId: "a1", source: "whatsapp", won: false, hasAppointment: false, ...over });

  it("counts qualified leads per campaign and works out the cost of each", () => {
    const report = buildAdsReport([stat], [row({ qualified: true }), row({ qualified: true }), row({ qualified: true }), row({}), row({ qualified: false })]);
    expect(report.campaigns[0]).toMatchObject({ leads: 5, qualified: 3, costPerQualifiedMinor: 100_000 });
  });

  it("gives null when nothing qualified, and treats a missing flag as not qualified", () => {
    const report = buildAdsReport([stat], [row({}), row({})]);
    expect(report.campaigns[0]).toMatchObject({ qualified: 0, costPerQualifiedMinor: null });
  });

  it("does not count qualified leads that came from no tracked campaign", () => {
    const report = buildAdsReport([stat], [row({ adId: "other-ad", qualified: true }), row({ adId: null, qualified: true })]);
    expect(report.campaigns[0]!.qualified).toBe(0);
  });
});
