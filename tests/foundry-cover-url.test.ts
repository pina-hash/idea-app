// tests/foundry-cover-url.test.ts
//
// 0057: THE COVER URL, THE KEY PREDICATE, AND THE PROXY ROUTE.
//
// `0182_foundry_covers_private.sql` makes `/storage/v1/object/public/
// foundry-covers/<key>` stop answering. Three properties of the app half fail
// SILENTLY once it lands, which is why this file exists rather than a browser
// pass alone:
//
//   1. A SURFACE STILL BUILDING A PUBLIC URL renders a broken image and looks
//      like a bad upload. The URL used to be built in three route files; the
//      sweep at the bottom is what stops a fourth appearing.
//   2. THE MINT IS ON THE CALLER'S OWN CLIENT. The route is deliberately NOT
//      the authorization boundary -- 0182's storage policy is, evaluated as
//      the caller's own role. A service-role client here would work perfectly,
//      render identically, and quietly move the boundary into a file nobody
//      would look in. Asserted by handing the route a client that RECORDS
//      which one it was, and by reading the source for the key's name.
//   3. EVERY REFUSAL IS THE SAME RESPONSE. A 403 on one key and a 404 on
//      another turns this route into an oracle for which of a list of scraped
//      keys are still live, which is most of what the old public bucket handed
//      over. Asserted by comparing responses to EACH OTHER rather than by
//      checking each is "a 404", which would pass on three different 404s
//      carrying three different bodies.
//
// The handler is imported from its own file and called directly. There is no
// reimplementation of it here.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import {
	FOUNDRY_COVER_PROXY_PREFIX,
	foundryCoverObjectKey,
	foundryCoverUrl
} from '../src/lib/foundry/covers';
import { GET } from '../src/routes/api/foundry-cover/[...path]/+server';

const UID = 'b4b40903-b1bf-4df4-90a5-7e6f0dbc4fd2';
const FILE = '6f1d2b4e-6a5c-4f0e-9d1a-2b3c4d5e6f70.png';
const KEY = `${UID}/${FILE}`;
const SIGNED =
	'https://example-ref.supabase.co/storage/v1/object/sign/foundry-covers/x?token=abc';

// ---------------------------------------------------------------------------
// THE PREDICATE
// ---------------------------------------------------------------------------

describe('foundryCoverObjectKey', () => {
	it('accepts exactly what the three upload sites produce', () => {
		// All three build `${uid}/${crypto.randomUUID()}.${ext}` and the bucket's
		// write policies permit nothing else, so this is the whole live corpus.
		expect(foundryCoverObjectKey(KEY)).toBe(KEY);
		expect(foundryCoverObjectKey(`${UID}/a.jpg`)).toBe(`${UID}/a.jpg`);
		expect(foundryCoverObjectKey(`${UID}/${'x'.repeat(120)}`)).not.toBeNull();
	});

	it('REFUSES WHAT THE COLUMN CAN HOLD BUT NO UPLOAD PRODUCES', () => {
		// `student_apps.cover_path` is checked by `_classroom_deck_path_ok`,
		// which is the BUNDLE path rule borrowed: it admits any relative
		// multi-segment path up to 400 characters. Pointing a mint at a column
		// is not the same as pointing a dead public link at one, so the client
		// and the route both apply this narrower rule.
		for (const bad of [
			'index.html', // no folder segment at all
			'assets/img/cover.png', // legal in the column, never an upload
			`${UID}/sub/cover.png`, // a third segment
			`${UID}/`, // no filename
			`/${KEY}`, // leading slash
			`${UID}/../secret.png`, // traversal
			`${UID}/.`,
			`${UID}/..`,
			`not-a-uuid/${FILE}`,
			`${UID}/${'x'.repeat(121)}`, // over the filename cap
			`${UID}/cover file.png`, // a space
			''
		]) {
			expect(foundryCoverObjectKey(bad), bad).toBeNull();
		}
	});

	it('answers null for null and undefined rather than throwing', () => {
		// `cover_path` is nullable and every call site reaches it off a row.
		expect(foundryCoverObjectKey(null)).toBeNull();
		expect(foundryCoverObjectKey(undefined)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// THE URL
// ---------------------------------------------------------------------------

describe('foundryCoverUrl', () => {
	it('points at our own origin, never at storage', () => {
		expect(foundryCoverUrl(KEY)).toBe(`${FOUNDRY_COVER_PROXY_PREFIX}${UID}/${FILE}`);
		expect(foundryCoverUrl(KEY)).not.toContain('supabase');
		expect(foundryCoverUrl(KEY)).not.toContain('/object/public/');
	});

	it('ANSWERS NULL FOR A NON-KEY, AND NEVER THE EMPTY STRING', () => {
		// An `<img>` whose src is `''` requests the CURRENT PAGE, which on a
		// gallery is a second render of the gallery rather than a missing
		// picture -- the reason `foundryBundleUrl` gives about a frame.
		expect(foundryCoverUrl('assets/img/cover.png')).toBeNull();
		expect(foundryCoverUrl(null)).toBeNull();
	});

	it('encodes each segment', () => {
		// Nothing that gets past the predicate needs escaping today. The
		// encoding is there so a future filename rule cannot break the URL.
		const url = foundryCoverUrl(`${UID}/a%b.png`);
		expect(url).toBeNull(); // `%` is not in the filename class
		expect(foundryCoverUrl(KEY)?.split('/').length).toBe(
			`${FOUNDRY_COVER_PROXY_PREFIX}${KEY}`.split('/').length
		);
	});
});

// ---------------------------------------------------------------------------
// THE ROUTE
// ---------------------------------------------------------------------------

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

/** Everything about a response a prober could compare between two keys. */
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

	it('asks the foundry-covers bucket for exactly the key in the URL', async () => {
		const { client } = await call(KEY);
		expect(client.calls).toEqual([{ bucket: 'foundry-covers', key: KEY, ttl: 120 }]);
	});

	it('CACHES THE REDIRECT PRIVATELY AND BRIEFLY -- who may read it is not immutable', async () => {
		const { res } = await call(KEY);
		expect(res.headers.get('cache-control')).toBe('private, max-age=60');
	});

	it('THE TTL OUTLIVES THE CACHE WINDOW, and that relationship is load-bearing', async () => {
		// A browser may reuse the 302 for the length of max-age, so a cached
		// redirect handed out at the last permitted moment still has to point at
		// a live signed URL. Raise the cache window past the TTL and the tail of
		// every cache lifetime becomes a redirect to an expired URL -- a broken
		// image that fixes itself a minute later, the hardest thing to report.
		const { res, client } = await call(KEY);
		const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1]);
		expect(Number.isFinite(maxAge)).toBe(true);
		expect(client.calls[0].ttl).toBeGreaterThan(maxAge);
	});

	it("MINTS ON THE CALLER'S OWN CLIENT: the object handed in, never another one", async () => {
		// The whole authorization argument. If this route ever reaches for a
		// service-role client the mint succeeds for everybody, the pages look
		// perfect, and 0182's policy stops being the boundary.
		const { client } = await call(KEY);
		expect(client.calls.length).toBe(1);
		const src = readFileSync('src/routes/api/foundry-cover/[...path]/+server.ts', 'utf8');
		expect(src).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
		expect(src).not.toContain('createClient');
	});
});

describe('every refusal is the same response', () => {
	it('a signed-out caller, a non-key and a storage refusal are INDISTINGUISHABLE', async () => {
		const noSession = await call(KEY, { claims: null }).then((r) => fingerprint(r.res));
		const notAKey = await call('assets/img/cover.png').then((r) => fingerprint(r.res));
		const gone = await call(KEY, { claims: { sub: UID }, signed: false }).then((r) =>
			fingerprint(r.res)
		);

		// Compared to EACH OTHER. Asserting each "is a 404" would pass on three
		// different 404s carrying three different bodies, which is the oracle.
		expect(notAKey).toEqual(noSession);
		expect(gone).toEqual(noSession);
		expect(noSession.status).toBe(404);
		expect(noSession.body).toBe('');
	});

	it('A SIGNED-OUT CALLER NEVER REACHES STORAGE AT ALL', async () => {
		// Defence in depth rather than the gate -- the policy would refuse it
		// anyway -- but it is what answers a crawler working through keys it
		// scraped before 0182 landed, without a round trip each.
		const { client } = await call(KEY, { claims: null });
		expect(client.calls).toEqual([]);
	});

	it('A NON-KEY NEVER REACHES STORAGE EITHER', async () => {
		const { client } = await call(`${UID}/../../secret.png`);
		expect(client.calls).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// THE SWEEP
// ---------------------------------------------------------------------------

/**
 * Comments stripped before matching, because this file's OWN subject is
 * discussed in prose all over the tree -- `covers.ts` explains what
 * `getPublicUrl` used to do and 0182's client half is described in three
 * headers. A sweep that matched prose would report the documentation as the
 * defect and, worse, could be silenced by rewording a comment.
 */
function code(path: string): string {
	return readFileSync(path, 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
		.replace(/<!--[\s\S]*?-->/g, ' ');
}

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(ts|svelte)$/.test(name)) out.push(p);
	}
	return out;
}

describe('no surface builds a public cover URL any more', () => {
	const files = walk('src');

	it('the sweep found the tree, not an empty directory', () => {
		// A sweep that generated nothing passes vacuously and reads as clean.
		expect(files.length).toBeGreaterThan(300);
	});

	it('NOTHING CALLS getPublicUrl ON THE COVERS BUCKET', () => {
		// The URL was built in three route files, byte-identically. A fourth
		// surface written against `getPublicUrl` after 0182 lands renders
		// nothing and looks like a broken upload, and nothing on screen would
		// say which of the two it was.
		const offenders = files.filter((f) => {
			const s = code(f);
			return s.includes('getPublicUrl') && s.includes('FOUNDRY_COVER_BUCKET');
		});
		expect(offenders).toEqual([]);
	});

	it('AND THE POSITIVE CONTROL: the sweep still finds getPublicUrl where it legitimately lives', () => {
		// `tournament-thumbs` is deliberately still a public bucket (see
		// `tests/db/tournament-thumb-stays-public.test.ts`), so its own
		// `getPublicUrl` calls are correct and must be found -- otherwise the
		// assertion above is measuring a predicate that matches nothing.
		const found = files.filter((f) => code(f).includes('getPublicUrl'));
		expect(found.length).toBeGreaterThan(0);
		// Named, so "the control still passes" cannot become true because some
		// unrelated file happened to gain the string.
		expect(found.some((f) => f.includes('tournaments'))).toBe(true);
	});

	it('EVERY FOUNDRY SURFACE THAT RENDERS A COVER GOES THROUGH THE ONE BUILDER', () => {
		// The components take `coverUrl` as a prop, so the routes are where the
		// function is chosen. Each one that hands a cover down must hand down
		// this one.
		const routes = files.filter(
			(f) => f.includes(`routes${sep}foundry`) && f.endsWith('+page.svelte')
		);
		const passers = routes.filter((f) => readFileSync(f, 'utf8').includes('coverUrl='));
		expect(passers.length).toBe(3);
		for (const f of passers) {
			const s = readFileSync(f, 'utf8');
			expect(s, f).toContain("from '$lib/foundry/covers'");
			expect(s, f).toContain('coverUrl={foundryCoverUrl}');
		}
	});
});
