// tests/cert-server-verify-limit.test.ts
//
// THE VERIFY PAGE'S TOKEN BUCKET (ledger 0391, DECISIONS D10): 30 a minute and
// 300 an hour per address, walked on an injected clock so the refill is
// measured rather than assumed. A limiter that silently never refused is one
// nobody would notice from a browser.

import { describe, expect, it } from 'vitest';
import { VERIFY_LIMIT, VerifyLimiter, allowVerify } from '../src/lib/server/certifications/verify-limit';

const T0 = 1_000_000_000_000;

describe('VerifyLimiter', () => {
	it('allows 30 checks in a minute from one address and refuses the 31st', () => {
		const l = new VerifyLimiter();
		let allowed = 0;
		for (let i = 0; i < 31; i++) if (l.allow('10.0.0.1', T0 + i)) allowed += 1;
		expect(allowed).toBe(VERIFY_LIMIT.perMinute);
		expect(l.allow('10.0.0.1', T0 + 40)).toBe(false);
		// Another address is its own bucket.
		expect(l.allow('10.0.0.2', T0 + 41)).toBe(true);
	});

	it('refills over time: one token every two seconds at 30 a minute', () => {
		const l = new VerifyLimiter();
		for (let i = 0; i < 30; i++) l.allow('a', T0);
		expect(l.allow('a', T0)).toBe(false);
		expect(l.allow('a', T0 + 1_000)).toBe(false);
		expect(l.allow('a', T0 + 2_000)).toBe(true);
		expect(l.allow('a', T0 + 2_000)).toBe(false);
		// A full minute later the bucket is full again.
		let allowed = 0;
		for (let i = 0; i < 40; i++) if (l.allow('a', T0 + 62_000 + i)) allowed += 1;
		expect(allowed).toBe(30);
	});

	it('the hourly bucket is a token bucket: 300 at once, then only its refill of 5 a minute, full again an hour later', () => {
		const l = new VerifyLimiter();
		let allowed = 0;
		// 20 minutes at 30 a minute would be 600. The hour bucket starts at 300 and
		// refills 300 an hour, 5 a minute, so 19 refills land before the 20th minute.
		for (let minute = 0; minute < 20; minute++) {
			for (let i = 0; i < 30; i++) if (l.allow('b', T0 + minute * 60_000 + i)) allowed += 1;
		}
		expect(allowed).toBe(VERIFY_LIMIT.perHour + 19 * (VERIFY_LIMIT.perHour / 60));
		// The next minute the minute bucket is full again but the hour bucket admits only its refill.
		let next = 0;
		for (let i = 0; i < 30; i++) if (l.allow('b', T0 + 20 * 60_000 + i)) next += 1;
		expect(next).toBe(VERIFY_LIMIT.perHour / 60);
		// An hour of silence later both buckets are full: a whole minute's worth goes through.
		let later = 0;
		for (let i = 0; i < 40; i++) if (l.allow('b', T0 + 21 * 60_000 + 3_600_000 + i)) later += 1;
		expect(later).toBe(VERIFY_LIMIT.perMinute);
	});

	it('keeps the map bounded by dropping the least recently touched address', () => {
		const l = new VerifyLimiter({ perMinute: 2, perHour: 10, maxEntries: 3 });
		expect(l.allow('one', T0)).toBe(true);
		expect(l.allow('two', T0 + 1)).toBe(true);
		expect(l.allow('three', T0 + 2)).toBe(true);
		expect(l.size).toBe(3);
		expect(l.allow('one', T0 + 3)).toBe(true); // its second token; "one" is now the most recently touched
		expect(l.allow('one', T0 + 4)).toBe(false); // spent
		expect(l.allow('four', T0 + 5)).toBe(true); // a fourth address evicts "two", the least recently touched
		expect(l.size).toBe(3);
		expect(l.allow('one', T0 + 6)).toBe(false); // still there, still spent
		expect(l.allow('two', T0 + 7)).toBe(true); // was evicted, so it comes back with a fresh bucket (and evicts "three")
		expect(l.size).toBe(3);
		expect(l.allow('three', T0 + 8)).toBe(true); // evicted in turn, fresh again
		expect(l.size).toBe(3);
	});

	it('the module-level allowVerify is one shared limiter', () => {
		const address = `test-${Date.now()}-${Math.random()}`;
		let allowed = 0;
		for (let i = 0; i < 40; i++) if (allowVerify(address, T0 + i)) allowed += 1;
		expect(allowed).toBe(30);
	});
});
