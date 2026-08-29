// tests/gauntlet-published-answer.test.ts
//
// 0153: the ranked answer stops being PUBLISHED, on the rows that already
// carry it.
//
// WHY THIS FILE EXISTS, given that automated tests here are the exception.
// Every guarantee below fails silently.
//
//   * A key creeping back into `challenges.prompt` costs nothing visible. The
//     page renders, the run grades, the board ranks -- and every signed-in
//     student can read the target through PostgREST. That is precisely how this
//     survived 0061 and 0147, both of which named it in their own headers.
//   * `answer` being damaged by a migration that strips `prompt` is invisible
//     until somebody's ranked run is graded against a NULL and told they are
//     wrong. The three graders read `answer`; nothing on screen reports a
//     missing key there.
//   * A publish that starts refusing is silent in the other direction: it is a
//     raise, in an authoring form, in front of one teacher, on a day nobody is
//     watching CI. `gauntlet_publish_blocker` requires `answer.density` and
//     `answer.target_mass`, and moving fields between two object literals is
//     exactly the shape of change that breaks it -- a previous tolerance fix
//     walked into that trap.
//
// THE MIGRATION IS APPLIED OVER SEEDED PRE-MIGRATION DATA, not asserted against
// a chain that always had it. The chain boots one file short of 0153, the rows
// are seeded in the shape production holds (both objects carrying the three
// keys, exactly as the 0005 and 0007 seeds wrote them), the BEFORE facts are
// captured through the real client-role read and the real grading RPC, and then
// the file is applied over the top. Every assertion below compares two measured
// worlds rather than one world against a description of it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';
import { buildPayload, emptyForm, type AuthorFormState } from '$lib/gauntlet/authoring';
import type { GauntletModeId } from '$lib/gauntlet';

/** The GAUNTLET chain as production stands, one file short of the file under test. */
const CHAIN_BEFORE = [
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
	// 0149 is deliberately absent, for the reason 0151's own suite records: its
	// self-check requires nine views a gauntlet-only chain does not have.
	'0150_gauntlet_connect_run_analysis.sql',
	'0151_gauntlet_meter_practice.sql'
] as const;

const FILE_0153 = '0153_gauntlet_unpublish_the_target.sql';
const SQL_0153 = readFileSync(join(process.cwd(), 'supabase/migrations', FILE_0153), 'utf8');

/** The three keys this file is about. Named once. */
const ANSWER_KEYS = ['target_mass', 'density', 'tolerance_pct'] as const;

// ---------------------------------------------------------------------------
// The level. Nothing is round, so a recovered figure could not have come from a
// default, another fixture, or a coincidence.
// ---------------------------------------------------------------------------
const TARGET_VOLUME_MM3 = 73412.8391;
const DENSITY_G_CM3 = 2.7;
const TOLERANCE_PCT = 0.1;
const TARGET_MASS_G = (TARGET_VOLUME_MM3 / 1000) * DENSITY_G_CM3;
/** A clear miss, so a practice check is a check and never an accidental pass. */
const MISS_MASS_G = 150.25;

/** The shape production holds: the three keys in BOTH objects (0005/0007). */
const legacyPrompt = (extra: Record<string, unknown> = {}) => ({
	material: 'Aluminium 6061',
	density: DENSITY_G_CM3,
	density_unit: 'g/cm³',
	target_mass: TARGET_MASS_G,
	mass_unit: 'g',
	tolerance_pct: TOLERANCE_PCT,
	length_unit: 'mm',
	unit_system: 'MMGS',
	note: 'Read the section view.',
	...extra
});
const legacyAnswer = (extra: Record<string, unknown> = {}) => ({
	drawing: '<svg/>',
	target_volume_mm3: TARGET_VOLUME_MM3,
	target_mass: TARGET_MASS_G,
	density: DENSITY_G_CM3,
	tolerance_pct: TOLERANCE_PCT,
	feature_count: 5,
	...extra
});

interface World {
	db: TestDb;
	student: SeededUser;
	teacher: SeededUser;
	publishedId: string;
	draftId: string;
	reverseId: string;
}

async function seedWorld(db: TestDb): Promise<World> {
	const student = await createUser(db, 'student@boscotech.net', 'A Student');
	const teacher = await createUser(db, 'chair@boscotech.edu', 'The Chair');
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		'chair@boscotech.edu'
	]);

	// `published` is DERIVED from `status` by 0009's trigger, so the status is
	// what is set and the boolean follows.
	const insert = async (
		mode: string,
		title: string,
		status: string,
		prompt: object,
		answer: object
	) => {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, status, prompt, answer)
			 values ($1::public.gauntlet_mode, $2, 2, $3, $4::jsonb, $5::jsonb)
			 returning id`,
			[mode, title, status, JSON.stringify(prompt), JSON.stringify(answer)]
		);
		return rows[0].id;
	};

	return {
		db,
		student,
		teacher,
		publishedId: await insert(
			'speedrun',
			'Published Speedrun',
			'published',
			legacyPrompt({ slug: 'published-speedrun', par_time: 420 }),
			legacyAnswer()
		),
		draftId: await insert(
			'speedrun',
			'Draft Speedrun',
			'draft',
			legacyPrompt({ slug: 'draft-speedrun' }),
			legacyAnswer()
		),
		reverseId: await insert(
			'reverse_engineer',
			'Published Reverse Engineer',
			'published',
			legacyPrompt({ reference: '<svg/>' }),
			legacyAnswer({ target_surface_area_mm2: 12345.6 })
		)
	};
}

/** The prompt a STUDENT can read, through the client role and the 0004 grant. */
async function studentPrompt(db: TestDb, uid: string, id: string) {
	return db.asUser(uid, async (q) => {
		const { rows } = await q<{ prompt: Record<string, unknown> | null }>(
			`select prompt from public.challenges where id = $1`,
			[id]
		);
		return rows[0]?.prompt ?? null;
	});
}

/** The practice check, through the real RPC, as the student. */
async function practice(db: TestDb, uid: string, id: string, mass: number) {
	return db.asUser(uid, async (q) => {
		const { rows } = await q<{ result: Record<string, unknown> }>(
			`select public.gauntlet_submit($1::uuid, $2::jsonb, $3) as result`,
			[id, JSON.stringify({ mass: String(mass) }), 1000]
		);
		return rows[0].result;
	});
}

/** A full form for a mode, so `buildPayload` emits everything it can. */
function fullForm(mode: GauntletModeId): AuthorFormState {
	return {
		...emptyForm(mode),
		title: 'Angle Bracket',
		slug: 'angle-bracket',
		unit_system: 'MMGS',
		material: '6061 Alloy',
		density: DENSITY_G_CM3,
		target_volume_mm3: TARGET_VOLUME_MM3,
		surface_area_mm2: 18_400,
		feature_count: 5,
		target_mass: TARGET_MASS_G,
		tolerance_pct: TOLERANCE_PCT,
		par_time: 90,
		par_features: 5,
		note: 'Read the section view.',
		asset: '<svg viewBox="0 0 10 10"></svg>',
		drawing_image_path: 'drawings/angle-bracket.png',
		model_path: 'models/angle-bracket.stl'
	};
}

// ===========================================================================
describe('0153 over seeded pre-migration data', () => {
	let w: World;

	// Everything measured BEFORE the migration, so no assertion below depends on
	// the order vitest happens to run the `it`s in.
	const before: {
		prompt: Record<string, unknown> | null;
		practiceMiss: Record<string, unknown> | null;
		practicePass: Record<string, unknown> | null;
	} = { prompt: null, practiceMiss: null, practicePass: null };
	const after: typeof before & { draftPrompt: Record<string, unknown> | null; reversePrompt: Record<string, unknown> | null } = {
		prompt: null,
		practiceMiss: null,
		practicePass: null,
		draftPrompt: null,
		reversePrompt: null
	};
	let answerBefore: Record<string, unknown> | null = null;
	let answerAfter: Record<string, unknown> | null = null;
	let secondApplyTouched = -1;
	let stampsSeeded = '';
	let firstApplyMovedStamps = false;

	beforeAll(async () => {
		const db = await startTestDb(CHAIN_BEFORE as unknown as string[]);
		w = await seedWorld(db);

		before.prompt = await studentPrompt(db, w.student.id, w.publishedId);
		before.practiceMiss = await practice(db, w.student.id, w.publishedId, MISS_MASS_G);
		// 0151 meters the practice check per student per challenge, so the second
		// check goes through a SECOND student rather than by waiting out a floor.
		const other = await createUser(db, 'second@boscotech.net', 'Second Student');
		before.practicePass = await practice(db, other.id, w.publishedId, TARGET_MASS_G);
		const { rows: ab } = await db.sql<{ answer: Record<string, unknown> }>(
			`select answer from public.challenges where id = $1`,
			[w.publishedId]
		);
		answerBefore = ab[0].answer;

		{
			const { rows } = await db.sql<{ id: string; updated_at: string }>(
				`select id, updated_at::text as updated_at from public.challenges order by id`
			);
			stampsSeeded = rows.map((r) => `${r.id}:${r.updated_at}`).join('|');
		}

		// --- the migration, applied by hand over that data, exactly as it will be
		await db.sql(SQL_0153);

		after.prompt = await studentPrompt(db, w.student.id, w.publishedId);
		after.draftPrompt = await db.asUser(w.teacher.id, async (q) => {
			const { rows } = await q<{ prompt: Record<string, unknown> }>(
				`select prompt from public.challenges where id = $1`,
				[w.draftId]
			);
			return rows[0]?.prompt ?? null;
		});
		after.reversePrompt = await studentPrompt(db, w.student.id, w.reverseId);
		const third = await createUser(db, 'third@boscotech.net', 'Third Student');
		const fourth = await createUser(db, 'fourth@boscotech.net', 'Fourth Student');
		after.practiceMiss = await practice(db, third.id, w.publishedId, MISS_MASS_G);
		after.practicePass = await practice(db, fourth.id, w.publishedId, TARGET_MASS_G);
		const { rows: aa } = await db.sql<{ answer: Record<string, unknown> }>(
			`select answer from public.challenges where id = $1`,
			[w.publishedId]
		);
		answerAfter = aa[0].answer;

		// Idempotence, measured on what a second apply WRITES rather than on the
		// end state -- which is 0 either way and would pass vacuously. The strip
		// stamps `updated_at`, so a row it touches again moves.
		const stamps = async () => {
			const { rows } = await db.sql<{ id: string; updated_at: string }>(
				`select id, updated_at::text as updated_at from public.challenges order by id`
			);
			return rows.map((r) => `${r.id}:${r.updated_at}`).join('|');
		};
		const stampsBefore = await stamps();
		await db.sql(SQL_0153);
		const stampsAfter = await stamps();
		secondApplyTouched = stampsBefore === stampsAfter ? 0 : 1;
		// The control: the FIRST apply must have moved those stamps, or the
		// comparison above is comparing two untouched worlds.
		firstApplyMovedStamps = stampsSeeded !== stampsBefore;
	}, 120_000);

	afterAll(async () => {
		await w?.db.stop();
	});

	// --- POSITIVE CONTROLS: the world this file exists to change ------------
	it('POSITIVE CONTROL: before 0153 a plain student read hands over the target, the density and the band', () => {
		expect(before.prompt).not.toBeNull();
		for (const key of ANSWER_KEYS) {
			expect(before.prompt, `${key} was expected in the pre-migration prompt`).toHaveProperty(key);
		}
	});

	it('POSITIVE CONTROL: before 0153 those three reconstruct the ranked comparison volume exactly, with no search', () => {
		const p = before.prompt as Record<string, number>;
		// This is `targetVolumeFromMass`, which the shipped client ran on this
		// very payload: mass / density, back to mm3.
		const recovered = (Number(p.target_mass) * 1000) / Number(p.density);
		expect(Math.abs(recovered - TARGET_VOLUME_MM3) / TARGET_VOLUME_MM3).toBeLessThan(1e-12);
		// And the band width, which is what turns a 163-probe search into 12.
		expect(Number(p.tolerance_pct)).toBe(TOLERANCE_PCT);
	});

	// --- WHAT 0153 CHANGES ---------------------------------------------------
	it('a published challenge publishes no target, no density and no tolerance', () => {
		expect(after.prompt).not.toBeNull();
		for (const key of ANSWER_KEYS) {
			expect(after.prompt, `${key} still published`).not.toHaveProperty(key);
		}
	});

	it('a DRAFT is stripped too, because publishing one does not rewrite its prompt', () => {
		for (const key of ANSWER_KEYS) {
			expect(after.draftPrompt, `${key} still in the draft prompt`).not.toHaveProperty(key);
		}
	});

	it('the other modeling modes are stripped as well, not just the ranked one', () => {
		for (const key of ANSWER_KEYS) {
			expect(after.reversePrompt, `${key} still in the reverse_engineer prompt`).not.toHaveProperty(key);
		}
	});

	it('everything the student legitimately needs to model survives, so this is a narrowing and not a blanking', () => {
		// The exclusion assertions above come back clean if the whole column were
		// emptied, or if the read returned nothing at all. This is their control.
		expect(after.prompt).toMatchObject({
			material: 'Aluminium 6061',
			mass_unit: 'g',
			length_unit: 'mm',
			unit_system: 'MMGS',
			slug: 'published-speedrun',
			par_time: 420,
			note: 'Read the section view.'
		});
	});

	it('`answer` is byte-identical: the file never wrote to it', () => {
		expect(answerAfter).toEqual(answerBefore);
		for (const key of ANSWER_KEYS) {
			expect(answerAfter).toHaveProperty(key);
		}
		expect((answerAfter as Record<string, number>).target_volume_mm3).toBe(TARGET_VOLUME_MM3);
	});

	// --- WHAT 0153 MUST NOT CHANGE ------------------------------------------
	it('grading is unchanged: the same miss and the same pass answer identically before and after', () => {
		const strip = (r: Record<string, unknown> | null) => {
			const { score_metric: _drop, ...rest } = (r ?? {}) as Record<string, unknown>;
			return rest;
		};
		expect(strip(after.practiceMiss)).toEqual(strip(before.practiceMiss));
		expect(strip(after.practicePass)).toEqual(strip(before.practicePass));
		// The control for that pair of equalities: they would also be equal if
		// both sides were the same failure.
		expect((before.practicePass as Record<string, unknown>).is_correct).toBe(true);
		expect((before.practiceMiss as Record<string, unknown>).is_correct).toBe(false);
		expect((after.practicePass as Record<string, unknown>).is_correct).toBe(true);
		expect((after.practiceMiss as Record<string, unknown>).deviation_band).toBe('far');
	});

	it('the practice check still discloses nothing itself (0147 holds through this file)', () => {
		expect(Object.keys(after.practiceMiss ?? {}).sort()).toEqual(
			['deviation_band', 'is_correct', 'mass_unit', 'mode', 'score_metric', 'unit_system', 'your_mass'].sort()
		);
	});

	it('re-applying the file is a no-op, and the first apply is the control that says so', () => {
		expect(firstApplyMovedStamps, 'the first apply wrote nothing, so the second proves nothing').toBe(true);
		expect(secondApplyTouched).toBe(0);
	});
});

// ===========================================================================
describe('the refusal, which is the half that protects a level from being stranded', () => {
	let db: TestDb;
	let thrown: string | null = null;
	let promptAfter: Record<string, unknown> | null = null;

	beforeAll(async () => {
		db = await startTestDb(CHAIN_BEFORE as unknown as string[]);
		// A level whose density lives ONLY in the prompt. `_gauntlet_density_g_cm3`
		// and `gauntlet_run_targets` both coalesce answer over prompt, so stripping
		// this row's prompt takes away the basis every grader computes from.
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, status, prompt, answer)
			 values ('speedrun', 'Density Only In Prompt', 2, 'published', $1::jsonb, $2::jsonb)
			 returning id`,
			[
				JSON.stringify(legacyPrompt()),
				JSON.stringify({ drawing: '<svg/>', target_volume_mm3: TARGET_VOLUME_MM3, tolerance_pct: TOLERANCE_PCT })
			]
		);
		try {
			await db.sql(SQL_0153);
		} catch (e) {
			thrown = e instanceof Error ? e.message : String(e);
		}
		const { rows: p } = await db.sql<{ prompt: Record<string, unknown> }>(
			`select prompt from public.challenges where id = $1`,
			[rows[0].id]
		);
		promptAfter = p[0].prompt;
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('refuses rather than stranding the level, and names it', () => {
		expect(thrown).not.toBeNull();
		expect(thrown).toMatch(/0153 REFUSES/);
		expect(thrown).toMatch(/Density Only In Prompt/);
	});

	it('and applies nothing at all when it refuses', () => {
		// The whole `do` block is one statement, so the raise rolls back its own
		// work; this is the assertion that says so rather than assuming it.
		for (const key of ANSWER_KEYS) {
			expect(promptAfter).toHaveProperty(key);
		}
	});
});

// ===========================================================================
describe('a freshly authored challenge still publishes -- the trap a previous tolerance fix walked into', () => {
	let db: TestDb;
	let teacher: SeededUser;

	beforeAll(async () => {
		db = await startTestDb(CHAIN_BEFORE as unknown as string[]);
		teacher = await createUser(db, 'author@boscotech.edu', 'The Author');
		await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
			'author@boscotech.edu'
		]);
		await db.sql(SQL_0153);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	/** Publish through the REAL RPC, with the REAL `buildPayload` output. */
	const publish = async (mode: GauntletModeId, mutate?: (a: Record<string, unknown>) => void) => {
		const { prompt, answer } = buildPayload(fullForm(mode));
		const a = { ...(answer as Record<string, unknown>) };
		mutate?.(a);
		return db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ id: string }>(
				`select public.gauntlet_author_upsert(null, $1::public.gauntlet_mode, $2, 2::smallint, 'published', $3::jsonb, $4::jsonb) as id`,
				[mode, `Fresh ${mode}`, JSON.stringify(prompt), JSON.stringify(a)]
			);
			return rows[0].id;
		});
	};

	for (const mode of ['speedrun', 'feature_golf'] as const) {
		it(`publishes a fresh ${mode} built by buildPayload, and the published prompt carries none of the three`, async () => {
			const id = await publish(mode);
			expect(id).toBeTruthy();
			const { rows } = await db.sql<{ published: boolean; prompt: Record<string, unknown>; answer: Record<string, unknown> }>(
				`select published, prompt, answer from public.challenges where id = $1`,
				[id]
			);
			expect(rows[0].published).toBe(true);
			for (const key of ANSWER_KEYS) {
				expect(rows[0].prompt, `${key} published by the form`).not.toHaveProperty(key);
				expect(rows[0].answer, `${key} missing from answer`).toHaveProperty(key);
			}
		});
	}

	it('POSITIVE CONTROL: the blocker still bites -- take density out of `answer` and the publish is refused', async () => {
		await expect(publish('speedrun', (a) => delete a.density)).rejects.toThrow(/Density is required to publish/);
	});

	it('POSITIVE CONTROL: and it still bites on the target mass', async () => {
		await expect(publish('speedrun', (a) => delete a.target_mass)).rejects.toThrow(/Target mass is required to publish/);
	});

	it('POSITIVE CONTROL: and on the tolerance band', async () => {
		await expect(publish('speedrun', (a) => delete a.tolerance_pct)).rejects.toThrow(/tolerance band is required to publish/i);
	});
});
