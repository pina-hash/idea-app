// tests/gauntlet-run-review-route.test.ts
//
// The REAL `/gauntlet/run-review` load, driven against a REAL Postgres with the
// REAL 0152 function behind it, plus a server render of the REAL page.
//
// WHY THE ROUTE AND NOT JUST THE SQL. `tests/gauntlet-run-review.test.ts` proves
// what the database answers. Two things it cannot see:
//
//   * WHETHER THE ROUTE TURNS ANYONE AWAY, and with which status. The function's
//     own gate answers a non-admin with an EMPTY SET, which is correct for the
//     database and is exactly what a leaked surface would also look like from
//     the outside: a signed-in student reaching this page without a 404 would
//     get a working, well-laid-out, entirely empty console telling them a review
//     lane exists. The redirect-vs-404 distinction is a route decision and is
//     invisible on screen.
//   * WHETHER THE PAGE SAYS THE THING IT EXISTS TO SAY. The standing note about
//     why "none recorded" is expected is the difference between a teacher
//     reading this report correctly and a teacher concluding the board is full
//     of fakes. It is copy, so nothing type-checks it and nothing else asserts
//     it.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { load as RUN_REVIEW_LOAD, type RunReviewRow } from '../src/routes/gauntlet/run-review/+page.server';
import RunReviewPage from '../src/routes/gauntlet/run-review/+page.svelte';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0004_gauntlet.sql',
	'0005_gauntlet_speedrun.sql',
	'0006_gauntlet_macro.sql',
	'0007_gauntlet_modeling_modes.sql',
	'0008_gauntlet_knowledge_modes.sql',
	'0009_gauntlet_authoring.sql',
	'0010_gauntlet_rooms.sql',
	'0015_gauntlet_speedrun_formalize.sql',
	'0016_gauntlet_speedrun_start.sql',
	'0017_gauntlet_run_status.sql',
	'0018_gauntlet_speedrun_units.sql',
	'0021_gauntlet_progression.sql',
	'0022_gauntlet_drawing_series.sql',
	'0023_gauntlet_reveal_focus_regions.sql',
	'0024_gauntlet_leaderboards.sql',
	'0026_gauntlet_material_gate.sql',
	'0027_gauntlet_material_density_gate.sql',
	'0028_gauntlet_room_code_and_host_play.sql',
	'0029_gauntlet_drop_tiers.sql',
	'0030_gauntlet_unit_system.sql',
	'0033_gauntlet_speedrun_attempts.sql',
	'0034_gauntlet_volume_only_verification.sql',
	'0035_gauntlet_run_events.sql',
	'0036_gauntlet_volume_tolerance_0_1.sql',
	'0061_gauntlet_target_disclosure.sql',
	'0137_anon_execute_sweep.sql',
	'0146_gauntlet_reveal_all_modeling_modes.sql',
	'0147_gauntlet_close_target_disclosure.sql',
	'0148_gauntlet_knowledge_clock.sql',
	'0150_gauntlet_connect_run_analysis.sql',
	'0151_gauntlet_meter_practice.sql',
	'0152_gauntlet_run_review.sql'
] as const;

/** The chain one file short of 0152: a deployment between the push and the apply. */
const CHAIN_BEFORE = CHAIN.slice(0, -1) as unknown as string[];

const TARGET_VOLUME_MM3 = 61237.4408;

/** `loadForeignKeys` does not export its element type; take it from the call. */
type ForeignKeys = Awaited<ReturnType<typeof loadForeignKeys>>;

/**
 * What the load returns. SvelteKit types a load that can `error()` as
 * `void | ...`, so every read of a real field is an error without this; the
 * cast is at the ONE call site below rather than at each assertion.
 */
interface LoadResult {
	rows: RunReviewRow[];
	challenges: Array<{ id: string; title: string }>;
	filters: {
		challengeId: string | null;
		sinceHours: number;
		fastFinishSeconds: number;
		includeAbsent: boolean;
		observedOnly: boolean;
	};
	notApplied: boolean;
	readError: string | null;
}

let db: TestDb;
let fks: ForeignKeys;
/** A second database with 0152 absent, for the not-applied branch. */
let dbBefore: TestDb;
let fksBefore: ForeignKeys;
let adminBefore: SeededUser;
let admin: SeededUser;
let student: SeededUser;
let challengeId: string;

/**
 * The shared shim, unwrapped.
 *
 * This was a LOCAL `rpc` override until the shim was fixed centrally:
 * `tests/db/postgrest-shim.ts` called every function as `select f(...) as
 * result`, which collapses a `returns table` result to its first row and hands
 * that row back as a composite, so a test built on it proved nothing about the
 * shape this page receives. The shim now reads `proretset` from the catalog
 * itself and answers a set-returning call with an array of row objects, in
 * JSON, so the copy that lived here is gone rather than kept beside it.
 */
function client(who: SeededUser) {
	return createPostgrestShim(db, fks, who.id);
}

/**
 * Server-render the REAL page with a load result.
 *
 * The cast is here, once. `PageData` includes the root layout's own keys
 * (`supabase`, `claims`, `userProfile`, `isAdmin`), which this page never reads
 * and which a load result does not carry; supplying fakes for them would be
 * four values a reader has to check are irrelevant.
 */
function renderPage(data: LoadResult) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return render(RunReviewPage, { props: { data: data as any } });
}

/** Drive the REAL load with that client, as a given caller. */
async function driveLoad(who: SeededUser | null, query = ''): Promise<LoadResult> {
	const url = new URL(`http://localhost/gauntlet/run-review${query}`);
	const out = await RUN_REVIEW_LOAD({
		locals: {
			supabase: client(who ?? admin),
			claims: who ? { sub: who.id, email: who.email, role: 'authenticated' } : null
		},
		url
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);
	return out as unknown as LoadResult;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN as unknown as string[]);
	fks = await loadForeignKeys(db);

	admin = await createUser(db, 'chair@boscotech.edu', 'The Chair');
	student = await createUser(db, 'runner@boscotech.net', 'Ana Reyes');
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		'chair@boscotech.edu'
	]);

	const { rows } = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
		 values ('speedrun', 'Alpha Bracket', 2, $1::jsonb, $2::jsonb, 'published') returning id`,
		[
			JSON.stringify({ material: 'Aluminium 6061', density: 2.7, unit_system: 'MMGS', par_time: 275 }),
			JSON.stringify({
				target_volume_mm3: TARGET_VOLUME_MM3,
				target_mass: (TARGET_VOLUME_MM3 / 1000) * 2.7,
				density: 2.7,
				tolerance_pct: 0.1,
				drawing: '<svg/>'
			})
		]
	);
	challengeId = rows[0].id;

	// The world as it is deployed right now: everything up to 0151, applied.
	dbBefore = await startTestDb(CHAIN_BEFORE);
	fksBefore = await loadForeignKeys(dbBefore);
	adminBefore = await createUser(dbBefore, 'chair@boscotech.edu', 'The Chair');
	await dbBefore.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		'chair@boscotech.edu'
	]);

	// One real ranked run, through the real RPC chain, fast enough to be listed.
	const rev = await db.asUser(student.id, (q) =>
		q<{ r: { code: string } }>(`select public.gauntlet_speedrun_reveal($1::uuid) as r`, [challengeId])
	);
	const code = rev.rows[0].r.code;
	const st = await db.sql<{ r: { run_id: string } }>(
		`select public.gauntlet_macro_start($1::text, 0::numeric) as r`,
		[code]
	);
	await db.sql(
		`select public.gauntlet_macro_submit(
			p_code => $1::text, p_volume_mm3 => $2::numeric, p_run_id => $3::text,
			p_surface_area_mm2 => 12000, p_feature_count => 6)`,
		[code, String(TARGET_VOLUME_MM3), st.rows[0].r.run_id]
	);
}, 120_000);

afterAll(async () => {
	await db?.stop();
	await dbBefore?.stop();
});

describe('the route turns away everyone who is not an admin', () => {
	it('404s a signed-in non-admin, and does NOT redirect', async () => {
		// A redirect would confirm there is a review lane to be turned away from,
		// and SvelteKit models the two as different throws. Asserting the STATUS
		// rather than "it threw" is the whole point: `redirect(303)` also throws.
		let thrown: unknown;
		try {
			await driveLoad(student);
		} catch (err) {
			thrown = err;
		}
		expect(thrown).toBeDefined();
		const e = thrown as { status?: number; location?: string; body?: { message?: string } };
		expect(e.status).toBe(404);
		expect(e.location).toBeUndefined(); // a redirect would carry one
	});

	it('404s an anonymous caller', async () => {
		let thrown: unknown;
		try {
			await driveLoad(null);
		} catch (err) {
			thrown = err;
		}
		expect((thrown as { status?: number }).status).toBe(404);
	});

	it('serves an admin, on the same fixture', async () => {
		// POSITIVE CONTROL for both refusals above: the route is not simply broken.
		const data = await driveLoad(admin, '?all=1');
		expect(data.notApplied).toBe(false);
		expect(data.readError).toBeNull();
		expect(data.rows.length).toBeGreaterThan(0);
		expect(data.challenges.map((c) => c.id)).toContain(challengeId);
	});
});

describe('the load reads its controls off the query string', () => {
	it('defaults, and each parameter moving', async () => {
		const dflt = await driveLoad(admin);
		expect(dflt.filters).toMatchObject({
			challengeId: null,
			sinceHours: 720,
			fastFinishSeconds: 30,
			includeAbsent: false,
			observedOnly: true
		});

		const set = await driveLoad(
			admin,
			`?challenge=${challengeId}&hours=48&floor=90&absent=1&all=1`
		);
		expect(set.filters).toMatchObject({
			challengeId,
			sinceHours: 48,
			fastFinishSeconds: 90,
			includeAbsent: true,
			observedOnly: false
		});
	});

	it('clamps nonsense rather than passing it through', async () => {
		const junk = await driveLoad(admin, '?hours=notanumber&floor=-500');
		expect(junk.filters.sinceHours).toBe(720);
		expect(junk.filters.fastFinishSeconds).toBe(0);
		const huge = await driveLoad(admin, '?hours=999999&floor=999999');
		expect(huge.filters.sinceHours).toBe(8760);
		expect(huge.filters.fastFinishSeconds).toBe(3600);
	});

	it('observedOnly actually narrows, so the switch is not decorative', async () => {
		const all = await driveLoad(admin, '?all=1&floor=0');
		const only = await driveLoad(admin, '?floor=0');
		expect(all.rows.length).toBeGreaterThan(0); // positive control
		expect(only.rows.length).toBeLessThan(all.rows.length);
	});
});

describe('the page says what it exists to say', () => {
	it('renders the standing note about why nothing recorded is expected', async () => {
		const data = await driveLoad(admin, '?all=1');
		const { body } = renderPage(data);

		// The four sentences a first reader needs before they read a single row.
		expect(body).toContain('Read this before you read the list');
		expect(body).toMatch(/VBA macros are still a supported way to play/i);
		expect(body).toMatch(/raced in a live room can never have one/i);
		expect(body).toMatch(/not proof of anything on its own/i);
		expect(body).toMatch(/a reason to look, not a conclusion/i);
	});

	it('renders the run, its elapsed and its telemetry state in words', async () => {
		const data = await driveLoad(admin, '?all=1');
		const { body } = renderPage(data);
		expect(body).toContain('Ana Reyes');
		expect(body).toContain('Elapsed');
		expect(body).toContain('Progress record');
		// The state is a WORD, not only a tint: colour is never the only signal.
		expect(body).toMatch(/None recorded|Progress recorded|Not possible|Cannot be matched/);
	});

	it('never renders an accusation, and never a score', async () => {
		const data = await driveLoad(admin, '?all=1&absent=1&floor=600');
		const body = renderPage(data).body.toLowerCase();
		// POSITIVE CONTROL for the sweep.
		expect(body).toContain('run');
		for (const word of [
			'cheat',
			'fraud',
			'forged',
			'forgery',
			'suspicious',
			'suspect',
			'guilty',
			'dishonest',
			'faked',
			'violation',
			'offender',
			'suspicion score',
			'risk score'
		]) {
			expect(body.includes(word)).toBe(false);
		}
	});

	it('says so plainly when 0152 is not applied, instead of showing an empty all clear', async () => {
		// THE REAL LOAD, against a REAL database with 0152 genuinely absent --
		// the state this deployment is in right now, between the push and the
		// hand-applied migration. Built by hand instead, this test passes against
		// a load that has stopped setting the flag at all: measured, that mutant
		// SURVIVED until this was driven for real.
		const url = new URL('http://localhost/gauntlet/run-review');
		const data = (await RUN_REVIEW_LOAD({
			locals: {
				supabase: createPostgrestShim(dbBefore, fksBefore, adminBefore.id),
				claims: { sub: adminBefore.id, email: adminBefore.email, role: 'authenticated' }
			},
			url
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as unknown as LoadResult;
		expect(data.notApplied).toBe(true);
		expect(data.rows).toEqual([]);
		const { body } = renderPage(data);
		expect(body).toMatch(/not on the database yet/i);
		expect(body).toMatch(/0152/);
		expect(body).toMatch(/Nothing is wrong with the runs/i);
		// And it does NOT also claim there is nothing to review.
		expect(body).not.toMatch(/which is the ordinary result/i);
	});

	it('a read failure is reported by the LOAD, never degraded into an all clear', async () => {
		// Only the ERROR is stubbed, because a statement timeout is not something
		// a fixture can be asked to produce on demand; everything else is the real
		// handler. Degrading past a non-PGRST202 error would turn a broken read
		// into a clean bill of health, which is the one outcome this page must
		// never produce -- and with `readError` hard-coded null that mutant
		// SURVIVED a version of this test built from a hand-made object.
		const base = createPostgrestShim(db, fks, admin.id);
		const failing = {
			...base,
			async rpc(name: string, args?: Record<string, unknown>) {
				if (name === 'gauntlet_run_review') {
					return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
				}
				return base.rpc(name, args);
			}
		};
		const data = (await RUN_REVIEW_LOAD({
			locals: {
				supabase: failing,
				claims: { sub: admin.id, email: admin.email, role: 'authenticated' }
			},
			url: new URL('http://localhost/gauntlet/run-review')
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as unknown as LoadResult;
		// The discriminator: a real failure is NOT the not-applied state.
		expect(data.notApplied).toBe(false);
		expect(data.readError).toContain('statement timeout');

		const { body } = renderPage(data);
		expect(body).toMatch(/not showing you an all clear/i);
		expect(body).toContain('statement timeout');
	});
});
