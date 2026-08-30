// tests/short-link-reserved-names.test.ts
//
// `_app_short_link_reserved` (0093, redefined by 0156) is a hand-typed list.
// SQL cannot read the filesystem, so the list can never derive itself -- what
// this file buys instead is that the NEXT drift is loud.
//
// TWO INDEPENDENT CHECKS, and neither one is the creation-refusal sweep in
// tests/short-link-redirect.test.ts (that file still transcribes the list by
// hand and asserts each name is refused; this file is about the list staying
// honest, not about what a refusal looks like):
//
//   1. THE FILESYSTEM CHECK, no database involved. Every top-level entry
//      under src/routes/ and static/ that COULD be typed as a slug (i.e.
//      matches the slug shape SvelteKit and 0093's own upsert both enforce)
//      must be covered by RESERVED_SLUGS in src/lib/short-links.ts. A route
//      or a static asset added later and never reserved reddens this, rather
//      than sitting there for a year the way `foundry` and ten others did.
//
//   2. THE SQL <-> TYPESCRIPT CHECK. RESERVED_SLUGS is the client-safe mirror
//      ShortLinkManager.svelte's precheck reads; `_app_short_link_reserved`
//      is the real gate app_short_link_upsert calls. Nothing type-checks the
//      two staying equal, so this reads the deployed function's own source
//      back out of a real Postgres and asserts it names the identical set.
//
// Both are read-only against the real route tree and a real migrated
// database -- nothing here mutates a tracked file. The one mutation proof
// (a stray route directory reddening check 1) creates and removes an UNTRACKED
// directory of its own under src/routes, cleaned up in a finally block, and
// never touches anything git already knows about.

import { readdirSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startTestDb, type TestDb } from './db/harness';
import { RESERVED_SLUGS, SLUG_RE } from '../src/lib/short-links';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROUTES_DIR = join(REPO_ROOT, 'src', 'routes');
const STATIC_DIR = join(REPO_ROOT, 'static');

/**
 * Every top-level name under `dir` that COULD collide with a slug -- i.e.
 * that fully matches the same shape both the [shortlink] route and
 * app_short_link_upsert enforce before a reserved check is ever reached.
 * `_platform` (leading `_`) and `IDEA` (uppercase) are excluded by this same
 * filter, which is why they are not in RESERVED_SLUGS either: no slug can
 * ever equal them, so reserving them would refuse nothing.
 */
function slugShapedTopLevelNames(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true })
		.map((entry) => entry.name)
		.filter((name) => SLUG_RE.test(name));
}

describe('every real top-level path is covered by RESERVED_SLUGS', () => {
	test('every slug-shaped route directory is reserved', () => {
		const routes = slugShapedTopLevelNames(ROUTES_DIR);
		// A positive control for the sweep itself: if the route tree stopped
		// producing any slug-shaped name at all, the loop below would pass
		// vacuously.
		expect(routes.length).toBeGreaterThan(10);
		const uncovered = routes.filter((name) => !RESERVED_SLUGS.includes(name));
		expect(uncovered).toEqual([]);
	});

	test('every slug-shaped top-level static entry is reserved', () => {
		const staticEntries = slugShapedTopLevelNames(STATIC_DIR);
		expect(staticEntries.length).toBeGreaterThan(5);
		const uncovered = staticEntries.filter((name) => !RESERVED_SLUGS.includes(name));
		expect(uncovered).toEqual([]);
	});

	test('the exclusions are exactly the two the shape guard already refuses', () => {
		const allRouteEntries = readdirSync(ROUTES_DIR, { withFileTypes: true }).map((e) => e.name);
		expect(allRouteEntries).toContain('_platform');
		expect(SLUG_RE.test('_platform')).toBe(false);

		const allStaticEntries = readdirSync(STATIC_DIR, { withFileTypes: true }).map((e) => e.name);
		expect(allStaticEntries).toContain('IDEA');
		expect(SLUG_RE.test('IDEA')).toBe(false);
	});

	// MUTATION PROOF: a route directory the list has never heard of must
	// redden the first check above. Creates and removes its own untracked
	// directory -- nothing tracked by git is touched, so there is nothing to
	// restore from a copy.
	test('mutation proof: an unreserved route directory reddens the sweep', () => {
		const strayName = 'zz-mutation-proof-stray-route';
		const strayDir = join(ROUTES_DIR, strayName);
		expect(existsSync(strayDir)).toBe(false);
		expect(RESERVED_SLUGS).not.toContain(strayName);
		try {
			mkdirSync(strayDir);
			writeFileSync(join(strayDir, '+page.svelte'), '<p>stray</p>\n');
			const routes = slugShapedTopLevelNames(ROUTES_DIR);
			expect(routes).toContain(strayName);
			const uncovered = routes.filter((name) => !RESERVED_SLUGS.includes(name));
			// This is the assertion that would have failed the check above had
			// the stray directory been left in RESERVED_SLUGS's blind spot --
			// proving the sweep actually bites rather than passing on anything.
			expect(uncovered).toEqual([strayName]);
		} finally {
			rmSync(strayDir, { recursive: true, force: true });
		}
		expect(existsSync(strayDir)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// THE SQL <-> TYPESCRIPT CHECK
// ---------------------------------------------------------------------------

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0093_short_links.sql',
	'0137_anon_execute_sweep.sql',
	'0156_short_link_reserved_names.sql'
] as const;

let db: TestDb;

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('the deployed function names the identical set RESERVED_SLUGS does', () => {
	test('RESERVED_SLUGS has no duplicate and is sorted-comparable as a set', () => {
		expect(new Set(RESERVED_SLUGS).size).toBe(RESERVED_SLUGS.length);
	});

	test("every RESERVED_SLUGS entry is refused by the function (TS is a subset of SQL)", async () => {
		const { rows } = await db.sql<{ slug: string; reserved: boolean }>(
			`select slug, public._app_short_link_reserved(slug) as reserved
			 from unnest($1::text[]) as slug`,
			[RESERVED_SLUGS]
		);
		const notReserved = rows.filter((r) => !r.reserved).map((r) => r.slug);
		expect(notReserved).toEqual([]);
	});

	test('the function source names exactly RESERVED_SLUGS, no more and no fewer', async () => {
		const { rows } = await db.sql<{ prosrc: string }>(
			`select prosrc from pg_proc
			 where proname = '_app_short_link_reserved'
			   and pronamespace = 'public'::regnamespace`
		);
		expect(rows).toHaveLength(1);
		// The body is exactly `select p_slug in ('a', 'admin', ...)`, so every
		// single-quoted literal in it IS the reserved set -- there is nothing
		// else in the function for a quoted string to be.
		const literals = [...rows[0].prosrc.matchAll(/'([^']*)'/g)].map((m) => m[1]);
		expect(literals.length).toBeGreaterThan(0);
		expect(new Set(literals)).toEqual(new Set(RESERVED_SLUGS));
		// Equal-length here plus equal-as-sets above rules out a duplicate
		// literal masking a missing one.
		expect(literals.length).toBe(RESERVED_SLUGS.length);
	});

	test('a name of the same shape that shadows nothing is NOT reserved (negative control)', async () => {
		const { rows } = await db.sql<{ reserved: boolean }>(
			`select public._app_short_link_reserved('open-lab') as reserved`
		);
		expect(rows[0].reserved).toBe(false);
	});
});
