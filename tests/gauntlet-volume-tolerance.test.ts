// tests/gauntlet-volume-tolerance.test.ts
//
// The ranked volume pass band, and the four places that still state it.
//
// WHY THIS FILE IS A SWEEP AND NOT A CONSTANT. Volume is GAUNTLET's whole
// correctness signal: `abs(mass - target) <= target * tol / 100`. A copy that
// drifts does not fail, it silently changes what counts as a correct part --
// and it does so ASYMMETRICALLY, because the student watches one copy live
// while they model and the server grades with another. That is exactly the
// 0036 defect: the server tightened 0.5 -> 0.1, the authoring form was left
// behind, and every challenge authored through it for months was graded five
// times wider than the band the student was shown.
//
// ---------------------------------------------------------------------------
// WHAT IS ALREADY IMPOSSIBLE, AND WHAT IS NOT
// ---------------------------------------------------------------------------
// THE SQL SIDE IS SINGLE-SOURCE ALREADY, and that is worth stating because the
// standing description of this problem says otherwise. 0034 (0.5), 0036 (0.1)
// and 0061 (0.1) each declared a LOCAL `c_volume_tol_pct constant`, so there
// really were three -- but 0147 replaced all of them with one shared function,
// `_gauntlet_tol_pct(answer)`, and every later definition of every grading
// function reads it. Those three migrations are an immutable applied record of
// a superseded state; they decide nothing today and nothing should pin them.
// `the server states the band exactly once` below asserts the property that
// makes that true, so a future migration reintroducing a local literal reddens
// here rather than in a term's worth of grades.
//
// WHAT DRIFT IS STILL POSSIBLE is the three CLIENT copies, in three languages,
// none of which can import from the database or from each other:
//
//   * `src/lib/gauntlet/authoring.ts` -- the band a newly authored challenge is
//     seeded with, which lands in `answer.tolerance_pct` and OVERRIDES the
//     server default for that challenge forever after.
//   * `static/tools/idea-gauntlet-submit.bas` -- the VBA macro's live readout.
//   * `tools/solidworks-addin/.../GauntletMath.cs` -- the COM add-in's.
//
// THE VBA AND THE ADD-IN ARE BOTH IN THIS REPOSITORY. The standing description
// of this defect says the macros live "outside this repo" and does not mention
// the add-in at all; both are reachable from here and both are read below. A
// source this file expects and cannot read is a FAILURE naming that copy, never
// a silent skip -- a check that quietly guarded two copies of four would be
// worse than no check, because its green tick would be read as covering them.
//
// `tests/gauntlet-authoring-tolerance.test.ts` is the other half and is not
// duplicated here: it pins `authoring.ts` to the server BEHAVIOURALLY, by
// calling the real RPC on a level carrying no explicit band. This file pins the
// four TEXTS to each other. Neither subsumes the other -- a behavioural test
// cannot read a VBA file, and a text sweep cannot prove the server actually
// grades at the number it declares.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAUNTLET_DEFAULT_TOLERANCE_PCT } from '../src/lib/gauntlet/authoring';

const ROOT = resolve(__dirname, '..');
const MIGRATIONS = resolve(ROOT, 'supabase/migrations');

/**
 * One stated copy of the band. `read` returns the number, or throws with a
 * sentence naming what it could not reach -- which is how an unreachable copy
 * announces itself instead of dropping out of the sweep.
 */
interface Copy {
	/** What a failure message calls it. */
	readonly label: string;
	/** Repo-relative, so a failure names something a reader can open. */
	readonly path: string;
	/** How the value is spelled in that language. */
	readonly pattern: RegExp;
}

const COPIES: readonly Copy[] = [
	{
		label: 'the server default (_gauntlet_tol_pct, 0147)',
		path: 'supabase/migrations/0147_gauntlet_close_target_disclosure.sql',
		pattern: /coalesce\(\s*nullif\(p_answer\s*->>\s*'tolerance_pct',\s*''\)::numeric\s*,\s*([0-9.]+)\s*\)/
	},
	{
		label: 'the authoring form seed (GAUNTLET_DEFAULT_TOLERANCE_PCT)',
		path: 'src/lib/gauntlet/authoring.ts',
		pattern: /export const GAUNTLET_DEFAULT_TOLERANCE_PCT\s*=\s*([0-9.]+)\s*;/
	},
	{
		label: 'the VBA submit macro (GAUNTLET_VOLUME_TOL_PCT)',
		path: 'static/tools/idea-gauntlet-submit.bas',
		pattern: /Private Const GAUNTLET_VOLUME_TOL_PCT As Double\s*=\s*([0-9.]+)/
	},
	{
		label: 'the SolidWorks add-in (GauntletMath.VolumeTolPct)',
		path: 'tools/solidworks-addin/IdeaGauntletAddin/GauntletMath.cs',
		pattern: /public const double VolumeTolPct\s*=\s*([0-9.]+)\s*;/
	}
] as const;

/**
 * Reads one copy. Every failure mode -- file gone, pattern no longer matching,
 * value unparseable -- throws a sentence naming the copy and its path, so the
 * sweep can never come back clean over something it did not actually read.
 */
function readCopy(copy: Copy): number {
	const full = resolve(ROOT, copy.path);
	if (!existsSync(full)) {
		throw new Error(
			`Cannot check ${copy.label}: ${copy.path} does not exist. ` +
				`The band is stated in four places and this check now guards only ${COPIES.length - 1}. ` +
				`Point this copy at the file's new home rather than deleting the entry.`
		);
	}
	const source = readFileSync(full, 'utf8');
	const m = copy.pattern.exec(source);
	if (!m) {
		throw new Error(
			`Cannot check ${copy.label}: ${copy.path} exists but no longer states the band ` +
				`in the form this check reads (${copy.pattern}). It was rewritten, or the value moved. ` +
				`Update the pattern; do not drop the copy.`
		);
	}
	const value = Number(m[1]);
	if (!Number.isFinite(value)) {
		throw new Error(`Cannot check ${copy.label}: ${copy.path} states "${m[1]}", which is not a number.`);
	}
	return value;
}

describe('the volume tolerance band, stated in four places', () => {
	it('every stated copy is reachable and readable', () => {
		// The sweep's own case count. A sweep that generated nothing passes
		// vacuously, and "all copies agree" over zero copies is true.
		expect(COPIES.length).toBe(4);
		const seen = COPIES.map((c) => ({ label: c.label, path: c.path, value: readCopy(c) }));
		expect(seen).toHaveLength(4);
		// Every entry names a DIFFERENT file: two entries pointed at one file
		// would look like coverage and be one copy read twice.
		expect(new Set(seen.map((s) => s.path)).size).toBe(4);
		for (const s of seen) expect(Number.isFinite(s.value)).toBe(true);
	});

	it('all four agree, and a disagreement names the copy and its value', () => {
		const seen = COPIES.map((c) => ({ label: c.label, path: c.path, value: readCopy(c) }));
		const server = seen[0];
		const off = seen.filter((s) => s.value !== server.value);

		// The message is the product here. A bare `toEqual` on four numbers
		// tells whoever hits this that something differs and not which file to
		// open, which on a four-language drift is most of the work.
		expect(
			off.map((s) => `${s.label} in ${s.path} states ${s.value}`).join('; ') ||
				'all copies agree'
		).toBe('all copies agree');

		// And the value itself is asserted from the module, not from a literal
		// retyped here -- a fifth copy in a test is still a fifth copy.
		expect(server.value).toBe(GAUNTLET_DEFAULT_TOLERANCE_PCT);
	});

	it('CONTROL: a disagreement in any single copy is caught and named', () => {
		// The sweep above is only worth its green tick if it can go red. Each
		// copy is perturbed IN MEMORY -- nothing on disk is touched, so there
		// is no restore to get wrong -- and the same comparison is shown to
		// name that copy. Every copy is controlled, not just a representative
		// one: a pattern that had silently stopped matching would otherwise
		// keep passing here too.
		const baseline = COPIES.map((c) => ({ label: c.label, path: c.path, value: readCopy(c) }));
		expect(baseline.length).toBe(4);

		for (let i = 0; i < baseline.length; i++) {
			const mutated = baseline.map((s, j) => (j === i ? { ...s, value: s.value * 5 } : s));
			const server = mutated[0];
			const off = mutated.filter((s) => s.value !== server.value);
			const message = off.map((s) => `${s.label} in ${s.path} states ${s.value}`).join('; ');

			// Moving the SERVER copy puts the other three off it; moving any
			// client copy puts that one off. Either way the message names a
			// real file, and it is never empty.
			expect(off.length).toBe(i === 0 ? 3 : 1);
			expect(message).not.toBe('');
			expect(message).toContain(baseline[i === 0 ? 1 : i].path);
		}
	});
});

describe('the server states the band exactly once', () => {
	// This is the property that makes "the SQL side cannot drift" true, rather
	// than a claim about three files nobody is allowed to edit. 0147 replaced
	// every local constant with `_gauntlet_tol_pct`; a future migration that
	// declared its own literal again would restore the 0036 defect silently,
	// because a local constant grades perfectly well -- just at its own number.
	const files = readdirSync(MIGRATIONS)
		.filter((f) => f.endsWith('.sql'))
		.sort();

	/** The last migration file that defines `name`, i.e. the live definition. */
	function lastDefinitionOf(name: string): { file: string; body: string } | null {
		const marker = `create or replace function public.${name}(`;
		let found: { file: string; body: string } | null = null;
		for (const f of files) {
			const src = readFileSync(resolve(MIGRATIONS, f), 'utf8');
			const at = src.lastIndexOf(marker);
			if (at === -1) continue;
			// From this definition to the end of its body.
			const end = src.indexOf('\n$$;', at);
			found = { file: f, body: src.slice(at, end === -1 ? src.length : end) };
		}
		return found;
	}

	// Every function that decides whether a submitted part passes the band.
	//
	// `gauntlet_run_targets` is deliberately NOT here and is asserted separately
	// below. It used to declare the constant (0034, 0036) because it TOLD the
	// client the band; 0147 closed that disclosure, so it now states no
	// tolerance at all and grades nothing. Listing it here as a grader was the
	// first shape of this check and it reddened -- correctly, on a function that
	// had stopped being one. The assertion is kept, pointed at what is now true
	// of it, rather than removed.
	const GRADERS = ['gauntlet_submit', 'gauntlet_macro_submit', 'gauntlet_room_manual_submit'] as const;

	it('every live grading function reads the shared helper and declares no literal of its own', () => {
		expect(files.length).toBeGreaterThan(150);
		const checked: string[] = [];
		for (const name of GRADERS) {
			const live = lastDefinitionOf(name);
			// A grader that vanished is a change to what grades a part and must
			// not pass as "nothing to check".
			expect(live, `${name} has no definition in any migration`).not.toBeNull();
			checked.push(`${name}@${live!.file}`);
			expect(
				live!.body.includes('_gauntlet_tol_pct('),
				`${name}, last defined in ${live!.file}, no longer reads _gauntlet_tol_pct`
			).toBe(true);
			expect(
				live!.body.includes('c_volume_tol_pct'),
				`${name}, last defined in ${live!.file}, declares its own tolerance constant again ` +
					`-- this is the 0036 drift, reintroduced`
			).toBe(false);
		}
		// The sweep's case count, and a record of which file each verdict came
		// from: a graders list that silently shrank would pass over the rest.
		expect(checked).toHaveLength(GRADERS.length);
	});

	it('gauntlet_run_targets states no band at all, which is 0147 closing the disclosure', () => {
		// The other direction of the same rule. A copy of the band can also
		// reappear by a function starting to PUBLISH one again -- which is
		// exactly what 0147 removed, and what `targetVolumeFromMass` in the
		// browser could reconstruct a ranked comparison from while it was there.
		const live = lastDefinitionOf('gauntlet_run_targets');
		expect(live, 'gauntlet_run_targets has no definition in any migration').not.toBeNull();
		expect(
			live!.body.includes('c_volume_tol_pct'),
			`gauntlet_run_targets, last defined in ${live!.file}, declares a tolerance constant again`
		).toBe(false);
		expect(
			live!.body.includes('_gauntlet_tol_pct('),
			`gauntlet_run_targets, last defined in ${live!.file}, reads the band again -- 0147 removed it`
		).toBe(false);

		// CONTROL: the same reader DOES find the constant in the superseded
		// definition, so the two falses above are a reading and not a miss.
		const src = readFileSync(resolve(MIGRATIONS, '0036_gauntlet_volume_tolerance_0_1.sql'), 'utf8');
		const at = src.lastIndexOf('create or replace function public.gauntlet_run_targets(');
		expect(at).toBeGreaterThan(-1);
		expect(src.slice(at).includes('c_volume_tol_pct constant')).toBe(true);
	});

	it('CONTROL: the same reader finds the superseded local constants in 0034/0036/0061', () => {
		// Proves the assertion above is reading bodies rather than coming back
		// clean over nothing. These three are the immutable record of the state
		// 0147 ended, so the same predicate that must be FALSE for the live
		// definitions is TRUE here.
		for (const f of [
			'0034_gauntlet_volume_only_verification.sql',
			'0036_gauntlet_volume_tolerance_0_1.sql',
			'0061_gauntlet_target_disclosure.sql'
		]) {
			const src = readFileSync(resolve(MIGRATIONS, f), 'utf8');
			expect(src.includes('c_volume_tol_pct constant'), `${f} should still hold the old form`).toBe(
				true
			);
		}
		// And 0034 is the one that held the OTHER value, which is what made the
		// drift a real defect rather than a tidiness complaint.
		const old = readFileSync(
			resolve(MIGRATIONS, '0034_gauntlet_volume_only_verification.sql'),
			'utf8'
		);
		expect(/c_volume_tol_pct constant numeric := 0\.5;/.test(old)).toBe(true);
	});
});
