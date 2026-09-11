/**
 * HOW FAR ALONG A STUDENT IS IN A PORTED HTML ASSIGNMENT, WEIGHTED BY POINTS.
 *
 * The number the progress rail above every schema-3 worksheet shows, and every
 * word beside it. No DOM, no Svelte, no client: `Progress.svelte` renders what
 * this returns and decides nothing of its own, so every rule here can be put
 * to a value in `tests/` with no browser in the room.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT MEASURES, AND WHAT IT MUST NEVER BE READ AS
 * ---------------------------------------------------------------------------
 *
 * COMPLETENESS, NOT SCORE. A student at 100% has answered everything and
 * earned nothing yet; the rubric is the teacher's and nothing here reads it.
 * `HX_PROGRESS_NOT_A_GRADE` is the sentence that says so, and the component
 * renders it beside the number at every value, zero and one hundred included,
 * because those are exactly the two values somebody reads as a mark.
 *
 * WEIGHTED BY POINTS, SO A 5-POINT MODULE IS MORE OF THE BAR THAN A 1-POINT
 * ONE. That is the brief in one sentence. A module's points are spread evenly
 * over its blocks (a 6-point module with three blocks is worth 2 per block),
 * because the manifest carries points per MODULE and nothing finer; a block
 * weight is the only division available without inventing one. **The header
 * carries no points and is not in the bar**: a student's name and the date are
 * identity, not work, and 0134's whole reason for lifting them out of a module
 * was that a 0-point module read as something to score. A module with points
 * but no blocks (graded by observation) contributes nothing to the denominator
 * either, since nothing a student types can fill it.
 *
 * THE FALLBACK IS BY COUNT, AND IT IS NAMED. A manifest whose modules all
 * carry zero points has no weighting to apply, so every block counts once.
 * `basis` says which rule produced the number, so a surface can never present
 * a count as a weighting.
 *
 * ---------------------------------------------------------------------------
 * WHEN A BLOCK IS MET, AND WHY HALF OF THAT RULE IS NOT WRITTEN HERE
 * ---------------------------------------------------------------------------
 *
 * A block is met when it has a stored response -- for an `image` block, a
 * submission file -- AND it is not short of its own `minSentences`. The second
 * half is `hxIncompleteBlocks` in `answers.ts`, called rather than copied: it
 * is the Submit gate's own count, and a bar that counted sentences a second
 * way is a bar that reads 100% over a worksheet Submit refuses. Measured on
 * 2026-09-10, that function had no caller outside its own file; this is its
 * first, and the parity is the point.
 *
 * "HAS A STORED RESPONSE" IS THE HALF THAT IS THIS FILE'S, and it is per type:
 *
 *   text, longText, radio   a string with something other than whitespace in it
 *   table                   a JSON string of rows in which at least one cell
 *                           holds something (a document serialises the WHOLE
 *                           table on any cell change, so a table a student
 *                           typed into and emptied again is `[["",""]]`, which
 *                           is not an answer)
 *   checkbox                any stored boolean. Unticking a box is a choice,
 *                           and a manifest cannot say which way a box "should"
 *                           go; treating only `true` as met would make every
 *                           "check if applicable" box a required tick
 *   image                   a picture is standing for the field
 *
 * ---------------------------------------------------------------------------
 * THE NUMBER
 * ---------------------------------------------------------------------------
 *
 * `percent` is an integer, and it is CLAMPED to 1 and 99 while the work is
 * partial. Rounding alone would show a student who has just answered their
 * first block of forty "0%", which is the one number this bar exists to move
 * off, and would show "100%" over a worksheet with a block still empty, which
 * contradicts `complete`. Zero means nothing is met; one hundred means
 * everything is.
 */

import type { HtmlAssignmentManifest, HtmlBlock, HtmlBlockType } from './manifest';
import type { HxImageState } from './bridge';
import { hxIncompleteBlocks } from './answers';

// ---------------------------------------------------------------------------
// The copy. Every word the rail shows lives here, once.
// ---------------------------------------------------------------------------

/**
 * THE SENTENCE THAT KEEPS THIS FROM BEING READ AS A GRADE. Rendered beside the
 * number at every value. American spelling, no dashes, no weekday.
 */
export const HX_PROGRESS_NOT_A_GRADE =
	'This measures how much you have filled in, not how well. Grades come from your teacher.';

/** The accessible name of the bar itself. */
export const HX_PROGRESS_BAR_LABEL = 'How much of this assignment is filled in';

/**
 * THE STAGES, IN ORDER, WITH A WORD AND A GLYPH EACH. Colour is never the only
 * signal, so the hue of the bar is always accompanied by the number, the word
 * and the glyph -- a filling circle, which is the same picture the bar draws.
 * `min` is the lowest percent that earns the stage; the list is walked from
 * the top.
 */
export const HX_PROGRESS_STAGES: readonly {
	readonly key: 'blank' | 'started' | 'building' | 'halfway' | 'nearly' | 'complete';
	readonly label: string;
	readonly glyph: string;
	readonly min: number;
}[] = [
	{ key: 'blank', label: 'Not started', glyph: '○', min: 0 },
	{ key: 'started', label: 'Just started', glyph: '◔', min: 1 },
	{ key: 'building', label: 'Building up', glyph: '◑', min: 25 },
	{ key: 'halfway', label: 'Past halfway', glyph: '◕', min: 50 },
	{ key: 'nearly', label: 'Almost there', glyph: '●', min: 75 },
	{ key: 'complete', label: 'All filled in', glyph: '★', min: 100 }
];

export type HxProgressStageKey = (typeof HX_PROGRESS_STAGES)[number]['key'];

/** The sentence under "All filled in". Says the same thing as the note, at the
    moment a student is most likely to read the number as a mark. */
export const HX_PROGRESS_COMPLETE_NOTE =
	'Every answer is in. That is completeness, not a grade: your teacher still scores the work.';

// ---------------------------------------------------------------------------
// The shapes.
// ---------------------------------------------------------------------------

export type HxProgressBasis = 'points' | 'count';

export interface HxProgressBlock {
	blockId: string;
	field: string;
	type: HtmlBlockType;
	/** Null for a header identity field. */
	moduleId: string | null;
	moduleTitle: string | null;
	/** Its share of the bar. Zero for a block the bar does not count. */
	weight: number;
	met: boolean;
	/** Why it is not met, or null when it is. */
	reason: 'empty' | 'short' | null;
	/** `minSentences` and the count so far, from `hxIncompleteBlocks`. */
	need: number;
	have: number;
}

export interface HxProgressModule {
	id: string;
	title: string;
	points: number;
	/** The module's share of the bar; the sum of its blocks' weights. */
	weight: number;
	/** How much of that share is met. */
	earned: number;
	blocks: number;
	met: number;
	/** `earned / weight`, or 0 for a module the bar does not count. */
	fraction: number;
	done: boolean;
}

export interface HxProgress {
	/** 0..100, integer, clamped to 1..99 while partial. */
	percent: number;
	/** `earned / total`, unclamped, 0 when `total` is 0. */
	fraction: number;
	earned: number;
	total: number;
	basis: HxProgressBasis;
	stage: HxProgressStageKey;
	/** Every block in the manifest, in manifest order, header included. */
	blocks: HxProgressBlock[];
	/** Every module in manifest order, including ones the bar does not count. */
	modules: HxProgressModule[];
	/** Counts over the blocks the bar counts (weight > 0). */
	metBlocks: number;
	totalBlocks: number;
	/** The first unmet counted block in manifest order, or null. */
	next: HxProgressBlock | null;
	/** Every counted block is met. False when there is nothing to count. */
	complete: boolean;
	/** At least one counted block is met. */
	started: boolean;
}

// ---------------------------------------------------------------------------
// The rules.
// ---------------------------------------------------------------------------

/**
 * Whether a stored table string holds anything a person typed. Any string cell
 * with a non-whitespace character, or any number, anywhere in the parsed
 * value. A string that is not JSON at all is judged as text.
 */
export function hxTableHasContent(value: string): boolean {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return value.trim().length > 0;
	}
	const walk = (node: unknown): boolean => {
		if (typeof node === 'string') return node.trim().length > 0;
		if (typeof node === 'number') return Number.isFinite(node);
		if (Array.isArray(node)) return node.some(walk);
		if (node && typeof node === 'object') return Object.values(node).some(walk);
		return false;
	};
	return walk(parsed);
}

/**
 * THE "HAS A STORED RESPONSE" HALF. Per type, as the header says. `values` and
 * `images` are keyed by FIELD, the document's own names, which is how the
 * controller holds them.
 */
export function hxBlockHasResponse(
	block: HtmlBlock,
	values: Readonly<Record<string, string | boolean>>,
	images: Readonly<Record<string, HxImageState>>
): boolean {
	if (block.type === 'image') {
		const image = images[block.field];
		return !!image && typeof image.url === 'string' && image.url.length > 0;
	}
	const value = values[block.field];
	if (block.type === 'checkbox') return typeof value === 'boolean';
	if (typeof value !== 'string') return false;
	if (block.type === 'table') return hxTableHasContent(value);
	return value.trim().length > 0;
}

/** The stage a percent earns. Walked from the top so 100 is `complete` and
    only 100 is. */
export function hxProgressStage(percent: number): HxProgressStageKey {
	for (let i = HX_PROGRESS_STAGES.length - 1; i >= 0; i -= 1) {
		if (percent >= HX_PROGRESS_STAGES[i].min) return HX_PROGRESS_STAGES[i].key;
	}
	return 'blank';
}

/** The stage's row, for a renderer that wants the word and the glyph. */
export function hxProgressStageRow(key: HxProgressStageKey) {
	return HX_PROGRESS_STAGES.find((s) => s.key === key) ?? HX_PROGRESS_STAGES[0];
}

/**
 * THE PAINT: which two of the room's own tokens the fill sits between, and how
 * far along. Red to green, as the brief says, and never a colour the register
 * does not have: below fifty the fill is a mix of `--crimson` and `--amber`,
 * above it a mix of `--amber` and `--green`, and the CSS does the mixing with
 * `color-mix` so the value on screen is always a point on the line between two
 * tokens. `t` is 0..1 along that segment.
 *
 * `--crimson` is the register's status red, reserved for live, rec and error;
 * a bar at 3% is a status, and the brief named red explicitly. It is the one
 * place this feature spends it, and only for the bottom of the ramp.
 */
export function hxProgressPaint(percent: number): {
	from: '--crimson' | '--amber';
	to: '--amber' | '--green';
	t: number;
} {
	const p = Math.max(0, Math.min(100, percent));
	if (p < 50) return { from: '--crimson', to: '--amber', t: p / 50 };
	return { from: '--amber', to: '--green', t: (p - 50) / 50 };
}

/**
 * THE WHOLE COMPUTATION. Manifest order throughout, so `next` is the first
 * thing a student reading top to bottom would reach.
 */
export function hxProgress(
	manifest: HtmlAssignmentManifest,
	values: Readonly<Record<string, string | boolean>>,
	images: Readonly<Record<string, HxImageState>> = {}
): HxProgress {
	// The Submit gate's own sentence count, keyed by block id. Called, not
	// copied: see the header.
	const short = new Map<string, { need: number; have: number }>();
	for (const inc of hxIncompleteBlocks(manifest, values)) {
		short.set(inc.blockId, { need: inc.need, have: inc.have });
	}

	const modules = manifest.modules ?? [];

	// Points spread evenly over a module's blocks. A module with no blocks has
	// no per-block weight and contributes nothing.
	const weighted = modules.some((m) => (m.blocks?.length ?? 0) > 0 && Number(m.points) > 0);
	const basis: HxProgressBasis = weighted ? 'points' : 'count';

	const perBlock = (points: number, count: number): number => {
		if (count <= 0) return 0;
		if (basis === 'count') return 1;
		const p = Number(points);
		return Number.isFinite(p) && p > 0 ? p / count : 0;
	};

	const judge = (
		block: HtmlBlock,
		moduleId: string | null,
		moduleTitle: string | null,
		weight: number
	): HxProgressBlock => {
		const has = hxBlockHasResponse(block, values, images);
		const gap = short.get(block.id) ?? null;
		const met = has && gap === null;
		const reason: HxProgressBlock['reason'] = met ? null : !has ? 'empty' : 'short';
		return {
			blockId: block.id,
			field: block.field,
			type: block.type,
			moduleId,
			moduleTitle,
			weight,
			met,
			reason,
			need: gap?.need ?? block.minSentences ?? 0,
			have: gap?.have ?? 0
		};
	};

	const blocks: HxProgressBlock[] = [];
	// THE HEADER IS JUDGED AND NOT COUNTED. Under the count basis it still
	// carries no weight: identity is not work under either rule.
	for (const block of manifest.header ?? []) blocks.push(judge(block, null, null, 0));

	const moduleRows: HxProgressModule[] = [];
	for (const mod of modules) {
		const list = mod.blocks ?? [];
		const w = perBlock(mod.points, list.length);
		let earned = 0;
		let met = 0;
		for (const block of list) {
			const row = judge(block, mod.id, mod.title, w);
			blocks.push(row);
			if (row.met) {
				earned += w;
				met += 1;
			}
		}
		const weight = w * list.length;
		moduleRows.push({
			id: mod.id,
			title: mod.title,
			points: Number(mod.points) || 0,
			weight,
			earned,
			blocks: list.length,
			met,
			fraction: weight > 0 ? earned / weight : 0,
			done: weight > 0 && met === list.length
		});
	}

	const counted = blocks.filter((b) => b.weight > 0);
	const total = counted.reduce((sum, b) => sum + b.weight, 0);
	const earned = counted.reduce((sum, b) => sum + (b.met ? b.weight : 0), 0);
	const metBlocks = counted.filter((b) => b.met).length;
	const totalBlocks = counted.length;
	const complete = totalBlocks > 0 && metBlocks === totalBlocks;
	const started = metBlocks > 0;
	const fraction = total > 0 ? earned / total : 0;

	let percent: number;
	if (!started || total <= 0) percent = 0;
	else if (complete) percent = 100;
	else percent = Math.min(99, Math.max(1, Math.round(fraction * 100)));

	return {
		percent,
		fraction,
		earned,
		total,
		basis,
		stage: hxProgressStage(percent),
		blocks,
		modules: moduleRows,
		metBlocks,
		totalBlocks,
		next: counted.find((b) => !b.met) ?? null,
		complete,
		started
	};
}

// ---------------------------------------------------------------------------
// The sentences built from the result.
// ---------------------------------------------------------------------------

/**
 * "NEXT UP", NAMING THE MODULE AND WHAT IT WANTS. One line, because the blocks
 * themselves are on screen in the worksheet below. Null when nothing is left.
 */
export function hxProgressNextLine(progress: HxProgress): string | null {
	const next = progress.next;
	if (!next) return null;
	const where = next.moduleTitle ? `"${next.moduleTitle}"` : 'the top of the page';
	if (next.type === 'image') return `Next up: ${where} is waiting for a photo.`;
	if (next.reason === 'short') {
		const left = Math.max(1, next.need - next.have);
		return `Next up: ${where} needs ${left} more ${left === 1 ? 'sentence' : 'sentences'}.`;
	}
	if (next.type === 'checkbox') return `Next up: ${where} has a box to check.`;
	if (next.type === 'table') return `Next up: ${where} has an empty table.`;
	return `Next up: ${where} has an empty answer.`;
}

/**
 * THE MODULE CHIP'S WORDS. A done module says so; an unmet one says how many
 * answers it still wants, which is a count of blocks and never of points, so a
 * chip cannot be read as a score either.
 */
export function hxProgressModuleLine(mod: HxProgressModule): string {
	if (mod.weight <= 0) return mod.title;
	if (mod.done) return `${mod.title}: done`;
	const left = mod.blocks - mod.met;
	return `${mod.title}: ${left} ${left === 1 ? 'answer' : 'answers'} left`;
}

/** The whole state in one sentence for a screen reader, and for a test. */
export function hxProgressSummary(progress: HxProgress): string {
	const row = hxProgressStageRow(progress.stage);
	return `${progress.percent}% filled in. ${row.label}. ${progress.metBlocks} of ${progress.totalBlocks} answers in.`;
}
