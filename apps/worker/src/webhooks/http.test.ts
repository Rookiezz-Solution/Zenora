import { describe, expect, it } from "vitest";
import { UnsafeTargetError, postWebhook, resolvePublicAddresses } from "./http";

const resolverFor = (...addresses: string[]) => () => Promise.resolve(addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));

describe("resolvePublicAddresses", () => {
  it("accepts a host that resolves only to public addresses", async () => {
    await expect(resolvePublicAddresses("hooks.example.com", resolverFor("93.184.216.34"))).resolves.toHaveLength(1);
  });

  it("refuses a host that resolves to a private address, even alongside a public one", async () => {
    await expect(resolvePublicAddresses("evil.example.com", resolverFor("93.184.216.34", "10.0.0.5"))).rejects.toThrow(UnsafeTargetError);
    await expect(resolvePublicAddresses("evil.example.com", resolverFor("169.254.169.254"))).rejects.toThrow(UnsafeTargetError);
    await expect(resolvePublicAddresses("evil.example.com", resolverFor("::1"))).rejects.toThrow(UnsafeTargetError);
  });

  it("refuses a host with no addresses", async () => {
    await expect(resolvePublicAddresses("nothing.example.com", resolverFor())).rejects.toThrow(UnsafeTargetError);
  });
});

describe("postWebhook", () => {
  it("rejects a literal private address before any connection is attempted", async () => {
    await expect(postWebhook("https://127.0.0.1:9/x", {}, "{}", { allowPrivate: false })).rejects.toThrow(UnsafeTargetError);
  });
});
