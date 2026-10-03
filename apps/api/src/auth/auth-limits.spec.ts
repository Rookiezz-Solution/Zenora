import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { authLimits } from "./auth-limits";

describe("authLimits", () => {
  it("stops guessing one account's password from many addresses", () => {
    for (let i = 0; i < 8; i++) authLimits.login(`10.0.0.${i}`, "Target@Example.com");
    expect(() => authLimits.login("10.0.0.99", "target@example.com")).toThrow(HttpException); // same account, new IP, email case ignored
  });

  it("stops one address trying many accounts", () => {
    for (let i = 0; i < 30; i++) authLimits.login("203.0.113.5", `user${i}@example.com`);
    expect(() => authLimits.login("203.0.113.5", "another@example.com")).toThrow(HttpException);
  });

  it("limits code requests and code guesses per target", () => {
    for (let i = 0; i < 5; i++) authLimits.otpRequest(`10.1.0.${i}`, "victim@x.co");
    expect(() => authLimits.otpRequest("10.1.0.99", "VICTIM@x.co")).toThrow(HttpException);
    for (let i = 0; i < 10; i++) authLimits.otpVerify(`10.2.0.${i}`, "victim2@x.co");
    expect(() => authLimits.otpVerify("10.2.0.99", "victim2@x.co")).toThrow(HttpException);
  });

  it("limits sign-ups per address", () => {
    for (let i = 0; i < 10; i++) authLimits.signup("198.51.100.7");
    expect(() => authLimits.signup("198.51.100.7")).toThrow(HttpException);
  });
});
