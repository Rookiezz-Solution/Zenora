import { isPrivateAddress } from "@zenora/shared";
import * as dns from "node:dns";
import * as http from "node:http";
import * as https from "node:https";

export class UnsafeTargetError extends Error {}

const TIMEOUT_MS = 10_000;

type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;

const systemResolver: Resolver = (hostname) => dns.promises.lookup(hostname, { all: true });

// Resolve a hostname and refuse if ANY address it points at is private.
// Exported with an injectable resolver so the rule can be unit-tested.
export async function resolvePublicAddresses(hostname: string, resolver: Resolver = systemResolver) {
  const addresses = await resolver(hostname);
  if (addresses.length === 0) throw new UnsafeTargetError("The host did not resolve to any address");
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new UnsafeTargetError("The host resolves to a private or internal address");
  return addresses;
}

// Passed to https.request as `lookup`: the check happens on the very address
// the socket then connects to, so DNS can't answer "public" for a pre-check and
// "internal" for the real connection (DNS rebinding).
function safeLookup(hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) {
  resolvePublicAddresses(hostname).then(
    (addresses) => (options.all ? callback(null, addresses) : callback(null, addresses[0]!.address, addresses[0]!.family)),
    (err) => callback(err)
  );
}

export interface WebhookResponse {
  status: number;
}

// One POST, no redirects followed (a redirect could point somewhere internal),
// a hard timeout, and the response body discarded.
export function postWebhook(rawUrl: string, headers: Record<string, string>, body: string, options: { allowPrivate: boolean }): Promise<WebhookResponse> {
  const url = new URL(rawUrl);
  const transport = url.protocol === "http:" ? http : https;
  if (!options.allowPrivate && isPrivateAddress(url.hostname)) return Promise.reject(new UnsafeTargetError("The address is private or internal"));

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(body).toString() },
        ...(options.allowPrivate ? {} : { lookup: safeLookup as unknown as typeof dns.lookup })
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
        res.on("error", reject);
      }
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error(`Timed out after ${TIMEOUT_MS / 1000}s`)));
    req.on("error", reject);
    req.end(body);
  });
}
