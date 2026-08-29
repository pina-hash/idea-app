// tests/gauntlet-class-stat-floor.test.ts
//
// 0150: the k-anonymity floor on `gauntlet_class_run_stats`, and the drop of
// `gauntlet_log_speedrun_attempt`.
//
// WHY THIS FILE EXISTS AT ALL. A class median is other students' work, and the
// failure it protects against is SILENT in exactly the way CLAUDE.md reserves a
// test for: a floor that is off by one, counts runs instead of students, or is
// checked once for three different populations still renders a plausible number
// on screen. Nobody looking at "Time: 4:12 vs 3:58 median" can tell whether that
// median came from thirty classmates or from one classmate's four attempts.
//
// THE FOUR PROPERTIES ASSERTED, each with a positive control beside it so an
// absence can never pass vacuously:
//   1. Below the floor -> null. (Control: one more peer -> a number.)
//   2. The floor counts DISTINCT STUDENTS, not runs. (Control: the same run
//      count spread over enough students -> a number.)
//   3. The caller is excluded from both the count and the median.
//   4. Each statistic carries its OWN count: a population that clears the floor
//      must not license one that does not.
//
// AND ONE STRUCTURAL PAIR: the dropped logger is gone, and the new function is
// executable by `authenticated` and NOT by `anon` (0137's rule -- a new function
// arrives granted to anon under the project's default privileges unless its own
// migration names the roles, and the fixture carries those defaults).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render } from 'svelte/server';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';
import PostRunAnalysis from '../src/lib/gauntlet/PostRunAnalysis.svelte';
import type { RunEvent, TelemetryTargets } from '../src/lib/gauntlet';

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
	'0147_gauntlet_close_target_disclosure.sql',
	'0150_gauntlet_connect_run_analysis.sql'
] as const;

/** The floor 0150 states. Read from the database, never written down twice. */
let FLOOR = 0;

let db: TestDb;
let me: SeededUser;
let challengeId: string;
/** A deep bench of peers; each test enrolls only as many as it needs. */
const peers: SeededUser[] = [];

interface Stats {
	median_elapsed_ms: number | null;
	median_features: number | null;
	median_stuck_ms: number | null;
	peers_elapsed: number;
	peers_features: number;
	peers_stuck: number;
	floor: number;
}

const stats = (viewer: string, cid: string = challengeId) =>
	db.asUser(viewer, async (q) => {
		const { rows } = await q<{ s: Stats }>(
			`select public.gauntlet_class_run_stats($1::uuid) as s`,
			[cid]
		);
		return rows[0].s;
	});

/** A PASSED attempt with a given elapsed time, seeded past the triggers. */
async function seedAttempt(user: SeededUser, elapsedMs: number, cid = challengeId) {
	await db.sql(
		`insert into public.gauntlet_speedrun_attempts
			(run_id, user_id, challenge_id, elapsed_ms, result)
		 values (gen_random_uuid(), $1, $2, $3, 'passed')`,
		[user.id, cid, elapsedMs]
	);
}

/** A run-analysis summary row carrying a feature count. */
async function seedAnalysis(user: SeededUser, featureCount: number, cid = challengeId) {
	await db.sql(
		`insert into public.gauntlet_run_analysis (run_id, user_id, challenge_id, feature_count)
		 values (gen_random_uuid(), $1, $2, $3)`,
		[user.id, cid, featureCount]
	);
}

/**
 * A run whose LONGEST DWELL is `stuckMs`: two feature_add events `stuckMs`
 * apart, then a shorter tail to the run's final event. Built through the real
 * column shape so the SQL window computation sees what a real stream looks like.
 */
async function seedRun(user: SeededUser, stuckMs: number, cid = challengeId) {
	const { rows } = await db.sql<{ id: string }>(`select gen_random_uuid() as id`);
	const runId = rows[0].id;
	const ev = (seq: number, t: number, type: string) =>
		db.sql(
			`insert into public.gauntlet_run_events (run_id, user_id, challenge_id, seq, t_ms, event_type)
			 values ($1, $2, $3, $4, $5, $6)`,
			[runId, user.id, cid, seq, t, type]
		);
	await ev(1, 0, 'run_start');
	await ev(2, 1000, 'feature_add');
	await ev(3, 1000 + stuckMs, 'feature_add');
	await ev(4, 1000 + stuckMs + 500, 'run_end');
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	const { rows: floorRows } = await db.sql<{ f: number }>(
		`select public._gauntlet_class_stat_floor() as f`
	);
	FLOOR = floorRows[0].f;

	me = await createUser(db, 'viewer@boscotech.net', 'Viewer Student');
	// Comfortably more peers than the floor, so a test can add one at a time.
	for (let i = 0; i < FLOOR + 4; i++) {
		peers.push(await createUser(db, `peer${i}@boscotech.net`, `Peer ${i}`));
	}

	const { rows } = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
		 values ('speedrun', 'Floor Fixture', 2, '{}'::jsonb, '{}'::jsonb, 'published')
		 returning id`
	);
	challengeId = rows[0].id;
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

describe('0150 structure', () => {
	it('drops gauntlet_log_speedrun_attempt entirely', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and p.proname = 'gauntlet_log_speedrun_attempt'`
		);
		expect(Number(rows[0].n)).toBe(0);
	});

	it('grants the aggregate to authenticated and NOT to anon', async () => {
		const { rows } = await db.sql<{ anon: boolean; authed: boolean; svc: boolean }>(
			`select
				has_function_privilege('anon', 'public.gauntlet_class_run_stats(uuid)', 'execute') as anon,
				has_function_privilege('authenticated', 'public.gauntlet_class_run_stats(uuid)', 'execute') as authed,
				has_function_privilege('service_role', 'public.gauntlet_class_run_stats(uuid)', 'execute') as svc`
		);
		// The positive control sits in the same row: `authed` true is what proves
		// `anon` false is a narrowing rather than a function nobody can reach.
		expect(rows[0].authed).toBe(true);
		expect(rows[0].anon).toBe(false);
		expect(rows[0].svc).toBe(false);
	});

	it('has exactly one overload (the signature trap)', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and p.proname = 'gauntlet_class_run_stats'`
		);
		expect(Number(rows[0].n)).toBe(1);
	});

	it('states a floor above the "an aggregate over three is a named person" line', () => {
		expect(FLOOR).toBeGreaterThan(3);
	});
});

describe('the floor withholds a median until enough DISTINCT peers contribute', () => {
	it('is null one peer below the floor, and a number one peer above it', async () => {
		// Exactly FLOOR-1 distinct peers, one passing attempt each.
		for (let i = 0; i < FLOOR - 1; i++) await seedAttempt(peers[i], 60_000 + i * 1000);

		const under = await stats(me.id);
		expect(under.floor).toBe(FLOOR);
		expect(under.peers_elapsed).toBe(0);
		expect(under.median_elapsed_ms).toBeNull();

		// POSITIVE CONTROL: one more distinct peer and the same call answers.
		await seedAttempt(peers[FLOOR - 1], 60_000 + (FLOOR - 1) * 1000);
		const over = await stats(me.id);
		expect(over.peers_elapsed).toBe(FLOOR);
		expect(over.median_elapsed_ms).not.toBeNull();
		expect(Number(over.median_elapsed_ms)).toBeGreaterThan(0);
	});

	it('counts students, not runs: many attempts by too few people stay null', async () => {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
			 values ('speedrun', 'Runs Not Students', 2, '{}'::jsonb, '{}'::jsonb, 'published')
			 returning id`
		);
		const cid = rows[0].id;

		// FLOOR + 5 ATTEMPTS spread over only THREE students. A floor that counted
		// rows would clear here; a floor that counts people must not.
		for (let i = 0; i < FLOOR + 5; i++) {
			await seedAttempt(peers[i % 3], 50_000 + i * 100, cid);
		}
		const thin = await stats(me.id, cid);
		expect(thin.peers_elapsed).toBe(0);
		expect(thin.median_elapsed_ms).toBeNull();

		// POSITIVE CONTROL: the same total attempt count, now spread over enough
		// distinct students, does clear.
		for (let i = 3; i < FLOOR + 1; i++) await seedAttempt(peers[i], 50_000 + i * 100, cid);
		const wide = await stats(me.id, cid);
		expect(wide.peers_elapsed).toBeGreaterThanOrEqual(FLOOR);
		expect(wide.median_elapsed_ms).not.toBeNull();
	});

	it('counts students, not runs, on ALL THREE populations', async () => {
		// The elapsed case is proven above. The other two have their own per-student
		// collapse (`min(feature_count)` and `min(stuck_ms)`) and would each fail
		// independently: a mutation dropping only the DWELL collapse passed a
		// version of this file that tested elapsed alone, because every fixture
		// there happened to seed one run per peer.
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
			 values ('speedrun', 'Runs Not Students, All Three', 2, '{}'::jsonb, '{}'::jsonb, 'published')
			 returning id`
		);
		const cid = rows[0].id;

		// THREE students, many runs each, on every population at once.
		for (let i = 0; i < FLOOR + 5; i++) {
			const who = peers[i % 3];
			await seedAttempt(who, 50_000 + i * 100, cid);
			await seedAnalysis(who, 5 + i, cid);
			await seedRun(who, 10_000 + i * 250, cid);
		}
		const thin = await stats(me.id, cid);
		expect(thin.peers_elapsed).toBe(0);
		expect(thin.peers_features).toBe(0);
		expect(thin.peers_stuck).toBe(0);
		expect(thin.median_elapsed_ms).toBeNull();
		expect(thin.median_features).toBeNull();
		expect(thin.median_stuck_ms).toBeNull();

		// POSITIVE CONTROL: spread over enough distinct students, all three answer.
		for (let i = 3; i < FLOOR + 1; i++) {
			await seedAttempt(peers[i], 50_000, cid);
			await seedAnalysis(peers[i], 6, cid);
			await seedRun(peers[i], 11_000, cid);
		}
		const wide = await stats(me.id, cid);
		expect(wide.peers_elapsed).toBeGreaterThanOrEqual(FLOOR);
		expect(wide.peers_features).toBeGreaterThanOrEqual(FLOOR);
		expect(wide.peers_stuck).toBeGreaterThanOrEqual(FLOOR);
		expect(wide.median_elapsed_ms).not.toBeNull();
		expect(wide.median_features).not.toBeNull();
		expect(wide.median_stuck_ms).not.toBeNull();
	});

	it('excludes the caller from both the count and the median', async () => {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
			 values ('speedrun', 'Caller Excluded', 2, '{}'::jsonb, '{}'::jsonb, 'published')
			 returning id`
		);
		const cid = rows[0].id;

		// FLOOR-1 peers plus the CALLER. If the caller counted, this would clear.
		for (let i = 0; i < FLOOR - 1; i++) await seedAttempt(peers[i], 70_000, cid);
		await seedAttempt(me, 70_000, cid);

		const s = await stats(me.id, cid);
		expect(s.peers_elapsed).toBe(0);
		expect(s.median_elapsed_ms).toBeNull();

		// POSITIVE CONTROL: seen by a DIFFERENT viewer, the caller's own run is a
		// peer run, so the identical data clears the floor. The same rows, a
		// different reader, a different answer -- which is the exclusion working.
		const other = await stats(peers[FLOOR].id, cid);
		expect(other.peers_elapsed).toBe(FLOOR);
		expect(other.median_elapsed_ms).not.toBeNull();
	});

	it('the caller\'s own value never moves the median', async () => {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
			 values ('speedrun', 'Median Excludes Caller', 2, '{}'::jsonb, '{}'::jsonb, 'published')
			 returning id`
		);
		const cid = rows[0].id;

		// An odd number of peers all on the same time: the median is that time.
		const PEER_MS = 90_000;
		for (let i = 0; i < FLOOR + 2; i++) await seedAttempt(peers[i], PEER_MS, cid);
		const before = await stats(me.id, cid);
		expect(Number(before.median_elapsed_ms)).toBe(PEER_MS);

		// The caller posts a wildly different time. A median that included them
		// would move; this one must not.
		await seedAttempt(me, 5_000, cid);
		const after = await stats(me.id, cid);
		expect(Number(after.median_elapsed_ms)).toBe(PEER_MS);
		expect(after.peers_elapsed).toBe(before.peers_elapsed);
	});

	it('holds the floor PER STATISTIC: a full population never licenses a thin one', async () => {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
			 values ('speedrun', 'Per Statistic', 2, '{}'::jsonb, '{}'::jsonb, 'published')
			 returning id`
		);
		const cid = rows[0].id;

		// Times: a full population. Features: TWO students. Dwell: TWO students.
		for (let i = 0; i < FLOOR + 2; i++) await seedAttempt(peers[i], 80_000 + i * 10, cid);
		await seedAnalysis(peers[0], 7, cid);
		await seedAnalysis(peers[1], 9, cid);
		await seedRun(peers[0], 30_000, cid);
		await seedRun(peers[1], 40_000, cid);

		const s = await stats(me.id, cid);
		expect(s.median_elapsed_ms).not.toBeNull();
		expect(s.peers_elapsed).toBeGreaterThanOrEqual(FLOOR);
		// The two thin statistics must be independently withheld.
		expect(s.median_features).toBeNull();
		expect(s.peers_features).toBe(0);
		expect(s.median_stuck_ms).toBeNull();
		expect(s.peers_stuck).toBe(0);

		// POSITIVE CONTROL: fill both thin populations to the floor and they answer.
		for (let i = 2; i < FLOOR; i++) {
			await seedAnalysis(peers[i], 8, cid);
			await seedRun(peers[i], 35_000, cid);
		}
		const full = await stats(me.id, cid);
		expect(full.median_features).not.toBeNull();
		expect(full.peers_features).toBeGreaterThanOrEqual(FLOOR);
		expect(full.median_stuck_ms).not.toBeNull();
		expect(full.peers_stuck).toBeGreaterThanOrEqual(FLOOR);
	});

	it('answers an unknown challenge exactly as it answers a thin one (no probe)', async () => {
		const unknown = await stats(me.id, '00000000-0000-0000-0000-000000000000');
		expect(unknown.median_elapsed_ms).toBeNull();
		expect(unknown.median_features).toBeNull();
		expect(unknown.median_stuck_ms).toBeNull();
		expect(unknown.peers_elapsed).toBe(0);
		expect(unknown.peers_features).toBe(0);
		expect(unknown.peers_stuck).toBe(0);
		expect(unknown.floor).toBe(FLOOR);
	});
});

describe('the aggregate returns no per-person anything', () => {
	it('carries no user id, email, run id or name in its payload', async () => {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
			 values ('speedrun', 'No Identity', 2, '{}'::jsonb, '{}'::jsonb, 'published')
			 returning id`
		);
		const cid = rows[0].id;
		for (let i = 0; i < FLOOR + 2; i++) {
			await seedAttempt(peers[i], 40_000 + i * 137, cid);
			await seedAnalysis(peers[i], 6 + i, cid);
			await seedRun(peers[i], 20_000 + i * 500, cid);
		}

		const s = await stats(me.id, cid);
		// POSITIVE CONTROL: this payload is populated, so the absences below are
		// absences from a real answer rather than from an empty one.
		expect(s.median_elapsed_ms).not.toBeNull();
		expect(s.median_features).not.toBeNull();
		expect(s.median_stuck_ms).not.toBeNull();

		const blob = JSON.stringify(s);
		for (const p of peers.slice(0, FLOOR + 2)) {
			expect(blob).not.toContain(p.id);
			expect(blob).not.toContain(p.email);
		}
		// Only the seven documented keys, so a field cannot be added unnoticed.
		expect(Object.keys(s).sort()).toEqual(
			[
				'floor',
				'median_elapsed_ms',
				'median_features',
				'median_stuck_ms',
				'peers_elapsed',
				'peers_features',
				'peers_stuck'
			].sort()
		);
	});
});

// ---------------------------------------------------------------------------
// The dwell median is a SECOND STATEMENT of the component's "longest dwell",
// which this repo normally refuses. It is here because the per-student half
// cannot run in a browser at all (RLS returns one student's rows), so the only
// available guard is to put the SAME stream through both and require the same
// answer. Without this the two drift silently: a median computed one way is
// compared on screen against a run computed the other, and every student is
// told they are faster or slower than they are.
//
// IT TAKES TWO FIXTURES, AND THE FIRST DRAFT OF THIS TEST TOOK ONE AND PROVED
// NOTHING. A single stream has a single maximum, so it exercises exactly one of
// the two branches that can be wrong -- with the max sitting on a middle gap,
// deleting the `coalesce(..., end_ms)` tail and dropping the `event_type =
// 'feature_add'` filter BOTH left the answer unchanged and the test green.
// Measured, on this file: both mutations passed 12/12. So:
//   * TAIL exercises `coalesce(lead(...), end_ms)`: the largest dwell is the
//     last feature's, which has no next feature and must run to the run's end.
//   * NOISE exercises the event-type filter: the largest gap in the stream is
//     between non-feature events and must NOT be counted, so a scan over every
//     event answers differently from the component, which only reads
//     feature_add.
// ---------------------------------------------------------------------------
describe('the SQL dwell mirrors the component\'s own dwell', () => {
	const targets: TelemetryTargets = {
		targetVolumeMm3: null, densityGcm3: null, targetMassLevel: null,
		massUnit: 'g', unitSystem: 'MMGS', parTime: null, parFeatures: null
	};

	/**
	 * The component's own answer, read off the real component. Its callout prints
	 * `toFixed(1)` seconds, so this readback has 100ms granularity -- every
	 * fixture gap below is therefore a whole tenth of a second, and the SQL side
	 * is asserted against the exact figure separately. (A 12,250ms gap reads back
	 * as 12,300 and would look like a disagreement that is not one.)
	 */
	function componentDwellMs(events: RunEvent[]): number {
		const body = render(PostRunAnalysis, { props: { events, targets } }).body;
		const m = body.match(/Longest dwell was ([\d.]+)s on/);
		expect(m).not.toBeNull();
		return Math.round(parseFloat(m![1]) * 1000);
	}

	/** Seed FLOOR peers with the IDENTICAL stream, so the median IS that value. */
	async function seedIdenticalRuns(events: RunEvent[], title: string): Promise<string> {
		const { rows: cRows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
			 values ('speedrun', $1, 2, '{}'::jsonb, '{}'::jsonb, 'published') returning id`,
			[title]
		);
		const cid = cRows[0].id;
		for (let i = 0; i < FLOOR; i++) {
			const { rows } = await db.sql<{ id: string }>(`select gen_random_uuid() as id`);
			const runId = rows[0].id;
			for (const e of events) {
				await db.sql(
					`insert into public.gauntlet_run_events
						(run_id, user_id, challenge_id, seq, t_ms, event_type, payload)
					 values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
					[runId, peers[i].id, cid, e.seq, e.t_ms, e.event_type, JSON.stringify(e.payload)]
				);
			}
		}
		return cid;
	}

	/**
	 * TAIL: three features close together, then a long silence to `run_end`. The
	 * last feature's dwell (40s) is the largest, and it exists only because the
	 * tail runs to the end of the run.
	 */
	const TAIL: RunEvent[] = [
		{ seq: 1, t_ms: 0, event_type: 'run_start', payload: {} },
		{ seq: 2, t_ms: 1_000, event_type: 'feature_add', payload: { name: 'F0' } },
		{ seq: 3, t_ms: 4_000, event_type: 'feature_add', payload: { name: 'F1' } },
		{ seq: 4, t_ms: 9_500, event_type: 'feature_add', payload: { name: 'F2' } },
		{ seq: 5, t_ms: 49_500, event_type: 'run_end', payload: {} }
	];
	const TAIL_EXPECTED_MS = 40_000;

	/**
	 * NOISE: a long think BEFORE the first feature (run_start -> first add is 90s,
	 * the biggest gap in the stream by far) and a modest 12.3s largest dwell
	 * between features. A scan that forgot to filter to feature_add answers 90s.
	 */
	const NOISE: RunEvent[] = [
		{ seq: 1, t_ms: 0, event_type: 'run_start', payload: {} },
		{ seq: 2, t_ms: 90_000, event_type: 'feature_add', payload: { name: 'F0' } },
		{ seq: 3, t_ms: 93_000, event_type: 'feature_add', payload: { name: 'F1' } },
		{ seq: 4, t_ms: 105_300, event_type: 'feature_add', payload: { name: 'F2' } },
		{ seq: 5, t_ms: 106_200, event_type: 'feature_add', payload: { name: 'F3' } },
		{ seq: 6, t_ms: 108_000, event_type: 'run_end', payload: {} }
	];
	const NOISE_EXPECTED_MS = 12_300;

	it('agrees when the largest dwell is the LAST feature\'s (the tail branch)', async () => {
		const cid = await seedIdenticalRuns(TAIL, 'Dwell Mirror Tail');
		const s = await stats(me.id, cid);
		expect(s.peers_stuck).toBe(FLOOR);
		// Pinned independently of both implementations: 49,500 - 9,500.
		expect(Number(s.median_stuck_ms)).toBe(TAIL_EXPECTED_MS);
		expect(componentDwellMs(TAIL)).toBe(TAIL_EXPECTED_MS);
	});

	it('agrees when the stream\'s largest gap is NOT between features', async () => {
		const cid = await seedIdenticalRuns(NOISE, 'Dwell Mirror Noise');
		const s = await stats(me.id, cid);
		expect(s.peers_stuck).toBe(FLOOR);
		// 105,300 - 93,000, and emphatically NOT the 90,000 pre-first-feature gap.
		expect(Number(s.median_stuck_ms)).toBe(NOISE_EXPECTED_MS);
		expect(Number(s.median_stuck_ms)).not.toBe(90_000);
		expect(componentDwellMs(NOISE)).toBe(NOISE_EXPECTED_MS);
	});
});
