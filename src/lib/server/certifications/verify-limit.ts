/**
 * THE VERIFY PAGE'S RATE LIMIT (ledger 0391, DECISIONS D10): a token bucket
 * per client address, in this instance's memory, 30 checks a minute and 300 an
 * hour. A serial is 80 random bits, so guessing one is hopeless at any rate a
 * person can type; the limit is against a script, and a per-instance bucket is
 * enough for that without putting the database in the rate-limiting business.
 *
 * Pure arithmetic over an injected clock so the test can walk time. The map is
 * BOUNDED: past `maxEntries` the oldest-touched addresses are dropped, which
 * costs a dropped address a fresh full bucket and costs the instance nothing.
 *
 * The address is whatever the route hands in, which is `getClientAddress()`
 * and never a header (the anonymous feedback route's rule).
 */

export interface VerifyLimitOptions {
	perMinute: number;
	perHour: number;
	maxEntries: number;
}

export const VERIFY_LIMIT: VerifyLimitOptions = { perMinute: 30, perHour: 300, maxEntries: 10_000 };

interface Bucket {
	minute: number;
	hour: number;
	touched: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

export class VerifyLimiter {
	private readonly buckets = new Map<string, Bucket>();
	constructor(private readonly options: VerifyLimitOptions = VERIFY_LIMIT) {}

	/** True when this address may check a serial now; spends one token from each bucket. */
	allow(address: string, now: number = Date.now()): boolean {
		const key = address || 'unknown';
		const { perMinute, perHour, maxEntries } = this.options;
		let b = this.buckets.get(key);
		if (!b) {
			b = { minute: perMinute, hour: perHour, touched: now };
			this.evict(maxEntries);
		} else {
			const elapsed = Math.max(0, now - b.touched);
			b.minute = Math.min(perMinute, b.minute + (elapsed / MINUTE_MS) * perMinute);
			b.hour = Math.min(perHour, b.hour + (elapsed / HOUR_MS) * perHour);
		}
		b.touched = now;
		// Re-set so the Map's insertion order tracks last touch (eviction order).
		this.buckets.delete(key);
		this.buckets.set(key, b);
		if (b.minute < 1 || b.hour < 1) return false;
		b.minute -= 1;
		b.hour -= 1;
		return true;
	}

	get size(): number {
		return this.buckets.size;
	}

	private evict(maxEntries: number): void {
		while (this.buckets.size >= maxEntries) {
			const oldest = this.buckets.keys().next();
			if (oldest.done) break;
			this.buckets.delete(oldest.value);
		}
	}
}

const limiter = new VerifyLimiter();

/** The route's one call: may this address verify a serial right now. */
export function allowVerify(address: string, now: number = Date.now()): boolean {
	return limiter.allow(address, now);
}
