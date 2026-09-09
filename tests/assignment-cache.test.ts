import { describe, expect, it } from 'vitest';
import { GET } from '../src/routes/assignments/[slug]/+server';
import { GET as COINS_GET } from '../src/routes/coins/[...path]/+server';

/**
 * THE PUBLIC ASSIGNMENT HANDOUT IS SHARED-CACHEABLE FOR A MINUTE.
 *
 * `/assignments/<slug>` is QR-coded onto printed handouts, so its arrival
 * pattern is a whole class opening one slug inside a minute -- and it set no
 * `Cache-Control` at all, so every one of those executed the function.
 *
 * SIXTY SECONDS, AND THE CEILING IS THE POINT: an assignment corrected
 * mid-class has to reach the room, so this asserts the max-age is not longer
 * rather than merely present. Verified against the header-less handler, where
 * the first expectation below reads `null`.
 */

/** Any real slug; the assertion is about headers, not about which handout. */
async function anyAssignment(): Promise<Response> {
	for (const slug of ['idea113-blade-01', 'idea100-blade-01']) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = (await GET({ params: { slug } } as any)) as Response;
		if (res.status === 200) return res;
	}
	throw new Error('no assignment fixture resolved; the raw-import glob found nothing');
}

describe('GET /assignments/[slug]', () => {
	it('sets a short shared cache', async () => {
		const cache = (await anyAssignment()).headers.get('cache-control');
		expect(cache).not.toBeNull();
		expect(cache).toContain('s-maxage=60');
		expect(cache).toContain('public');
	});

	it('does not let a browser hold its own stale copy', async () => {
		const cache = (await anyAssignment()).headers.get('cache-control') ?? '';
		expect(cache).toContain('max-age=0');
		expect(cache).toContain('must-revalidate');
	});

	it('caps the shared cache at a minute, so a correction still lands', async () => {
		const cache = (await anyAssignment()).headers.get('cache-control') ?? '';
		const seconds = Number(/s-maxage=(\d+)/.exec(cache)?.[1] ?? -1);
		expect(seconds).toBeGreaterThan(0);
		expect(seconds).toBeLessThanOrEqual(60);
	});

	/**
	 * NO `Vary: Cookie`, AND THIS IS THE HALF THAT IS EASY TO ADD BY MISTAKE.
	 * The coin ledger's otherwise identical header carries one because its
	 * shell genuinely varies by session. This handler reads no session, no
	 * cookie and no claim, so a `Vary: Cookie` here would fragment the shared
	 * cache by every student's distinct session cookie -- costing the whole
	 * benefit on exactly the class-wide burst it exists for.
	 */
	it('does not vary by cookie, though the ledger it copies does', async () => {
		expect((await anyAssignment()).headers.get('vary')).toBeNull();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const coins = (await COINS_GET({ params: { path: '' }, locals: {} } as any)) as Response;
		expect(coins.headers.get('vary')).toBe('Cookie');
	});

	it('still 404s an unknown slug', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await expect(GET({ params: { slug: 'no-such-handout' } } as any)).rejects.toMatchObject({
			status: 404
		});
	});
});
