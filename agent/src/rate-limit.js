/**
 * Общий лимит на все open-эндпойнты + жёсткая блокировка после превышения.
 */
export class OpenRateLimit {
  /**
   * @param {{ maxPerMinute: number, lockSeconds: number }} opts
   */
  constructor({ maxPerMinute, lockSeconds }) {
    this.maxPerMinute = maxPerMinute;
    this.lockSeconds = lockSeconds;
    /** @type {number[]} */
    this.hits = [];
    /** @type {number} */
    this.lockedUntil = 0;
  }

  prune(now) {
    const cutoff = now - 60_000;
    while (this.hits.length && this.hits[0] < cutoff) this.hits.shift();
  }

  /**
   * @returns {{ ok: true } | { ok: false, status: number, error: string, retryAfterSec: number }}
   */
  check() {
    const now = Date.now();

    if (now < this.lockedUntil) {
      const retryAfterSec = Math.ceil((this.lockedUntil - now) / 1000);
      return {
        ok: false,
        status: 429,
        error: 'locked',
        retryAfterSec,
      };
    }

    this.prune(now);

    if (this.hits.length >= this.maxPerMinute) {
      this.lockedUntil = now + this.lockSeconds * 1000;
      this.hits = [];
      console.warn(
        `[rate] lock both endpoints for ${this.lockSeconds}s (>${this.maxPerMinute}/min)`,
      );
      return {
        ok: false,
        status: 429,
        error: 'rate limit exceeded, endpoints locked',
        retryAfterSec: this.lockSeconds,
      };
    }

    this.hits.push(now);
    return { ok: true };
  }

  status() {
    const now = Date.now();
    this.prune(now);
    return {
      hitsLastMinute: this.hits.length,
      maxPerMinute: this.maxPerMinute,
      locked: now < this.lockedUntil,
      lockedForSec:
        now < this.lockedUntil ? Math.ceil((this.lockedUntil - now) / 1000) : 0,
    };
  }
}
