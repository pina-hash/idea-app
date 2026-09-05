// tests/db/gauntlet-run-events-bounds.test.ts
//
// 0184: what one run may write into `gauntlet_run_events`.
//
// Every guarantee here fails SILENTLY. `gauntlet_run_events_insert` is
// best-effort by contract (0035 section 4): it never raises, and the C# add-in
// swallows transport errors on purpose, so a bound that started refusing the
// wrong thing would show up as telemetry quietly going missing and nothing
// else. Both directions are therefore asserted, and both carry a control:
//
//   * THE ABUSIVE HALF. Unbounded rows, unbounded bytes, and a token that had
//     expired 30 days ago all wrote successfully before this file. Each is
//     asserted refused AND each is mutation-proved by opening its own clause,
//     because a refusal that came from some other guard is not the guard under
//     test.
//   * THE LEGITIMATE HALF -- the one 0152 names as the reason the `anon` grant
//     exists. A SolidWorks add-in holds no session: it posts with the public
//     anon key and the run code. That path is driven end to end here (reveal ->
//     start -> anon flushes -> submit -> anon FINAL flush) and must still work.
//     It is control-proved by TIGHTENING the caps until it breaks, so a test
//     that had stopped exercising the path could not stay green.
//
// THE TRAP THIS FILE EXISTS TO PIN: the window bound keys on `expires_at` and
// must never also key on `locked_at`. A correct solo submit SETS `locked_at`,
// and the add-in's guaranteed final flush -- the one carrying `run_end` --
// posts after that submit returns. `the final flush lands after a correct
// submit` below is the assertion that catches a future tightening there, and
// it is the one that would otherwise be discovered by a teacher noticing that
// no correct run has an end event.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, createUser, type TestDb, type SeededUser } from './harness';

/** The GAUNTLET chain as production stands, plus the file under test. */
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
	'0152_gauntlet_run_review.sql',
	'0184_gauntlet_run_event_bounds.sql'
] as const;

// Nothing round, so a number that comes back could not have come from a
// default or from a fixture elsewhere.
const TARGET_VOLUME_MM3 = 61237.4408;
const DENSITY_G_CM3 = 2.7;

let db: TestDb;
let ana: SeededUser;
let ben: SeededUser;
let challengeId: string;

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Okafor');
	const prompt = {
		material: 'Aluminium 6061',
		density: DENSITY_G_CM3,
		unit_system: 'MMGS',
		par_time: 275,
		drawing: '<svg/>'
	};
	const answer = {
		target_volume_mm3: TARGET_VOLUME_MM3,
		target_mass: (TARGET_VOLUME_MM3 / 1000) * DENSITY_G_CM3,
		density: DENSITY_G_CM3,
		tolerance_pct: 0.1,
		drawing: '<svg/>'
	};
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
		 values ('speedrun', 'Alpha Bracket', 2, $1::jsonb, $2::jsonb, 'published') returning id`,
		[JSON.stringify(prompt), JSON.stringify(answer)]
	);
	challengeId = rows[0].id;
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// Driving helpers. Every row below is written by the REAL RPC chain, and every
// telemetry post goes through `asAnon` -- role `anon`, no claims at all --
// because that is what a COM add-in holding only the public key actually is.
// Driving these as the connection owner would bypass the grant under test.
// ---------------------------------------------------------------------------

async function reveal(who: SeededUser): Promise<string> {
	const out = await db.asUser(who.id, (q) =>
		q<{ r: { code: string } }>(`select public.gauntlet_speedrun_reveal($1::uuid) as r`, [
			challengeId
		])
	);
	return out.rows[0].r.code;
}

async function startRun(code: string): Promise<string> {
	const out = await db.sql<{ r: { run_id: string } }>(
		`select public.gauntlet_macro_start($1::text, 0::numeric) as r`,
		[code]
	);
	return out.rows[0].r.run_id;
}

async function submit(code: string, runId: string, volumeMm3: number) {
	const out = await db.sql<{ r: Record<string, unknown> }>(
		`select public.gauntlet_macro_submit(
			p_code => $1::text, p_volume_mm3 => $2::numeric, p_run_id => $3::text,
			p_surface_area_mm2 => 12000, p_feature_count => 6) as r`,
		[code, String(volumeMm3), runId]
	);
	return out.rows[0].r;
}

/** The add-in's actual post: anon role, no session, code as the credential. */
async function postEvents(code: string, runId: string, events: unknown[]): Promise<number> {
	const out = await db.asAnon((q) =>
		q<{ n: number }>(
			`select public.gauntlet_run_events_insert($1::text, $2::text, $3::jsonb) as n`,
			[code, runId, JSON.stringify(events)]
		)
	);
	return Number(out.rows[0].n);
}

function batch(from: number, count: number, type = 'snapshot'): unknown[] {
	return Array.from({ length: count }, (_, i) => ({
		seq: from + i,
		t_ms: (from + i) * 1000,
		event_type: type,
		payload: { volume_mm3: 1234.5 }
	}));
}

async function rowsFor(runId: string): Promise<number> {
	const out = await db.sql<{ c: string }>(
		`select count(*)::text c from public.gauntlet_run_events where run_id = $1`,
		[runId]
	);
	return Number(out.rows[0].c);
}

/** Reads a cap out of the database rather than restating it here. */
async function cap(fn: '_gauntlet_run_event_cap' | '_gauntlet_event_bytes_cap'): Promise<number> {
	const out = await db.sql<{ v: number }>(`select public.${fn}() as v`);
	return Number(out.rows[0].v);
}

/** Replaces one cap for the duration of `fn`, then restores it EXACTLY. */
async function withCap<T>(
	name: '_gauntlet_run_event_cap' | '_gauntlet_event_bytes_cap',
	value: number,
	fn: () => Promise<T>
): Promise<T> {
	const original = await cap(name);
	const set = (v: number) =>
		db.sql(
			`create or replace function public.${name}() returns integer
			 language sql immutable set search_path = '' as $f$ select ${v} $f$`
		);
	await set(value);
	try {
		return await fn();
	} finally {
		await set(original);
		expect(await cap(name)).toBe(original);
	}
}

describe('0184: the legitimate add-in path -- the reason the anon grant exists', () => {
	it('reveal -> start -> anon flush -> submit -> anon FINAL flush all land', async () => {
		const code = await reveal(ana);
		const runId = await startRun(code);

		// Mid-run flushes, exactly as TelemetryRecorder.MaybeFlush sends them
		// (12 buffered events per post).
		expect(await postEvents(code, runId, [{ seq: 0, t_ms: 0, event_type: 'run_start', payload: {} }])).toBe(1);
		expect(await postEvents(code, runId, batch(1, 12))).toBe(12);
		expect(await postEvents(code, runId, batch(13, 12, 'feature_add'))).toBe(12);

		const result = await submit(code, runId, TARGET_VOLUME_MM3);
		expect(result.is_correct).toBe(true);

		// THE TRAP. A correct solo submit sets locked_at; the final flush posts
		// after it. If the window bound ever also keys on locked_at (or on
		// used_at), this is the assertion that reddens.
		const state = await db.sql<{ locked: boolean; used: boolean; expired: boolean }>(
			`select locked_at is not null as locked, used_at is not null as used,
			        now() > expires_at as expired
			 from public.gauntlet_run_tokens where code = $1`,
			[code]
		);
		expect(state.rows[0].locked).toBe(true);
		expect(state.rows[0].expired).toBe(false);

		expect(
			await postEvents(code, runId, [
				{ seq: 25, t_ms: 26_000, event_type: 'run_end', payload: { is_correct: true } }
			])
		).toBe(1);

		expect(await rowsFor(runId)).toBe(26);
	});

	it('CONTROL: tightening each cap breaks that same legitimate path', async () => {
		// A green test above proves nothing unless the assertions can fail. Each
		// cap is squeezed below what the legitimate path needs and the SAME
		// drive is shown to stop landing rows.
		const code = await reveal(ana);
		const runId = await startRun(code);
		expect(await postEvents(code, runId, batch(0, 12))).toBe(12);

		await withCap('_gauntlet_run_event_cap', 12, async () => {
			expect(await postEvents(code, runId, batch(12, 12))).toBe(0);
		});
		// Restored: the same post now lands.
		expect(await postEvents(code, runId, batch(12, 12))).toBe(12);

		await withCap('_gauntlet_event_bytes_cap', 64, async () => {
			expect(await postEvents(code, runId, batch(24, 12))).toBe(0);
		});
		expect(await postEvents(code, runId, batch(24, 12))).toBe(12);
	});
});

describe('0184: the bounds refuse what was unbounded before', () => {
	it('the rows-per-run cap bounds the RUN, not the call', async () => {
		const rowCap = await cap('_gauntlet_run_event_cap');
		// Squeezed so the assertion is about the RULE and not about writing
		// 20,000 rows; the real value is read back and asserted separately.
		await withCap('_gauntlet_run_event_cap', 30, async () => {
			const code = await reveal(ana);
			const runId = await startRun(code);

			// One oversized call is CLIPPED to the room left, not refused whole:
			// a legitimate flush arriving at the boundary still records what
			// fits, which is what "append-only, best effort" means.
			expect(await postEvents(code, runId, batch(0, 100))).toBe(30);
			expect(await rowsFor(runId)).toBe(30);

			// Rows already stored count, so a SECOND call gets nothing. This is
			// the half that makes it a run cap rather than a call cap, and the
			// half a naive fix gets wrong.
			expect(await postEvents(code, runId, batch(1000, 50))).toBe(0);
			expect(await rowsFor(runId)).toBe(30);
		});
		// The shipped value is generous by design; assert the real one is well
		// above anything a 30-minute token window can emit at one snapshot/sec.
		expect(rowCap).toBeGreaterThan(1800);
	});

	it('MUTATION: with the room clause opened, the same second call floods', async () => {
		// Opens ONLY the cap clause, in the PERMISSIVE direction, leaving every
		// other guard in place -- so a refusal that survives is another guard's
		// and this assertion is not certifying the wrong thing.
		const code = await reveal(ana);
		const runId = await startRun(code);
		await withCap('_gauntlet_run_event_cap', 30, async () => {
			expect(await postEvents(code, runId, batch(0, 100))).toBe(30);
			expect(await postEvents(code, runId, batch(1000, 50))).toBe(0);
		});
		// v_room is now 20000 - 30, i.e. effectively open: the identical second
		// call that was refused above lands in full.
		expect(await postEvents(code, runId, batch(1000, 50))).toBe(50);
	});

	it('the bytes-per-call cap refuses the 2 MB row that used to be accepted', async () => {
		const code = await reveal(ana);
		const runId = await startRun(code);
		const huge = [
			{ seq: 1, t_ms: 0, event_type: 'huge', payload: { blob: 'z'.repeat(2_000_000) } }
		];
		expect(await postEvents(code, runId, huge)).toBe(0);
		expect(await rowsFor(runId)).toBe(0);

		// MUTATION: with the byte clause opened wide, the identical document
		// lands -- so the refusal above is this clause and not jsonb parsing.
		await withCap('_gauntlet_event_bytes_cap', 50_000_000, async () => {
			expect(await postEvents(code, runId, huge)).toBe(1);
		});

		const bytesCap = await cap('_gauntlet_event_bytes_cap');
		// A real 12-event flush is single-digit KiB; the cap must clear it by a
		// wide margin or it would refuse the path it exists to protect.
		expect(bytesCap).toBeGreaterThan(64 * 1024);
	});

	it('an EXPIRED token can no longer write, and neither can it start or submit', async () => {
		const code = await reveal(ana);
		const runId = await startRun(code);
		expect(await postEvents(code, runId, batch(0, 5))).toBe(5);

		await db.sql(
			`update public.gauntlet_run_tokens
			 set expires_at = now() - interval '30 days' where code = $1`,
			[code]
		);

		expect(await postEvents(code, runId, batch(100, 5))).toBe(0);
		expect(await rowsFor(runId)).toBe(5);

		// Nothing legitimate is lost, because past this instant the run cannot
		// be started or submitted either -- which is the whole argument for
		// keying on expires_at.
		await expect(startRun(code)).rejects.toThrow(/expired|no longer active/i);
		await expect(submit(code, runId, TARGET_VOLUME_MM3)).rejects.toThrow(
			/expired|no longer active/i
		);
	});

	it('MUTATION: with the expiry clause opened, the expired token writes again', async () => {
		const code = await reveal(ana);
		const runId = await startRun(code);
		await db.sql(
			`update public.gauntlet_run_tokens
			 set expires_at = now() - interval '30 days' where code = $1`,
			[code]
		);
		expect(await postEvents(code, runId, batch(0, 5))).toBe(0);

		// Move the token back inside its window rather than editing the
		// function: the clause is exercised in the permissive direction with
		// every other guard untouched.
		await db.sql(
			`update public.gauntlet_run_tokens
			 set expires_at = now() + interval '30 minutes' where code = $1`,
			[code]
		);
		expect(await postEvents(code, runId, batch(0, 5))).toBe(5);
	});
});

describe('0184: what did NOT change', () => {
	it('the owner still comes from the token: cross-person forgery inserts nothing', async () => {
		// This was already true before 0184 (measured) and is asserted here so a
		// future edit to the insert cannot quietly start trusting the client.
		const anaCode = await reveal(ana);
		const anaRun = await startRun(anaCode);
		const benCode = await reveal(ben);
		const benRun = await startRun(benCode);

		expect(await postEvents(anaCode, benRun, batch(0, 5))).toBe(0);
		expect(await rowsFor(benRun)).toBe(0);

		expect(await postEvents(anaCode, anaRun, batch(0, 5))).toBe(5);
		const owners = await db.sql<{ user_id: string }>(
			`select distinct user_id from public.gauntlet_run_events where run_id = $1`,
			[anaRun]
		);
		expect(owners.rows.map((r) => r.user_id)).toEqual([ana.id]);
	});

	it('SELF-forgery is still possible, and that is 0152 decided rather than missed', async () => {
		// 0152 chose a REPORT over a GATE, on four measured grounds, the fourth
		// being that a trail is exactly as forgeable as the submit it would
		// corroborate. 0184 bounds the cost and the window; it does not and
		// cannot make a student's own trail trustworthy, because the student
		// legitimately holds the credential. Asserted so a reader knows this is
		// a decision with reasoning behind it and not an oversight.
		const code = await reveal(ana);
		const runId = await startRun(code);
		const invented = [
			{ seq: 0, t_ms: 0, event_type: 'run_start', payload: {} },
			{ seq: 1, t_ms: 90_000, event_type: 'feature_add', payload: { name: 'never modelled' } },
			{ seq: 2, t_ms: 180_000, event_type: 'snapshot', payload: { volume_mm3: TARGET_VOLUME_MM3 } }
		];
		expect(await postEvents(code, runId, invented)).toBe(3);

		// It is indistinguishable from a real trail at the database, which is
		// exactly why 0152 puts it in front of a person instead of judging it.
		const stored = await db.sql<{ event_type: string }>(
			`select event_type from public.gauntlet_run_events where run_id = $1 order by seq`,
			[runId]
		);
		expect(stored.rows.map((r) => r.event_type)).toEqual([
			'run_start',
			'feature_add',
			'snapshot'
		]);
	});

	it('anon keeps EXECUTE, and neither cap helper is reachable by a client role', async () => {
		const out = await db.sql<{
			anon_insert: boolean;
			auth_insert: boolean;
			anon_cap: boolean;
			auth_cap: boolean;
			anon_bytes: boolean;
			overloads: string;
		}>(
			`select
				has_function_privilege('anon', 'public.gauntlet_run_events_insert(text, text, jsonb)', 'execute') as anon_insert,
				has_function_privilege('authenticated', 'public.gauntlet_run_events_insert(text, text, jsonb)', 'execute') as auth_insert,
				has_function_privilege('anon', 'public._gauntlet_run_event_cap()', 'execute') as anon_cap,
				has_function_privilege('authenticated', 'public._gauntlet_run_event_cap()', 'execute') as auth_cap,
				has_function_privilege('anon', 'public._gauntlet_event_bytes_cap()', 'execute') as anon_bytes,
				(select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = 'gauntlet_run_events_insert') as overloads`
		);
		const r = out.rows[0];
		// The grant 0152 depends on, kept by name after create-or-replace.
		expect(r.anon_insert).toBe(true);
		expect(r.auth_insert).toBe(true);
		// A cap a caller can read is a cap a caller can aim just under.
		expect(r.anon_cap).toBe(false);
		expect(r.auth_cap).toBe(false);
		expect(r.anon_bytes).toBe(false);
		// The signature did not move, so there is no second overload for
		// PostgREST to fail to resolve.
		expect(r.overloads).toBe('1');
	});

	it('it still never raises: the contract that telemetry cannot break a run', async () => {
		// Every refusal path returns a number. A bound that raised would make
		// the thing 0035 built to be fail-safe able to abort a submit.
		const code = await reveal(ana);
		const runId = await startRun(code);
		await expect(postEvents('NOTACODE', runId, batch(0, 3))).resolves.toBe(0);
		await expect(postEvents(code, 'not-a-uuid', batch(0, 3))).resolves.toBe(0);
		await expect(postEvents(code, runId, [])).resolves.toBe(0);
		await expect(postEvents(code, runId, [{ t_ms: 1, event_type: 'noseq' }])).resolves.toBe(0);
	});
});

// ---------------------------------------------------------------------------
// The paired measurement. Everything above runs on a chain that INCLUDES 0184,
// so it proves the bounds hold -- not that 0184 is what put them there. A
// bound that had always been present would pass every assertion above
// identically. So the same three abuses are put to the DEPLOYED function, on a
// chain stopping one file short, and each is shown to succeed there.
//
// This is the shape CLAUDE.md calls for on a migration: test against seeded
// PRE-migration data through the REAL pre-migration RPCs, then apply the file
// over the top and compare case for case.
// ---------------------------------------------------------------------------
describe('0184: measured against the chain one file short', () => {
	const PRE_CHAIN = CHAIN.filter((f) => f !== '0184_gauntlet_run_event_bounds.sql');
	let pre: TestDb;
	let preUser: SeededUser;
	let preChallenge: string;

	beforeAll(async () => {
		pre = await startTestDb(PRE_CHAIN);
		preUser = await createUser(pre, 'pre@boscotech.net', 'Pre Migration');
		const { rows } = await pre.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
			 values ('speedrun', 'Alpha Bracket', 2, $1::jsonb, $2::jsonb, 'published') returning id`,
			[
				JSON.stringify({ material: 'Aluminium 6061', density: DENSITY_G_CM3, unit_system: 'MMGS', par_time: 275 }),
				JSON.stringify({
					target_volume_mm3: TARGET_VOLUME_MM3,
					target_mass: (TARGET_VOLUME_MM3 / 1000) * DENSITY_G_CM3,
					density: DENSITY_G_CM3,
					tolerance_pct: 0.1
				})
			]
		);
		preChallenge = rows[0].id;
	}, 240_000);

	afterAll(async () => {
		await pre?.stop();
	});

	async function preRun(): Promise<{ code: string; runId: string }> {
		const rev = await pre.asUser(preUser.id, (q) =>
			q<{ r: { code: string } }>(`select public.gauntlet_speedrun_reveal($1::uuid) as r`, [
				preChallenge
			])
		);
		const code = rev.rows[0].r.code;
		const st = await pre.sql<{ r: { run_id: string } }>(
			`select public.gauntlet_macro_start($1::text, 0::numeric) as r`,
			[code]
		);
		return { code, runId: st.rows[0].r.run_id };
	}

	async function prePost(code: string, runId: string, events: unknown[]): Promise<number> {
		const out = await pre.asAnon((q) =>
			q<{ n: number }>(
				`select public.gauntlet_run_events_insert($1::text, $2::text, $3::jsonb) as n`,
				[code, runId, JSON.stringify(events)]
			)
		);
		return Number(out.rows[0].n);
	}

	it('BEFORE 0184: none of the three bounds exists', async () => {
		expect(PRE_CHAIN.length).toBe(CHAIN.length - 1);

		// The cap helpers do not exist yet, which is what makes the three
		// results below the DEPLOYED behaviour and not a mis-chained fixture.
		const helpers = await pre.sql<{ c: string }>(
			`select count(*)::text c from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and p.proname in ('_gauntlet_run_event_cap', '_gauntlet_event_bytes_cap')`
		);
		expect(helpers.rows[0].c).toBe('0');

		// 1. Volume: one call, 5,000 rows.
		const flood = await preRun();
		expect(await prePost(flood.code, flood.runId, batch(0, 5000))).toBe(5000);

		// 2. Bytes: a single 2 MB payload.
		const fat = await preRun();
		expect(
			await prePost(fat.code, fat.runId, [
				{ seq: 1, t_ms: 0, event_type: 'huge', payload: { blob: 'z'.repeat(2_000_000) } }
			])
		).toBe(1);

		// 3. Time: a token expired 30 days ago still writes, while
		//    gauntlet_macro_start on that same token already refuses -- the
		//    asymmetry 0184 removes.
		const stale = await preRun();
		await pre.sql(
			`update public.gauntlet_run_tokens
			 set expires_at = now() - interval '30 days' where code = $1`,
			[stale.code]
		);
		expect(await prePost(stale.code, stale.runId, batch(0, 5))).toBe(5);
		await expect(
			pre.sql(`select public.gauntlet_macro_start($1::text, 0::numeric)`, [stale.code])
		).rejects.toThrow(/expired|no longer active/i);
	}, 120_000);
});
