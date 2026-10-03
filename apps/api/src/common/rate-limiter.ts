import { HttpException, HttpStatus } from "@nestjs/common";

// Sliding-window limiter for public, unauthenticated endpoints. Per API
// process — a shared (Redis) limiter is a follow-up if the API scales out.
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  consume(key: string): void {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      throw new HttpException("Too many requests — try again later", HttpStatus.TOO_MANY_REQUESTS);
    }
    this.hits.set(key, [...recent, now]);
  }
}
