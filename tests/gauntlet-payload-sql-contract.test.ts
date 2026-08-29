// tests/gauntlet-payload-sql-contract.test.ts
//
// THE AUTHORING FORM AND THE GRADING SQL AGREE ON KEY NAMES, OR A CHALLENGE
// GRADES WRONG AND NOTHING ANYWHERE SAYS SO.
//
// `buildPayload` in src/lib/gauntlet/authoring.ts writes the `prompt` (public)
// and `answer` (private) JSONB for a challenge. Nothing consumes those objects
// in TypeScript: they go into `challenges.prompt` / `challenges.answer` as
// opaque jsonb, and the readers are SECURITY DEFINER plpgsql functions in
// `supabase/migrations/`, which reach in by literal string key --
// `v_challenge.answer->>'target_volume_mm3'`, `answer->>'drawing'`,
// `answer->'focus_regions'`.
//
// SO THE TWO SIDES ARE JOINED BY NOTHING BUT A SPELLING, AND EVERY LAYER
// BETWEEN THEM IS INDIFFERENT TO IT. `svelte-check` types the form state and
// never types the object; PostgREST forwards jsonb without inspecting it;
// Postgres answers `->>` on a missing key with NULL rather than an error. A
// renamed key therefore produces a challenge that saves perfectly, publishes
// perfectly, reveals a NULL drawing, and grades every submission against a NULL
// target -- which `gauntlet_macro_submit` reads as not-correct. The student
// models the part right and is told they are wrong.
//
// THE EXPECTED VALUES DO NOT COME FROM THE CODE UNDER TEST. They are extracted
// from the migration files, which are an independently maintained artifact that
// no session edits to make this test pass (they are an immutable applied
// record). The extraction rule is the one Postgres itself uses: a function is
// resolved BY NAME at call time, so the LAST `create or replace` in migration
// order is the live definition and the earlier ones are history. Reading keys
// out of every migration indiscriminately would credit the schema with
// `tier` (dropped in 0029) and `target_volume` (a superseded spelling), which
// is why the walk keeps only the latest body per function.
//
// This is the same shape as tests/postgrest-embeds -- assert the join between
// two artifacts that a type system cannot see -- and it is written here rather
// than as a database test because it is a question about STRINGS, not about
// rows: a live Postgres would answer NULL for a wrong key exactly as happily.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	buildPayload,
	emptyForm,
	formFromChallenge,
	type AuthorFormState
} from '../src/lib/gauntlet/authoring';
import { MODES, type GauntletModeId } from '../src/lib/gauntlet';

const MIGRATIONS = 'supabase/migrations';

/**
 * The live body of every `public.<name>` function, resolved the way Postgres
 * resolves one: last definition in migration order wins.
 */
function liveFunctionBodies(): Map<string, { file: string; body: string }> {
	const files = readdirSync(MIGRATIONS)
		.filter((f) => f.endsWith('.sql'))
		.sort();
	const latest = new Map<string, { file: string; body: string }>();
	for (const file of files) {
		const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
		const re = /create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi;
		let m: RegExpExecArray | null;
		while ((m = re.exec(sql))) {
			const start = m.index;
			const end = sql.indexOf('\n$$;', start);
			latest.set(m[1], { file, body: sql.slice(start, end < 0 ? sql.length : end) });
		}
	}
	return latest;
}

/** Every `prompt->'x'` / `answer->>'x'` key the live GAUNTLET functions read. */
function keysReadBySql(): { prompt: Set<string>; answer: Set<string> } {
	const live = liveFunctionBodies();
	const prompt = new Set<string>();
	const answer = new Set<string>();
	for (const [name, { body }] of live) {
		if (!name.startsWith('gauntlet_') && !name.startsWith('_gauntlet')) continue;
		for (const [, col, key] of body.matchAll(/\b(answer|prompt)\s*->>?\s*'([a-z_0-9]+)'/gi)) {
			(col.toLowerCase() === 'answer' ? answer : prompt).add(key);
		}
	}
	return { prompt, answer };
}

/**
 * Keys a caller could NOT have authored, each with the reason it is here. The
 * list is short and the count is pinned: a new entry has to be added
 * deliberately, which is the point -- the cheap way to make this test pass
 * after breaking it is to widen this list, so widening it has to be visible.
 */
const NOT_AUTHORED: Record<string, string> = {
	// `gauntlet_author_delete` (0019) refuses to delete anything that is not a
	// seeded demo row. It is a purge predicate over migration-seeded data, not
	// a field the authoring form has ever written.
	demo: 'purge predicate in gauntlet_author_delete (0019), written by seeds, never by the form'
};

/** A form with every field populated, per mode, so the union is the full emit set. */
function fullForm(mode: GauntletModeId): AuthorFormState {
	return {
		...emptyForm(mode),
		title: 'Angle Bracket',
		slug: 'angle-bracket',
		unit_system: 'IPS',
		material: '6061 Alloy',
		density: 0.0975,
		target_volume_mm3: 52_000,
		surface_area_mm2: 18_400,
		feature_count: 5,
		target_mass: 0.0111,
		tolerance_pct: 0.1,
		par_time: 90,
		par_features: 5,
		note: 'Read the section view.',
		tutorialVideoId: 'https://youtu.be/dQw4w9WgXcQ',
		focusRegions: [{ label: 'Slot', x: 10, y: 20, w: 30, h: 40, page: 1 }],
		asset: '<svg viewBox="0 0 10 10"></svg>',
		drawing_image_path: 'drawings/angle-bracket.png',
		model_path: 'models/angle-bracket.stl',
		question: 'Which view is misaligned?',
		instructions: 'The dashed guides show the projection.',
		answerType: 'numeric',
		options: [
			{ id: 'a', label: 'One' },
			{ id: 'b', label: 'Two' }
		],
		correct: '3',
		numericTolerance: 0.5,
		inputUnit: 'mm',
		explanation: 'The right-side view is dropped below the guides.'
	};
}

/** The union of every key buildPayload can put in `prompt` / `answer`, all modes. */
function emittableKeys(): { prompt: Set<string>; answer: Set<string> } {
	const prompt = new Set<string>();
	const answer = new Set<string>();
	for (const mode of MODES) {
		for (const answerType of ['choice', 'text', 'numeric'] as const) {
			const built = buildPayload({ ...fullForm(mode.id), answerType });
			Object.keys(built.prompt).forEach((k) => prompt.add(k));
			Object.keys(built.answer).forEach((k) => answer.add(k));
		}
	}
	return { prompt, answer };
}

describe('every jsonb key the live grading SQL reads is a key the author form can write', () => {
	const sql = keysReadBySql();
	const emit = emittableKeys();

	it('extracted a non-empty key set from the migrations (a parser that found nothing would pass everything below)', () => {
		// The positive control. A regex that stopped matching -- a reformatted
		// `answer ->> 'x'`, a renamed schema -- would empty both sets and turn
		// every assertion in this file into a vacuous truth.
		expect(sql.answer.size).toBeGreaterThanOrEqual(10);
		expect(sql.prompt.size).toBeGreaterThanOrEqual(4);
		expect(emit.answer.size).toBeGreaterThanOrEqual(10);
		expect(emit.prompt.size).toBeGreaterThanOrEqual(8);
	});

	it('reads exactly one deliberately non-authored key, and it is named with its reason', () => {
		const unauthored = [...sql.prompt, ...sql.answer].filter((k) => !emit.prompt.has(k) && !emit.answer.has(k));
		expect(unauthored.sort()).toEqual(Object.keys(NOT_AUTHORED).sort());
		expect(Object.keys(NOT_AUTHORED)).toHaveLength(1);
	});

	it('every answer key the SQL reads is emittable', () => {
		const missing = [...sql.answer].filter((k) => !emit.answer.has(k) && !(k in NOT_AUTHORED));
		expect(missing).toEqual([]);
	});

	it('every prompt key the SQL reads is emittable', () => {
		const missing = [...sql.prompt].filter((k) => !emit.prompt.has(k) && !(k in NOT_AUTHORED));
		expect(missing).toEqual([]);
	});

	it('names the four keys a wrong spelling would cost a ranked run, so a rename cannot pass silently', () => {
		// Spelled out DELIBERATELY, unlike the sweep above: these four are the
		// ones `gauntlet_macro_submit` (0061) and `gauntlet_speedrun_reveal`
		// (0023) read to decide pass/fail and what to reveal. The sweep proves
		// the sets agree; this proves the sets are the RIGHT sets, which a
		// sweep over two lists that both went empty could not.
		for (const key of ['target_volume_mm3', 'tolerance_pct', 'drawing', 'focus_regions']) {
			expect(sql.answer.has(key), `${key} is no longer read by any live GAUNTLET function`).toBe(true);
			expect(emit.answer.has(key), `${key} is no longer written by buildPayload`).toBe(true);
		}
	});
});

describe('the answer key is private and the prompt is public, per mode', () => {
	// THE GATE IS WHICH OBJECT A FIELD LANDS IN, and there is no other one. A
	// Speedrun drawing revealed before Start is the whole mode defeated, and it
	// is defeated by moving one line between two object literals -- a change
	// that type-checks, saves, and looks right in the form.
	it('a Speedrun drawing is in the ANSWER and never in the prompt', () => {
		const { prompt, answer } = buildPayload(fullForm('speedrun'));
		expect(answer).toHaveProperty('drawing');
		expect(prompt).not.toHaveProperty('drawing');
		expect(answer).toHaveProperty('drawing_image_path');
		expect(prompt).not.toHaveProperty('drawing_image_path');
		expect(answer).toHaveProperty('focus_regions');
		expect(prompt).not.toHaveProperty('focus_regions');
	});

	it('a Feature Golf drawing is gated the same way', () => {
		const { prompt, answer } = buildPayload(fullForm('feature_golf'));
		expect(answer).toHaveProperty('drawing');
		expect(prompt).not.toHaveProperty('drawing');
	});

	it('Reverse Engineer shows its reference UP FRONT, which is the opposite decision and is deliberate', () => {
		// The mode is untimed, so there is nothing to gate. Asserting it here
		// stops "make the modeling modes consistent" from quietly closing a
		// mode's own prompt.
		const { prompt, answer } = buildPayload(fullForm('reverse_engineer'));
		expect(prompt).toHaveProperty('reference');
		expect(answer).not.toHaveProperty('drawing');
	});

	it('a knowledge mode never writes the correct answer into the prompt', () => {
		for (const mode of ['drawing_reading', 'gdt_tolerance', 'spot_the_error'] as const) {
			for (const answerType of ['choice', 'text', 'numeric'] as const) {
				const { prompt, answer } = buildPayload({ ...fullForm(mode), answerType });
				expect(answer).toHaveProperty('correct');
				expect(prompt).not.toHaveProperty('correct');
				expect(prompt).not.toHaveProperty('explanation');
			}
		}
	});
});

describe('the form and the payload round-trip', () => {
	// `formFromChallenge` reads back what `buildPayload` wrote, and an editor
	// opening a published challenge is that read. A field that writes but does
	// not read back is silently BLANKED the next time anybody presses save --
	// the form shows an empty box, the author does not notice, and the save
	// clears a key the grading SQL needs.
	const roundTrip = (mode: GauntletModeId, over: Partial<AuthorFormState> = {}) => {
		const before = { ...fullForm(mode), ...over };
		const { prompt, answer } = buildPayload(before);
		const after = formFromChallenge({
			id: 'c-1',
			mode,
			title: before.title,
			difficulty: before.difficulty,
			status: before.status,
			prompt: prompt as Record<string, unknown>,
			answer: answer as Record<string, unknown>
		});
		return { before, after };
	};

	it('a Speedrun survives write-then-read on every field the grading SQL reads', () => {
		const { before, after } = roundTrip('speedrun');
		for (const k of [
			'slug',
			'unit_system',
			'material',
			'density',
			'target_volume_mm3',
			'surface_area_mm2',
			'feature_count',
			'target_mass',
			'tolerance_pct',
			'par_time',
			'note',
			'asset',
			'drawing_image_path',
			'model_path'
		] as const) {
			expect(after[k], `${k} did not survive the round trip`).toEqual(before[k]);
		}
	});

	it('a focus region survives the percent-to-fraction conversion in both directions', () => {
		// buildPayload divides by 100 and formFromChallenge multiplies by 100.
		// Two conversions that must be exact inverses, written 150 lines apart.
		const { before, after } = roundTrip('speedrun');
		expect(after.focusRegions).toEqual(before.focusRegions);
	});

	it('a YouTube URL is normalized on write and reads back as the bare id', () => {
		// Asymmetric on purpose: the author pastes a URL, the payload stores an
		// id, and the form must show the id rather than re-showing the URL.
		const { after } = roundTrip('speedrun');
		expect(after.tutorialVideoId).toBe('dQw4w9WgXcQ');
	});

	it('a knowledge challenge survives write-then-read for each answer type', () => {
		for (const answerType of ['choice', 'text', 'numeric'] as const) {
			const { before, after } = roundTrip('gdt_tolerance', { answerType });
			expect(after.answerType).toBe(before.answerType);
			expect(after.question).toBe(before.question);
			expect(after.instructions).toBe(before.instructions);
			expect(after.correct).toBe(before.correct);
			expect(after.explanation).toBe(before.explanation);
			expect(after.asset).toBe(before.asset);
			if (answerType === 'choice') expect(after.options).toEqual(before.options);
			// `tolerance` and `unit` are written only for the types that own
			// them, so the read back is 0 / '' for the others -- which is the
			// emptyForm default, not a loss.
			if (answerType === 'numeric') {
				expect(after.numericTolerance).toBe(before.numericTolerance);
				expect(after.inputUnit).toBe(before.inputUnit);
			}
		}
	});

	it('an empty optional field is DROPPED rather than written as an empty string', () => {
		// `clean()` is what keeps a challenge row from filling with "" and null.
		// It matters because the SQL reads with `->>`, which cannot tell an
		// absent key from one holding an empty string -- both come back with
		// something falsy, and only one of them is what the author meant.
		const { prompt, answer } = buildPayload({
			...fullForm('speedrun'),
			note: '   ',
			tutorialVideoId: 'not-a-video-id',
			material: '',
			model_path: ''
		});
		expect(prompt).not.toHaveProperty('note');
		expect(prompt).not.toHaveProperty('tutorial_video_id');
		expect(prompt).not.toHaveProperty('material');
		expect(prompt).not.toHaveProperty('model_path');
		expect(answer).toHaveProperty('target_volume_mm3');
	});

	it('a degenerate focus region is dropped and a real one beside it is kept', () => {
		// The positive control on the same call: a filter that dropped
		// everything would satisfy "the bad one is gone" perfectly.
		const { answer } = buildPayload({
			...fullForm('speedrun'),
			focusRegions: [
				{ label: 'zero width', x: 5, y: 5, w: 0, h: 40, page: 0 },
				{ label: 'real', x: 10, y: 10, w: 20, h: 20, page: 0 }
			]
		});
		const regions = (answer as { focus_regions?: { label: string }[] }).focus_regions ?? [];
		expect(regions.map((r) => r.label)).toEqual(['real']);
	});
});
