import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { authLimits } from "./auth-limits";

describe("authLimits", () => {
  it("stops guessing one account's password from many addresses", async () => {
    for (let i = 0; i < 8; i++) await authLimits.login(`10.0.0.${i}`, "Target@Example.com");
    await expect(authLimits.login("10.0.0.99", "target@example.com")).rejects.toThrow(HttpException); // same account, new IP, email case ignored
  });

  it("stops one address trying many accounts", async () => {
    for (let i = 0; i < 30; i++) await authLimits.login("203.0.113.5", `user${i}@example.com`);
    await expect(authLimits.login("203.0.113.5", "another@example.com")).rejects.toThrow(HttpException);
  });

  it("limits code requests and code guesses per target", async () => {
    for (let i = 0; i < 5; i++) await authLimits.otpRequest(`10.1.0.${i}`, "victim@x.co");
    await expect(authLimits.otpRequest("10.1.0.99", "VICTIM@x.co")).rejects.toThrow(HttpException);
    for (let i = 0; i < 10; i++) await authLimits.otpVerify(`10.2.0.${i}`, "victim2@x.co");
    await expect(authLimits.otpVerify("10.2.0.99", "victim2@x.co")).rejects.toThrow(HttpException);
  });

  it("limits sign-ups per address", async () => {
    for (let i = 0; i < 10; i++) await authLimits.signup("198.51.100.7");
    await expect(authLimits.signup("198.51.100.7")).rejects.toThrow(HttpException);
  });
});
