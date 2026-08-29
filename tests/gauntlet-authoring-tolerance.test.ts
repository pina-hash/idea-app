// tests/gauntlet-authoring-tolerance.test.ts
//
// The GAUNTLET authoring form's default volume tolerance must equal the
// SERVER's default, and this file reads the server's out of the migration SQL
// rather than writing the number down a second time.
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
// THE EXPECTED VALUE DOES NOT COME FROM THE THING UNDER TEST. It is parsed out
// of the newest migration that defines `gauntlet_macro_submit`, which is the
// definition the live database is running. So the next time somebody tightens
// the band, this file fails until the form follows -- which is the whole job.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	GAUNTLET_DEFAULT_TOLERANCE_PCT,
	buildPayload,
	emptyForm,
	formFromChallenge
} from '../src/lib/gauntlet/authoring';

const MIGRATIONS_DIR = fileURLToPath(new URL('../supabase/migrations', import.meta.url));

/** Every migration file, newest first. */
function migrationsNewestFirst(): string[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith('.sql'))
		.sort()
		.reverse();
}

/**
 * The LIVE body of a function is the one in the highest-numbered migration that
 * defines it: migrations are an immutable applied record replayed in order, so
 * the last definition wins.
 */
function newestDefinitionOf(fnName: string): { file: string; sql: string } {
	const needle = `create or replace function public.${fnName}(`;
	for (const file of migrationsNewestFirst()) {
		const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
		if (sql.includes(needle)) return { file, sql };
	}
	throw new Error(`No migration defines ${fnName}`);
}

/**
 * `c_volume_tol_pct constant numeric := 0.1;` -> 0.1. Pure, so it can be put to
 * a synthetic body below as an instrument control.
 */
function parseToleranceConstant(sql: string): number[] {
	return [...sql.matchAll(/c_volume_tol_pct\s+constant\s+numeric\s*:=\s*([0-9.]+)\s*;/g)].map(
		(m) => Number(m[1])
	);
}

function serverDefaultTolerance(): { value: number; file: string } {
	const { file, sql } = newestDefinitionOf('gauntlet_macro_submit');
	const found = parseToleranceConstant(sql);
	if (found.length === 0) {
		throw new Error(`No c_volume_tol_pct constant found in ${file}`);
	}
	const values = new Set(found);
	// A file defining several functions can carry the constant more than once
	// (0036 and 0061 both do, for the ranked path and the preview path). They
	// must agree, or the preview is lying to the student by construction.
	expect([...values]).toHaveLength(1);
	return { value: [...values][0], file };
}

describe('the form default tracks the server default', () => {
	// INSTRUMENT CONTROL. Without this, `GAUNTLET_DEFAULT_TOLERANCE_PCT equals
	// the server constant` would pass just as happily against a parser that
	// always returned 0.1 -- which is exactly the number under test. Putting the
	// parser to a body carrying a DIFFERENT value proves it reads the SQL.
	it('the parser tracks the value in the SQL rather than returning a fixed one', () => {
		expect(parseToleranceConstant('c_volume_tol_pct constant numeric := 0.05;')).toEqual([0.05]);
		expect(parseToleranceConstant('c_volume_tol_pct constant numeric := 0.5;')).toEqual([0.5]);
		expect(parseToleranceConstant('nothing here')).toEqual([]);
		// The real-file spelling, tabs and trailing comment included.
		expect(
			parseToleranceConstant('\tc_volume_tol_pct  constant  numeric  :=  0.25;   -- note')
		).toEqual([0.25]);
	});

	it('parses a real constant out of a real migration (instrument check)', () => {
		const { value, file } = serverDefaultTolerance();
		expect(file).toMatch(/^\d{4}_.*\.sql$/);
		expect(Number.isFinite(value)).toBe(true);
		expect(value).toBeGreaterThan(0);
	});

	it('GAUNTLET_DEFAULT_TOLERANCE_PCT equals the server constant', () => {
		expect(GAUNTLET_DEFAULT_TOLERANCE_PCT).toBe(serverDefaultTolerance().value);
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
	it('gauntlet_publish_blocker requires an explicit band to publish', () => {
		const { sql } = newestDefinitionOf('gauntlet_publish_blocker');
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
