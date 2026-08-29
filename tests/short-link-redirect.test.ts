// tests/short-link-redirect.test.ts
//
// `/<slug>` -- the site-wide short link (0093), driven as the REAL shipped
// `load` from `src/routes/[shortlink]/+page.server.ts` against a REAL Postgres
// carrying the REAL migration chain, through the PostgREST shim.
//
// WHY THIS ROUTE AND NOT ANOTHER. It is one RPC and no components, so nothing
// about it is covered by a component test by accident -- and it is the one
// route in this repo whose contract is PRINTED ON PAPER. CLAUDE.md calls an
// authored slug a permanent contract: a QR code on a syllabus, a handout, a
// poster. Every other route can be fixed by deploying; a slug that stops
// resolving is a sheet already in a student's folder.
//
// FOUR BEHAVIOURS, and each of them fails in a way nobody would notice from the
// outside. They are asserted here as what the code ACTUALLY does, which in two
// cases is not quite where a reading of the route comment would put them:
//
//   1. 307, NEVER 308. A permanent redirect is cached by browsers and by QR
//      readers past the point where re-pointing the row would help, which is
//      the entire reason the target is a row rather than a route constant. A
//      308 here would work perfectly on the day it shipped and strand every
//      visitor who had already followed the link once.
//
//   2. THE RESERVED-NAME GUARD IS AT CREATION, NOT AT RESOLUTION. There is no
//      reserved check in the route at all: `_app_short_link_reserved` is called
//      by `app_short_link_upsert`, so a slug that shadows a real page cannot be
//      CREATED. What the route itself refuses is the slug's SHAPE, before any
//      RPC is made -- asserted below by counting the calls the load makes.
//
//   3. FRAGMENT PRESERVATION IS NOT SOMETHING THE SERVER DOES; it is something
//      the server must not DEFEAT. A fragment never reaches the server, and a
//      browser carries the original URL's onto a redirect target that has none
//      of its own (RFC 7231 7.1.2). So the two assertable halves are that the
//      database refuses a target carrying its own `#`, and that the route hands
//      back the stored target BYTE FOR BYTE -- an appended fragment, a
//      normalised path or a rebuilt absolute URL would each silently win over
//      the visitor's.
//
//   4. THE DEGRADE RUNG. A pre-0093 deployment answers PGRST202 and the route
//      404s. It is driven on a second chain that stops one migration short, the
//      `tests/classroom-roster-degrade.test.ts` shape, so the difference between
//      the two answers is attributable to exactly that migration. The route
//      swallows ANY rpc error, not PGRST202 alone -- which is the correct
//      direction here (404 grants nothing) and is asserted as such rather than
//      as a code check the route does not make.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { load as SHORTLINK_LOAD } from '../src/routes/[shortlink]/+page.server';

/**
 * 0093 and the three things it stands on: 0001 for `profiles`/`role_for_email`,
 * 0067 for `is_admin()` (the upsert's own gate), and 0137 last per the harness
 * note -- it is the sweep over whatever the chain above it created, and it is
 * the migration that KEPT `anon` on `app_short_link_target` while revoking it
 * from the admin sibling.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0093_short_links.sql',
	'0137_anon_execute_sweep.sql'
] as const;

/** The same chain with 0093 REMOVED -- the pre-0093 deployment, claim 4. */
const PRE_CHAIN = CHAIN.filter((f) => f !== '0093_short_links.sql');

let db: TestDb;
let preDb: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
let preFks: Awaited<ReturnType<typeof loadForeignKeys>>;

let owner: SeededUser;
let admin: SeededUser;
/**
 * THE ONE THING THE SHIM CANNOT DRIVE, stated rather than stubbed around.
 *
 * `createPostgrestShim` runs every statement through `TestDb.asUser`, which
 * does `set role authenticated`; there is no anon mode on it. This route is
 * PUBLIC -- the whole point is a parent with a QR code and no account -- so the
 * caller a real request carries is the `anon` role, and driving the load here
 * exercises `authenticated` instead.
 *
 * WHAT CLOSES THE GAP FOR THIS ROUTE, rather than papering over it:
 * `app_short_link_target` is SECURITY DEFINER with `search_path = ''` and reads
 * no `auth.uid()` anywhere in its body, so the ONLY thing that can differ
 * between the two roles is the EXECUTE grant -- and that is asserted directly,
 * as `anon`, in "the public tier" below. The empty subject is what a request
 * carrying no session looks like to everything downstream of the grant.
 */
const ANON = '';

const EMAIL = {
	owner: 'apina@boscotech.edu',
	admin: 'dean.redirect@boscotech.edu'
} as const;

/** The syllabus link this feature was built for, and the one on the handout. */
const SYLLABUS_TARGET = '/assignments/idea209h-syllabus';

function rpcAs<T>(who: SeededUser, call: string, values: unknown[] = []): Promise<T> {
	return db.asUser(who.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, values);
		return rows[0].result;
	});
}

const upsert = (slug: string, target: string, label: string | null = null, active = true) =>
	rpcAs<{ ok: boolean }>(admin, 'public.app_short_link_upsert($1, $2, $3, $4)', [
		slug,
		target,
		label,
		active
	]);

/**
 * The REAL load, driven exactly as SvelteKit calls it, with the shim WRAPPED so
 * the RPC calls it makes are countable.
 *
 * The count is not decoration: the route's shape guard is only a guard if it
 * runs BEFORE the database is asked, and a version that asked first and
 * discarded the answer would return the identical 404 for every case here.
 */
function runLoad(
	which: 'full' | 'pre',
	shortlink: string
): { run: () => Promise<unknown>; rpcCalls: string[] } {
	const rpcCalls: string[] = [];
	const base = createPostgrestShim(
		which === 'full' ? db : preDb,
		which === 'full' ? fks : preFks,
		ANON
	);
	const supabase = {
		...base,
		rpc(name: string, args?: Record<string, unknown>) {
			rpcCalls.push(name);
			return base.rpc(name, args);
		}
	};
	return {
		rpcCalls,
		run: () =>
			(SHORTLINK_LOAD as unknown as (event: unknown) => Promise<unknown>)({
				params: { shortlink },
				// PUBLIC on purpose: the point is a parent with a QR code and no
				// account, so no `claims` are handed in anywhere in this file.
				locals: { supabase, claims: null }
			})
	};
}

/** What the load threw, as a plain shape -- redirect, http error, or neither. */
type Outcome =
	| { kind: 'redirect'; status: number; location: string; rpcCalls: string[] }
	| { kind: 'error'; status: number; message: string; rpcCalls: string[] }
	| { kind: 'returned'; value: unknown; rpcCalls: string[] };

async function outcome(which: 'full' | 'pre', shortlink: string): Promise<Outcome> {
	const { run, rpcCalls } = runLoad(which, shortlink);
	try {
		const value = await run();
		return { kind: 'returned', value, rpcCalls };
	} catch (thrown) {
		// SvelteKit's own predicates, not a duck-typed `status` read: a redirect
		// and an error() both carry a status, and telling them apart by hand is
		// how a test starts accepting one for the other.
		if (isRedirect(thrown)) {
			return { kind: 'redirect', status: thrown.status, location: thrown.location, rpcCalls };
		}
		if (isHttpError(thrown)) {
			return {
				kind: 'error',
				status: thrown.status,
				message: String((thrown.body as { message?: string })?.message ?? ''),
				rpcCalls
			};
		}
		throw thrown;
	}
}

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	fks = await loadForeignKeys(db);
	preDb = await startTestDb([...PRE_CHAIN]);
	preFks = await loadForeignKeys(preDb);

	owner = await createUser(db, EMAIL.owner, 'Site Owner');
	admin = await createUser(db, EMAIL.admin, 'Dean Redirect');
	await rpcAs(owner, 'public.admin_grant($1, $2)', [EMAIL.admin, 'redirect test']);

	// Seeded through the REAL write RPC rather than a raw insert: a hand-built
	// row could carry a target the upsert would have refused, and then every
	// assertion below would be about a row this feature cannot produce.
	await upsert('209h', SYLLABUS_TARGET, 'IDEA209H syllabus', true);
	await upsert('open-house', '/assignments/open-house', 'Open house handout', true);
	// RETIRED: on a printed sheet, still in the table, and it must stop
	// resolving without becoming distinguishable from a slug that never existed.
	await upsert('last-year', '/assignments/last-year', null, false);
}, 180_000);

afterAll(async () => {
	await db?.stop();
	await preDb?.stop();
});

// ---------------------------------------------------------------------------
// 1. THE REDIRECT, AND ITS CODE
// ---------------------------------------------------------------------------
describe('a live slug redirects, temporarily', () => {
	test('the positive control: /209h reaches the syllabus at all', async () => {
		const got = await outcome('full', '209h');
		expect(got.kind).toBe('redirect');
		// The RPC was reached, which is what makes every 404 below a decision
		// rather than a fixture that seeded nothing.
		expect(got.rpcCalls).toEqual(['app_short_link_target']);
	});

	test('307, and specifically NOT a permanent redirect', async () => {
		const got = await outcome('full', '209h');
		if (got.kind !== 'redirect') throw new Error(`expected a redirect, got ${got.kind}`);
		expect(got.status).toBe(307);
		// Spelled out as well as pinned: 301 and 308 are the two codes a browser
		// and a QR reader cache, and caching is exactly what a re-pointable row
		// cannot survive. A change to either of them passes `toBe(307)`'s
		// opposite and this line says why that matters.
		expect([301, 308]).not.toContain(got.status);
	});

	test('every live slug takes the same code, so the rule is the route s and not one row s', async () => {
		const codes = await Promise.all(
			['209h', 'open-house'].map(async (slug) => {
				const got = await outcome('full', slug);
				return got.kind === 'redirect' ? got.status : got.kind;
			})
		);
		expect(codes).toEqual([307, 307]);
	});
});

// ---------------------------------------------------------------------------
// 2. THE FRAGMENT
// ---------------------------------------------------------------------------
describe('the fragment a visitor scanned is what survives', () => {
	test('the Location is the stored target BYTE FOR BYTE', async () => {
		const got = await outcome('full', '209h');
		if (got.kind !== 'redirect') throw new Error(`expected a redirect, got ${got.kind}`);
		// Not `toContain`, not a parsed comparison: an appended fragment, a
		// trailing slash, a normalised path or a rebuilt absolute URL would each
		// be a Location a browser prefers over the one the visitor typed.
		expect(got.location).toBe(SYLLABUS_TARGET);
	});

	test('the route contributes no fragment of its own', async () => {
		for (const slug of ['209h', 'open-house']) {
			const got = await outcome('full', slug);
			if (got.kind !== 'redirect') throw new Error(`expected a redirect for ${slug}`);
			expect(got.location.includes('#')).toBe(false);
			// Same-site, so the browser has an origin to carry the fragment onto
			// and this is never an open redirector (0093's own header).
			expect(got.location.startsWith('/')).toBe(true);
			expect(got.location.startsWith('//')).toBe(false);
		}
	});

	test('the upsert refuses a target that carries its own fragment', async () => {
		await expect(upsert('frag', '/assignments/syllabus#ai-policy')).rejects.toThrow(
			/may not carry its own fragment/
		);
	});

	test('and so does the column, with RLS and the RPC both out of the way', async () => {
		// The CHECK is the half that holds for a row written by anything other
		// than the upsert -- a repair statement in the SQL editor, a future RPC.
		// Run as the connection owner so nothing but the constraint can refuse.
		await expect(
			db.sql(
				`insert into public.app_short_links (slug, target, created_by)
				 values ('frag-direct', '/assignments/syllabus#ai-policy', 'test')`
			)
		).rejects.toThrow(/app_short_links_target_check|violates check constraint/);
	});
});

// ---------------------------------------------------------------------------
// 3. THE RESERVED NAMES, AND WHAT THE ROUTE ITSELF REFUSES
// ---------------------------------------------------------------------------

/**
 * 0093's list, transcribed. It is transcribed rather than read out of the
 * function because the assertion is that each of these is REFUSED -- deriving
 * the list from the predicate under test would make the sweep unable to fail.
 */
const RESERVED = [
	'admin',
	'api',
	'archive',
	'assignments',
	'auth',
	'classroom',
	'coins',
	'coin-balance',
	'coin-desk',
	'coin-entry',
	'contracts',
	'dashboard',
	'dev',
	'frc',
	'fsp',
	'gauntlet',
	'greenline',
	'notebook',
	'reference',
	'tournaments',
	'vanguard'
] as const;

describe('a slug that shadows a real page cannot be created', () => {
	// A generated sweep asserts its own case count, or a sweep that generated
	// nothing passes.
	test('the sweep has 21 names in it', () => {
		expect(RESERVED.length).toBe(21);
	});

	for (const name of RESERVED) {
		test(`"${name}" is refused at creation`, async () => {
			await expect(upsert(name, '/assignments/anything')).rejects.toThrow(
				/is a real page on this site/
			);
		});
	}

	test('the positive control: a slug of the same SHAPE that shadows nothing is accepted', async () => {
		await expect(upsert('open-lab', '/assignments/open-lab')).resolves.toMatchObject({
			ok: true
		});
		const got = await outcome('full', 'open-lab');
		expect(got.kind).toBe('redirect');
	});

	test('the ROUTE has no reserved check: what it refuses is the slug SHAPE', async () => {
		// Each of these is refused BEFORE the database is asked, which is the
		// half a shape guard exists for. `not a slug` carries a space, the long
		// one is 62 characters (the column allows 61), and the last two are
		// characters the charset does not admit.
		for (const bad of ['not a slug', 'a'.repeat(62), '-leads-with-a-dash', 'UPPER CASE?']) {
			const got = await outcome('full', bad);
			if (got.kind !== 'error') throw new Error(`expected a 404 for "${bad}", got ${got.kind}`);
			expect(got.status).toBe(404);
			expect(got.rpcCalls).toEqual([]);
		}
	});

	test('a printed slug in the wrong case or with stray space still resolves', async () => {
		// A QR code is generated from something somebody typed, and the route
		// trims and lowercases before it decides anything. Both of these reach
		// the RPC, which is the difference from the shape refusals above.
		for (const typed of ['209H', ' 209h ', '209H ']) {
			const got = await outcome('full', typed);
			if (got.kind !== 'redirect') throw new Error(`expected a redirect for "${typed}"`);
			expect(got.location).toBe(SYLLABUS_TARGET);
			expect(got.rpcCalls).toEqual(['app_short_link_target']);
		}
	});
});

// ---------------------------------------------------------------------------
// THE PUBLIC TIER -- the half of this route the shim cannot itself drive.
// ---------------------------------------------------------------------------
describe('the public tier', () => {
	test('`anon` may execute the resolver, and reads the same target', async () => {
		const target = await db.asAnon(async (q) => {
			const { rows } = await q<{ t: string | null }>(
				'select public.app_short_link_target($1) as t',
				['209h']
			);
			return rows[0].t;
		});
		expect(target).toBe(SYLLABUS_TARGET);
	});

	test('and `anon` may NOT enumerate the table, by either door', async () => {
		// The negative control the grant assertion needs: a resolver anyone may
		// call is only safe while the listing beside it is not.
		await expect(
			db.asAnon(async (q) => q('select * from public.app_short_links'))
		).rejects.toThrow();
		await expect(
			db.asAnon(async (q) => q('select * from public.app_short_link_list()'))
		).rejects.toThrow();
	});
});

// ---------------------------------------------------------------------------
// 4. THE DEGRADE RUNG, AND EVERY OTHER WAY THIS ANSWERS 404
// ---------------------------------------------------------------------------
describe('nothing resolvable answers a plain 404, and they are all the same 404', () => {
	test('the pre-0093 chain genuinely answers PGRST202 (the rung s positive control)', async () => {
		const res = await createPostgrestShim(preDb, preFks, ANON).rpc('app_short_link_target', {
			p_slug: '209h'
		});
		// Without this, the 404 below could equally be a fixture with no rows in
		// it, and the rung would be covered by nothing.
		expect(res.error?.code).toBe('PGRST202');
	});

	test('a pre-0093 deployment 404s rather than throwing', async () => {
		const got = await outcome('pre', '209h');
		if (got.kind !== 'error') throw new Error(`expected a 404, got ${got.kind}`);
		expect(got.status).toBe(404);
		expect(got.rpcCalls).toEqual(['app_short_link_target']);
	});

	test('the same slug redirects on the chain that differs by that one migration', async () => {
		// The two chains differ in 0093 alone, so the difference between this
		// answer and the one above is attributable to it.
		expect((await outcome('full', '209h')).kind).toBe('redirect');
	});

	test('a retired slug, an unknown slug, a malformed one and a missing RPC are indistinguishable', async () => {
		const seen = await Promise.all([
			outcome('full', 'last-year'),
			outcome('full', 'never-existed'),
			outcome('full', 'not a slug'),
			outcome('pre', '209h')
		]);
		for (const got of seen) {
			if (got.kind !== 'error') throw new Error(`expected a 404, got ${got.kind}`);
			expect(got.status).toBe(404);
			expect(got.message).toBe('Not found');
		}
	});

	test('a retired slug stays retired only while it is retired', async () => {
		// Re-pointing is the operation this feature exists for, so the 404 above
		// has to be the `active` flag rather than the row having gone.
		expect((await outcome('full', 'last-year')).kind).toBe('error');
		await upsert('last-year', '/assignments/last-year', null, true);
		expect((await outcome('full', 'last-year')).kind).toBe('redirect');
		await upsert('last-year', '/assignments/last-year', null, false);
		expect((await outcome('full', 'last-year')).kind).toBe('error');
	});
});
