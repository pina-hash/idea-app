// tests/html-assignment-steps.test.ts
//
// LEDGER 0458, REPORT 4930ba0e: ONE HEADER AND ONE PROGRESS RAIL.
//
// A kit document reports its steps (`idea:steps`); the parent judges the
// message like every other one, draws the steps in the rail counting required
// steps only (report 88ad281b), answers `idea:host`, and sends `idea:go-step`.
// The kit half is read as source text here (the browser pass drives it); the
// parent half is asserted on values and on the rendered rail.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import Progress from '$lib/classroom/html-assignment/Progress.svelte';
import {
	HX_GO_STEP_TYPE,
	HX_HOST_TYPE,
	HX_MAX_STEPS,
	HX_SANDBOX_FLAGS,
	HX_STEPS_TYPE,
	hxGoStepMessage,
	hxHostMessage,
	hxReceive,
	hxStepColor,
	hxStepsCount,
	type HxGate,
	type HxSteps
} from '$lib/classroom/html-assignment/bridge';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';

const FRAME = { name: 'frame' };
const gate: HxGate = { documentOrigin: 'https://sandbox.ideabosco.com', frameWindow: FRAME, sandboxFlags: HX_SANDBOX_FLAGS, fieldToBlockId: {} };
const from = (data: unknown) => hxReceive({ origin: 'null', source: FRAME, data }, gate);

const STEPS = [
	{ title: 'Read the brief', done: true, optional: false, phase: 'Learn', color: '#4a8' },
	{ title: 'Sketch three', done: false, optional: false, phase: 'Learn', color: 'oklch(0.7 0.1 140)' },
	{ title: 'Rate the rotation', done: false, optional: false, phase: 'Survey', color: 'url(x)' },
	{ title: 'Go deeper', done: true, optional: true, phase: 'Survey', color: '' }
];

describe('the parent judges idea:steps', () => {
	it('accepts a well-formed report and keeps only safe colours', () => {
		const v = from({ type: HX_STEPS_TYPE, steps: STEPS, current: 1, next: 1 });
		expect(v.ok).toBe(true);
		if (!v.ok || v.message.kind !== 'steps') throw new Error('not steps');
		expect(v.message.steps.map((s) => s.color)).toEqual(['#4a8', 'oklch(0.7 0.1 140)', '', '']);
		expect(v.message.current).toBe(1);
	});

	it('refuses an empty list, too many steps, a step without done, and an index outside the list', () => {
		expect(from({ type: HX_STEPS_TYPE, steps: [], current: 0, next: -1 }).ok).toBe(false);
		const many = Array.from({ length: HX_MAX_STEPS + 1 }, (_, i) => ({ title: `S${i}`, done: false }));
		expect(from({ type: HX_STEPS_TYPE, steps: many, current: 0, next: 0 }).ok).toBe(false);
		expect(from({ type: HX_STEPS_TYPE, steps: [{ title: 'x' }], current: 0, next: 0 }).ok).toBe(false);
		expect(from({ type: HX_STEPS_TYPE, steps: STEPS, current: 4, next: 0 }).ok).toBe(false);
		expect(from({ type: HX_STEPS_TYPE, steps: STEPS, current: 0, next: -2 }).ok).toBe(false);
		// -1 means every counted step is done.
		expect(from({ type: HX_STEPS_TYPE, steps: STEPS, current: 0, next: -1 }).ok).toBe(true);
	});

	it('refuses a report from another window', () => {
		expect(hxReceive({ origin: 'null', source: { other: true }, data: { type: HX_STEPS_TYPE, steps: STEPS, current: 0, next: 0 } }, gate).ok).toBe(false);
	});

	it('a colour that could escape a style attribute is dropped', () => {
		for (const bad of ['red;background:url(x)', 'var(--x)', 'expression(1)', 'rgb(1,2,3);x', 'javascript:1']) {
			expect(hxStepColor(bad), bad).toBe('');
		}
		for (const good of ['#abc', '#aabbcc', 'rgb(1, 2, 3)', 'oklch(0.5 0.1 200 / 50%)']) expect(hxStepColor(good)).toBe(good);
	});

	it('the two parent messages say exactly what they mean', () => {
		expect(hxHostMessage(true, false)).toEqual({ type: HX_HOST_TYPE, steps: true, title: false });
		expect(hxGoStepMessage(3)).toEqual({ type: HX_GO_STEP_TYPE, index: 3 });
	});
});

describe('the count is over required steps only (88ad281b)', () => {
	it('three required, one done; the extra step is never counted', () => {
		const s: HxSteps = { steps: STEPS.map((x) => ({ ...x, color: '' })), current: 0, next: 1 };
		expect(hxStepsCount(s)).toEqual({ done: 1, of: 3 });
	});
});

describe('the rail draws the steps', () => {
	const manifest = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'T',
		course: 'IDEA100',
		points: 0,
		modules: [{ id: 'm', title: 'M', points: 0, blocks: [{ id: 'a', field: 'a', type: 'text' }] }]
	} as unknown as HtmlAssignmentManifest;
	const steps: HxSteps = { steps: STEPS.map((x) => ({ ...x, color: x.color.startsWith('#') ? x.color : '' })), current: 1, next: 1 };

	it('with a step key per step when it can send idea:go-step', () => {
		const html = render(Progress, { props: { manifest, values: {}, steps, ongostep: () => {} } }).body;
		expect(html).toContain('data-testid="hxp-steps"');
		expect(html.match(/data-testid="hxp-step"/g)?.length).toBe(4);
		expect(html).toContain('Step 2 of 3: Sketch three');
		expect(html).toContain('1 of 3 steps done');
		expect(html).toContain('aria-current="step"');
		expect(html).toContain('--hxp-step: #4a8;');
	});

	it('as words with no keys when it cannot, and not at all when no steps were reported', () => {
		const words = render(Progress, { props: { manifest, values: {}, steps } }).body;
		expect(words).toContain('data-testid="hxp-steps"');
		expect(words.match(/data-testid="hxp-step"/g)).toBeNull();
		const none = render(Progress, { props: { manifest, values: {} } }).body;
		expect(none).not.toContain('data-testid="hxp-steps"');
	});
});

describe('the kit speaks the same three messages', () => {
	const kit = readFileSync('tools/hx-kit/kit/kit.js', 'utf8');
	it('sends idea:steps, hears idea:host and idea:go-step', () => {
		expect(kit).toContain(`type: '${HX_STEPS_TYPE}'`);
		expect(kit).toContain(`d.type === '${HX_HOST_TYPE}'`);
		expect(kit).toContain(`d.type === '${HX_GO_STEP_TYPE}'`);
	});
});
