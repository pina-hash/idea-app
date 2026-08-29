// tests/gauntlet-authoring-tolerance.test.ts
//
// The GAUNTLET authoring form's default volume tolerance must equal the
// SERVER's default. This file used to read the server's out of the migration
// SQL with a regex; it now asks a REAL Postgres running the real migrations
// instead, for the reason recorded below.
//
// WHY IT EXISTS. The form seeded the literal 0.5 from 0009. 0036 tightened the
// server default to 0.1 and kept the VBA macros and the C# add-in in step, but
// nothing moved the form -- and `buildPayload` writes the seed into `answer`,
// where the per-level override BEATS the server constant. So every challenge
// authored through the form since 0036 has graded at five times the intended
// band, and five times the band the student watched while modelling: a part the
// add-in called a fail could be a ranked pass.
//
// That regression was SILENT in every direction. Nothing type-checks a number
// in a form against a constant in a plpgsql body; no test read either; the
// number on the page and the number used to grade agreed with each other (they
// are the same stored field), so the surface looked self-consistent while
// disagreeing with the two tools the student actually uses. It is exactly the
// shape CLAUDE.md reserves automated tests for.
//
// WHY THE ORIGINAL INSTRUMENT WAS WRONG, AND WHY A REGEX ON THE SQL COULD NOT
// SURVIVE ITS OWN PREMISE. The first version of this file parsed
// `c_volume_tol_pct constant numeric := <value>;` out of the newest migration
// that redefined `gauntlet_macro_submit`, on the theory that migrations are an
// immutable applied record and the highest-numbered definition is the live one.
// That theory is still correct; the parser was coupled to how 0036 happened to
// SPELL the default rather than to what the default MEANS. 0146 shipped a test
// pinning this file's number to the server's, in parallel with 0147, which
// refactored the same constant into a shared SQL function,
// `_gauntlet_tol_pct(answer)` -- same value (0.1), same job, no local
// `c_volume_tol_pct` declaration left in `gauntlet_macro_submit` at all. The
// regex found nothing and the file raised on an instrument failure, not a real
// disagreement between the form and the server. Two migrations built without
// sight of each other is exactly how a text-shaped assumption like this
// surfaces: nobody was wrong about the number, the parser was wrong about the
// SHAPE the number would keep taking.
//
// THE FIX IS TO STOP READING THE DEFINITION AND START ASKING FOR THE ANSWER.
// `startTestDb` already applies the real migration chain (0004..0147) to an
// embedded Postgres for 0146's and 0147's own tests; this file reuses that
// fixture and calls the REAL `gauntlet_submit` RPC on a level whose `answer`
// carries no `tolerance_pct`, so the server's default has to govern the
// pass/fail verdict. Two probes bracket `GAUNTLET_DEFAULT_TOLERANCE_PCT` --
// one submission just inside it, one just outside -- and the server's own
// verdicts are compared against what the form's constant predicts. This is
// blind to whether the default lives in a `constant`, a SQL function, a
// lookup table, or five more migrations' worth of some other shape: it only
// ever asks "does a submission at this deviation pass", which is the one
// question that has to keep meaning the same thing for the RPC to keep
// grading correctly at all. THE EXPECTED VALUE STILL DOES NOT COME FROM THE
// THING UNDER TEST -- it is read off the live database's own graded verdicts,
// which is a strictly stronger source than the SQL text ever was: this proves
// the number the server actually ENFORCES, not merely the number written next
// to `constant`.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	GAUNTLET_DEFAULT_TOLERANCE_PCT,
	buildPayload,
	emptyForm,
	formFromChallenge
} from '../src/lib/gauntlet/authoring';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';

const MIGRATIONS_DIR = fileURLToPath(new URL('../supabase/migrations', import.meta.url));

/**
 * Kept only for the one remaining SQL-text assertion in this file (a
 * user-facing refusal SENTENCE, not a graded number) -- see the note on
 * `gauntlet_publish_blocker requires an explicit band to publish` below for
 * why that one case is still read out of the migration text.
 */
function readNewestDefinitionOf(fnName: string): string {
	const needle = `create or replace function public.${fnName}(`;
	const files = readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith('.sql'))
		.sort()
		.reverse();
	for (const file of files) {
		const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
		if (sql.includes(needle)) return sql;
	}
	throw new Error(`No migration defines ${fnName}`);
}

/**
 * The GAUNTLET dependency chain through 0147, where `gauntlet_submit`'s
 * Speedrun branch last picked up the shared `_gauntlet_tol_pct` helper.
 * Mirrors `tests/gauntlet-target-disclosure.test.ts`'s CHAIN_0061 + 0147 --
 * duplicated here rather than imported, the way every other GAUNTLET/notebook
 * suite states its own chain, so this file's dependency list cannot drift by
 * editing a different file's constant.
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
	'0147_gauntlet_close_target_disclosure.sql'
] as const;

/**
 * Publishes a Speedrun level whose `answer` carries a target mass basis
 * (volume x density) and, deliberately, no `tolerance_pct` at all -- so the
 * server's own default is the only thing that can decide a verdict. Returns
 * the level's implied target mass in grams (MMGS, the default unit system a
 * prompt with no `unit_system` field resolves to).
 */
async function seedUnbandedLevel(db: TestDb): Promise<{ challengeId: string; targetMassG: number }> {
	const volumeMm3 = 100_000;
	const densityGCm3 = 2.7; // Aluminum 6061, matches the seeded demo levels.
	const targetMassG = (volumeMm3 / 1000) * densityGCm3;
	const prompt = { material: 'Aluminum 6061', density: densityGCm3, unit_system: 'MMGS' };
	const answer = { target_volume_mm3: volumeMm3, density: densityGCm3 };
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
		 values ('speedrun', 'Tolerance Probe (unbanded)', 2, $1::jsonb, $2::jsonb, 'published')
		 returning id`,
		[JSON.stringify(prompt), JSON.stringify(answer)]
	);
	return { challengeId: rows[0].id, targetMassG };
}

/**
 * Same shape, but `answer.tolerance_pct` is set explicitly to a value nothing
 * else in this file collides with -- the instrument control below uses this to
 * prove the probe mechanism actually discriminates pass from fail at a KNOWN
 * band, rather than merely never firing.
 */
async function seedBandedLevel(
	db: TestDb,
	tolerancePct: number
): Promise<{ challengeId: string; targetMassG: number }> {
	const volumeMm3 = 40_000;
	const densityGCm3 = 7.85; // Steel, distinct from the unbanded fixture above.
	const targetMassG = (volumeMm3 / 1000) * densityGCm3;
	const prompt = { material: 'Steel', density: densityGCm3, unit_system: 'MMGS' };
	const answer = { target_volume_mm3: volumeMm3, density: densityGCm3, tolerance_pct: tolerancePct };
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
		 values ('speedrun', 'Tolerance Probe (banded)', 2, $1::jsonb, $2::jsonb, 'published')
		 returning id`,
		[JSON.stringify(prompt), JSON.stringify(answer)]
	);
	return { challengeId: rows[0].id, targetMassG };
}

/**
 * Submits a manual Speedrun mass through the REAL `gauntlet_submit` RPC (the
 * unranked practice branch: no run token needed) and reports whether the
 * server graded it correct.
 */
async function submitMass(
	db: TestDb,
	student: SeededUser,
	challengeId: string,
	mass: number
): Promise<boolean> {
	const result = await db.asUser(student.id, async (q) => {
		const r = await q<{ result: { is_correct: boolean } }>(
			'select public.gauntlet_submit($1, $2::jsonb) as result',
			[challengeId, JSON.stringify({ mass })]
		);
		return r.rows[0].result;
	});
	return result.is_correct;
}

/** A submitted mass this many percent away from the target, in the target's own unit. */
const massAtDeviation = (targetMassG: number, deviationPct: number) =>
	targetMassG * (1 + deviationPct / 100);

let db: TestDb;
let student: SeededUser;

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	student = await createUser(db, 'racer@boscotech.net', 'Racer One');
}, 300_000);

afterAll(async () => {
	await db?.stop();
});

describe('the form default tracks the server default', () => {
	// INSTRUMENT CONTROL. Proves the probe -- submit at a known deviation,
	// read back is_correct -- actually discriminates pass from fail, and that it
	// TRACKS whichever band a level is explicitly given rather than always
	// answering the same fixed number (the equivalent, for a behavioural probe,
	// of the old regex parser's own instrument-control assertion against several
	// distinct SQL bodies). Each value here is distinct from
	// GAUNTLET_DEFAULT_TOLERANCE_PCT and from the others, so a probe that
	// secretly ignored the level and always measured the same width would fail
	// at least one of them.
	it.each([1.2, 3.3, 7.5])(
		'the probe discriminates pass from fail at a KNOWN, explicit band of %s percent',
		async (knownTolerancePct) => {
			const { challengeId, targetMassG } = await seedBandedLevel(db, knownTolerancePct);
			const inside = await submitMass(
				db,
				student,
				challengeId,
				massAtDeviation(targetMassG, knownTolerancePct * 0.9)
			);
			const outside = await submitMass(
				db,
				student,
				challengeId,
				massAtDeviation(targetMassG, knownTolerancePct * 1.1)
			);
			expect(inside).toBe(true);
			expect(outside).toBe(false);
		}
	);

	// The comparison is `<=`, not `<` (see gauntlet_submit's speedrun branch):
	// a submission exactly on the band edge still passes. Pinned so a future
	// tightening to a strict `<` is a deliberate decision seen in a diff, not an
	// accidental one-line change nothing here would otherwise notice.
	it('a submission exactly on the band edge passes (the comparison is inclusive)', async () => {
		const knownTolerancePct = 2.4;
		const { challengeId, targetMassG } = await seedBandedLevel(db, knownTolerancePct);
		const onEdge = await submitMass(
			db,
			student,
			challengeId,
			massAtDeviation(targetMassG, knownTolerancePct)
		);
		expect(onEdge).toBe(true);
	});

	// GAUNTLET_DEFAULT_TOLERANCE_PCT equals the server constant: measured by
	// asking the live RPC to grade a level that carries no explicit band, so
	// only the server's own default can be governing the verdict. Whichever
	// shape that default takes -- a `constant`, `_gauntlet_tol_pct`, or
	// whatever comes after it -- the query still answers, because it is a
	// question about behaviour, not about a declaration's spelling.
	it('GAUNTLET_DEFAULT_TOLERANCE_PCT equals the server default (measured against the live RPC)', async () => {
		const { challengeId, targetMassG } = await seedUnbandedLevel(db);
		const inside = await submitMass(
			db,
			student,
			challengeId,
			massAtDeviation(targetMassG, GAUNTLET_DEFAULT_TOLERANCE_PCT * 0.9)
		);
		const outside = await submitMass(
			db,
			student,
			challengeId,
			massAtDeviation(targetMassG, GAUNTLET_DEFAULT_TOLERANCE_PCT * 1.1)
		);
		expect(inside).toBe(true);
		expect(outside).toBe(false);
	});

	// The specific historical value, named so a silent drift back to it is loud.
	it('is not the pre-0036 0.5 the form used to seed', () => {
		expect(GAUNTLET_DEFAULT_TOLERANCE_PCT).not.toBe(0.5);
	});

	it.each(['speedrun', 'reverse_engineer', 'feature_golf'] as const)(
		'a fresh %s form starts on it',
		(mode) => {
			expect(emptyForm(mode).tolerance_pct).toBe(GAUNTLET_DEFAULT_TOLERANCE_PCT);
		}
	);
});

describe('what buildPayload writes', () => {
	it.each(['speedrun', 'reverse_engineer', 'feature_golf'] as const)(
		'%s: the band lands in answer (which grades) and prompt (which is shown)',
		(mode) => {
			const { prompt, answer } = buildPayload(emptyForm(mode)) as {
				prompt: Record<string, unknown>;
				answer: Record<string, unknown>;
			};
			// `answer.tolerance_pct` is the one the server reads FIRST, ahead of its
			// own constant -- that is why the seed mattered at all.
			expect(answer.tolerance_pct).toBe(GAUNTLET_DEFAULT_TOLERANCE_PCT);
			// `prompt.tolerance_pct` is the student's on-page +/-% readout. The two
			// must be the same number or the page describes a band it is not graded
			// on, which is the defect one level over.
			expect(prompt.tolerance_pct).toBe(answer.tolerance_pct);
		}
	);

	it('a knowledge challenge carries no volume band at all', () => {
		const { prompt, answer } = buildPayload(emptyForm('drawing_reading')) as {
			prompt: Record<string, unknown>;
			answer: Record<string, unknown>;
		};
		expect(prompt.tolerance_pct).toBeUndefined();
		expect(answer.tolerance_pct).toBeUndefined();
	});

	// An author who types a band still gets the band they typed. The seed is a
	// starting point, not a policy.
	it('an author-chosen band is written through unchanged', () => {
		const form = { ...emptyForm('speedrun'), tolerance_pct: 2.5 };
		const { answer } = buildPayload(form) as { answer: Record<string, unknown> };
		expect(answer.tolerance_pct).toBe(2.5);
	});
});

describe('already-stored challenges are not rewritten by the new default', () => {
	// The fix is to the SEED only. Editing a challenge stored under the old 0.5
	// band must still show 0.5, or opening a level in the authoring form and
	// pressing save silently re-grades it -- which is a decision for a person,
	// not a side effect of loading a form.
	it('formFromChallenge keeps a stored 0.5', () => {
		const form = formFromChallenge({
			id: 'c1',
			mode: 'speedrun',
			title: 'Legacy',
			difficulty: 2,
			status: 'published',
			prompt: { tolerance_pct: 0.5 },
			answer: { tolerance_pct: 0.5, target_volume_mm3: 80000 }
		});
		expect(form.tolerance_pct).toBe(0.5);
		const { answer } = buildPayload(form) as { answer: Record<string, unknown> };
		expect(answer.tolerance_pct).toBe(0.5);
	});

	// A challenge stored with NO band loads as null rather than being quietly
	// filled with the seed. That is the same rule as above pointing the other
	// way: the seed is what a NEW challenge starts on, and inventing a band for
	// a stored row would write an override into a row the server was defaulting
	// for -- which is how a default silently becomes 369 frozen copies of
	// itself. The author is told instead, by the publish blocker.
	it('a stored challenge with no band stays bandless, not seeded', () => {
		const form = formFromChallenge({
			id: 'c2',
			mode: 'speedrun',
			title: 'Bandless',
			difficulty: 2,
			status: 'draft',
			prompt: {},
			answer: { target_volume_mm3: 80000 }
		});
		expect(form.tolerance_pct).toBeNull();
		const { answer } = buildPayload(form) as { answer: Record<string, unknown> };
		expect(answer.tolerance_pct).toBeUndefined();
	});
});

describe('why the form cannot simply leave the band unset', () => {
	// This is the fact that decides the shape of the fix, so it is pinned rather
	// than left in a comment: `gauntlet_publish_blocker` REFUSES a modeling
	// challenge with no `answer.tolerance_pct`. Seeding null would therefore make
	// every freshly authored modeling challenge unpublishable until the author
	// typed a number, which is how 0.5 gets typed back in by hand.
	//
	// This one still reads the migration SQL directly rather than asking the
	// database, and deliberately so: it is pinning the TEXT of a user-facing
	// refusal sentence, which is exactly the kind of fact a regex is the right
	// tool for. What changed above is narrower than "stop reading SQL" -- it is
	// "stop reading SQL for a fact that is actually a question about runtime
	// behaviour".
	it('gauntlet_publish_blocker requires an explicit band to publish', () => {
		const sql = readNewestDefinitionOf('gauntlet_publish_blocker');
		expect(sql).toContain("public.gauntlet_jnum(p_answer, 'tolerance_pct') is null");
		expect(sql).toContain('A tolerance band is required to publish.');
	});

	it('so a freshly authored modeling challenge always carries one', () => {
		for (const mode of ['speedrun', 'reverse_engineer', 'feature_golf'] as const) {
			const { answer } = buildPayload(emptyForm(mode)) as { answer: Record<string, unknown> };
			expect(answer.tolerance_pct).not.toBeUndefined();
			expect(answer.tolerance_pct).not.toBeNull();
		}
	});
});
