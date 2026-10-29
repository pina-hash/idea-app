// tests/dom/grading-blind-mount.test.ts
//
// BLIND GRADING HIDES EVERY STORED SCORE (ledger 0457, queue item 20, report
// c622b97a). Mounts the REAL `GradingConsole` with a student already graded
// 10 + 5 = 15 of 20 and returned. Both directions on one fixture: with Blind
// off the roster chip, both criterion scores, the picked levels and the total
// all show the stored grade; with Blind on, none of them do, and the count of
// "Hidden" marks is exactly the number of stored scores. Changing one criterion
// shows that criterion (the grader's own score) and nothing else.
//
// A wrong answer here is invisible in normal use (a grader in Blind mode reads
// a score and never knows it was supposed to be hidden), so the CLAUDE.md
// mutation proof applies: `blindCrit` returning false and the chip ignoring
// `blind` each redden this file. See docs/history/lane-0457.md.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import GradingConsole from '$lib/classroom/GradingConsole.svelte';
import { mountInto, type Mounted } from './mount';

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
	try {
		localStorage.removeItem('idea.grading.blind');
	} catch {
		/* none */
	}
});

const SECTION = { id: 's1', label: 'Period 1', course: { code: 'IDEA100', title: 'Design' } };
const ITEM = { id: 'i1', kind: 'assignment' as const, title: 'Bridge Sketch', body: 'Do it.', points: 20, published: true };
const at = new Date(Date.now() - 3600_000).toISOString();
const GRADING = {
	roster: [
		{ student_email: 'ben@boscotech.net', display_name: 'Ben Student', active: true },
		{ student_email: 'cruz@boscotech.net', display_name: 'Cruz Student', active: true }
	],
	submissions: [
		{
			student_email: 'ben@boscotech.net',
			item_id: 'i1',
			state: 'returned',
			score: 15,
			rubric_scores: { c1: 10, c2: 5 },
			graded_at: at,
			returned_at: at
		}
	],
	responses: [{ student_email: 'ben@boscotech.net', item_id: 'i1', block_id: 'b1', value: { text: 'x' } }],
	files: [],
	approvals: []
};
const levels = [
	{ label: 'Proficient', short: 'P', points: 10, descriptor: 'Clear.' },
	{ label: 'Developing', short: 'D', points: 5, descriptor: 'Rough.' },
	{ label: 'Not yet', short: 'NY', points: 0, descriptor: 'Nothing.' }
];
const RUBRIC = [
	{ id: 'c1', criterion: 'Sketch', levels },
	{ id: 'c2', criterion: 'Labels', levels }
];

async function openBen(): Promise<Mounted> {
	const m = mountInto(GradingConsole as unknown as Component<Record<string, unknown>>, {
		section: SECTION,
		item: ITEM,
		spec: null,
		rubric: RUBRIC,
		transports: { loadGrading: async () => ({ ok: true, data: GRADING }) }
	});
	await m.settle();
	const ben = m.all<HTMLButtonElement>('.roster-row').find((r) => r.textContent?.includes('Ben Student'))!;
	ben.click();
	await m.settle();
	return m;
}

const text = (m: Mounted, sel: string) => m.all(sel).map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim());

describe('Blind grading', () => {
	it('off: the stored grade shows in the chip, both criteria, the picked levels and the total', async () => {
		mounted = await openBen();
		expect(text(mounted, '.roster-row').join(' ')).toContain('15/20');
		expect(text(mounted, '.score-value')).toEqual(['10 / 10', '5 / 10']);
		expect(mounted.all('.level-btn.picked')).toHaveLength(2);
		expect(text(mounted, '[data-testid="score-total"]')[0]).toContain('15 / 20');
		expect(mounted.all('[data-testid="blind-score"]')).toHaveLength(0);
		expect(mounted.all('[data-testid="blind-reveal"]')).toHaveLength(0);
	});

	it('on: no stored score anywhere, one Hidden per stored score, and Show brings them back', async () => {
		mounted = await openBen();
		mounted.one<HTMLButtonElement>('[data-testid="blind-mode"]').click();
		await mounted.settle();
		expect(mounted.one('[data-testid="blind-mode"]').getAttribute('aria-pressed')).toBe('true');
		// ABSENT: the stored numbers.
		expect(text(mounted, '.roster-row').join(' ')).not.toContain('15');
		expect(text(mounted, '.score-value').join(' ')).not.toMatch(/\b(10|5) \//);
		expect(mounted.all('.level-btn.picked')).toHaveLength(0);
		expect(mounted.all('.level-btn[aria-pressed="true"]')).toHaveLength(0);
		expect(text(mounted, '[data-testid="score-total"]')[0]).not.toContain('15');
		// PRESENT: a mark for each stored score, and the way back.
		expect(mounted.all('[data-testid="blind-score"]')).toHaveLength(2);
		expect(mounted.all('[data-testid="blind-reveal"]')).toHaveLength(1);
		mounted.one<HTMLButtonElement>('[data-testid="blind-reveal"]').click();
		await mounted.settle();
		expect(text(mounted, '[data-testid="score-total"]')[0]).toContain('15 / 20');
		expect(mounted.all('[data-testid="blind-score"]')).toHaveLength(0);
	});

	it('on: scoring a line shows that line and still hides the other', async () => {
		mounted = await openBen();
		mounted.one<HTMLButtonElement>('[data-testid="blind-mode"]').click();
		await mounted.settle();
		// Sketch's "Not yet" level: the grader's own score, now visible.
		mounted.one<HTMLButtonElement>('[data-grade-level="0:2"]').click();
		await mounted.settle();
		expect(text(mounted, '.score-value')[0]).toBe('0 / 10');
		expect(mounted.all('[data-testid="blind-score"]')).toHaveLength(1);
		expect(mounted.all('.level-btn.picked')).toHaveLength(1);
	});
});
