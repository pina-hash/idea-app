// tests/gauntlet-admin-set-returning-projection.test.ts
//
// THE TWO GAUNTLET SET-RETURNING READS NOTHING HAD EVER CALLED FROM A CLIENT:
// who may call them, and -- the half that has gone missing twice in this repo
// -- what they hand back to the caller they DO admit.
//
//     gauntlet_author_roster       0155   no mention anywhere in tests/ or src/
//     gauntlet_practice_pressure   0151   named in two tests, driven in raw SQL
//
// `docs/history/anon-coin-public-projections-mrlg0d.md` closed the last of the
// `anon`-granted set-returning functions and named these two among the four
// left. Both are ADMIN reads, so neither is reachable by a stranger; what is at
// stake here is what an ADMIN CONSOLE would put on a screen, and in one case
// what a plausible future widening would hand to somebody who is not an admin.
//
// WHY A CLIENT-SHAPED CALL IS A DIFFERENT CLAIM FROM RAW SQL.
// `gauntlet_practice_pressure` already has substantial raw-SQL coverage in
// `tests/gauntlet-practice-meter.test.ts` (`select * from
// public.gauntlet_practice_pressure(...)` through `db.asUser`). That is the
// shape node-postgres produces: a `bigint` arrives as a STRING, a `timestamptz`
// as a `Date`. A browser receives neither. Everything below goes through the
// shared PostgREST shim, which aggregates the set into one JSON value exactly
// as PostgREST does, so the keys and the types pinned here are the ones a
// console would actually branch on.
//
// AND `gauntlet_author_roster` HAS NEVER BEEN EXECUTED BY ANYTHING. 0155's own
// self-checks read the catalog; `tests/gauntlet-author-tier.test.ts` drives the
// grant and the revoke and never the read. Its body has not run once.
//
// THE PINS ARE WHOLE SETS, NEVER SPOT CHECKS, for the reason the two sibling
// files give: a disclosure arrives as an ADDED field, so an assertion naming
// the fields it dislikes passes forever while the payload grows around it. Each
// projection is pinned TWICE from one constant -- as the DECLARED result
// columns in `pg_proc`, and as the complete key set of a real row a real caller
// received. The catalog half is what still reddens when a fixture returns
// nothing.
//
// THE ONE GAP THIS FILE CLOSES IN AN EXISTING TEST, stated because that test
// says so itself: `gauntlet-author-tier.test.ts` probes the pressure read as an
// author, a teacher and a student, gets zero rows from each, and then writes
// down that the probe "cannot tell a closed gate from an empty table" -- its
// fixture has no practice cadence in it, so the ADMIN reads zero too. The
// fixture below has a burst in it, the admin reads rows from it, and the three
// zeroes then mean what they were always supposed to mean.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';

/**
 * The GAUNTLET chain as production stands, taken verbatim from
 * `tests/gauntlet-author-tier.test.ts` so the two files cannot disagree about
 * what 0155 sits on top of. 0149 is deliberately absent for the reason 0151's
 * own suite records: its self-check requires nine views a gauntlet-only chain
 * does not have.
 */
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
	'0019_gauntlet_purge_demo.sql',
	'0021_gauntlet_progression.sql',
	'0022_gauntlet_drawing_series.sql',
	'0023_gauntlet_reveal_focus_regions.sql',
	'0024_gauntlet_leaderboards.sql',
	'0025_gauntlet_room_delete.sql',
	'0026_gauntlet_material_gate.sql',
	'0027_gauntlet_material_density_gate.sql',
	'0028_gauntlet_room_code_and_host_play.sql',
	'0029_gauntlet_drop_tiers.sql',
	'0030_gauntlet_unit_system.sql',
	'0031_gauntlet_tools_bucket.sql',
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
	'0152_gauntlet_run_review.sql',
	'0153_gauntlet_unpublish_the_target.sql',
	'0154_gauntlet_rank_what_is_checkable.sql',
	'0155_gauntlet_authoring_tier.sql'
] as const;

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * 0155 section 6 SEEDS this address into `gauntlet_authors` with a note and no
 * grantor. It is part of the applied schema, not of this fixture, so it is
 * named rather than worked around -- a roster read that silently dropped it
 * would be reporting fewer authors than the database holds.
 */
const SEEDED_AUTHOR = 'wcosso@boscotech.edu';

/**
 * THE PROJECTIONS, WRITTEN DOWN ONCE. Each list is asserted twice below -- as
 * the DECLARED result columns in `pg_proc` and as the key set of a real row a
 * real caller received -- so a column added to a function reddens both and
 * neither can drift from the other.
 */
const PROJECTIONS = {
	gauntlet_author_roster: ['email', 'granted_by', 'granted_at', 'note'],
	gauntlet_practice_pressure: [
		'user_id',
		'player',
		'challenge_id',
		'challenge_title',
		'checks',
		'first_check',
		'last_check',
		'fastest_gap_ms',
		'median_gap_ms',
		'at_floor_gaps',
		'longest_burst',
		'passes'
	]
} as const;

type Who = 'admin' | 'author' | 'teacher' | 'student' | 'nameless';
/** Everyone who is signed in but is NOT an admin. */
const NON_ADMINS: readonly Who[] = ['author', 'teacher', 'student', 'nameless'];

let db: TestDb;
/** The catalog snapshot PostgREST caches, taken once. */
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
const user = {} as Record<Who, SeededUser>;
/** One client per caller, plus a signed-out one. `null` is a caller, not a gap. */
const client = {} as Record<Who, ReturnType<typeof createPostgrestShim>>;
let anon: ReturnType<typeof createPostgrestShim>;

let speedrunId = '';
let speedrunTitle = 'Metered Fixture';

/** Hands back `data`, or throws whatever the shim reported. */
async function ok<T>(
	call: PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T> {
	const res = await call;
	if (res.error) throw new Error(res.error.message);
	return res.data as T;
}

/** The refusal a call produced, or null if it was admitted. */
async function refusal(
	call: PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<string | null> {
	const res = await call;
	return res.error ? res.error.message : null;
}

/** The complete key set of an object, sorted, so a pin is order-independent. */
function keysOf(row: unknown): string[] {
	return Object.keys(row as Record<string, unknown>).sort();
}

/** The DECLARED result columns of a function, read off the catalog. */
async function declaredColumns(name: string): Promise<string[]> {
	const { rows } = await db.sql<{ col: string }>(
		`select unnest(p.proargnames) as col
		   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		  where n.nspname = 'public' and p.proname = $1`,
		[name]
	);
	// proargnames carries the IN parameters too; the OUT ones are the tail
	// identified by proargmodes. Read the modes and keep only 't' (table).
	const { rows: modes } = await db.sql<{ modes: string[] | null }>(
		`select p.proargmodes::text[] as modes
		   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		  where n.nspname = 'public' and p.proname = $1`,
		[name]
	);
	const m = modes[0]?.modes;
	if (!m) return rows.map((r) => r.col);
	return rows.map((r) => r.col).filter((_, i) => m[i] === 't');
}

/**
 * Seeds one practice cadence straight into `submissions` at chosen instants.
 * This is the shape `gauntlet-practice-meter.test.ts` uses for the same reason:
 * the DETECTOR is a pure read, and driving the real RPC would have to wait out
 * the two-second floor between every check. The triple written here
 * (`speedrun` / `manual` / null room) is the one 0151 section 2 identifies as
 * the practice branch's own writer, and that file's `discriminator` test is
 * what proves the triple reaches exactly one writer in the schema.
 */
async function seedCadence(
	who: SeededUser,
	challengeId: string,
	gapsMs: readonly number[],
	opts: { correct?: boolean } = {}
) {
	let offsetMs = gapsMs.reduce((a, b) => a + b, 0) + 60_000;
	const insert = async (secondsAgo: number) => {
		await db.sql(
			`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, created_at)
			 values ($1, $2, 'speedrun', '{}'::jsonb, $3, 0, now() - make_interval(secs => $4::float8))`,
			[who.id, challengeId, opts.correct ?? false, secondsAgo]
		);
	};
	await insert(offsetMs / 1000);
	for (const gap of gapsMs) {
		offsetMs -= gap;
		await insert(offsetMs / 1000);
	}
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	user.admin = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	user.author = await createUser(db, 'mcosso@boscotech.edu', 'Author Teacher');
	user.teacher = await createUser(db, 'notonthelist@boscotech.edu', 'Plain Teacher');
	user.student = await createUser(db, 'kid@boscotech.net', 'A Student');
	// NAMED NOWHERE, on purpose: `gauntlet_practice_pressure`'s `player` is
	// `display_name` else `full_name` and has NO third rung, so without a
	// student carrying neither, the null branch is never reached and "it does
	// not fall through to the address" is a claim about a branch nothing runs.
	user.nameless = await createUser(db, 'quiet.grinder@boscotech.net', '');

	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		user.admin.email
	]);

	// The author arrives through the REAL RPC, never a raw insert, so the row
	// the roster projects is one the shipped write path produced -- including
	// its `granted_by` and its `note`, which are the two fields this file has
	// something to say about.
	await db.asUser(user.admin.id, (q) =>
		q(`select public.gauntlet_author_grant($1, $2)`, [
			user.author.email,
			'Covering Speedrun authoring for the spring term.'
		])
	);
	// A SECOND author with NO note, so `note` being null is a real answer this
	// fixture contains rather than a shape nothing produces.
	await db.asUser(user.admin.id, (q) =>
		q(`select public.gauntlet_author_grant($1, $2)`, ['second.author@boscotech.edu', null])
	);

	const prompt = {
		material: 'Aluminium 6061',
		density: 2.7,
		unit_system: 'MMGS',
		drawing: '<svg/>'
	};
	const answer = {
		target_volume_mm3: 73412.8391,
		target_mass: 198.2146,
		density: 2.7,
		tolerance_pct: 0.1,
		drawing: '<svg/>'
	};
	const ch = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
		 values ('speedrun', $1, 2, $2::jsonb, $3::jsonb, 'published') returning id`,
		[speedrunTitle, JSON.stringify(prompt), JSON.stringify(answer)]
	);
	speedrunId = ch.rows[0].id;

	// THE BURST: eleven gaps at 2.1s, which is inside 0151's floor plus its
	// 500ms of slack, so every one of them counts as at-floor and the island
	// walk sees one run of eleven -- twelve checks. No person produces this.
	await seedCadence(user.student, speedrunId, Array(11).fill(2100));
	// THE GRINDER: the same student count reached honestly, minutes apart, by
	// the caller with no name. High `checks`, `longest_burst` of 0. This is the
	// row that makes `longest_burst` a discriminator rather than a synonym for
	// `checks`, and it is also the row whose `player` must be null.
	await seedCadence(user.nameless, speedrunId, Array(24).fill(240_000), { correct: true });

	fks = await loadForeignKeys(db);
	for (const who of Object.keys(user) as Who[]) {
		client[who] = createPostgrestShim(db, fks, user[who].id);
	}
	anon = createPostgrestShim(db, fks, null);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
describe('the callers are really the callers', () => {
	// A shim silently running as the table owner would satisfy every claim
	// below, so this runs FIRST and asks the same question of two seats.

	it('refuses the student client something the admin client is given', async () => {
		const denied = await refusal(
			client.student.rpc('gauntlet_author_grant', {
				p_email: 'sneaky@boscotech.edu',
				p_note: null
			})
		);
		expect(denied).toMatch(/Only site admins can grant GAUNTLET authoring/);

		// THE POSITIVE HALF, on the same shim and the same RPC: without it a
		// broken shim that refused everybody would pass the line above.
		const granted = await ok<{ granted: boolean }>(
			client.admin.rpc('gauntlet_author_grant', {
				p_email: 'third.author@boscotech.edu',
				p_note: null
			})
		);
		expect(granted.granted).toBe(true);
		await db.asUser(user.admin.id, (q) =>
			q(`select public.gauntlet_author_revoke($1)`, ['third.author@boscotech.edu'])
		);
	});

	it('refuses the AUTHOR client the same grant, which is 0155 section 3 exactly', async () => {
		// The author holds the capability the roster records and still cannot
		// write the roster. Authoring does not propagate -- the migration's own
		// argument for admin-gating grant and revoke rather than owner-gating.
		const denied = await refusal(
			client.author.rpc('gauntlet_author_grant', { p_email: 'friend@boscotech.edu', p_note: null })
		);
		expect(denied).toMatch(/Only site admins can grant GAUNTLET authoring/);
		const revokeDenied = await refusal(
			client.author.rpc('gauntlet_author_revoke', { p_email: 'second.author@boscotech.edu' })
		);
		expect(revokeDenied).toMatch(/Only site admins can revoke GAUNTLET authoring/);
	});

	it('is genuinely anon on the anon client: no session, and no EXECUTE', async () => {
		// `set role anon` with no claims. Both functions are revoked from anon
		// by their own migrations, so the refusal is the GRANT and not the body.
		expect(await refusal(anon.rpc('gauntlet_author_roster'))).toMatch(/permission denied/i);
		expect(await refusal(anon.rpc('gauntlet_practice_pressure'))).toMatch(/permission denied/i);
	});
});

// ---------------------------------------------------------------------------
describe('the EXECUTE partition, read off the catalog', () => {
	it('grants both to authenticated and neither to anon, with a shut control beside them', async () => {
		const { rows } = await db.sql<Record<string, boolean>>(
			`select
			   has_function_privilege('anon', 'public.gauntlet_author_roster()', 'execute') as roster_anon,
			   has_function_privilege('authenticated', 'public.gauntlet_author_roster()', 'execute') as roster_auth,
			   has_function_privilege('anon', 'public.gauntlet_practice_pressure(integer, integer, integer)', 'execute') as pressure_anon,
			   has_function_privilege('authenticated', 'public.gauntlet_practice_pressure(integer, integer, integer)', 'execute') as pressure_auth,
			   has_function_privilege('authenticated', 'public._gauntlet_practice_min_interval()', 'execute') as helper_auth`
		);
		expect(rows[0]).toEqual({
			roster_anon: false,
			roster_auth: true,
			pressure_anon: false,
			pressure_auth: true,
			// The private helper is shut to every client role. This is the
			// PARTITION half: a fixture in which everything is revoked would
			// satisfy the two `false`s above on its own.
			helper_auth: false
		});
	});
});

// ---------------------------------------------------------------------------
describe('gauntlet_author_roster: WHO MAY READ THE LIST OF WHO MAY AUTHOR', () => {
	it('answers an admin with every row, ordered by email', async () => {
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('gauntlet_author_roster'));
		// Three rows and three SHAPES, which is what makes the pins below cover
		// the projection rather than one row of it: two granted through the RPC
		// (one with a note, one without) and 0155's own SEEDED row, which was
		// written by an `insert` with no grantor and therefore carries a null
		// `granted_by` beside a non-null note. The seed is a fixture fact rather
		// than something this file arranged, and it is asserted as such.
		expect(rows.map((r) => r.email)).toEqual([
			'mcosso@boscotech.edu',
			'second.author@boscotech.edu',
			SEEDED_AUTHOR
		]);
	});

	it('records a null grantor for the row 0155 seeded, and a real one for the rest', async () => {
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('gauntlet_author_roster'));
		const seeded = rows.find((r) => r.email === SEEDED_AUTHOR);
		// `granted_by` is null exactly when nobody pressed anything -- the
		// migration's own comment on the column says so. A console reading this
		// must render nothing there rather than inventing a grantor.
		expect(seeded?.granted_by).toBeNull();
		expect(seeded?.note).toBe(
			'GAUNTLET author tier (0155). Authoring, publishing and room hosting only.'
		);
		// The positive control: the rows the RPC wrote DO carry one, so a null
		// here is a property of the seed and not of the column.
		expect(rows.filter((r) => r.granted_by === user.admin.email)).toHaveLength(2);
	});

	it('answers an AUTHOR with nothing, which is the finding worth stating', async () => {
		// The read gate is `where public.is_admin()` INSIDE the definer body, so
		// an author -- somebody the roster is a list OF -- receives an empty set
		// and cannot tell it from an empty roster.
		//
		// 0155's own reasoning is what makes this the right answer rather than a
		// narrowing somebody forgot: the comment above the table's policy says
		// "Reads are admin-only: this is a list of staff email addresses, and
		// that is app_admins' own reason", and the function's own comment calls
		// it "the roster, for an admin surface". The gate matches the stated
		// intent exactly.
		//
		// AND THE PROJECTION IS WHY IT SHOULD STAY THERE. The obvious future
		// widening -- let an author see who else authors -- reads as smaller
		// than an admin roster, and it is not, because this function does not
		// project "who authors". It projects who authors, WHO GRANTED THEM (a
		// second staff address), WHEN, and a free-text NOTE an admin wrote about
		// a colleague. Widening the gate to gauntlet_can_author() would hand all
		// four to every author. The pin below is what that widening reddens.
		for (const who of NON_ADMINS) {
			const rows = await ok<unknown[]>(client[who].rpc('gauntlet_author_roster'));
			expect(rows, `roster answered ${who}`).toEqual([]);
		}
	});

	it('projects a SECOND staff address and an admin-written note, not merely a list of authors', async () => {
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('gauntlet_author_roster'));
		const noted = rows.find((r) => r.email === 'mcosso@boscotech.edu');
		expect(noted).toBeDefined();
		// The grantor's address, stamped by `current_user_email()` inside the
		// definer body. It names a DIFFERENT person from the row's subject.
		expect(noted?.granted_by).toBe(user.admin.email);
		expect(noted?.granted_by).not.toBe(noted?.email);
		// Free text, capped at 200 characters by the table's own CHECK, written
		// by one member of staff about another and returned verbatim.
		expect(noted?.note).toBe('Covering Speedrun authoring for the spring term.');
		// Two addresses on one row, and both of them are staff.
		const addresses = [noted?.email, noted?.granted_by] as string[];
		expect(addresses.every((a) => a.endsWith('@boscotech.edu'))).toBe(true);
	});

	it('carries a null note as null, so an absent note is a real answer here', async () => {
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('gauntlet_author_roster'));
		const plain = rows.find((r) => r.email === 'second.author@boscotech.edu');
		expect(plain?.note).toBeNull();
		expect(plain?.granted_by).toBe(user.admin.email);
	});

	it('pins the projection TWICE from one constant', async () => {
		const expected = [...PROJECTIONS.gauntlet_author_roster].sort();
		// The catalog half, which still reddens when the fixture returns nothing.
		expect((await declaredColumns('gauntlet_author_roster')).sort()).toEqual(expected);
		// The wire half, over a row an admin really received.
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('gauntlet_author_roster'));
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) expect(keysOf(row)).toEqual(expected);
	});

	it('shuts the TABLE to the same callers, so the RPC is not the only gate', async () => {
		// 0155 puts RLS on `gauntlet_authors` with an `is_admin()` select
		// policy, so a client reading the table directly meets the same answer.
		const adminRows = await ok<unknown[]>(
			client.admin.from('gauntlet_authors').select('email,granted_by,note')
		);
		expect(adminRows.length).toBe(3);
		for (const who of NON_ADMINS) {
			const rows = await ok<unknown[]>(
				client[who].from('gauntlet_authors').select('email,granted_by,note')
			);
			expect(rows, `table answered ${who}`).toEqual([]);
		}
		// And anon holds no SELECT on it at all -- a refusal, not an empty set.
		expect(
			await refusal(anon.from('gauntlet_authors').select('email'))
		).toMatch(/permission denied/i);
	});
});

// ---------------------------------------------------------------------------
describe('gauntlet_practice_pressure: WHAT IT SAYS ABOUT A NAMED STUDENT', () => {
	it('answers an admin with rows, which is what makes every zero below a measurement', async () => {
		// The gap `gauntlet-author-tier.test.ts` names in its own comment: its
		// fixture has no cadence, so its admin reads zero and its three zeroes
		// prove nothing. This fixture has a burst and a grind in it.
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('gauntlet_practice_pressure'));
		expect(rows.length).toBe(2);
	});

	it('gives an author, a teacher and a student NOTHING from that same fixture', async () => {
		for (const who of NON_ADMINS) {
			const rows = await ok<unknown[]>(client[who].rpc('gauntlet_practice_pressure'));
			expect(rows, `pressure answered ${who}`).toEqual([]);
		}
		// Including the student who is IN the fixture: being the subject of a
		// row is not a licence to read it. `checks` and `longest_burst` about
		// yourself is exactly what a caller probing for a detection lane wants.
		const own = await ok<unknown[]>(client.student.rpc('gauntlet_practice_pressure'));
		expect(own).toEqual([]);
	});

	it('pins the projection TWICE from one constant', async () => {
		const expected = [...PROJECTIONS.gauntlet_practice_pressure].sort();
		expect((await declaredColumns('gauntlet_practice_pressure')).sort()).toEqual(expected);
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('gauntlet_practice_pressure'));
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) expect(keysOf(row)).toEqual(expected);
	});

	it('carries NO EMAIL on any row, with a positive control that there is one to leak', async () => {
		// THE CONTROL FIRST. An empty answer carries no address either, and
		// both students in this fixture really do hold @boscotech.net rows.
		const { rows: seeded } = await db.sql<{ n: string }>(
			`select count(*)::text as n from auth.users where email like '%@boscotech.net'`
		);
		expect(Number(seeded[0].n)).toBe(2);

		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('gauntlet_practice_pressure'));
		expect(rows.length).toBeGreaterThan(0);
		const blob = JSON.stringify(rows);
		expect(blob).not.toContain('@');
		expect(blob).not.toContain('boscotech');
	});

	it('names a student by their chosen name, and by NOTHING when they have none', async () => {
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('gauntlet_practice_pressure'));
		const burst = rows.find((r) => r.user_id === user.student.id);
		const grind = rows.find((r) => r.user_id === user.nameless.id);
		expect(burst?.player).toBe('A Student');
		// THE THIRD RUNG IS ABSENT AND MUST STAY ABSENT. `foundryAuthorName`'s
		// rule one subsystem over is the same one: a fallback to the local part
		// of the address would put a reconstructable address on an admin screen,
		// which is a screenshot away from anywhere. Null renders as nothing.
		expect(grind?.player).toBeNull();
		// And the row is still USEFUL without a name: `user_id` is what an admin
		// resolves against `profiles`, which 0151's header says in as many words.
		expect(typeof grind?.user_id).toBe('string');
	});

	it('discriminates the burst from the grind, which is the column that matters', async () => {
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('gauntlet_practice_pressure'));
		const burst = rows.find((r) => r.user_id === user.student.id);
		const grind = rows.find((r) => r.user_id === user.nameless.id);
		// Twelve checks, eleven at-floor gaps, one island of eleven -> 12.
		expect(Number(burst?.checks)).toBe(12);
		expect(Number(burst?.longest_burst)).toBe(12);
		expect(Number(burst?.at_floor_gaps)).toBe(11);
		// TWICE the checks, and no burst at all. `checks` alone would put the
		// hardest-working student in the class at the top of this list.
		expect(Number(grind?.checks)).toBe(25);
		expect(Number(grind?.longest_burst)).toBe(0);
		expect(Number(grind?.at_floor_gaps)).toBe(0);
		// Ordered by longest_burst desc, so the burst leads.
		expect(rows[0].user_id).toBe(user.student.id);
	});

	it('reports gaps and a challenge title, and passes as a count', async () => {
		const rows = await ok<Record<string, unknown>[]>(client.admin.rpc('gauntlet_practice_pressure'));
		const burst = rows.find((r) => r.user_id === user.student.id);
		const grind = rows.find((r) => r.user_id === user.nameless.id);
		expect(burst?.challenge_title).toBe(speedrunTitle);
		expect(burst?.challenge_id).toBe(speedrunId);
		// The measured cadence, in milliseconds, reported rather than judged.
		expect(Number(burst?.fastest_gap_ms)).toBeGreaterThan(0);
		expect(Number(burst?.fastest_gap_ms)).toBeLessThanOrEqual(2500);
		expect(Number(burst?.median_gap_ms)).toBeLessThanOrEqual(2500);
		expect(Number(grind?.median_gap_ms)).toBeGreaterThan(2500);
		// Every seeded grind row is a pass; every burst row is a miss.
		expect(Number(grind?.passes)).toBe(25);
		expect(Number(burst?.passes)).toBe(0);
		// The window bounds, as ISO strings over the wire rather than Dates.
		expect(typeof burst?.first_check).toBe('string');
		expect(typeof burst?.last_check).toBe('string');
	});

	it('says nothing about WHICH answers were given, only how many and how fast', async () => {
		// The projection is a cadence, never the work. A column carrying the
		// submitted value, the score or the part's mass would make this a read
		// of a student's answers rather than of their timing, and is exactly the
		// shape the whole-set pin above exists to catch. Stated here in words so
		// the intent is not left implied by a list of thirteen strings.
		const declared = await declaredColumns('gauntlet_practice_pressure');
		for (const forbidden of ['value', 'score_metric', 'is_correct', 'email', 'submission_id']) {
			expect(declared).not.toContain(forbidden);
		}
	});
});

// ---------------------------------------------------------------------------
describe('a table widening cannot reach either projection', () => {
	// The distinction `docs/history/anon-coin-public-projections-mrlg0d.md`
	// raised: `returns setof <table>` over `select *` grows with its table and
	// needs no function edit, so the guard worth writing there is a pin on the
	// TABLE's columns. `returns table (...)` over an explicit select list does
	// not, so the guard worth writing is a pin on the FUNCTION -- which is what
	// this file has. Saying which kind each one is, is what stops the two
	// guards being read as the same guard.

	it('declares an explicit result column list on both, with no select * in either body', async () => {
		const { rows } = await db.sql<{ proname: string; result: string; src: string }>(
			`select p.proname,
			        pg_get_function_result(p.oid) as result,
			        p.prosrc as src
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public'
			    and p.proname in ('gauntlet_author_roster', 'gauntlet_practice_pressure')
			  order by p.proname`
		);
		expect(rows.map((r) => r.proname)).toEqual([
			'gauntlet_author_roster',
			'gauntlet_practice_pressure'
		]);
		for (const row of rows) {
			expect(row.result.toLowerCase().startsWith('table(')).toBe(true);
			expect(row.src).not.toMatch(/select\s+\*/i);
		}
	});

	it('has a contrast control: app_short_link_list really is the OTHER kind', async () => {
		// Read from the migration TEXT rather than the catalog, because 0093 is
		// not on this chain and adding a short-link migration to a GAUNTLET
		// fixture to buy one assertion would change what the fixture is. Without
		// this half, "both of ours are the safe kind" is a claim about a
		// category with nothing in it.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'app_short_link_list'`
		);
		expect(Number(rows[0].n)).toBe(0);

		const sql = readFileSync(
			join(REPO_ROOT, 'supabase/migrations/0093_short_links.sql'),
			'utf8'
		);
		expect(sql).toMatch(
			/create\s+or\s+replace\s+function\s+public\.app_short_link_list\(\)\s*\n\s*returns\s+setof\s+public\.app_short_links/i
		);
	});
});
