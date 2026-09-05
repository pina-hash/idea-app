// tests/avatar-route.test.ts
//
// 0052: THE PROXY ROUTE, DRIVEN AS THE REAL HANDLER.
//
// `src/routes/api/avatar/[...path]/+server.ts` is what keeps every avatar on every
// page rendering once 0181 closes the bucket. Three of its properties fail
// SILENTLY and are the reason this file exists rather than a browser pass:
//
//   1. THE MINT IS ON THE CALLER'S OWN CLIENT. The route is deliberately NOT
//      the authorization boundary -- 0181's storage policy is, evaluated as
//      the caller's own role. A service-role client here would work perfectly,
//      render identically, and quietly move the boundary into a file where
//      nobody would look for it. Asserted by handing the route a client that
//      RECORDS which one it was.
//   2. EVERY REFUSAL IS THE SAME RESPONSE. A 403 on one key and a 404 on
//      another turns this route into an oracle for which of a list of scraped
//      keys are still live -- which is most of what the old public bucket
//      handed over. Asserted by comparing the responses to each other rather
//      than by checking each is "a 404", which would pass on three different
//      404s carrying three different bodies.
//   3. THE KEY IS THE CLIENT'S OWN PREDICATE. Two spellings of "is this a real
//      storage key" is the pair that stops agreeing, and the half that would
//      go quiet is this one, because nothing on screen reports a server that
//      got looser.
//
// The handler is imported from its own file and called directly. There is no
// reimplementation of it here.

import { describe, expect, it } from 'vitest';
import { GET } from '../src/routes/api/avatar/[...path]/+server';

const UID = 'b4b40903-b1bf-4df4-90a5-7e6f0dbc4fd2';
const KEY = `${UID}/avatar-1757000000000.png`;
const SIGNED = 'https://example.supabase.co/storage/v1/object/sign/avatars/x?token=abc';

interface Call {
	bucket: string;
	key: string;
	ttl: number;
}

/**
 * A Supabase client stand-in that records what it was asked for. `signed`
 * false is Storage refusing -- which is what the policy denying and the object
 * being gone both look like from here, and the route must not be able to tell
 * them apart either.
 */
function fakeClient(opts: { signed: boolean }, calls: Call[] = []) {
	return {
		calls,
		storage: {
			from(bucket: string) {
				return {
					async createSignedUrl(key: string, ttl: number) {
						calls.push({ bucket, key, ttl });
						return opts.signed
							? { data: { signedUrl: SIGNED }, error: null }
							: { data: null, error: { message: 'Object not found' } };
					}
				};
			}
		}
	};
}

/** Drives the real handler. `claims` null is a caller with no session. */
async function call(
	path: string,
	opts: { claims: unknown; signed?: boolean } = { claims: { sub: UID } }
) {
	const client = fakeClient({ signed: opts.signed ?? true });
	const res = (await GET({
		params: { path },
		locals: { supabase: client, claims: opts.claims }
	} as never)) as Response;
	return { res, client };
}

/** Everything about a response that a prober could compare between two keys. */
async function fingerprint(res: Response) {
	return {
		status: res.status,
		body: await res.text(),
		headers: [...res.headers.entries()].sort()
	};
}

describe('the permitted case', () => {
	it('302s to the signed URL', async () => {
		const { res } = await call(KEY);
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe(SIGNED);
	});

	it('asks the avatars bucket for exactly the key in the URL', async () => {
		const { client } = await call(KEY);
		expect(client.calls).toEqual([{ bucket: 'avatars', key: KEY, ttl: 120 }]);
	});

	it('CACHES THE REDIRECT PRIVATELY AND BRIEFLY -- who may read it is not immutable', () => {
		// `private` because the redirect names one person's picture; 60s because
		// a longer window means somebody who signed out keeps rendering faces
		// out of cache, and no window at all means one function invocation per
		// face per paint on a roster.
		return call(KEY).then(({ res }) => {
			expect(res.headers.get('cache-control')).toBe('private, max-age=60');
		});
	});

	it('MINTS ON THE CALLER\'S OWN CLIENT: the object handed in, never another one', async () => {
		// The whole authorization argument. If this route ever reaches for a
		// service-role client the mint succeeds for everybody, the pages look
		// perfect, and 0181's policy stops being the boundary.
		const { client } = await call(KEY);
		expect(client.calls.length).toBe(1);
		const src = (await import('node:fs')).readFileSync(
			'src/routes/api/avatar/[...path]/+server.ts',
			'utf8'
		);
		expect(src).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
		expect(src).not.toContain('createClient');
		expect(src).toContain('locals: { supabase, claims }');
	});
});

describe('every refusal is the same response', () => {
	const CASES: [string, () => Promise<Response>][] = [
		['no session at all', async () => (await call(KEY, { claims: null })).res],
		['a key that is not this shape', async () => (await call('not-a-uuid/x.png')).res],
		['a traversal', async () => (await call('../../etc/passwd')).res],
		['a nested path', async () => (await call(`${UID}/a/b.png`)).res],
		['an empty path', async () => (await call('')).res],
		[
			'a well-formed key storage refuses (gone, or the policy said no)',
			async () => (await call(KEY, { claims: { sub: UID }, signed: false })).res
		]
	];

	it('SWEPT SOMETHING: the positive control for the comparison below', () => {
		expect(CASES.length).toBe(6);
	});

	it('all six are byte-identical: status, body and headers', async () => {
		const prints = [];
		for (const [, run] of CASES) prints.push(await fingerprint(await run()));
		for (const p of prints) {
			expect(p.status).toBe(404);
			expect(p.body).toBe('');
			expect(p).toEqual(prints[0]);
		}
	});

	it('AND THE PERMITTED CASE IS DISTINGUISHABLE, which is what says the above is a real match', async () => {
		// Without this, six identical responses could be six identical
		// SUCCESSES and the comparison would prove nothing.
		const ok = await fingerprint((await call(KEY)).res);
		const refused = await fingerprint((await call(KEY, { claims: null })).res);
		expect(ok).not.toEqual(refused);
		expect(ok.status).toBe(302);
	});

	it('A REFUSED CALLER NEVER REACHES STORAGE AT ALL', async () => {
		// Defence in depth, and it is also what keeps a signed-out crawler
		// hitting scraped keys off the Supabase project entirely.
		const { client } = await call(KEY, { claims: null });
		expect(client.calls).toEqual([]);
	});
});

describe('the route exports only what SvelteKit admits', () => {
	it('exports GET and nothing else', async () => {
		// SvelteKit throws `Invalid export '<name>'` when a `+server.ts` exports
		// anything outside its method list, and neither svelte-check nor a
		// vitest import goes through the validator that raises it -- so the
		// first sign is production. CLAUDE.md's own trap, asserted here because
		// this file is the one thing that imports the module.
		const mod = await import('../src/routes/api/avatar/[...path]/+server');
		expect(Object.keys(mod).sort()).toEqual(['GET']);
	});
});
