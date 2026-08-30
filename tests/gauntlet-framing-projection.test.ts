// tests/gauntlet-framing-projection.test.ts
//
// 0153, the client half: the answer is not WRITTEN into the public column, the
// two Speedrun loaders do not PROJECT it, the helper that reconstructed it is
// gone, and the gauge that used to need it still moves.
//
// WHY A SOURCE-LEVEL TEST RATHER THAN A DRIVEN ONE. The projection is a STRING.
// PostgREST resolves `select=prompt->>material` at request time; nothing in
// TypeScript types it, `svelte-check` is indifferent to it, and the loader
// returns whatever the string asked for. So the question this file answers is
// the only one that can be answered locally and the only one that matters here:
// which keys does that string name? A key added to `challenges.prompt` next year
// reaches a student through these loaders if and only if somebody adds it to one
// of these lists, which is exactly the property the change is for.
//
// EVERY SWEEP BELOW HAS A POSITIVE CONTROL, because a parser that stopped
// matching returns an empty set and an empty set passes every exclusion.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'svelte/server';
import LiveTelemetry from '../src/lib/gauntlet/LiveTelemetry.svelte';
import { buildPayload, emptyForm, isModeling } from '$lib/gauntlet/authoring';
import { MODES, deviationBandFill, type DeviationBand, type TelemetryTargets } from '$lib/gauntlet';

const ROOT = process.cwd();
const LIST_LOADER = join(ROOT, 'src/routes/gauntlet/speedrun/+page.server.ts');
const DETAIL_LOADER = join(ROOT, 'src/routes/gauntlet/speedrun/[id]/+page.server.ts');

/** The three keys that are the level's answer and its pass band. */
const ANSWER_KEYS = ['target_mass', 'density', 'tolerance_pct'] as const;

/**
 * Every `challenges` select string in a loader, as it will be sent. The source
 * builds one of them by concatenating adjacent string literals across lines, so
 * the literals are joined before the string is read -- a parser that took only
 * the first literal would see `'id, mode, title, difficulty, '` and conclude,
 * wrongly and silently, that no prompt key is projected at all.
 */
function challengeSelects(file: string): string[] {
	const src = readFileSync(file, 'utf8');
	const out: string[] = [];
	// Match `.from('challenges')` ... `.select( ... )` on the same chain.
	for (const m of src.matchAll(/\.from\('challenges'\)\s*([\s\S]*?)\.eq\(/g)) {
		const chunk = m[1];
		const sel = chunk.match(/\.select\(([\s\S]*?)\)\s*$/) ?? chunk.match(/\.select\(([\s\S]*?)\)/);
		if (!sel) continue;
		// Concatenate every single-quoted literal inside the call.
		const joined = [...sel[1].matchAll(/'([^']*)'/g)].map((q) => q[1]).join('');
		if (joined) out.push(joined);
	}
	return out;
}

/** Split a PostgREST select string into its top-level items. */
const items = (sel: string) =>
	sel
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

/** The prompt keys a select string projects, however it spells the arrow. */
const promptKeys = (sel: string) =>
	items(sel)
		.map((i) => i.match(/^prompt\s*->>?\s*(.+)$/))
		.filter((m): m is RegExpMatchArray => m !== null)
		.map((m) => m[1].trim());

/** Whether a select string asks for the WHOLE prompt column. */
const takesWholeColumn = (sel: string) => items(sel).some((i) => i === 'prompt');

// ---------------------------------------------------------------------------
describe('the two Speedrun `challenges` selects project named framing fields', () => {
	const list = challengeSelects(LIST_LOADER);
	const detail = challengeSelects(DETAIL_LOADER);

	it('found both selects (a parser that found nothing would pass everything below)', () => {
		expect(list).toHaveLength(1);
		expect(detail).toHaveLength(1);
		// And it really did join the concatenated literals: the detail select's
		// last item lives in the third string literal of the call.
		expect(promptKeys(detail[0]).length).toBeGreaterThanOrEqual(8);
		expect(promptKeys(list[0]).length).toBeGreaterThanOrEqual(4);
	});

	it('POSITIVE CONTROL: the detector fires on the shapes it exists to catch', () => {
		expect(takesWholeColumn('id, title, prompt, series_id')).toBe(true);
		expect(takesWholeColumn('id, title, prompt->>material')).toBe(false);
		expect(promptKeys('id, prompt->>target_mass, prompt->density')).toEqual(['target_mass', 'density']);
	});

	for (const [name, sels] of [
		['list', list],
		['detail', detail]
	] as const) {
		it(`the ${name} loader never asks for the whole \`prompt\` column`, () => {
			expect(takesWholeColumn(sels[0])).toBe(false);
		});

		it(`the ${name} loader projects no target, density or tolerance`, () => {
			const keys = promptKeys(sels[0]);
			for (const bad of ANSWER_KEYS) {
				expect(keys, `${name} projects ${bad}`).not.toContain(bad);
			}
		});

		it(`every prompt key the ${name} loader projects is authored framing, named here with its reason`, () => {
			// The allowlist is spelled out so ADDING a key to a loader has to be a
			// deliberate edit in two places. It is the list of things a student
			// needs in order to model the part, and nothing in it is a quantity the
			// grader compares against.
			const ALLOWED: Record<string, string> = {
				material: 'which SolidWorks material to assign (0026); the density follows from it',
				unit_system: 'which units every presented property is in',
				mass_unit: 'the unit the student types their mass in',
				note: "the author's own guidance",
				model_path: 'shape-only STL preview, no dimensions',
				tutorial_video_id: 'optional walkthrough',
				par_time: 'a benchmark time, not a grading input',
				par_feature_count: 'a benchmark feature count, not a grading input',
				demo: 'the seeded-placeholder flag'
			};
			for (const key of promptKeys(sels[0])) {
				expect(Object.keys(ALLOWED), `${name} projects an unlisted prompt key: ${key}`).toContain(key);
			}
		});
	}
});

// ---------------------------------------------------------------------------
describe('`buildPayload` writes the answer to `answer` and nowhere else', () => {
	const modelingModes = MODES.filter((m) => isModeling(m.id));

	it('found the modeling modes (an empty list would pass every loop below)', () => {
		expect(modelingModes.length).toBeGreaterThanOrEqual(3);
	});

	for (const mode of modelingModes) {
		it(`${mode.id}: none of the three reach \`prompt\`, and all three reach \`answer\``, () => {
			const { prompt, answer } = buildPayload({
				...emptyForm(mode.id),
				title: 'T',
				material: '6061 Alloy',
				density: 2.7,
				target_volume_mm3: 52_000,
				surface_area_mm2: 18_400,
				feature_count: 5,
				target_mass: 140.4,
				tolerance_pct: 0.1,
				asset: '<svg/>'
			});
			for (const key of ANSWER_KEYS) {
				expect(prompt, `${mode.id} published ${key}`).not.toHaveProperty(key);
				expect(answer, `${mode.id} lost ${key} from the answer`).toHaveProperty(key);
			}
			// The control: the prompt is still a real framing object, not empty.
			expect(prompt).toHaveProperty('material', '6061 Alloy');
		});
	}
});

// ---------------------------------------------------------------------------
describe('`targetVolumeFromMass` is gone from the tree, not merely unused', () => {
	// The sweep shape `tests/foundry-bundle-url.test.ts` uses for the token
	// proxy's deleted names: a helper whose whole job was reconstructing the
	// ranked answer is a foothold for the next person even with no caller, and
	// its docstring was a written recipe.
	const walk = (dir: string, out: string[] = []): string[] => {
		for (const entry of readdirSync(dir)) {
			const p = join(dir, entry);
			if (statSync(p).isDirectory()) walk(p, out);
			else if (/\.(ts|svelte|js)$/.test(entry)) out.push(p);
		}
		return out;
	};
	const files = walk(join(ROOT, 'src'));

	it('swept a real tree (an empty file list would pass the sweep below)', () => {
		expect(files.length).toBeGreaterThan(200);
	});

	it('no module defines, exports, imports or calls it', () => {
		const hits = files.filter((f) => {
			const src = readFileSync(f, 'utf8');
			// The name may still appear inside a comment saying it was deleted and
			// why -- that is the record, not a caller. Anything else is a hit.
			return src
				.split('\n')
				.some((line) => line.includes('targetVolumeFromMass') && !/^\s*(\*|\/\/|\/\*)/.test(line));
		});
		expect(hits).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
describe('the gauge still moves, and it moves on the SERVER\'s verdict', () => {
	const targets: TelemetryTargets = {
		densityGcm3: 2.7,
		massUnit: 'g',
		unitSystem: 'MMGS',
		parTime: 600,
		parFeatures: 6
	};

	/** A stream carrying one snapshot, so the panel has a measured volume. */
	const events = [
		{ seq: 1, t_ms: 0, event_type: 'start', payload: {} },
		{ seq: 2, t_ms: 5_000, event_type: 'feature_add', payload: { name: 'Boss-Extrude1' } },
		{ seq: 3, t_ms: 9_000, event_type: 'snapshot', payload: { volume_mm3: 51_800, feature_count: 4 } }
	];

	const html = (band: DeviationBand | null) =>
		render(LiveTelemetry, {
			props: { events, targets, elapsedMs: 9_000, live: true, band, bandAtMs: 1_000, nowMs: 12_000 }
		}).body;

	/** The width the closeness bar was rendered at. */
	const fillWidth = (body: string) => {
		const m = body.match(/class="[^"]*lt-fill[^"]*"\s+style="width:([0-9.]+)%"/);
		return m ? Number(m[1]) : null;
	};

	it('draws no bar before the student has checked anything', () => {
		const body = html(null);
		expect(fillWidth(body)).toBe(0);
		expect(body).toContain('Not checked');
		expect(deviationBandFill(null)).toBeNull();
	});

	it('the bar MOVES, monotonically, as the server\'s verdict improves', () => {
		const widths = (['far', 'near', 'close', 'pass'] as const).map((b) => fillWidth(html(b)));
		expect(widths).toEqual([15, 45, 75, 100]);
		// Monotone and all distinct: a gauge whose four states render the same bar
		// is a gauge that does not move.
		expect(new Set(widths).size).toBe(4);
		for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
	});

	it('says the verdict in WORDS beside the bar, so colour is never the only signal', () => {
		expect(html('far')).toContain('Well outside');
		expect(html('close')).toContain('Very close');
		expect(html('pass')).toContain('In tolerance');
	});

	it('still renders the student\'s own measurements, which are not a disclosure', () => {
		const body = html('close');
		expect(body).toContain('51800');
		// 51.8 cm3 x 2.7 g/cm3 = 139.86 g, the mass they would read off Mass
		// Properties. Their own part, computed from their own volume.
		expect(body).toMatch(/139\.\d/);
	});

	it('renders no target, in any unit, on any band', () => {
		// The exclusion. 52000 / 140.4 are what the old fixture drew as the target
		// line; the point is that NO second quantity appears beside the student's
		// own, whatever the band.
		for (const b of [null, 'far', 'near', 'close', 'pass'] as const) {
			const body = html(b);
			expect(body).not.toMatch(/target/i);
		}
	});
});
