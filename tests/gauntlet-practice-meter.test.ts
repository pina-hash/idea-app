// tests/gauntlet-practice-meter.test.ts
//
// 0151: the Speedrun PRACTICE check gets a minimum interval, and an admin gets
// a way to see who has been sitting on it.
//
// WHY THIS FILE EXISTS AT ALL, given that automated tests here are the
// exception. Every guarantee below fails SILENTLY:
//
//   * A guard that stops biting looks exactly like a guard that is working,
//     because the honest path is the one everybody drives and the honest path
//     is meant to sail straight through. Nothing on screen reports a floor that
//     has quietly become zero.
//   * The reverse is worse and equally silent: a floor that has crept up bites
//     an honest student mid-loop, in a free practice check nobody is watching.
//   * The detector's discriminator is three column comparisons standing in for
//     "which code path wrote this row". If a fourth writer ever produces
//     `speedrun` + `manual` + null `room_id`, the meter starts refusing a path
//     it was never meant to touch and the pressure list starts counting rows
//     that are not probes -- and both of those read as normal.
//   * An exclusion assertion ("the knowledge modes are not metered", "a room
//     submit is not practice") comes back clean when the scan is wrong, and
//     clean is what nobody investigates. Every one below is paired with a
//     positive control on the same fixture.
//
// WHAT IT DELIBERATELY DOES NOT ASSERT: that the attack fails. It does not
// fail. 0151 meters and records it; the containment decision is a person's and
// was left open on purpose. A test asserting the attack works would be a
// ratchet that goes red the day somebody closes it, which is exactly the
// failure `docs/history/speedrun-deviation-band-measure-hoqxzz.md` declined to
// commit.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';

/**
 * The GAUNTLET chain as production stands, plus the file under test. 0137 sits
 * where the sibling gauntlet suites put it; every 014x file below it narrows
 * its own grants, and section 5 of 0151 asserts the resulting ACL from the
 * catalog rather than trusting that ordering.
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
	// 0149 is DELIBERATELY ABSENT and is not a dependency: it reconciles SELECT
	// grants on nine VIEWS (coin, notebook and gauntlet) and its own self-check
	// requires all nine to exist, so it cannot apply to a gauntlet-only chain.
	// Nothing it touches is read or written by 0151 -- it names no function and
	// no table this file goes near.
	'0150_gauntlet_connect_run_analysis.sql',
	'0151_gauntlet_meter_practice.sql',
	// 0158 RECONCILES 0151 WITH 0148, AND THIS FILE IS WHY IT HAD TO EXIST.
	// 0151 redefines `gauntlet_submit` from 0147's text and so drops the
	// server-stamped knowledge clock 0148 put in the same function; 0158 is the
	// single body carrying both. It is on this chain because the meter this file
	// tests lives in that body, and a suite that stopped at 0151 would be
	// asserting the meter against a definition nobody will ever run.
	//
	// It is worse than an untested definition, though, and that is the part
	// worth keeping in front of the next reader: the knowledge test below
	// ASSERTED THE REWOUND BEHAVIOUR AS CORRECT for as long as this chain ended
	// at 0151. It submitted three knowledge answers with no start row and
	// required all three to resolve -- which is only true of a body with no
	// clock in it. The chain was manufacturing the evidence for its own
	// assertion.
	'0158_gauntlet_submit_reconcile.sql'
] as const;

/**
 * The chain WITHOUT 0151: the pre-meter world, which is this file's positive
 * control.
 *
 * IT NAMES 0151 RATHER THAN COUNTING FROM THE END. This was
 * `CHAIN.slice(0, -1)`, which means "without 0151" only while 0151 happens to
 * be the last entry -- and appending 0158 above turned it into "without 0158",
 * leaving 0151 applied and the control asserting the opposite of its own name.
 * Measured, not feared: that is exactly what happened when 0158 was added, and
 * the failure read as a behavioural change rather than as a chain that had
 * stopped meaning what it said. The same defect was found and fixed in
 * `gauntlet-run-review-route.test.ts` one bundle earlier; this is its twin.
 *
 * A TRUNCATION AND NOT A FILTER, deliberately: 0158 refuses to apply without
 * `_gauntlet_practice_min_interval()`, so a database that has not applied 0151
 * cannot have 0158 either. Filtering 0151 out of the middle would build a
 * state no operator can reach.
 */
const CHAIN_BEFORE = CHAIN.slice(
	0,
	CHAIN.indexOf('0151_gauntlet_meter_practice.sql')
) as unknown as string[];

// `indexOf` returning -1 would make the slice above an EMPTY chain, which
// fails in a way that reads as a harness fault rather than a renamed file.
if (!CHAIN.includes('0151_gauntlet_meter_practice.sql')) {
	throw new Error('CHAIN_BEFORE cannot be derived: 0151 is not on CHAIN.');
}

// ---------------------------------------------------------------------------
// The level. Nothing here is round, so a recovered number could not have come
// from a default, a fixture elsewhere, or a coincidence.
// ---------------------------------------------------------------------------
const TARGET_VOLUME_MM3 = 73412.8391;
const DENSITY_G_CM3 = 2.7;
const TOLERANCE_PCT = 0.1;
const TARGET_MASS_G = (TARGET_VOLUME_MM3 / 1000) * DENSITY_G_CM3;
/** A clear miss, so a check is a check and never an accidental pass. */
const MISS_MASS_G = 150.25;

/**
 * The floor 0151 enforces, in milliseconds. Read from the MIGRATION at run time
 * rather than written down here: a constant retyped into a test is a constant
 * that agrees with itself and with nothing else, and the whole point of
 * `_gauntlet_practice_min_interval()` is that there is one copy of this number.
 */
let FLOOR_MS = 0;

interface World {
	db: TestDb;
	student: SeededUser;
	other: SeededUser;
	admin: SeededUser;
	speedrunId: string;
	otherSpeedrunId: string;
	knowledgeId: string;
	roomId: string;
}

async function seed(db: TestDb): Promise<World> {
	const student = await createUser(db, 'student@boscotech.net', 'Practice Student');
	const other = await createUser(db, 'other@boscotech.net', 'Other Student');
	const admin = await createUser(db, 'chair@boscotech.edu', 'The Chair');
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		'chair@boscotech.edu'
	]);

	const prompt = {
		material: 'Aluminium 6061',
		density: DENSITY_G_CM3,
		unit_system: 'MMGS',
		drawing: '<svg/>'
	};
	const answer = {
		target_volume_mm3: TARGET_VOLUME_MM3,
		target_mass: TARGET_MASS_G,
		density: DENSITY_G_CM3,
		tolerance_pct: TOLERANCE_PCT,
		drawing: '<svg/>'
	};

	const mkSpeedrun = async (title: string) => {
		// `published` is DERIVED from `status` by 0009's trigger; setting the
		// boolean directly is silently ignored.
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
			 values ('speedrun', $1, 2, $2::jsonb, $3::jsonb, 'published') returning id`,
			[title, JSON.stringify(prompt), JSON.stringify(answer)]
		);
		return rows[0].id;
	};

	const speedrunId = await mkSpeedrun('Metered Fixture');
	const otherSpeedrunId = await mkSpeedrun('Second Part');

	// A knowledge challenge on the same fixture: the positive control for
	// "the meter is scoped to the practice branch".
	const knowledge = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
		 values ('drawing_reading', 'Knowledge Fixture', 1, $1::jsonb, $2::jsonb, 'published')
		 returning id`,
		[JSON.stringify({ drawing: '<svg/>' }), JSON.stringify({ type: 'text', correct: 'x' })]
	);

	const room = await db.sql<{ id: string }>(
		`insert into public.gauntlet_rooms (host_id, join_code, current_challenge_id, state)
		 values ($1, 'ROOMCODE', $2, 'live') returning id`,
		[admin.id, speedrunId]
	);

	return {
		db,
		student,
		other,
		admin,
		speedrunId,
		otherSpeedrunId,
		knowledgeId: knowledge.rows[0].id,
		roomId: room.rows[0].id
	};
}

// ---------------------------------------------------------------------------
// Driving helpers. `check` is the real RPC through the real role switch.
// ---------------------------------------------------------------------------

type CheckResult = { ok: true; row: Record<string, unknown> } | { ok: false; message: string };

async function check(
	w: World,
	who: SeededUser,
	challengeId: string,
	mass: number
): Promise<CheckResult> {
	try {
		const out = await w.db.asUser(who.id, (q) =>
			q<{ r: Record<string, unknown> }>(
				`select public.gauntlet_submit($1::uuid, jsonb_build_object('mass', $2::text)) as r`,
				[challengeId, String(mass)]
			)
		);
		return { ok: true, row: out.rows[0].r };
	} catch (err) {
		return { ok: false, message: err instanceof Error ? err.message : String(err) };
	}
}

/**
 * Age this caller's practice rows on this challenge, so a cadence can be driven
 * without a test that sleeps. It moves `created_at` on rows that ALREADY EXIST;
 * it never inserts one, so every row the guard reads was written by the real
 * RPC.
 */
async function ageChecks(w: World, who: SeededUser, challengeId: string, ms: number) {
	await w.db.sql(
		`update public.submissions
		 set created_at = created_at - make_interval(secs => $3::float8)
		 where user_id = $1 and challenge_id = $2
		   and mode = 'speedrun' and source = 'manual' and room_id is null`,
		[who.id, challengeId, ms / 1000]
	);
}

/**
 * Put this caller's last practice check at an exact age. `ageChecks` subtracts
 * from `created_at` and therefore races the wall clock -- the round trip that
 * did the ageing is itself elapsed time -- which made a boundary test read one
 * side of the floor as the other. This sets the age ABSOLUTELY against the
 * server's own clock, so the only slack in a boundary assertion is the one the
 * assertion names.
 */
async function setLastCheckAge(w: World, who: SeededUser, challengeId: string, ms: number) {
	await w.db.sql(
		`update public.submissions
		 set created_at = now() - make_interval(secs => $3::float8)
		 where user_id = $1 and challenge_id = $2
		   and mode = 'speedrun' and source = 'manual' and room_id is null`,
		[who.id, challengeId, ms / 1000]
	);
}

/** How many practice rows this caller has on this challenge. */
async function practiceRows(w: World, who: SeededUser, challengeId: string): Promise<number> {
	const { rows } = await w.db.sql<{ n: string }>(
		`select count(*)::text as n from public.submissions
		 where user_id = $1 and challenge_id = $2
		   and mode = 'speedrun' and source = 'manual' and room_id is null`,
		[who.id, challengeId]
	);
	return Number(rows[0].n);
}

interface PressureRow {
	user_id: string;
	player: string | null;
	challenge_id: string;
	challenge_title: string | null;
	checks: string;
	fastest_gap_ms: string | null;
	median_gap_ms: string | null;
	at_floor_gaps: string;
	longest_burst: string;
	passes: string;
}

async function pressure(
	w: World,
	who: SeededUser,
	args: { sinceHours?: number; minChecks?: number; limit?: number } = {}
): Promise<PressureRow[]> {
	const out = await w.db.asUser(who.id, (q) =>
		q<PressureRow>(
			`select * from public.gauntlet_practice_pressure($1::int, $2::int, $3::int)`,
			[args.sinceHours ?? 168, args.minChecks ?? 20, args.limit ?? 100]
		)
	);
	return out.rows;
}

/**
 * Write practice rows straight into the table at chosen instants. Used ONLY to
 * build a history for the DETECTOR, which is a pure read -- never to test the
 * guard, which is driven through the real RPC above. The triple written here is
 * the same triple `gauntlet_submit` writes, and `discriminator` below is the
 * test that says so.
 */
async function seedHistory(
	w: World,
	who: SeededUser,
	challengeId: string,
	gapsMs: number[],
	opts: { correct?: boolean } = {}
) {
	// Start far enough back that the whole series lands inside the window.
	let offsetMs = gapsMs.reduce((a, b) => a + b, 0) + 60_000;
	await w.db.sql(
		`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, created_at)
		 values ($1, $2, 'speedrun', '{}'::jsonb, $3, 0, now() - make_interval(secs => $4::float8))`,
		[who.id, challengeId, opts.correct ?? false, offsetMs / 1000]
	);
	for (const gap of gapsMs) {
		offsetMs -= gap;
		await w.db.sql(
			`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, created_at)
			 values ($1, $2, 'speedrun', '{}'::jsonb, $3, 0, now() - make_interval(secs => $4::float8))`,
			[who.id, challengeId, opts.correct ?? false, offsetMs / 1000]
		);
	}
}

// ---------------------------------------------------------------------------

let w: World;
let before: World;

beforeAll(async () => {
	// SEQUENTIALLY, never Promise.all: both databases live on one shared cluster
	// and the stub's `create role ... if not exists` guards race each other
	// across concurrent connections (CLAUDE.md, the parallelism trap).
	w = await seed(await startTestDb([...CHAIN]));
	before = await seed(await startTestDb(CHAIN_BEFORE));

	const { rows } = await w.db.sql<{ ms: string }>(
		`select (extract(epoch from public._gauntlet_practice_min_interval()) * 1000)::text as ms`
	);
	FLOOR_MS = Number(rows[0].ms);
}, 300_000);

afterAll(async () => {
	await w?.db.stop();
	await before?.db.stop();
});

// ---------------------------------------------------------------------------

describe('the floor exists and is one number', () => {
	it('is a positive interval, and the test reads it rather than restating it', () => {
		expect(FLOOR_MS).toBeGreaterThan(0);
	});

	it('is small enough that no honest loop meets it, and large enough to beat a double click', () => {
		// The header's argument, pinned as a RANGE rather than as the literal:
		// below a second and a double click sails through; above a couple of
		// seconds and a student who read the banner and retyped starts meeting a
		// refusal in the free practice loop. Either edge is a real defect and
		// neither is visible from a passing feature.
		expect(FLOOR_MS).toBeGreaterThanOrEqual(1_000);
		expect(FLOOR_MS).toBeLessThanOrEqual(3_000);
	});

	it('is written down exactly once', async () => {
		// The guard and the detector must read the same helper. Two literals is
		// how an enforced floor and the floor a burst is counted against stop
		// being the same number.
		const { rows } = await w.db.sql<{ src: string }>(
			`select p.prosrc as src from pg_catalog.pg_proc p
			 join pg_catalog.pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and p.proname in ('gauntlet_submit', 'gauntlet_practice_pressure')`
		);
		expect(rows).toHaveLength(2);
		for (const r of rows) {
			expect(r.src).toContain('_gauntlet_practice_min_interval()');
		}
	});
});

describe('the interval bites', () => {
	it('refuses a second check inside the floor, and records nothing for it', async () => {
		const first = await check(w, w.student, w.speedrunId, MISS_MASS_G);
		expect(first.ok).toBe(true);
		expect(await practiceRows(w, w.student, w.speedrunId)).toBe(1);

		const second = await check(w, w.student, w.speedrunId, MISS_MASS_G + 1);
		expect(second.ok).toBe(false);

		// A refused call rolls back whole: the guard raises before the insert.
		expect(await practiceRows(w, w.student, w.speedrunId)).toBe(1);
	});

	it('brackets the floor from both sides, 200ms either way', async () => {
		// A two-sided boundary, which is what says the floor is AT the interval
		// rather than merely somewhere near it. 200ms of slack on each side is
		// the RPC round trip, named rather than hidden: a tighter bracket here
		// measures the network.
		const u = await createUser(w.db, 'edge@boscotech.net', 'Edge Case');
		expect((await check(w, u, w.speedrunId, MISS_MASS_G)).ok).toBe(true);

		await setLastCheckAge(w, u, w.speedrunId, FLOOR_MS - 200);
		expect((await check(w, u, w.speedrunId, MISS_MASS_G)).ok, 'inside the floor').toBe(false);

		await setLastCheckAge(w, u, w.speedrunId, FLOOR_MS + 200);
		expect((await check(w, u, w.speedrunId, MISS_MASS_G)).ok, 'outside the floor').toBe(true);
	});

	it('is per challenge: a second part is never blocked by the first', async () => {
		const u = await createUser(w.db, 'twoparts@boscotech.net', 'Two Parts');
		expect((await check(w, u, w.speedrunId, MISS_MASS_G)).ok).toBe(true);
		// Immediately, with no ageing at all.
		expect((await check(w, u, w.otherSpeedrunId, MISS_MASS_G)).ok).toBe(true);
	});

	it('is per student: one student cannot block another', async () => {
		const a = await createUser(w.db, 'a@boscotech.net', 'Student A');
		const b = await createUser(w.db, 'b@boscotech.net', 'Student B');
		expect((await check(w, a, w.otherSpeedrunId, MISS_MASS_G)).ok).toBe(true);
		expect((await check(w, b, w.otherSpeedrunId, MISS_MASS_G)).ok).toBe(true);
	});

	it('did not exist before 0151 -- the positive control on the whole file', async () => {
		// Without this control every refusal above could be some pre-existing
		// guard, and the file would prove nothing about 0151.
		const u = await createUser(before.db, 'rapid@boscotech.net', 'Rapid');
		expect((await check(before, u, before.speedrunId, MISS_MASS_G)).ok).toBe(true);
		expect((await check(before, u, before.speedrunId, MISS_MASS_G + 1)).ok).toBe(true);
		expect((await check(before, u, before.speedrunId, MISS_MASS_G + 2)).ok).toBe(true);
		expect(await practiceRows(before, u, before.speedrunId)).toBe(3);
	});
});

describe('the honest loop does not notice', () => {
	it('passes an honest cadence indefinitely, with no budget to run out of', async () => {
		// 40 checks at a cadence far slower than the floor and far FASTER than a
		// real modelling loop. If anything count-shaped had been built instead of
		// a rate, this is where it would surface.
		const u = await createUser(w.db, 'honest@boscotech.net', 'Honest Student');
		const cadenceMs = FLOOR_MS * 3;
		for (let i = 0; i < 40; i++) {
			const r = await check(w, u, w.speedrunId, MISS_MASS_G + i);
			expect(r.ok, `check ${i + 1} of 40 was refused`).toBe(true);
			await ageChecks(w, u, w.speedrunId, cadenceMs);
		}
		expect(await practiceRows(w, u, w.speedrunId)).toBe(40);
	});

	it('still teaches: the band and the pass verdict are 0147s, untouched', async () => {
		const u = await createUser(w.db, 'coached@boscotech.net', 'Coached');
		const miss = await check(w, u, w.speedrunId, MISS_MASS_G);
		expect(miss.ok).toBe(true);
		if (miss.ok) {
			expect(miss.row.is_correct).toBe(false);
			expect(typeof miss.row.deviation_band).toBe('string');
			// 0147's disclosure rule is not weakened by this file.
			expect(miss.row).not.toHaveProperty('target_mass');
			expect(miss.row).not.toHaveProperty('tolerance_pct');
		}

		await ageChecks(w, u, w.speedrunId, FLOOR_MS * 3);
		const hit = await check(w, u, w.speedrunId, TARGET_MASS_G);
		expect(hit.ok).toBe(true);
		if (hit.ok) expect(hit.row.is_correct).toBe(true);
	});
});

describe('the refusal is written for a person, and names nothing', () => {
	let message = '';

	beforeAll(async () => {
		const u = await createUser(w.db, 'doubleclick@boscotech.net', 'Double Clicker');
		await check(w, u, w.speedrunId, MISS_MASS_G);
		const refused = await check(w, u, w.speedrunId, MISS_MASS_G);
		expect(refused.ok).toBe(false);
		if (!refused.ok) message = refused.message;
	});

	it('names no database object', () => {
		// Every table, column, function and role this path touches, plus the
		// vocabulary a leak would arrive in. Asserted as a SWEEP so a message
		// rewritten later cannot quietly reintroduce one.
		const forbidden = [
			'submissions',
			'challenges',
			'gauntlet_submit',
			'gauntlet_practice_pressure',
			'_gauntlet_practice_min_interval',
			'created_at',
			'user_id',
			'challenge_id',
			'room_id',
			'source',
			'is_correct',
			'deviation_band',
			'public.',
			'select',
			'insert',
			'null',
			'sql',
			'postgres',
			'rls',
			'policy',
			'function',
			'row',
			'table',
			'column',
			'interval',
			'timestamp'
		];
		const lower = message.toLowerCase();
		const hits = forbidden.filter((f) => lower.includes(f));
		expect(hits, `refusal leaked: ${hits.join(', ')} in "${message}"`).toEqual([]);
		// Positive control: the sweep can find something when something is there.
		expect(['submissions', 'part'].filter((f) => 'the submissions part'.includes(f))).toEqual([
			'submissions',
			'part'
		]);
	});

	it('does not sound like an accusation', () => {
		const accusatory = [
			'too many',
			'rate limit',
			'rate-limit',
			'throttl',
			'blocked',
			'denied',
			'forbidden',
			'abuse',
			'suspicious',
			'cheat',
			'violation',
			'exceeded',
			'not allowed',
			'attempt'
		];
		const lower = message.toLowerCase();
		const hits = accusatory.filter((f) => lower.includes(f));
		expect(hits, `refusal reads as an accusation: ${hits.join(', ')}`).toEqual([]);
	});

	it('tells the student what to do next', () => {
		expect(message.toLowerCase()).toContain('check it again');
	});
});

describe('the meter is scoped to the practice branch', () => {
	it('does not meter the knowledge modes -- with a positive control beside it', async () => {
		// THIS TEST USED TO SUBMIT THREE KNOWLEDGE ANSWERS WITH NO START ROW AND
		// ASSERT ALL THREE RESOLVED, AND THAT DESCRIBED THE REVERTED WORLD.
		//
		// 0148 requires a `gauntlet_knowledge_starts` row and refuses without
		// one ("This question was not started on this device..."), so under 0148
		// the FIRST of those three would have raised. It passed only because
		// 0151 redefines `gauntlet_submit` from 0147's text and drops that
		// clock -- this file's own chain was the thing making the assertion
		// true. With 0158 on the chain the clock is back, so the fixture has to
		// start the question the way the deployed client does.
		//
		// THE SUBJECT IS UNCHANGED: still "three back to back, no ageing, all
		// resolve", still proving the two-second floor is not on this branch.
		// Only the setup moved, and it moved toward what a real caller does.
		const u = await createUser(w.db, 'quiz@boscotech.net', 'Quiz Taker');
		const answer = () =>
			w.db.asUser(u.id, (q) =>
				q(`select public.gauntlet_submit($1::uuid, jsonb_build_object('answer', 'x')) as r`, [
					w.knowledgeId
				])
			);

		// THE CLOCK IS STILL THERE. Asserted FIRST, and by its refusal rather than
		// by reading SQL: without a start row this call raises, which is exactly
		// what the old version of this test proved was no longer happening. This
		// is the assertion 0158 exists to make true again, and it is what makes
		// the three resolves below mean "unmetered" rather than "ungated".
		await expect(answer()).rejects.toThrow(/was not started on this device/);

		await w.db.asUser(u.id, (q) =>
			q(`select public.gauntlet_knowledge_start($1::uuid)`, [w.knowledgeId])
		);

		// NOW the original claim, on a started question: three back to back, no
		// ageing at all, none of them metered.
		await expect(answer()).resolves.toBeDefined();
		await expect(answer()).resolves.toBeDefined();
		await expect(answer()).resolves.toBeDefined();

		// POSITIVE CONTROL on the same caller and the same function: the floor is
		// real, it is simply not on this branch. Without this the assertion above
		// would pass just as happily against a guard that had stopped working.
		expect((await check(w, u, w.otherSpeedrunId, MISS_MASS_G)).ok).toBe(true);
		expect((await check(w, u, w.otherSpeedrunId, MISS_MASS_G)).ok).toBe(false);
	});

	it('THE TWO REFUSALS ARE DIFFERENT, and only one of them is the meter', async () => {
		// The other half of "the meter is scoped to the practice branch", and
		// the assertion that would have caught the revert from this file rather
		// than from the clock suite. A knowledge answer with NO start row is
		// refused -- by 0148's clock, not by 0151's floor -- so the two guards
		// on this one function are told apart by the sentence they raise.
		const u = await createUser(w.db, 'unstarted@boscotech.net', 'Never Started');
		const unstarted = w.db.asUser(u.id, (q) =>
			q(`select public.gauntlet_submit($1::uuid, jsonb_build_object('answer', 'x')) as r`, [
				w.knowledgeId
			])
		);
		await expect(unstarted).rejects.toThrow(/not started on this device/i);
		// And it is NOT the meter's sentence, which is what makes this a
		// scoping assertion rather than a duplicate of the clock suite's.
		await expect(
			w.db.asUser(u.id, (q) =>
				q(`select public.gauntlet_submit($1::uuid, jsonb_build_object('answer', 'x')) as r`, [
					w.knowledgeId
				])
			)
		).rejects.not.toThrow(/check it again/i);
	});

	it('scores a knowledge answer on the SERVER clock, which is the half 0151 dropped', async () => {
		// From claude/gauntlet-submit-reconcile-mzqr4t, kept because it asserts the
		// clock BEHAVIOURALLY on the one chain that carries both migrations. The
		// refusal above proves the gate is present; this proves the number it
		// produces is the server's. `gauntlet-knowledge-clock.test.ts` asserts the
		// same thing, but its mutants pin its chain at 0148, so this file is where
		// a future `create or replace` that rewinds the clock over the FULL chain
		// reddens.
		const u = await createUser(w.db, 'clocked@boscotech.net', 'Clocked');
		await w.db.asUser(u.id, (q) =>
			q(`select public.gauntlet_knowledge_start($1::uuid)`, [w.knowledgeId])
		);
		// Age the start row so the server's answer is unmistakably not the
		// client's, and not zero either.
		await w.db.sql(
			`update public.gauntlet_knowledge_starts set started_at = now() - interval '7 seconds'
			  where user_id = $1 and challenge_id = $2`,
			[u.id, w.knowledgeId]
		);
		const out = await w.db.asUser(u.id, (q) =>
			q<{ r: Record<string, unknown> }>(
				`select public.gauntlet_submit($1::uuid, jsonb_build_object('answer', 'x'), $2::int) as r`,
				[w.knowledgeId, 999_999]
			)
		);
		// The browser claimed 999999ms. The server scored ~7s from its own row.
		expect(Number(out.rows[0].r.score_metric)).toBeGreaterThanOrEqual(7);
		expect(Number(out.rows[0].r.score_metric)).toBeLessThan(9);

		const stored = await w.db.sql<{ value: Record<string, unknown> }>(
			`select value from public.submissions where user_id = $1 and challenge_id = $2`,
			[u.id, w.knowledgeId]
		);
		expect(stored.rows[0].value.clock).toBe('server');
		// The client's number is KEPT, as evidence, never as the score.
		expect(stored.rows[0].value.client_elapsed_ms).toBe(999_999);
		expect(Number(stored.rows[0].value.elapsed_ms)).toBeGreaterThanOrEqual(7000);

		// AND THE ZERO CASE, which is the one that would reach production: the
		// deployed client OMITS p_elapsed_ms once its start succeeds. Under the
		// rewound body that omission scores 0.00. Here it scores the real
		// elapsed, because the parameter is not read on this path.
		const u2 = await createUser(w.db, 'omitter@boscotech.net', 'Omitter');
		await w.db.asUser(u2.id, (q) =>
			q(`select public.gauntlet_knowledge_start($1::uuid)`, [w.knowledgeId])
		);
		await w.db.sql(
			`update public.gauntlet_knowledge_starts set started_at = now() - interval '5 seconds'
			  where user_id = $1 and challenge_id = $2`,
			[u2.id, w.knowledgeId]
		);
		const omitted = await w.db.asUser(u2.id, (q) =>
			q<{ r: Record<string, unknown> }>(
				`select public.gauntlet_submit($1::uuid, jsonb_build_object('answer', 'x')) as r`,
				[w.knowledgeId]
			)
		);
		expect(Number(omitted.rows[0].r.score_metric)).toBeGreaterThanOrEqual(5);
	});

	it('does not meter the ranked room path, and a room submit is not practice', async () => {
		const u = await createUser(w.db, 'racer@boscotech.net', 'Racer');
		await w.db.sql(
			`insert into public.gauntlet_run_tokens
				(code, user_id, challenge_id, room_id, reveal_at, expires_at)
			 values ('RACERUN1', $1, $2, $3, now(), now() + interval '1 hour')`,
			[u.id, w.speedrunId, w.roomId]
		);
		// A practice check first, so any leak between the two paths would show.
		expect((await check(w, u, w.speedrunId, MISS_MASS_G)).ok).toBe(true);

		// The room submit, immediately after, is not refused by the practice floor.
		const room = await w.db.asUser(u.id, (q) =>
			q<{ r: Record<string, unknown> }>(
				`select public.gauntlet_room_manual_submit('RACERUN1', $1::numeric) as r`,
				[MISS_MASS_G]
			)
		);
		expect(room.rows[0].r).toBeDefined();

		// And the row it wrote is NOT a practice row: it carries a room_id, which
		// is the whole of why the triple in section 2 identifies one writer.
		expect(await practiceRows(w, u, w.speedrunId)).toBe(1);
	});

	it('a ranked macro row does not hold the practice floor down', async () => {
		// The guard's read names `source = 'manual'`. Drop that term and a
		// student's own ranked submit starts blocking their next practice check,
		// which is the free loop closing behind a feature that never touched it.
		// The row seeded here is exactly what 0147's macro submit writes.
		const u = await createUser(w.db, 'macrorow@boscotech.net', 'Macro Row');
		await w.db.sql(
			`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source)
			 values ($1, $2, 'speedrun', '{}'::jsonb, false, 0, 'macro')`,
			[u.id, w.speedrunId]
		);
		expect((await check(w, u, w.speedrunId, MISS_MASS_G)).ok).toBe(true);
	});

	it('a room row does not hold the practice floor down', async () => {
		// The other term, `room_id is null`. A racer who just submitted in a
		// supervised round must be able to go straight back to practising.
		const u = await createUser(w.db, 'roomrow@boscotech.net', 'Room Row');
		await w.db.sql(
			`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source, room_id)
			 values ($1, $2, 'speedrun', '{}'::jsonb, false, 0, 'manual', $3)`,
			[u.id, w.speedrunId, w.roomId]
		);
		expect((await check(w, u, w.speedrunId, MISS_MASS_G)).ok).toBe(true);
		// Positive control: the floor IS on for this caller, it just does not
		// read those rows.
		expect((await check(w, u, w.speedrunId, MISS_MASS_G)).ok).toBe(false);
	});

	it('the discriminator reaches exactly one writer in the schema', async () => {
		// STRUCTURAL, over the applied catalog rather than over the fixture's
		// rows: a row-shaped version of this assertion takes its expected value
		// from whatever the test happened to seed, which is the one place an
		// expected value must never come from.
		//
		// Every function in the applied chain that writes `submissions` must
		// either name `'macro'` as its source or carry a `room_id` into the
		// insert -- and `gauntlet_submit` is the sole exception, which is exactly
		// what makes (speedrun, manual, null room) mean "the practice branch".
		// A new writer that satisfies neither would silently join the population
		// the meter refuses and the pressure list counts.
		const { rows } = await w.db.sql<{ proname: string; prosrc: string }>(
			`select p.proname, p.prosrc from pg_catalog.pg_proc p
			 join pg_catalog.pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.prosrc like '%insert into public.submissions%'
			 order by p.proname`
		);
		expect(rows.length).toBeGreaterThan(1); // the sweep found writers at all

		const unmarked = rows
			.filter((r) => r.proname !== 'gauntlet_submit')
			.filter((r) => {
				const stmt = r.prosrc.slice(r.prosrc.indexOf('insert into public.submissions'));
				return !/'macro'/.test(stmt) && !/room_id/.test(stmt);
			})
			.map((r) => r.proname);
		expect(unmarked, `writers that would look like practice rows: ${unmarked.join(', ')}`).toEqual(
			[]
		);

		// POSITIVE CONTROL: gauntlet_submit itself is the one that marks neither,
		// so the filter above genuinely distinguishes rather than matching
		// everything.
		const submit = rows.find((r) => r.proname === 'gauntlet_submit')!;
		const submitStmt = submit.prosrc.slice(submit.prosrc.indexOf('insert into public.submissions'));
		expect(/'macro'/.test(submitStmt)).toBe(false);
		expect(/room_id/.test(submitStmt)).toBe(false);
	});
});

describe('concurrency: a double post cannot slip through', () => {
	it('takes the lock on the (student, challenge) pair -- measured as a wait', async () => {
		// WHY THIS SHAPE RATHER THAN A BURST. The obvious test is N simultaneous
		// checks asserting that one is accepted. Measured against a mutant with
		// the lock deleted: two concurrent calls passed, and so did EIGHT, four
		// runs in a row, 31/31 green every time. The role switch and claims
		// round trip ahead of each call stagger them enough that they never
		// overlap inside the guard, so the burst version certifies a function
		// with no lock in it -- the 0134 lesson, that a burst which happens not
		// to overlap passes on the broken code too.
		//
		// So the overlap is MANUFACTURED instead of hoped for: a separate
		// transaction takes the same lock on the same key and holds it, and the
		// measurement is how long the check then waits. With the lock in the
		// function that is most of a second; with it removed the call returns in
		// milliseconds and the assertion below reddens deterministically.
		const u = await createUser(w.db, 'racecond@boscotech.net', 'Race Condition');
		const HOLD_MS = 1_200;

		// Simple protocol (no parameters) so the three statements run as one
		// transaction on one connection; the uuids are server-generated.
		const holder = w.db.sql(
			`begin;
			 select pg_advisory_xact_lock(hashtextextended('${u.id}:${w.speedrunId}', 0));
			 select pg_sleep(${HOLD_MS / 1000});
			 commit;`
		);
		// Let the holder actually acquire before the check goes in.
		await new Promise((r) => setTimeout(r, 250));

		const t0 = Date.now();
		const result = await check(w, u, w.speedrunId, MISS_MASS_G);
		const waitedMs = Date.now() - t0;
		await holder;

		// It waited for the lock rather than sailing past it.
		expect(waitedMs, `the check did not wait for the lock (${waitedMs}ms)`).toBeGreaterThan(500);
		// And once it had the lock it did the ordinary thing.
		expect(result.ok).toBe(true);

		// POSITIVE CONTROL, on the same fixture and the same clock: an
		// UNCONTENDED check on a different challenge is fast. Without this the
		// wait above could be a slow database rather than a held lock.
		const t1 = Date.now();
		expect((await check(w, u, w.otherSpeedrunId, MISS_MASS_G)).ok).toBe(true);
		const uncontendedMs = Date.now() - t1;
		expect(uncontendedMs, `uncontended check was slow (${uncontendedMs}ms)`).toBeLessThan(300);
	}, 30_000);

	it('keys the lock on the pair, so it never serializes two different students', async () => {
		// The key is the student AND the challenge. Keyed on either alone, one
		// student's burst would stall the whole class's practice checks -- which
		// is a performance defect nothing on screen would ever report.
		const a = await createUser(w.db, 'lockpair@boscotech.net', 'Lock Pair');
		const b = await createUser(w.db, 'lockpair2@boscotech.net', 'Lock Pair Two');
		const holder = w.db.sql(
			`begin;
			 select pg_advisory_xact_lock(hashtextextended('${a.id}:${w.speedrunId}', 0));
			 select pg_sleep(1.2);
			 commit;`
		);
		await new Promise((r) => setTimeout(r, 250));
		const t0 = Date.now();
		expect((await check(w, b, w.speedrunId, MISS_MASS_G)).ok).toBe(true);
		const waitedMs = Date.now() - t0;
		await holder;
		expect(waitedMs, `student B waited on student A's lock (${waitedMs}ms)`).toBeLessThan(300);
	}, 30_000);
});

describe('the detector answers "did anyone hammer this"', () => {
	let hammerer: SeededUser;
	let grinder: SeededUser;
	let shortSearch: SeededUser;

	beforeAll(async () => {
		hammerer = await createUser(w.db, 'hammer@boscotech.net', 'Hammer');
		grinder = await createUser(w.db, 'grind@boscotech.net', 'Grinder');
		shortSearch = await createUser(w.db, 'short@boscotech.net', 'Short Search');

		// A machine pinned at the floor: 60 checks, every gap 120ms above it.
		await seedHistory(
			w,
			hammerer,
			w.speedrunId,
			Array.from({ length: 60 }, () => FLOOR_MS + 120)
		);
		// The hardest-working student in the class: 45 checks, minutes apart,
		// irregular. High volume, no burst. This is the row a count-based
		// detector would have put at the top.
		await seedHistory(
			w,
			grinder,
			w.speedrunId,
			Array.from({ length: 45 }, (_, i) => 120_000 + ((i * 37_000) % 400_000))
		);
		// The realistic attack: a strong prior, twelve probes, under any
		// sensible volume floor.
		await seedHistory(
			w,
			shortSearch,
			w.otherSpeedrunId,
			Array.from({ length: 11 }, () => FLOOR_MS + 90)
		);
	});

	it('puts the burst at the top, and the grinder is not it', async () => {
		const rows = await pressure(w, w.admin);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows[0].user_id).toBe(hammerer.id);
		expect(Number(rows[0].longest_burst)).toBe(61);
		expect(Number(rows[0].checks)).toBe(61);

		const grind = rows.find((r) => r.user_id === grinder.id);
		// The grinder IS listed -- 46 checks clears the volume floor -- and that
		// is correct: the list is a place to look, not a verdict. What matters is
		// that the column an admin ranks on tells the two apart.
		expect(grind).toBeDefined();
		expect(Number(grind!.longest_burst)).toBe(0);
		expect(Number(grind!.checks)).toBe(46);
		expect(Number(grind!.median_gap_ms)).toBeGreaterThan(FLOOR_MS * 10);
	});

	it('lists a SHORT search that the volume floor alone would have hidden', async () => {
		const rows = await pressure(w, w.admin, { minChecks: 20 });
		const short = rows.find((r) => r.user_id === shortSearch.id);
		expect(short, 'a 12-probe search fell through the volume floor').toBeDefined();
		expect(Number(short!.checks)).toBe(12);
		expect(Number(short!.longest_burst)).toBe(12);

		// The positive control for that clause: raise the burst floor out of
		// reach by asking only for high volume, and this row is exactly what a
		// count-only detector loses.
		const countOnly = rows.filter((r) => Number(r.checks) >= 20);
		expect(countOnly.some((r) => r.user_id === shortSearch.id)).toBe(false);
	});

	it('reports the gaps it measured, not a verdict', async () => {
		const rows = await pressure(w, w.admin);
		const h = rows.find((r) => r.user_id === hammerer.id)!;
		expect(Number(h.fastest_gap_ms)).toBeGreaterThanOrEqual(FLOOR_MS);
		expect(Number(h.fastest_gap_ms)).toBeLessThan(FLOOR_MS + 500);
		expect(Number(h.at_floor_gaps)).toBe(60);
		expect(h.challenge_title).toBe('Metered Fixture');
		expect(h.player).toBe('Hammer');
	});

	it('carries no email, on any row', async () => {
		const rows = await pressure(w, w.admin);
		expect(rows.length).toBeGreaterThan(0);
		const blob = JSON.stringify(rows);
		expect(blob).not.toContain('@');
		// Positive control: the addresses really are in this database, so the
		// absence above is the function withholding them rather than the fixture
		// having none.
		const { rows: emails } = await w.db.sql<{ email: string }>(
			`select email from public.profiles where email is not null limit 1`
		);
		expect(emails[0].email).toContain('@');
	});

	it('counts only practice rows: a room submit never appears in the pressure', async () => {
		const u = await createUser(w.db, 'roomonly@boscotech.net', 'Room Only');
		await w.db.sql(
			`insert into public.gauntlet_run_tokens
				(code, user_id, challenge_id, room_id, reveal_at, expires_at)
			 values ('ROOMONLY', $1, $2, $3, now(), now() + interval '1 hour')`,
			[u.id, w.speedrunId, w.roomId]
		);
		await w.db.asUser(u.id, (q) =>
			q(`select public.gauntlet_room_manual_submit('ROOMONLY', $1::numeric) as r`, [MISS_MASS_G])
		);
		const rows = await pressure(w, w.admin, { minChecks: 1 });
		expect(rows.some((r) => r.user_id === u.id)).toBe(false);
		// Positive control on the same fixture: minChecks 1 really does list
		// everybody who has a practice row.
		expect(rows.some((r) => r.user_id === hammerer.id)).toBe(true);
	});

	it('honours the window', async () => {
		const wide = await pressure(w, w.admin, { sinceHours: 168, minChecks: 1 });
		expect(wide.some((r) => r.user_id === hammerer.id)).toBe(true);
		// Age the whole burst out of a one-hour window.
		await w.db.sql(
			`update public.submissions set created_at = created_at - interval '3 days'
			 where user_id = $1`,
			[hammerer.id]
		);
		const narrow = await pressure(w, w.admin, { sinceHours: 1, minChecks: 1 });
		expect(narrow.some((r) => r.user_id === hammerer.id)).toBe(false);
		// And it comes back when the window is widened again, so the absence
		// above is the window and not the rows having been destroyed.
		const again = await pressure(w, w.admin, { sinceHours: 168, minChecks: 1 });
		expect(again.some((r) => r.user_id === hammerer.id)).toBe(true);
	});
});

describe('the detector is admin only, and says nothing to anyone else', () => {
	it('gives a student no rows -- the same answer as "nothing was hammered"', async () => {
		const rows = await pressure(w, w.student, { minChecks: 1 });
		expect(rows).toEqual([]);
		// Positive control: the admin, on the identical call, sees rows.
		const adminRows = await pressure(w, w.admin, { minChecks: 1 });
		expect(adminRows.length).toBeGreaterThan(0);
	});

	it('gives a plain teacher no rows either -- teacher is not admin', async () => {
		const teacher = await createUser(w.db, 'teacher@boscotech.edu', 'A Teacher');
		const rows = await pressure(w, teacher, { minChecks: 1 });
		expect(rows).toEqual([]);
	});

	it('is not reachable by anon, and neither is the private interval helper', async () => {
		const { rows } = await w.db.sql<{
			pressure_anon: boolean;
			pressure_auth: boolean;
			helper_anon: boolean;
			helper_auth: boolean;
			submit_anon: boolean;
			submit_auth: boolean;
		}>(
			`select
				has_function_privilege('anon', 'public.gauntlet_practice_pressure(integer, integer, integer)', 'execute') as pressure_anon,
				has_function_privilege('authenticated', 'public.gauntlet_practice_pressure(integer, integer, integer)', 'execute') as pressure_auth,
				has_function_privilege('anon', 'public._gauntlet_practice_min_interval()', 'execute') as helper_anon,
				has_function_privilege('authenticated', 'public._gauntlet_practice_min_interval()', 'execute') as helper_auth,
				has_function_privilege('anon', 'public.gauntlet_submit(uuid, jsonb, integer)', 'execute') as submit_anon,
				has_function_privilege('authenticated', 'public.gauntlet_submit(uuid, jsonb, integer)', 'execute') as submit_auth`
		);
		const r = rows[0];
		expect(r.pressure_anon).toBe(false);
		expect(r.pressure_auth).toBe(true);
		expect(r.helper_anon).toBe(false);
		expect(r.helper_auth).toBe(false);
		// 0147's narrowing survived this file's create-or-replace (the 0137 rule).
		expect(r.submit_anon).toBe(false);
		expect(r.submit_auth).toBe(true);
	});
});

describe('the file itself', () => {
	it('leaves exactly one gauntlet_submit overload', async () => {
		const { rows } = await w.db.sql<{ n: string }>(
			`select count(*)::text as n from pg_catalog.pg_proc p
			 join pg_catalog.pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'gauntlet_submit'`
		);
		expect(Number(rows[0].n)).toBe(1);
	});

	it('re-applies cleanly, and a re-paste changes nothing', async () => {
		const countBefore = await practiceRows(w, w.student, w.speedrunId);
		const fresh = await startTestDb([...CHAIN, '0151_gauntlet_meter_practice.sql']);
		try {
			const { rows } = await fresh.sql<{ n: string }>(
				`select count(*)::text as n from pg_catalog.pg_proc p
				 join pg_catalog.pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public'
				   and p.proname in ('gauntlet_submit', 'gauntlet_practice_pressure',
				                     '_gauntlet_practice_min_interval')`
			);
			expect(Number(rows[0].n)).toBe(3);
		} finally {
			await fresh.stop();
		}
		expect(await practiceRows(w, w.student, w.speedrunId)).toBe(countBefore);
	}, 300_000);

	it('states in its own header that it does not prevent forgery', async () => {
		const { readFileSync } = await import('node:fs');
		const text = readFileSync('supabase/migrations/0151_gauntlet_meter_practice.sql', 'utf8');
		// The one sentence that must survive every future edit of this file: the
		// next reader must not take metering for closure.
		expect(text).toContain('THIS DOES NOT PREVENT FORGERY. IT MAKES IT SLOW AND VISIBLE.');
		// And it must not claim the board decision was made here.
		expect(text).toContain('THE CLOSURE DECISION IS NOT MADE HERE.');
	});
});
