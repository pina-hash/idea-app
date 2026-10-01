// tests/dom/grading-roster-compact-mount.test.ts
//
// LEDGER 0360, REPORT 7933566a: THE GRADE PAGE'S ROSTER IS ONE LINE PER
// STUDENT, ITS DETAIL IS ONE CARD, AND THE KEYBOARD WALKS IT.
//
// Mounts the REAL `GradingConsole`. What is asserted is STRUCTURE and EVENTS,
// both directions: one line per row and no presence line in it, against one
// card after a focus; Up and Down moving between NAMES while a name has focus,
// against Up and Down still moving between CRITERIA everywhere else; Escape
// closing the card and not the student, against Escape closing the student when
// no card is up. The geometry (row height, how many names fit, the head never a
// sliver) is `tools/browser-verify/routes/html-assignment-grading-roster-30.mjs`,
// because happy-dom has no layout engine and would read every box as zero.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import GradingConsole from '$lib/classroom/GradingConsole.svelte';
import { PRESENCE_LIMITS_FALLBACK, type PresencePayload } from '$lib/classroom/presence/state';
import { mountInto, type Mounted } from './mount';

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

const SECTION = { id: 's1', label: 'Period 1', course: { code: 'IDEA100', title: 'Design' } };
const ITEM = { id: 'i1', kind: 'assignment' as const, title: 'Bridge Sketch', body: 'Do it.', points: 20, published: true };
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

const ROSTER = ['ana', 'ben', 'cruz', 'dee'].map((n) => ({
	student_email: `${n}@boscotech.net`,
	display_name: `${n[0].toUpperCase()}${n.slice(1)} Student`,
	active: true
}));
const GRADING = {
	roster: ROSTER,
	submissions: [{ student_email: 'ben@boscotech.net', item_id: 'i1', state: 'returned', score: 18 }],
	responses: [{ student_email: 'ben@boscotech.net', item_id: 'i1', block_id: 'b1', value: { text: 'x' } }],
	files: [],
	approvals: []
};
const PRESENCE: PresencePayload = {
	item_id: 'i1',
	section_id: 's1',
	at: new Date().toISOString(),
	limits: PRESENCE_LIMITS_FALLBACK,
	students: [
		{
			student_email: 'ana@boscotech.net',
			state: 'working',
			last_seen_at: ago(5),
			last_input_at: ago(5),
			page_visible: true,
			active_seconds: 600
		}
	]
};
const RUBRIC = [
	{
		id: 'c1',
		criterion: 'Sketch',
		levels: [
			{ label: 'Proficient', short: 'P', points: 10, descriptor: 'Clear.' },
			{ label: 'Developing', short: 'D', points: 5, descriptor: 'Rough.' },
			{ label: 'Not yet', short: 'NY', points: 0, descriptor: 'Nothing.' }
		]
	},
	{
		id: 'c2',
		criterion: 'Labels',
		levels: [
			{ label: 'Proficient', short: 'P', points: 10, descriptor: 'Clear.' },
			{ label: 'Developing', short: 'D', points: 5, descriptor: 'Rough.' },
			{ label: 'Not yet', short: 'NY', points: 0, descriptor: 'Nothing.' }
		]
	}
];

function mountConsole(): Mounted {
	return mountInto(GradingConsole as unknown as Component<Record<string, unknown>>, {
		section: SECTION,
		item: ITEM,
		spec: null,
		rubric: RUBRIC,
		transports: { loadGrading: async () => ({ ok: true, data: GRADING }) },
		presence: { loadPresence: async () => PRESENCE }
	});
}

const rows = (m: Mounted) => m.all<HTMLButtonElement>('.roster-row');
function key(target: Element, k: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	return event;
}

describe('one line per student', () => {
	it('each item holds exactly one row and no presence line; the head keys sit in one group', async () => {
		mounted = mountConsole();
		await mounted.settle();
		const items = mounted.all('.roster-item');
		expect(items).toHaveLength(4);
		for (const item of items) {
			expect(item.querySelectorAll('.roster-row')).toHaveLength(1);
			expect(item.querySelectorAll('[data-testid="presence-line"]')).toHaveLength(0);
		}
		// The keys are one group, and the class size rides on All.
		const keys = mounted.one('.roster-keys');
		expect(keys.querySelector('[data-testid="roster-filter-all"]')).not.toBeNull();
		expect(keys.querySelector('[data-testid="roster-filter-to-grade"]')).not.toBeNull();
		expect(mounted.one('[data-testid="roster-count"]').textContent?.trim()).toBe('4');
		expect(mounted.one('[data-testid="roster-count"]').closest('[data-testid="roster-filter-all"]')).not.toBeNull();
		// The heading word is there for a screen reader.
		expect(mounted.one('.roster-head h2').textContent?.trim()).toBe('Roster');
	});
});

describe('the card', () => {
	it('0 cards at rest, 1 after a focus, naming that student and described by the row', async () => {
		mounted = mountConsole();
		await mounted.settle();
		expect(mounted.all('[data-testid="roster-card"]')).toHaveLength(0);
		const [ana, ben] = rows(mounted);
		ben.focus();
		await mounted.settle();
		const cards = mounted.all('[data-testid="roster-card"]');
		expect(cards).toHaveLength(1);
		expect(cards[0].getAttribute('role')).toBe('tooltip');
		expect(cards[0].textContent).toContain('Ben Student');
		expect(cards[0].querySelector('[data-testid="roster-card-state"]')?.textContent).toMatch(/^Returned/);
		// The row points at the card exactly while it shows, and no other row does.
		expect(ben.getAttribute('aria-describedby')).toBe(cards[0].id);
		expect(ana.hasAttribute('aria-describedby')).toBe(false);
		ben.blur();
		await mounted.settle();
		expect(mounted.all('[data-testid="roster-card"]')).toHaveLength(0);
		expect(ben.hasAttribute('aria-describedby')).toBe(false);
	});

	it('carries the presence line the row used to print', async () => {
		mounted = mountConsole();
		await mounted.settle();
		rows(mounted)[0].focus();
		await mounted.settle();
		const card = mounted.one('[data-testid="roster-card"]');
		expect(card.querySelector('[data-presence-state]')?.getAttribute('data-presence-state')).toBe('working');
		expect(card.querySelector('[data-testid="presence-active"]')?.textContent?.trim()).toBe('10m active');
	});

	it('opens on a mouse pointer after a pause, and never on a touch', async () => {
		mounted = mountConsole();
		await mounted.settle();
		const [ana] = rows(mounted);
		ana.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
		await new Promise((r) => setTimeout(r, 220));
		mounted.flush();
		expect(mounted.all('[data-testid="roster-card"]')).toHaveLength(0);
		ana.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		await new Promise((r) => setTimeout(r, 220));
		mounted.flush();
		expect(mounted.all('[data-testid="roster-card"]')).toHaveLength(1);
		ana.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		mounted.flush();
		expect(mounted.all('[data-testid="roster-card"]')).toHaveLength(0);
	});
});

describe('the keyboard walks the roster', () => {
	it('Down, Up, End and Home move focus between names', async () => {
		mounted = mountConsole();
		await mounted.settle();
		const r = rows(mounted);
		r[0].focus();
		await mounted.settle();
		expect(key(r[0], 'ArrowDown').defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(r[1]);
		key(r[1], 'End');
		expect(document.activeElement).toBe(r[3]);
		key(r[3], 'ArrowUp');
		expect(document.activeElement).toBe(r[2]);
		key(r[2], 'Home');
		expect(document.activeElement).toBe(r[0]);
		await mounted.settle();
		// The card follows the focus.
		expect(mounted.one('[data-testid="roster-card"]').textContent).toContain('Ana Student');
	});

	it('Up and Down in the roster do NOT move a criterion; outside it they still do', async () => {
		mounted = mountConsole();
		await mounted.settle();
		const r = rows(mounted);
		r[0].click();
		await mounted.settle();
		const focusedCriterion = () =>
			mounted!.all('.score-row').findIndex((row) => row.classList.contains('focused'));
		expect(focusedCriterion()).toBe(0);
		r[0].focus();
		key(r[0], 'ArrowDown');
		await mounted.settle();
		// The name moved, the criterion did not.
		expect(document.activeElement).toBe(r[1]);
		expect(focusedCriterion()).toBe(0);
		// THE POSITIVE CONTROL: the same key outside the roster moves the criterion.
		(document.activeElement as HTMLElement).blur();
		key(document.body, 'ArrowDown');
		await mounted.settle();
		expect(focusedCriterion()).toBe(1);
	});

	it('Escape closes the card and not the student; with no card it closes the student', async () => {
		mounted = mountConsole();
		await mounted.settle();
		const r = rows(mounted);
		r[1].click();
		await mounted.settle();
		expect(mounted.all('.work-head')).toHaveLength(1);
		r[2].focus();
		await mounted.settle();
		expect(mounted.all('[data-testid="roster-card"]')).toHaveLength(1);
		key(r[2], 'Escape');
		await mounted.settle();
		expect(mounted.all('[data-testid="roster-card"]')).toHaveLength(0);
		expect(mounted.all('.work-head')).toHaveLength(1);
		// No card now: the console's own Escape goes back to the roster.
		key(r[2], 'Escape');
		await mounted.settle();
		expect(mounted.all('.work-head')).toHaveLength(0);
	});
});
