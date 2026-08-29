// tests/gauntlet-target-disclosure.test.ts
//
// 0147: the GAUNTLET target/tolerance disclosures 0061 left open.
//
// WHY THESE ASSERT ON SHAPE AND NOT ON FIELD NAMES. 0061 removed
// `target_volume_mm3` from two payloads and then shipped `target_mass_level`
// beside `expected_density_g_cm3`, which reconstructs it by one division. A test
// that had checked `expect(payload.target_volume_mm3).toBeUndefined()` would
// have passed for the whole of 0061's life while the target sat in the same
// object under a different name and a unit conversion. So the detector here
// takes EVERY number in a payload and asks whether the target is recoverable
// from it -- directly, through the public density, or as the ratio of any two of
// them (which is the exact signed deviation, the "how far off you were" number
// 0061's own comment forbids). A new field can only pass by not disclosing.
//
// THE PERMISSIVE CONTROL IS A SECOND DATABASE, NOT A MUTATED FILE. Every test
// below runs the identical seed and the identical calls against two chains: one
// ending at 0061 (the world as production runs it today) and one with 0147 on
// top. The detector must FIRE on the first and be SILENT on the second. That is
// the mutation proof in the permissive direction, done by construction rather
// than by editing a migration and putting it back -- an unfixed world that
// cannot drift out of sync with the fixed one, and one that also proves the
// detector bites rather than merely finding nothing.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';
import { deviationBandLabel, deviationBandHint } from '$lib/gauntlet';

/** The GAUNTLET dependency chain, ending at 0061 -- production as it stands. */
const CHAIN_0061 = [
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
	// 0137 last in the pre-0147 world, per its own rule: it is a sweep over
	// whatever the chain above created.
	'0137_anon_execute_sweep.sql'
] as const;

const FILE_0147 = '0147_gauntlet_close_target_disclosure.sql';
const CHAIN_0147 = [...CHAIN_0061, FILE_0147] as const;

// ---------------------------------------------------------------------------
// The level. Every constant is deliberately distinctive so the detector cannot
// collide with an unrelated number that happens to be in a payload: a tolerance
// of 2 would false-positive against `attempts_remaining`, which really is 2
// after one miss. Nothing here is a round number that something else emits.
// ---------------------------------------------------------------------------
const TARGET_VOLUME_MM3 = 73412;
const DENSITY_G_CM3 = 2.7;
const TOLERANCE_PCT = 0.37;
/** The ranked target expressed as mass: 73.412 cm3 x 2.7 g/cm3. */
const TARGET_MASS_G = (TARGET_VOLUME_MM3 / 1000) * DENSITY_G_CM3; // 198.2124

/** A clear MISS, in both bases. Never the target: your_* must stay legitimate. */
const SUBMITTED_VOLUME_MM3 = 61000;
const SUBMITTED_MASS_G = 173.5;

interface Facts {
	targetVolumeMm3: number;
	targetMassG: number;
	tolerancePct: number;
	densityGcm3: number;
	/** What the CALLER already knows because they sent it. */
	submittedValue: number;
}

/** Pull every finite number out of a payload, whatever its nesting or key. */
function numbersIn(value: unknown, out: number[] = []): number[] {
	if (typeof value === 'number' && Number.isFinite(value)) out.push(value);
	else if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
		out.push(Number(value));
	else if (Array.isArray(value)) for (const v of value) numbersIn(v, out);
	else if (value && typeof value === 'object')
		for (const v of Object.values(value as Record<string, unknown>)) numbersIn(v, out);
	return out;
}

const exactly = (a: number, b: number) => b !== 0 && Math.abs(a - b) / Math.abs(b) < 1e-9;

/**
 * A number DISCLOSES a target if it lands inside the pass band, because that is
 * the whole of what a cheat needs: not the target to machine precision, just a
 * value that scores. This matters rather than being pedantry -- 0061 returns
 * `target_mass_level` ROUNDED to 2dp, so an exact-equality detector would have
 * reported that payload clean while 198.21 sat in it against a true target of
 * 198.2124 and a 0.37% band four hundred times wider than the rounding.
 */
const discloses = (a: number, b: number, tolPct: number) =>
	b !== 0 && Math.abs(a - b) / Math.abs(b) <= tolPct / 100;

/**
 * Every way the ranked comparison value is recoverable from a payload. Returns
 * a human-readable reason per route, so a firing test says WHICH disclosure it
 * found rather than just failing.
 */
function reconstructions(payload: unknown, f: Facts): string[] {
	const nums = numbersIn(payload);
	const hits: string[] = [];
	for (const n of nums) {
		if (discloses(n, f.targetVolumeMm3, f.tolerancePct))
			hits.push(`target volume returned directly (${n})`);
		// Density is public framing, so a target MASS is a target VOLUME.
		if (discloses(n, f.targetMassG, f.tolerancePct))
			hits.push(`target mass returned (${n}); / density * 1000 = ${f.targetVolumeMm3}`);
		if (exactly(n, f.tolerancePct)) hits.push(`authoritative tolerance_pct returned (${n})`);
	}
	// The ratio route: any pair whose quotient is target/submitted hands the
	// caller the exact signed deviation, because they already know what they sent.
	const wanted = f.targetVolumeMm3 / f.submittedValue;
	for (const a of nums)
		for (const b of nums) {
			if (b === 0 || a === b) continue;
			if (discloses(a / b, wanted, f.tolerancePct) || discloses(b / a, wanted, f.tolerancePct))
				hits.push(`ratio ${a}/${b} is target/submitted (${wanted}): exact signed deviation`);
		}
	return hits;
}

interface World {
	db: TestDb;
	student: SeededUser;
	challengeId: string;
	roomChallengeId: string;
}

/**
 * One published Speedrun level, plus a solo run token and a room run token for
 * it, seeded identically on both chains. Tokens are inserted directly as the
 * connection owner: gauntlet_speedrun_reveal is out of this bundle's scope and
 * must not be called or changed.
 */
async function seed(db: TestDb): Promise<World> {
	const student = await createUser(db, 'racer@boscotech.net', 'Racer One');
	const prompt = {
		material: 'Aluminum 6061',
		density: DENSITY_G_CM3,
		density_unit: 'g/cm³',
		target_mass: TARGET_MASS_G,
		mass_unit: 'g',
		tolerance_pct: TOLERANCE_PCT,
		unit_system: 'MMGS'
	};
	const answer = {
		target_volume_mm3: TARGET_VOLUME_MM3,
		target_mass: TARGET_MASS_G,
		density: DENSITY_G_CM3,
		tolerance_pct: TOLERANCE_PCT,
		drawing: '<svg/>'
	};
	const { rows } = await db.sql<{ id: string }>(
		// `published` is DERIVED from `status` by 0009's challenges_sync_published
		// trigger, so setting the boolean directly is silently ignored.
		`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
		 values ('speedrun', 'Disclosure Fixture', 2, $1::jsonb, $2::jsonb, 'published') returning id`,
		[JSON.stringify(prompt), JSON.stringify(answer)]
	);
	const challengeId = rows[0].id;

	// A room, so the room submit path has somewhere to rank.
	const room = await db.sql<{ id: string }>(
		`insert into public.gauntlet_rooms (host_id, join_code, current_challenge_id, state)
		 values ($1, 'ROOMCODE', $2, 'live') returning id`,
		[student.id, challengeId]
	);

	await db.sql(
		`insert into public.gauntlet_run_tokens
			(code, user_id, challenge_id, reveal_at, expires_at, started_at, run_id)
		 values ('SOLOCODE', $1, $2, now(), now() + interval '1 hour', now(), $3)`,
		[student.id, challengeId, '11111111-1111-1111-1111-111111111111']
	);
	await db.sql(
		`insert into public.gauntlet_run_tokens
			(code, user_id, challenge_id, room_id, reveal_at, expires_at)
		 values ('ROOMRUN1', $1, $2, $3, now(), now() + interval '1 hour')`,
		[student.id, challengeId, room.rows[0].id]
	);
	// A spent code, for the lifecycle assertions.
	await db.sql(
		`insert into public.gauntlet_run_tokens
			(code, user_id, challenge_id, reveal_at, expires_at, used_at)
		 values ('SPENTCOD', $1, $2, now(), now() + interval '1 hour', now())`,
		[student.id, challengeId]
	);
	// An expired code.
	await db.sql(
		`insert into public.gauntlet_run_tokens
			(code, user_id, challenge_id, reveal_at, expires_at)
		 values ('EXPIRCOD', $1, $2, now() - interval '2 hours', now() - interval '1 hour')`,
		[student.id, challengeId]
	);

	return { db, student, challengeId, roomChallengeId: challengeId };
}

const factsFor = (submittedValue: number): Facts => ({
	targetVolumeMm3: TARGET_VOLUME_MM3,
	targetMassG: TARGET_MASS_G,
	tolerancePct: TOLERANCE_PCT,
	densityGcm3: DENSITY_G_CM3,
	submittedValue
});

let before: World;
let after: World;

beforeAll(async () => {
	// SEQUENTIALLY, never Promise.all: both databases live on one shared cluster
	// and the stub's `create role ... if not exists` guards race each other
	// across concurrent connections (CLAUDE.md, the parallelism trap). Measured
	// here: the concurrent form dies on pg_authid_rolname_index.
	before = await seed(await startTestDb([...CHAIN_0061]));
	after = await seed(await startTestDb([...CHAIN_0147]));
}, 300_000);

afterAll(async () => {
	await before?.db.stop();
	await after?.db.stop();
});

// ---------------------------------------------------------------------------

describe('gauntlet_run_targets', () => {
	const call = (w: World) =>
		w.db.asAnon(async (q) => {
			const r = await q<{ result: unknown }>('select public.gauntlet_run_targets($1) as result', [
				'SOLOCODE'
			]);
			return r.rows[0].result;
		});

	it('POSITIVE CONTROL: at 0061 it discloses the target to an anon caller', async () => {
		const hits = reconstructions(await call(before), factsFor(SUBMITTED_VOLUME_MM3));
		expect(hits.length).toBeGreaterThan(0);
	});

	it('at 0147 no number in the payload reconstructs the target', async () => {
		const payload = await call(after);
		expect(reconstructions(payload, factsFor(SUBMITTED_VOLUME_MM3))).toEqual([]);
	});

	it('still returns the public level framing the add-in needs', async () => {
		const p = (await call(after)) as Record<string, unknown>;
		// Density alone reconstructs nothing, and is what computes the student's
		// OWN mass. Present is as load-bearing as the absences above.
		expect(p.expected_density_g_cm3).toBeDefined();
		expect(Number(p.expected_density_g_cm3)).toBeCloseTo(DENSITY_G_CM3, 9);
		expect(p.unit_system).toBe('MMGS');
		expect(p.mass_unit).toBe('g');
		expect(p.material).toBe('Aluminum 6061');
	});

	it('POSITIVE CONTROL: at 0061 a SPENT and an EXPIRED code both still answer', async () => {
		for (const code of ['SPENTCOD', 'EXPIRCOD']) {
			const r = await before.db.asAnon((q) =>
				q<{ result: unknown }>('select public.gauntlet_run_targets($1) as result', [code])
			);
			expect(r.rows[0].result).toBeTruthy();
		}
	});

	it('at 0147 a spent code and an expired code are both refused', async () => {
		await expect(
			after.db.asAnon((q) => q('select public.gauntlet_run_targets($1)', ['SPENTCOD']))
		).rejects.toThrow(/no longer active/i);
		await expect(
			after.db.asAnon((q) => q('select public.gauntlet_run_targets($1)', ['EXPIRCOD']))
		).rejects.toThrow(/expired/i);
	});
});

describe('gauntlet_macro_submit', () => {
	const call = (w: World) =>
		w.db.asAnon(async (q) => {
			const r = await q<{ result: unknown }>(
				'select public.gauntlet_macro_submit($1, $2, $3) as result',
				['SOLOCODE', SUBMITTED_VOLUME_MM3, '11111111-1111-1111-1111-111111111111']
			);
			return r.rows[0].result;
		});

	it('POSITIVE CONTROL: at 0061 a failing submit discloses the target', async () => {
		const hits = reconstructions(await call(before), factsFor(SUBMITTED_VOLUME_MM3));
		expect(hits.length).toBeGreaterThan(0);
	});

	it('at 0147 a failing submit reconstructs nothing', async () => {
		const payload = await call(after);
		expect(reconstructions(payload, factsFor(SUBMITTED_VOLUME_MM3))).toEqual([]);
	});

	it('still teaches: the coarse unsigned band and the caller own mass survive', async () => {
		const p = (await call(after)) as Record<string, unknown>;
		expect(p.is_correct).toBe(false);
		expect(['close', 'near', 'far']).toContain(p.deviation_band);
		// your_mass_level is the caller's OWN volume x a public density.
		expect(Number(p.your_mass_level)).toBeCloseTo((SUBMITTED_VOLUME_MM3 / 1000) * DENSITY_G_CM3, 2);
		expect(p.attempts_remaining).toBeDefined();
	});

	it('the band is unsigned: an equal miss over and under reads the same', async () => {
		const over = TARGET_VOLUME_MM3 * 1.02;
		const under = TARGET_VOLUME_MM3 * 0.98;
		const read = async (v: number) => {
			await after.db.sql(
				`insert into public.gauntlet_run_tokens
					(code, user_id, challenge_id, reveal_at, expires_at, started_at, run_id)
				 values ($1, $2, $3, now(), now() + interval '1 hour', now(), $4)`,
				[
					v === over ? 'BANDOVER' : 'BANDUNDR',
					after.student.id,
					after.challengeId,
					'22222222-2222-2222-2222-222222222222'
				]
			);
			const r = await after.db.asAnon((q) =>
				q<{ result: Record<string, unknown> }>(
					'select public.gauntlet_macro_submit($1, $2, $3) as result',
					[
						v === over ? 'BANDOVER' : 'BANDUNDR',
						v,
						'22222222-2222-2222-2222-222222222222'
					]
				)
			);
			return r.rows[0].result;
		};
		const a = await read(over);
		const b = await read(under);
		expect(a.deviation_band).toBe(b.deviation_band);
	});
});

describe('gauntlet_submit (Speedrun practice branch)', () => {
	const call = (w: World) =>
		w.db.asUser(w.student.id, async (q) => {
			const r = await q<{ result: unknown }>(
				'select public.gauntlet_submit($1, $2::jsonb, $3) as result',
				[w.challengeId, JSON.stringify({ mass: SUBMITTED_MASS_G }), 1234]
			);
			return r.rows[0].result;
		});

	it('POSITIVE CONTROL: at 0061 one free call hands any signed-in student the key', async () => {
		const hits = reconstructions(await call(before), factsFor(SUBMITTED_MASS_G));
		expect(hits.length).toBeGreaterThan(0);
	});

	it('at 0147 the practice check reconstructs nothing', async () => {
		const payload = await call(after);
		expect(reconstructions(payload, factsFor(SUBMITTED_MASS_G))).toEqual([]);
	});

	it('still teaches: verdict, the caller own mass, and the band', async () => {
		const p = (await call(after)) as Record<string, unknown>;
		expect(p.is_correct).toBe(false);
		expect(Number(p.your_mass)).toBeCloseTo(SUBMITTED_MASS_G, 9);
		expect(['close', 'near', 'far']).toContain(p.deviation_band);
	});

	it('grades on the same basis as the ranked path: a within-tolerance mass passes', async () => {
		const p = await after.db.asUser(after.student.id, async (q) => {
			const r = await q<{ result: Record<string, unknown> }>(
				'select public.gauntlet_submit($1, $2::jsonb, $3) as result',
				[after.challengeId, JSON.stringify({ mass: TARGET_MASS_G }), 1000]
			);
			return r.rows[0].result;
		});
		expect(p.is_correct).toBe(true);
		expect(p.deviation_band).toBe('pass');
		// The numeric detector is not the instrument for a PASS: the caller
		// submitted the target, so their own echoed number legitimately equals it
		// and every ratio is 1. The shape assertion for this case is the KEY SET,
		// which is the other half of "assert the shape, not a field name" -- it
		// reddens on a re-added field whatever its value, where the detector
		// reddens on a disclosing value whatever its key. Neither alone is enough.
		expect(Object.keys(p).sort()).toEqual([
			'deviation_band',
			'is_correct',
			'mass_unit',
			'mode',
			'score_metric',
			'unit_system',
			'your_mass'
		]);
	});
});

describe('gauntlet_room_manual_submit', () => {
	const call = (w: World, code = 'ROOMRUN1') =>
		w.db.asUser(w.student.id, async (q) => {
			const r = await q<{ result: unknown }>(
				'select public.gauntlet_room_manual_submit($1, $2) as result',
				[code, SUBMITTED_MASS_G]
			);
			return r.rows[0].result;
		});

	it('POSITIVE CONTROL: at 0010/0061 one wrong entry in a live room yields the target', async () => {
		const hits = reconstructions(await call(before), factsFor(SUBMITTED_MASS_G));
		expect(hits.length).toBeGreaterThan(0);
	});

	it('at 0147 a wrong entry reconstructs nothing', async () => {
		const payload = await call(after);
		expect(reconstructions(payload, factsFor(SUBMITTED_MASS_G))).toEqual([]);
	});

	it('the coaching band is budgeted, and running out never blocks the submit', async () => {
		// Its OWN token: the budget is per token, so sharing one with the tests
		// above would make this assertion depend on file order.
		await after.db.sql(
			`insert into public.gauntlet_run_tokens
				(code, user_id, challenge_id, room_id, reveal_at, expires_at)
			 values ('ROOMRUN2', $1, $2,
			         (select room_id from public.gauntlet_run_tokens where code = 'ROOMRUN1'),
			         now(), now() + interval '1 hour')`,
			[after.student.id, after.challengeId]
		);
		const bands: unknown[] = [];
		for (let i = 0; i < 5; i += 1) {
			const p = (await call(after, 'ROOMRUN2')) as Record<string, unknown>;
			bands.push(p.deviation_band);
			// The racer is never locked out of a live round.
			expect(p.is_correct).toBe(false);
			expect(p.score_metric).not.toBeNull();
		}
		// The first attempts coach; past the cap the oracle goes quiet.
		expect(bands.slice(0, 2).every((b) => ['close', 'near', 'far'].includes(b as string))).toBe(
			true
		);
		expect(bands[bands.length - 1]).toBe('withheld');
	});

	it('a withheld band still reconstructs nothing', async () => {
		const payload = await call(after);
		expect(reconstructions(payload, factsFor(SUBMITTED_MASS_G))).toEqual([]);
	});
});

describe('knowledge modes are deliberately untouched (0147 section 6)', () => {
	// Pinning this is the point: a future session must be able to tell that the
	// knowledge branch was LEFT ALONE on purpose, not quietly half-fixed. The
	// clock cannot be server-stamped without a start event, which does not exist.
	const askOne = async (w: World, answer: string, elapsed: number) => {
		const { rows } = await w.db.sql<{ id: string }>(
			`select id from public.challenges where mode = 'gdt_tolerance' and published order by title limit 1`
		);
		return w.db.asUser(w.student.id, async (q) => {
			const r = await q<{ result: Record<string, unknown> }>(
				'select public.gauntlet_submit($1, $2::jsonb, $3) as result',
				[rows[0].id, JSON.stringify({ answer }), elapsed]
			);
			return r.rows[0].result;
		});
	};

	it('the payload shape is identical before and after 0147', async () => {
		const b = await askOne(before, 'zzz-wrong', 4321);
		const a = await askOne(after, 'zzz-wrong', 4321);
		expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
		expect(a).toEqual(b);
	});

	it('the open defects are still open, and are recorded rather than claimed fixed', async () => {
		const wrong = await askOne(after, 'zzz-wrong', 4321);
		// Still returns the key on a wrong answer (the teaching 0147 preserves).
		expect(wrong.is_correct).toBe(false);
		expect(wrong.correct).toBeTruthy();
		// Still ranks on the number the browser sent. 0147 section 6 says so in
		// words and proposes the start event that would fix it.
		const zeroed = await askOne(after, 'zzz-wrong', 0);
		expect(Number(zeroed.score_metric)).toBe(0);
	});
});

describe('the migration itself', () => {
	it('re-applies cleanly (it will be pasted more than once)', async () => {
		const sqlText = readFileSync(
			join(process.cwd(), 'supabase', 'migrations', FILE_0147),
			'utf8'
		);
		await expect(after.db.sql(sqlText)).resolves.toBeTruthy();
		// And the world still behaves after a second paste.
		const p = await after.db.asAnon(async (q) => {
			const r = await q<{ result: unknown }>('select public.gauntlet_run_targets($1) as result', [
				'SOLOCODE'
			]);
			return r.rows[0].result;
		});
		expect(reconstructions(p, factsFor(SUBMITTED_VOLUME_MM3))).toEqual([]);
	});

	it('keeps the anon grant the macros need, and closes the new helpers', async () => {
		const granted = await after.db.sql<{ proname: string; anon: boolean; authed: boolean }>(
			`select p.proname,
			        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
			        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and (p.proname like '_gauntlet%' or p.proname in
			        ('gauntlet_run_targets','gauntlet_macro_submit','gauntlet_submit','gauntlet_room_manual_submit'))
			 order by p.proname`
		);
		const by = (n: string) => granted.rows.filter((r) => r.proname === n);
		// The run code is the credential; a SolidWorks macro calls these with the
		// anon key and has no session (0137's deliberate list).
		expect(by('gauntlet_run_targets').every((r) => r.anon)).toBe(true);
		expect(by('gauntlet_macro_submit').every((r) => r.anon)).toBe(true);
		// Signed-in only.
		expect(by('gauntlet_submit').every((r) => !r.anon && r.authed)).toBe(true);
		expect(by('gauntlet_room_manual_submit').every((r) => !r.anon && r.authed)).toBe(true);
		// The new private helpers are reachable by NOBODY. A bare `revoke from
		// public` would not have done this on a hosted project.
		const helpers = granted.rows.filter((r) => r.proname.startsWith('_gauntlet'));
		expect(helpers.length).toBeGreaterThanOrEqual(5);
		expect(helpers.filter((r) => r.anon || r.authed)).toEqual([]);
	});

	it('keeps every signature it replaces, so no old arity survives as an overload', async () => {
		const { rows } = await after.db.sql<{ proname: string; n: string }>(
			`select proname, count(*)::text as n from pg_proc p
			 join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public'
			   and proname in ('gauntlet_submit','gauntlet_run_targets','gauntlet_macro_submit','gauntlet_room_manual_submit')
			 group by proname order by proname`
		);
		expect(rows.map((r) => [r.proname, r.n])).toEqual([
			['gauntlet_macro_submit', '1'],
			['gauntlet_room_manual_submit', '1'],
			['gauntlet_run_targets', '1'],
			['gauntlet_submit', '1']
		]);
	});
});


describe('the band vocabulary the two surfaces share', () => {
	// This is what makes the "either deploy order is safe" claim in 0147's header
	// true on screen rather than just in the payload. A client shipped before the
	// migration is applied by hand gets NO `deviation_band` at all.
	it('an ABSENT band reads as a plain miss, not as a broken level', () => {
		for (const absent of [null, undefined, '']) {
			expect(deviationBandLabel(absent)).toBe('Outside tolerance');
			expect(deviationBandHint(absent)).toBe('');
		}
	});

	it('an explicit `unknown` is a DIFFERENT statement and keeps its own words', () => {
		// `unknown` is the server saying the LEVEL carries no target. Collapsing it
		// into the absent case would hide a real authoring fault; collapsing the
		// absent case into it would tell a student their level is broken during
		// the window before the migration is applied.
		expect(deviationBandLabel('unknown')).not.toBe(deviationBandLabel(null));
		expect(deviationBandHint('unknown')).not.toBe('');
	});

	it('every band has words, and no two states read the same', () => {
		const bands = ['pass', 'close', 'near', 'far', 'unknown', 'withheld'];
		const labels = bands.map((b) => deviationBandLabel(b));
		expect(labels.every((l) => l.length > 0)).toBe(true);
		expect(new Set(labels).size).toBe(bands.length);
	});

	it('no band label or hint leaks a number', () => {
		// The whole point of the band is that it is not a quantity. A digit in any
		// of these strings is a percentage or a target that crept back in.
		for (const b of ['pass', 'close', 'near', 'far', 'unknown', 'withheld']) {
			expect(deviationBandLabel(b)).not.toMatch(/[0-9]/);
			expect(deviationBandHint(b)).not.toMatch(/[0-9]/);
		}
	});
});
