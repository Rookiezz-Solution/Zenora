import { HttpException, HttpStatus } from "@nestjs/common";

// A counter shared between API processes (Redis in production). Without one,
// each process counts for itself, so N instances allow N times the limit.
export interface SharedCounter {
  // Adds one hit to `key`, which expires after `windowMs`, and returns the count in the current window.
  hit(key: string, windowMs: number): Promise<number>;
}

let shared: SharedCounter | null = null;

export function setSharedCounter(counter: SharedCounter | null): void {
  shared = counter;
}

const tooMany = () => new HttpException("Too many requests — try again later", HttpStatus.TOO_MANY_REQUESTS);

// Limiter for public, unauthenticated endpoints. It always keeps a local
// sliding window (instant, and still protects the process if Redis is down) and,
// when the limiter has a `name` and a shared counter is configured, also checks
// the shared fixed window so the limit holds across instances. The shared check
// fails open: a Redis outage must not lock everyone out of signing in.
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly name?: string
  ) {}

  async consume(key: string): Promise<void> {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) throw tooMany();
    this.hits.set(key, [...recent, now]);
    if (this.hits.size > 10_000) this.sweep(now);

    if (shared && this.name) {
      let count: number;
      try {
        count = await shared.hit(`rl:${this.name}:${key}`, this.windowMs);
      } catch {
        return;
      }
      if (count > this.max) throw tooMany();
    }
  }

  // Keeps the map from growing with every address ever seen.
  private sweep(now: number): void {
    for (const [k, times] of this.hits) if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
  }
}
