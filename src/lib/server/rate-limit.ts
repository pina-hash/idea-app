/**
 * A SMALL IN-MEMORY SLIDING-WINDOW RATE LIMITER, added for IDEA Armory's
 * connect endpoints (contract 3h: both endpoints are rate limited per IP and
 * per user).
 *
 * idea-app had no application-side limiter: the one rate limit it enforces,
 * the anonymous feedback box's, lives inside the database
 * (`app_feedback_submit`), keyed on an address the route hands in. A connect
 * code is not a database write worth a round trip to count, so this is the
 * smallest thing that does the job.
 *
 * WHAT IT IS NOT. It is per server INSTANCE: Vercel may run several, and each
 * keeps its own windows, so the real ceiling is the limit times the instances
 * that happen to be warm. That is acceptable for its job, which is to make a
 * guessing loop slow and noisy rather than to meter anyone exactly; the code
 * itself is 32 random bytes, one-use, and two minutes long, which is the real
 * defence. A refused request is not counted (the agent's fake site's rule).
 */

export interface RateLimiter {
	/** True and counted when `key` is under `limit` in the window; false otherwise. */
	take(key: string, limit: number, now: number): boolean;
	/** For tests only: forget every window. */
	reset(): void;
}

export function createRateLimiter(windowMs = 60_000, maxKeys = 50_000): RateLimiter {
	const windows = new Map<string, number[]>();
	return {
		take(key, limit, now) {
			const start = now - windowMs;
			let hits = windows.get(key);
			if (hits) {
				while (hits.length > 0 && hits[0] <= start) hits.shift();
			} else {
				if (windows.size >= maxKeys) {
					// Bounded memory: drop every key whose window is empty, then the oldest.
					for (const [k, v] of windows) if (v.length === 0 || v[v.length - 1] <= start) windows.delete(k);
					if (windows.size >= maxKeys) windows.delete(windows.keys().next().value as string);
				}
				hits = [];
				windows.set(key, hits);
			}
			if (hits.length >= limit) return false;
			hits.push(now);
			return true;
		},
		reset() {
			windows.clear();
		}
	};
}
