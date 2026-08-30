// tests/gauntlet-run-review.test.ts
//
// 0152: an ADMIN-ONLY review of ranked Speedrun runs. It ranks nobody, unranks
// nobody and refuses nothing, so almost everything it guarantees fails
// SILENTLY and none of it fails in front of a user:
//
//   * THE ADMIN GATE. `gauntlet_run_review` joins other students' names onto
//     other students' runs. If `is_admin()` inside the body ever stops biting,
//     the function keeps returning exactly the same rows to the admin who is
//     testing it, and nothing anywhere reports that a student can now read the
//     whole class. This is 0060's room-roster shape, which leaked for two
//     months. The gate is therefore asserted in the PERMISSIVE direction and
//     mutation-proved (see the history entry).
//   * THE POPULATION. It must be the set the board ranks and no wider. A report
//     that quietly starts including practice checks or failing submits puts
//     runs in front of a reader as if they counted, and reads as a busier
//     report rather than as a wrong one.
//   * THE OBSERVATIONS' NEGATIVE HALF. Every one of them is worth more for what
//     it does NOT fire on than for what it does: this file's premise is that
//     crying wolf is the failure mode. `submit_volume_unseen` firing on the
//     ordinary submit-fail-fix-resubmit loop would be invisible in code review
//     and obvious only to the teacher who stopped trusting the report.
//   * NO EMAIL, AND NO ACCUSATION. Both are sweeps, and a sweep that reads the
//     wrong thing comes back clean. Both carry positive controls.
//
// WHAT THIS FILE DELIBERATELY DOES NOT ASSERT: that a forged run is detected.
// It is not detectable -- `gauntlet_run_events_insert` validates nothing but
// the code a forger already holds, so a complete and consistent trail costs one
// extra POST. What 0152 does is put the run and its facts in front of a person.
// A test claiming otherwise would be asserting a property the schema does not
// have.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';
import {
	OBSERVATIONS,
	TELEMETRY,
	formatElapsed,
	isObservationCode,
	isTelemetryState
} from '../src/routes/gauntlet/run-review/observations';

/**
 * The GAUNTLET chain as production stands, plus the file under test. Mirrors
 * `tests/gauntlet-practice-meter.test.ts`, including its note on 0149: that
 * file reconciles grants across nine coin/notebook/gauntlet VIEWS and its own
 * self-check requires all nine to exist, so it cannot apply to a gauntlet-only
 * chain. 0152 names nothing it touches.
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
	'0150_gauntlet_connect_run_analysis.sql',
	'0151_gauntlet_meter_practice.sql',
	'0152_gauntlet_run_review.sql'
] as const;

// ---------------------------------------------------------------------------
// The level. Nothing round, so a number that comes back could not have come
// from a default or from a fixture elsewhere.
// ---------------------------------------------------------------------------
const TARGET_VOLUME_MM3 = 61237.4408;
const DENSITY_G_CM3 = 2.7;
const TOLERANCE_PCT = 0.1;
const TARGET_MASS_G = (TARGET_VOLUME_MM3 / 1000) * DENSITY_G_CM3;
const PAR_TIME_S = 275;
/** A clear miss: outside the 0.1% band by orders of magnitude. */
const MISS_VOLUME_MM3 = 41000.5;

interface ReviewRow {
	submission_id: string;
	challenge_id: string;
	challenge_title: string | null;
	user_id: string;
	player: string | null;
	started_at: string;
	submitted_at: string;
	elapsed_ms: string | number | null;
	par_time_s: number | null;
	board_rank: number | null;
	failed_attempts: number | null;
	submitted_volume_mm3: string | null;
	telemetry: string;
	event_count: string | number;
	snapshot_count: string | number;
	feature_add_count: string | number;
	distinct_feature_counts: string | number;
	last_snapshot_volume_mm3: string | null;
	telemetry_span_ms: string | number | null;
	first_event_at: string | null;
	last_event_at: string | null;
	observations: string[];
}

interface World {
	db: TestDb;
	admin: SeededUser;
	student: SeededUser;
	other: SeededUser;
	/**
	 * A student whose profile carries NEITHER a display name NOR a full name.
	 * They exist so the no-email sweep is not vacuous: `player` is a coalesce,
	 * so a mutant appending `pr.email` as a further rung is INVISIBLE to a
	 * fixture where every profile has a name -- the fall-through never happens
	 * and the sweep certifies nothing. Measured: without this row the
	 * email-projection mutant SURVIVED.
	 */
	nameless: SeededUser;
	speedrunId: string;
	secondId: string;
	knowledgeId: string;
	roomId: string;
}

async function seed(db: TestDb): Promise<World> {
	const admin = await createUser(db, 'chair@boscotech.edu', 'The Chair');
	const student = await createUser(db, 'runner@boscotech.net', 'Ana Reyes');
	const other = await createUser(db, 'second@boscotech.net', 'Ben Okafor');
	const nameless = await createUser(db, 'noname@boscotech.net', '');
	// The 0001 trigger derives full_name from the sign-up metadata; blank it so
	// both rungs of `player`'s coalesce are empty and a third rung would show.
	await db.sql(
		`update public.profiles set full_name = null, display_name = null where id = $1`,
		[nameless.id]
	);
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		'chair@boscotech.edu'
	]);

	const prompt = {
		material: 'Aluminium 6061',
		density: DENSITY_G_CM3,
		unit_system: 'MMGS',
		par_time: PAR_TIME_S,
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

	// Titles chosen so the ORDER BY challenge title is observable and is not the
	// same order as insertion.
	const speedrunId = await mkSpeedrun('Alpha Bracket');
	const secondId = await mkSpeedrun('Zulu Housing');

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
		admin,
		student,
		other,
		nameless,
		speedrunId,
		secondId,
		knowledgeId: knowledge.rows[0].id,
		roomId: room.rows[0].id
	};
}

// ---------------------------------------------------------------------------
// Driving helpers. Every ranked row below is written by the REAL RPC chain
// (reveal -> macro_start -> macro_submit), never inserted by hand, so the
// `value` jsonb the report reads is the shape production actually stores.
// ---------------------------------------------------------------------------

async function reveal(w: World, who: SeededUser, challengeId: string): Promise<string> {
	const out = await w.db.asUser(who.id, (q) =>
		q<{ r: { code: string } }>(`select public.gauntlet_speedrun_reveal($1::uuid) as r`, [
			challengeId
		])
	);
	return out.rows[0].r.code;
}

async function startRun(w: World, code: string): Promise<string> {
	const out = await w.db.sql<{ r: { run_id: string } }>(
		`select public.gauntlet_macro_start($1::text, $2::numeric) as r`,
		[code, '0']
	);
	return out.rows[0].r.run_id;
}

async function macroSubmit(
	w: World,
	code: string,
	runId: string | null,
	volumeMm3: number,
	featureCount = 6
): Promise<Record<string, unknown>> {
	const out = await w.db.sql<{ r: Record<string, unknown> }>(
		`select public.gauntlet_macro_submit(
			p_code => $1::text,
			p_volume_mm3 => $2::numeric,
			p_run_id => $3::text,
			p_surface_area_mm2 => 12000,
			p_feature_count => $4::integer
		) as r`,
		[code, String(volumeMm3), runId, featureCount]
	);
	return out.rows[0].r;
}

/**
 * A complete honest solo run: reveal, start, submit the exact target.
 * `ageStartedMs` moves the token's server-stamped `started_at` BACKWARDS before
 * the submit, so the elapsed the server computes is a real elapsed over a real
 * clock rather than a number this test wrote into a row.
 */
async function soloRun(
	w: World,
	who: SeededUser,
	challengeId: string,
	opts: { ageStartedMs?: number; volume?: number; featureCount?: number } = {}
): Promise<{ code: string; runId: string; result: Record<string, unknown> }> {
	const code = await reveal(w, who, challengeId);
	const runId = await startRun(w, code);
	if (opts.ageStartedMs) {
		await w.db.sql(
			`update public.gauntlet_run_tokens
			 set started_at = started_at - make_interval(secs => $2::float8)
			 where code = $1`,
			[code, opts.ageStartedMs / 1000]
		);
	}
	const result = await macroSubmit(
		w,
		code,
		runId,
		opts.volume ?? TARGET_VOLUME_MM3,
		opts.featureCount ?? 6
	);
	return { code, runId, result };
}

/** Post a telemetry batch through the real anon-granted RPC. */
async function postEvents(
	w: World,
	code: string,
	runId: string,
	events: Array<{ seq: number; t_ms: number; event_type: string; payload?: unknown }>
): Promise<number> {
	const out = await w.db.sql<{ n: number }>(
		`select public.gauntlet_run_events_insert($1::text, $2::text, $3::jsonb) as n`,
		[code, runId, JSON.stringify(events)]
	);
	return out.rows[0].n;
}

/**
 * A plausible add-in trail for a run that ended at `finalVolume`: run_start, a
 * ramp of snapshots, a feature_add per step, run_end. `spanMs` is the client
 * stopwatch's own idea of the run length.
 */
function trail(finalVolume: number, spanMs: number) {
	const steps = 4;
	const events: Array<{ seq: number; t_ms: number; event_type: string; payload?: unknown }> = [
		{ seq: 0, t_ms: 0, event_type: 'run_start' }
	];
	for (let i = 1; i <= steps; i += 1) {
		events.push({
			seq: events.length,
			t_ms: Math.round((spanMs * i) / (steps + 1)),
			event_type: 'feature_add',
			payload: { entity: 1, name: `Boss-Extrude${i}` }
		});
		events.push({
			seq: events.length,
			t_ms: Math.round((spanMs * i) / (steps + 1)) + 5,
			event_type: 'snapshot',
			payload: {
				volume_mm3: (finalVolume * i) / steps,
				area_mm2: 9000 + i,
				feature_count: i
			}
		});
	}
	events.push({ seq: events.length, t_ms: spanMs, event_type: 'run_end', payload: { is_correct: true } });
	return events;
}

type Params = {
	challengeId?: string | null;
	sinceHours?: number;
	fastFinishSeconds?: number;
	includeAbsent?: boolean;
	observedOnly?: boolean;
	limit?: number;
};

async function review(w: World, who: SeededUser, p: Params = {}): Promise<ReviewRow[]> {
	const out = await w.db.asUser(who.id, (q) =>
		q<ReviewRow>(
			`select * from public.gauntlet_run_review(
				p_challenge_id => $1::uuid,
				p_since_hours => $2::integer,
				p_fast_finish_seconds => $3::integer,
				p_include_absent => $4::boolean,
				p_observed_only => $5::boolean,
				p_limit => $6::integer
			)`,
			[
				p.challengeId ?? null,
				p.sinceHours ?? 720,
				p.fastFinishSeconds ?? 30,
				p.includeAbsent ?? false,
				p.observedOnly ?? true,
				p.limit ?? 200
			]
		)
	);
	return out.rows;
}

const rowFor = (rows: ReviewRow[], submissionId: string) =>
	rows.find((r) => r.submission_id === submissionId);

/** The submission id of the most recent ranked row for a (student, challenge). */
async function lastRankedId(w: World, who: SeededUser, challengeId: string): Promise<string> {
	const { rows } = await w.db.sql<{ id: string }>(
		`select id from public.submissions
		 where user_id = $1 and challenge_id = $2 and source = 'macro' and is_correct = true
		 order by created_at desc, id desc limit 1`,
		[who.id, challengeId]
	);
	return rows[0].id;
}

// ===========================================================================

describe('0152 gauntlet_run_review', () => {
	let db: TestDb;
	let w: World;

	beforeAll(async () => {
		db = await startTestDb(CHAIN as unknown as string[]);
		w = await seed(db);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// The admin gate. Asserted in the permissive direction: the interesting
	// failure is a NON-admin getting rows, so every assertion below is paired
	// with a positive control proving the same call, same fixture, same moment
	// returns rows for an admin.
	// -----------------------------------------------------------------------
	describe('admin only', () => {
		it('returns rows to an admin and an EMPTY SET to a student, on the same fixture', async () => {
			const { runId, code } = await soloRun(w, w.student, w.speedrunId);
			await postEvents(w, code, runId, trail(TARGET_VOLUME_MM3, 500));

			const asAdmin = await review(w, w.admin, { observedOnly: false });
			const asStudent = await review(w, w.student, { observedOnly: false });
			const asOther = await review(w, w.other, { observedOnly: false });

			// POSITIVE CONTROL: the report is not empty for everybody.
			expect(asAdmin.length).toBeGreaterThan(0);
			expect(asStudent).toHaveLength(0);
			// Not even the student's OWN run: this is not an own-rows surface.
			expect(asOther).toHaveLength(0);
			expect(asAdmin.some((r) => r.user_id === w.student.id)).toBe(true);
		});

		it('an empty set and not an error, so the surface does not announce itself', async () => {
			// A refusal would tell a student there is a review lane to be turned
			// away from. Reaching this assertion at all is the test: asUser would
			// have thrown.
			await expect(review(w, w.student, { observedOnly: false })).resolves.toEqual([]);
		});

		it('the ACL is what the catalog says, not what the migration claims', async () => {
			const { rows } = await db.sql<{
				anon_review: boolean;
				auth_review: boolean;
				anon_juuid: boolean;
				auth_juuid: boolean;
				public_review: boolean;
			}>(
				`select
					has_function_privilege('anon', $1, 'execute') as anon_review,
					has_function_privilege('authenticated', $1, 'execute') as auth_review,
					has_function_privilege('anon', $2, 'execute') as anon_juuid,
					has_function_privilege('authenticated', $2, 'execute') as auth_juuid,
					has_function_privilege('public', $1, 'execute') as public_review`,
				[
					'public.gauntlet_run_review(uuid, integer, integer, boolean, boolean, integer)',
					'public._gauntlet_juuid(jsonb, text)'
				]
			);
			const acl = rows[0];
			expect(acl.auth_review).toBe(true); // positive control
			expect(acl.anon_review).toBe(false);
			expect(acl.public_review).toBe(false);
			expect(acl.anon_juuid).toBe(false);
			expect(acl.auth_juuid).toBe(false);
		});

		it('exactly one overload exists, so no old arity can survive a later widening', async () => {
			const { rows } = await db.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p
				 join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = 'gauntlet_run_review'`
			);
			expect(Number(rows[0].n)).toBe(1);
		});
	});

	// -----------------------------------------------------------------------
	// The population must be the set the board ranks, and no wider.
	// -----------------------------------------------------------------------
	describe('population', () => {
		it('is ranked Speedrun macro rows only, with a positive control for each exclusion', async () => {
			// The row that MUST appear.
			const good = await soloRun(w, w.student, w.secondId);
			const goodId = await lastRankedId(w, w.student, w.secondId);

			// (a) a FAILING macro submit on the same code.
			const failCode = await reveal(w, w.other, w.secondId);
			const failRun = await startRun(w, failCode);
			await macroSubmit(w, failCode, failRun, MISS_VOLUME_MM3);

			// (b) a PRACTICE check (mode speedrun, source manual, room_id null).
			await db.asUser(w.other.id, (q) =>
				q(`select public.gauntlet_submit($1::uuid, jsonb_build_object('mass', $2::text))`, [
					w.secondId,
					String(TARGET_MASS_G)
				])
			);

			// (c) a KNOWLEDGE submit.
			await db.asUser(w.other.id, (q) =>
				q(`select public.gauntlet_submit($1::uuid, jsonb_build_object('answer', 'x'))`, [
					w.knowledgeId
				])
			);

			const rows = await review(w, w.admin, { observedOnly: false, challengeId: w.secondId });
			const ids = rows.map((r) => r.submission_id);

			// POSITIVE CONTROL first: the exclusions are not vacuous, something
			// on this challenge did come back.
			expect(ids).toContain(goodId);
			expect(good.result.is_correct).toBe(true);

			// Now the exclusions, checked against the real rows rather than by
			// counting: every returned row is a passing macro speedrun row.
			const { rows: shapes } = await db.sql<{
				id: string;
				mode: string;
				source: string | null;
				is_correct: boolean | null;
			}>(
				`select id, mode::text as mode, source, is_correct from public.submissions
				 where id = any($1::uuid[])`,
				[ids]
			);
			expect(shapes.length).toBe(ids.length);
			for (const s of shapes) {
				expect(s.mode).toBe('speedrun');
				expect(s.source).toBe('macro');
				expect(s.is_correct).toBe(true);
			}

			// And the excluded rows really exist, so the loop above had something
			// to exclude.
			const { rows: excluded } = await db.sql<{ n: string }>(
				`select count(*)::text as n from public.submissions
				 where challenge_id in ($1::uuid, $2::uuid)
				   and (is_correct is not true or source is distinct from 'macro' or mode <> 'speedrun')`,
				[w.secondId, w.knowledgeId]
			);
			expect(Number(excluded[0].n)).toBeGreaterThan(0);
		});

		it('honours the challenge filter and the window', async () => {
			const all = await review(w, w.admin, { observedOnly: false });
			const one = await review(w, w.admin, { observedOnly: false, challengeId: w.speedrunId });
			expect(all.length).toBeGreaterThan(one.length); // positive control
			expect(one.every((r) => r.challenge_id === w.speedrunId)).toBe(true);

			// A one-hour window still holds everything this suite just wrote...
			const recent = await review(w, w.admin, { observedOnly: false, sinceHours: 1 });
			expect(recent.length).toBe(all.length);
			// ...and ageing a row out of it removes exactly that row.
			const victim = all[0].submission_id;
			await db.sql(
				`update public.submissions set created_at = created_at - interval '10 days' where id = $1`,
				[victim]
			);
			const stillRecent = await review(w, w.admin, { observedOnly: false, sinceHours: 24 });
			expect(stillRecent.map((r) => r.submission_id)).not.toContain(victim);
			const wide = await review(w, w.admin, { observedOnly: false, sinceHours: 720 });
			expect(wide.map((r) => r.submission_id)).toContain(victim);
		});
	});

	// -----------------------------------------------------------------------
	// The telemetry vocabulary is four answers, and three of them mean "there
	// was nothing here to check".
	// -----------------------------------------------------------------------
	describe('telemetry classification', () => {
		it("a solo run with a posted trail reads 'present' and counts it", async () => {
			const { code, runId } = await soloRun(w, w.student, w.speedrunId, { ageStartedMs: 300_000 });
			const id = await lastRankedId(w, w.student, w.speedrunId);
			const n = await postEvents(w, code, runId, trail(TARGET_VOLUME_MM3, 290_000));
			expect(n).toBeGreaterThan(0); // positive control: the RPC accepted them

			const row = rowFor(await review(w, w.admin, { observedOnly: false }), id);
			expect(row?.telemetry).toBe('present');
			expect(Number(row?.event_count)).toBe(n);
			expect(Number(row?.snapshot_count)).toBe(4);
			expect(Number(row?.feature_add_count)).toBe(4);
		});

		it("a solo run with no trail reads 'absent' -- the documented VBA path", async () => {
			await soloRun(w, w.other, w.speedrunId, { ageStartedMs: 300_000 });
			const id = await lastRankedId(w, w.other, w.speedrunId);
			const row = rowFor(await review(w, w.admin, { observedOnly: false }), id);
			expect(row?.telemetry).toBe('absent');
			expect(Number(row?.event_count)).toBe(0);
		});

		it("a room run reads 'room', and its telemetry really is impossible", async () => {
			// A room token: reveal through the room path so room_id is set.
			const { rows: tok } = await db.sql<{ code: string }>(
				`insert into public.gauntlet_run_tokens (code, user_id, challenge_id, room_id, expires_at)
				 values ('ROOMTOK1', $1, $2, $3, now() + interval '1 hour') returning code`,
				[w.student.id, w.speedrunId, w.roomId]
			);
			// Room racers never run the Start macro, so the token has no run_id.
			await macroSubmit(w, tok[0].code, null, TARGET_VOLUME_MM3);
			const { rows: sub } = await db.sql<{ id: string }>(
				`select id from public.submissions where room_id = $1 order by created_at desc limit 1`,
				[w.roomId]
			);

			const row = rowFor(await review(w, w.admin, { observedOnly: false }), sub[0].id);
			expect(row?.telemetry).toBe('room');

			// The structural half, asserted rather than assumed: the events RPC
			// refuses a batch for a token with no run_id, so there is nothing a
			// room racer could have posted.
			const accepted = await postEvents(w, tok[0].code, crypto.randomUUID(), [
				{ seq: 0, t_ms: 0, event_type: 'run_start' }
			]);
			expect(accepted).toBe(0);
		});

		it("a row carrying no run_id reads 'unlinked', not 'absent'", async () => {
			// Every ranked row written before 0016 is this: the run happened, the
			// record cannot be joined to a trail. Simulated by stripping the key
			// from a real row, because no RPC in the current chain can produce
			// one.
			await soloRun(w, w.student, w.secondId, { ageStartedMs: 200_000 });
			const id = await lastRankedId(w, w.student, w.secondId);
			await db.sql(`update public.submissions set value = value - 'run_id' where id = $1`, [id]);

			const row = rowFor(await review(w, w.admin, { observedOnly: false }), id);
			expect(row?.telemetry).toBe('unlinked');
			expect(Number(row?.event_count)).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// The observations. Each one is asserted in BOTH directions: the case it is
	// written for, and the honest case it must leave alone.
	// -----------------------------------------------------------------------
	describe('observations', () => {
		it('fast_finish fires under the floor and not over it', async () => {
			// A forged-shaped run: start and submit with no time in between.
			await soloRun(w, w.other, w.secondId);
			const fastId = await lastRankedId(w, w.other, w.secondId);

			// An honest run: five minutes on the server's own clock.
			await soloRun(w, w.student, w.speedrunId, { ageStartedMs: 300_000 });
			const slowId = await lastRankedId(w, w.student, w.speedrunId);

			const rows = await review(w, w.admin, { observedOnly: false });
			expect(rowFor(rows, fastId)?.observations).toContain('fast_finish');
			expect(rowFor(rows, slowId)?.observations).not.toContain('fast_finish');

			// And the floor is the caller's, not a constant: lifting it past the
			// honest run's elapsed brings that run in too. This is the control
			// that says the comparison is real rather than accidental.
			const wide = await review(w, w.admin, { observedOnly: false, fastFinishSeconds: 600 });
			expect(rowFor(wide, slowId)?.observations).toContain('fast_finish');
		});

		it('elapsed and started_at agree with the server clock', async () => {
			await soloRun(w, w.student, w.secondId, { ageStartedMs: 420_000 });
			const id = await lastRankedId(w, w.student, w.secondId);
			const row = rowFor(await review(w, w.admin, { observedOnly: false }), id);
			// ~420s, allowing for the round trips inside the run.
			expect(Number(row?.elapsed_ms)).toBeGreaterThan(415_000);
			expect(Number(row?.elapsed_ms)).toBeLessThan(430_000);
			// started_at is DERIVED as submitted_at - elapsed. It must land back on
			// the token's own server-stamped start.
			const drift =
				new Date(row!.submitted_at).getTime() -
				new Date(row!.started_at).getTime() -
				Number(row?.elapsed_ms);
			expect(Math.abs(drift)).toBeLessThan(1000);
		});

		it('submit_volume_unseen fires when the trail never shows the part that was handed in', async () => {
			const { code, runId } = await soloRun(w, w.student, w.speedrunId, { ageStartedMs: 300_000 });
			const id = await lastRankedId(w, w.student, w.speedrunId);
			// A trail that ramps to a DIFFERENT part.
			await postEvents(w, code, runId, trail(MISS_VOLUME_MM3, 290_000));

			const row = rowFor(await review(w, w.admin, { observedOnly: false }), id);
			expect(row?.telemetry).toBe('present');
			expect(row?.failed_attempts).toBe(0);
			expect(row?.observations).toContain('submit_volume_unseen');
		});

		it('and does NOT fire when the trail ends on the submitted volume', async () => {
			const { code, runId } = await soloRun(w, w.other, w.speedrunId, { ageStartedMs: 300_000 });
			const id = await lastRankedId(w, w.other, w.speedrunId);
			await postEvents(w, code, runId, trail(TARGET_VOLUME_MM3, 290_000));

			const row = rowFor(await review(w, w.admin, { observedOnly: false }), id);
			expect(row?.telemetry).toBe('present'); // positive control
			expect(row?.observations).not.toContain('submit_volume_unseen');
			expect(Number(row?.last_snapshot_volume_mm3)).toBeCloseTo(TARGET_VOLUME_MM3, 3);
		});

		it('and does NOT fire on the ordinary submit-fail-fix-resubmit loop', async () => {
			// THE LOAD-BEARING NEGATIVE. The add-in stops telemetry on ANY submit,
			// pass or fail, so on this 0061-sanctioned workflow the passing
			// geometry is modelled after the trail went quiet and legitimately
			// appears in no snapshot. Ungated, this observation would fire on
			// every honest student who missed once.
			const code = await reveal(w, w.student, w.secondId);
			const runId = await startRun(w, code);
			await db.sql(
				`update public.gauntlet_run_tokens
				 set started_at = started_at - interval '300 seconds' where code = $1`,
				[code]
			);
			// The trail records the part as it stood at the FIRST (failing) submit.
			await postEvents(w, code, runId, trail(MISS_VOLUME_MM3, 150_000));
			const first = await macroSubmit(w, code, runId, MISS_VOLUME_MM3);
			expect(first.is_correct).toBe(false); // positive control: it really failed

			// The student fixes the geometry and submits again, and this one ranks.
			const second = await macroSubmit(w, code, runId, TARGET_VOLUME_MM3);
			expect(second.is_correct).toBe(true);
			const id = await lastRankedId(w, w.student, w.secondId);

			const row = rowFor(await review(w, w.admin, { observedOnly: false }), id);
			// Everything the naive version of this check would key on is true...
			expect(row?.telemetry).toBe('present');
			expect(Number(row?.snapshot_count)).toBeGreaterThan(0);
			expect(row?.failed_attempts).toBe(1);
			// ...and the observation is correctly absent.
			expect(row?.observations).not.toContain('submit_volume_unseen');
		});

		it('clock_exceeds_run fires only when the client stopwatch outruns the server', async () => {
			// The honest direction first: t_ms starts after macro_start returns, so
			// it is structurally the SHORTER clock.
			const honest = await soloRun(w, w.other, w.secondId, { ageStartedMs: 300_000 });
			const honestId = await lastRankedId(w, w.other, w.secondId);
			await postEvents(w, honest.code, honest.runId, trail(TARGET_VOLUME_MM3, 295_000));

			// The fabricated direction: a stopwatch claiming an hour on a 5s run.
			const forged = await soloRun(w, w.student, w.speedrunId);
			const forgedId = await lastRankedId(w, w.student, w.speedrunId);
			await postEvents(w, forged.code, forged.runId, trail(TARGET_VOLUME_MM3, 3_600_000));

			const rows = await review(w, w.admin, { observedOnly: false });
			expect(rowFor(rows, honestId)?.observations).not.toContain('clock_exceeds_run');
			expect(rowFor(rows, forgedId)?.observations).toContain('clock_exceeds_run');
			expect(Number(rowFor(rows, forgedId)?.telemetry_span_ms)).toBe(3_600_000);
		});

		it('events_after_submit fires on a trail posted long after the run ranked', async () => {
			const { code, runId } = await soloRun(w, w.other, w.speedrunId, { ageStartedMs: 300_000 });
			const id = await lastRankedId(w, w.other, w.speedrunId);
			await postEvents(w, code, runId, trail(TARGET_VOLUME_MM3, 290_000));

			// In the window: nothing to say.
			let row = rowFor(await review(w, w.admin, { observedOnly: false }), id);
			expect(row?.observations).not.toContain('events_after_submit'); // positive control

			// gauntlet_run_events.created_at is server-stamped (default now()), so
			// it is the one part of a trail a caller cannot choose. Move it past
			// the grace and the disagreement appears.
			await db.sql(
				`update public.gauntlet_run_events set created_at = created_at + interval '30 minutes'
				 where run_id = $1`,
				[runId]
			);
			row = rowFor(await review(w, w.admin, { observedOnly: false }), id);
			expect(row?.observations).toContain('events_after_submit');
		});

		it('events_before_start fires on a trail that predates the run', async () => {
			const { code, runId } = await soloRun(w, w.student, w.secondId, { ageStartedMs: 120_000 });
			const id = await lastRankedId(w, w.student, w.secondId);
			await postEvents(w, code, runId, trail(TARGET_VOLUME_MM3, 110_000));

			let row = rowFor(await review(w, w.admin, { observedOnly: false }), id);
			expect(row?.observations).not.toContain('events_before_start'); // positive control

			await db.sql(
				`update public.gauntlet_run_events set created_at = created_at - interval '2 hours'
				 where run_id = $1`,
				[runId]
			);
			row = rowFor(await review(w, w.admin, { observedOnly: false }), id);
			expect(row?.observations).toContain('events_before_start');
		});

		it('telemetry_absent is OFF by default and available on request', async () => {
			// This is the signal that would accuse every student on the documented
			// VBA path, so its default matters more than its logic.
			await soloRun(w, w.other, w.secondId, { ageStartedMs: 300_000 });
			const id = await lastRankedId(w, w.other, w.secondId);

			const off = rowFor(await review(w, w.admin, { observedOnly: false }), id);
			expect(off?.telemetry).toBe('absent'); // positive control
			expect(off?.observations).not.toContain('telemetry_absent');
			// With observedOnly on, a run whose ONLY property is missing telemetry
			// is not listed at all.
			expect(
				(await review(w, w.admin)).map((r) => r.submission_id)
			).not.toContain(id);

			const on = rowFor(await review(w, w.admin, { observedOnly: false, includeAbsent: true }), id);
			expect(on?.observations).toContain('telemetry_absent');
		});

		it('a room run is never listed for missing telemetry, even with the flag on', async () => {
			// Facts 3: a room racer CANNOT emit a trail. Listing them for not
			// having one is the purest form of crying wolf available here.
			const rows = await review(w, w.admin, {
				observedOnly: false,
				includeAbsent: true,
				fastFinishSeconds: 0
			});
			const roomRows = rows.filter((r) => r.telemetry === 'room');
			expect(roomRows.length).toBeGreaterThan(0); // positive control
			for (const r of roomRows) {
				expect(r.observations).not.toContain('telemetry_absent');
			}
		});
	});

	// -----------------------------------------------------------------------
	// Shape: no score, no accusation, no email.
	// -----------------------------------------------------------------------
	describe('what the report is not', () => {
		it('orders by challenge then newest first, never by how much was observed', async () => {
			const rows = await review(w, w.admin, { observedOnly: false });
			expect(rows.length).toBeGreaterThan(3); // positive control

			const titles = rows.map((r) => r.challenge_title ?? '');
			expect([...titles]).toEqual([...titles].sort());
			// Within each challenge, strictly newest first.
			for (let i = 1; i < rows.length; i += 1) {
				if (rows[i].challenge_title !== rows[i - 1].challenge_title) continue;
				expect(new Date(rows[i - 1].submitted_at).getTime()).toBeGreaterThanOrEqual(
					new Date(rows[i].submitted_at).getTime()
				);
			}
			// And an observation count is NOT the sort key: prove the ordering
			// survives a row with more observations sitting below an older one.
			const counts = rows.map((r) => r.observations.length);
			expect(Math.max(...counts)).toBeGreaterThan(0);
			expect(counts).not.toEqual([...counts].sort((a, b) => b - a));
		});

		it('returns no column that scores or ranks suspicion', async () => {
			const { rows } = await db.sql<{ name: string }>(
				`select unnest(p.proargnames) as name from pg_proc p
				 join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = 'gauntlet_run_review'`
			);
			const names = rows.map((r) => r.name);
			expect(names).toContain('observations'); // positive control
			for (const banned of ['score', 'suspicion', 'risk', 'confidence', 'severity', 'flags']) {
				expect(names.some((nm) => nm.includes(banned))).toBe(false);
			}
		});

		it('never accuses anyone, in the observation vocabulary or in its own source', async () => {
			const { rows: src } = await db.sql<{ body: string }>(
				`select p.prosrc as body from pg_proc p
				 join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = 'gauntlet_run_review'`
			);
			const rows = await review(w, w.admin, {
				observedOnly: false,
				includeAbsent: true,
				fastFinishSeconds: 600
			});
			const vocabulary = [...new Set(rows.flatMap((r) => r.observations))];
			expect(vocabulary.length).toBeGreaterThan(2); // positive control

			const haystack = (src[0].body + ' ' + vocabulary.join(' ')).toLowerCase();
			// POSITIVE CONTROL for the sweep itself: a word that IS in the source.
			expect(haystack).toContain('telemetry');
			for (const word of [
				'cheat',
				'cheating',
				'fraud',
				'forged',
				'forgery',
				'suspicious',
				'suspect',
				'guilty',
				'dishonest',
				'faked',
				'violation',
				'offender'
			]) {
				expect(haystack.includes(word)).toBe(false);
			}
		});

		it('projects no email anywhere in its payload', async () => {
			// A run by the student with NO name of any kind. `player` is a
			// coalesce, so without this row every rung resolves at rung one or two
			// and a mutant adding `pr.email` as rung three is unreachable -- the
			// sweep would come back clean over a payload that genuinely leaks.
			await soloRun(w, w.nameless, w.secondId, { ageStartedMs: 300_000 });
			const namelessId = await lastRankedId(w, w.nameless, w.secondId);

			const rows = await review(w, w.admin, {
				observedOnly: false,
				includeAbsent: true,
				fastFinishSeconds: 600
			});
			expect(rows.length).toBeGreaterThan(0);
			// POSITIVE CONTROL for the sweep itself.
			expect(JSON.stringify({ player: 'x@y.z' })).toContain('@');
			// POSITIVE CONTROL for the fixture: the nameless run really is here,
			// and its player really did fall through both rungs.
			const nameless = rowFor(rows, namelessId);
			expect(nameless).toBeDefined();
			expect(nameless?.player).toBeNull();

			expect(JSON.stringify(rows)).not.toContain('@');
			// The chosen name IS projected, so a reader knows whose run this is.
			expect(rows.some((r) => r.player === 'Ana Reyes' || r.player === 'Ben Okafor')).toBe(true);
		});

		it('reports par time and board rank as context', async () => {
			const rows = await review(w, w.admin, { observedOnly: false });
			expect(rows.every((r) => r.par_time_s === PAR_TIME_S)).toBe(true);
			// Somebody is on the board, so rank is real context and not always null.
			expect(rows.some((r) => r.board_rank !== null)).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// The database emits codes; the surface turns them into sentences. These are
	// two files that must agree, and nothing type-checks the join: a code added
	// to 0152 without a sentence renders as a bare identifier beside a student's
	// name, and a sentence left behind for a code that no longer exists is dead
	// copy nobody notices.
	// -----------------------------------------------------------------------
	describe('the database vocabulary and the surface copy agree', () => {
		/**
		 * The observation codes the DEPLOYED function can emit, read out of
		 * `pg_proc.prosrc` rather than out of the migration file, so this pins
		 * what is actually installed.
		 */
		async function sqlObservationCodes(): Promise<string[]> {
			const { rows } = await db.sql<{ body: string }>(
				`select p.prosrc as body from pg_proc p
				 join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = 'gauntlet_run_review'`
			);
			return [...new Set([...rows[0].body.matchAll(/then '([a-z_]+)' end/g)].map((m) => m[1]))];
		}

		async function sqlTelemetryStates(): Promise<string[]> {
			const { rows } = await db.sql<{ body: string }>(
				`select p.prosrc as body from pg_proc p
				 join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = 'gauntlet_run_review'`
			);
			const block = rows[0].body.split('end as telemetry')[0].split('case').pop() ?? '';
			return [...new Set([...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))];
		}

		it('every observation code the function can emit has a sentence, and vice versa', async () => {
			const fromSql = (await sqlObservationCodes()).sort();
			// POSITIVE CONTROL for the extraction: if the regex stops matching, this
			// is what says so, rather than an empty set agreeing with an empty set.
			expect(fromSql.length).toBe(6);
			expect(fromSql).toContain('fast_finish');

			expect(fromSql).toEqual(Object.keys(OBSERVATIONS).sort());
			for (const code of fromSql) expect(isObservationCode(code)).toBe(true);
		});

		it('every telemetry state the function can emit has a sentence, and vice versa', async () => {
			const fromSql = (await sqlTelemetryStates()).sort();
			expect(fromSql.length).toBe(4); // positive control for the extraction
			expect(fromSql).toEqual(Object.keys(TELEMETRY).sort());
			for (const state of fromSql) expect(isTelemetryState(state)).toBe(true);
		});

		it('every state and code this suite actually produced is explained', async () => {
			const rows = await review(w, w.admin, {
				observedOnly: false,
				includeAbsent: true,
				fastFinishSeconds: 600
			});
			const states = [...new Set(rows.map((r) => r.telemetry))];
			const codes = [...new Set(rows.flatMap((r) => r.observations))];
			// POSITIVE CONTROL: the fixture really did exercise the vocabulary.
			expect(states.length).toBeGreaterThanOrEqual(3);
			expect(codes.length).toBeGreaterThanOrEqual(3);
			for (const s of states) expect(TELEMETRY[s as keyof typeof TELEMETRY]).toBeDefined();
			for (const c of codes) expect(OBSERVATIONS[c as keyof typeof OBSERVATIONS]).toBeDefined();
		});

		it('the surface copy accuses nobody either', async () => {
			// The migration's source is swept above; this is the OTHER half, and it
			// is the half a teacher actually reads.
			const copy = [
				...Object.values(OBSERVATIONS).flatMap((e) => [e.label, e.meaning]),
				...Object.values(TELEMETRY).flatMap((e) => [e.label, e.meaning])
			]
				.join(' ')
				.toLowerCase();
			// POSITIVE CONTROL for the sweep.
			expect(copy).toContain('server');
			for (const word of [
				'cheat',
				'cheating',
				'fraud',
				'forged',
				'forgery',
				'suspicious',
				'suspect',
				'guilty',
				'dishonest',
				'faked',
				'violation',
				'offender'
			]) {
				expect(copy.includes(word)).toBe(false);
			}
		});

		it('a sub-second run is not formatted away to zero', () => {
			// The runs this surface exists for are measured in milliseconds. A
			// formatter that rounded them to "0s" would hide the one number the
			// reader came for.
			expect(formatElapsed(1)).toBe('1 ms');
			expect(formatElapsed(940)).toBe('940 ms');
			expect(formatElapsed(0)).toBe('0 ms');
			expect(formatElapsed(null)).toBe('--');
			expect(formatElapsed(305_000)).toBe('5m 05s');
		});
	});

	describe('the file itself', () => {
		it('writes nothing: the report is stable across two identical calls', async () => {
			const a = await review(w, w.admin, { observedOnly: false });
			const b = await review(w, w.admin, { observedOnly: false });
			expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
		});
	});
});

// ---------------------------------------------------------------------------
// Re-application, on its own database: re-pasting a migration is ordinary here,
// and a file that only works once fails exactly then, with the schema half
// built.
// ---------------------------------------------------------------------------
describe('0152 re-applies', () => {
	it('a chain listing it twice produces one function and no error', async () => {
		const twice = [...CHAIN, '0152_gauntlet_run_review.sql'] as unknown as string[];
		const db = await startTestDb(twice);
		try {
			const { rows } = await db.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p
				 join pg_namespace ns on ns.oid = p.pronamespace
				 where ns.nspname = 'public' and p.proname = 'gauntlet_run_review'`
			);
			expect(Number(rows[0].n)).toBe(1);
		} finally {
			await db.stop();
		}
	}, 120_000);
});
