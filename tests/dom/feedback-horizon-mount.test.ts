// tests/dom/feedback-horizon-mount.test.ts
//
// THE REPORT BOX AND THE CONSOLE, MOUNTED: the console link an admin gets in
// the box (report R15) and the long-term horizon (0230), driven rather than
// read out of the source.
//
// WHAT ONLY A MOUNT CAN SEE, AND WHY EACH ONE FAILS QUIETLY:
//
//   * THE LINK IS DERIVED FROM `page.data.isAdmin`, which the root layout puts
//     there and no mount site threads. A derivation that stopped reading it
//     would remove the link from every admin's box with nothing on screen to
//     say it was ever meant to be there, so both directions are asserted on
//     the REAL `SiteFeedback` with the same fixture: 1 link for an admin, 0 for
//     everyone else, 0 on the console itself.
//   * THE ENTRY IS WHAT REACHES THE WRITE PATH, and a `horizon` key sent where
//     nobody chose "long-term" is invisible on screen and costs every report a
//     refused insert on a backend before 0230. So `'horizon' in entry` is the
//     assertion, in both directions, not a value comparison.
//   * GREENLINE MOUNTS `FeedbackBox` DIRECTLY, without the prop, and must get
//     no horizon control and no key: the positive control beside that absence
//     is the kind group, which it does get.
//   * IN THE CONSOLE, "Fix soon" LEAVING OUT THE LONG-TERM IDEAS must not be a
//     list that leaves out everything: counted both ways, then a move drives a
//     row from one list to the other through the transport.
//
// Structure, events and payloads only: happy-dom has no layout engine, so the
// 44px floor and the contrast of the link and the chip are verify:browser's
// (`feedback-state-admin-link.mjs`, `feedback-view-console-horizon.mjs`).

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import { page } from '$app/state';

import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
import FeedbackBox from '$lib/feedback/FeedbackBox.svelte';
import FeedbackConsole from '$lib/classroom/FeedbackConsole.svelte';
import { describeBuild, type BuildStamp } from '$lib/feedback/context';
import type {
	FeedbackEntry,
	FeedbackHorizon,
	FeedbackResult,
	FeedbackRow
} from '$lib/feedback/feedback';
import { mountInto, type Mounted } from './mount';

type Any = Component<Record<string, unknown>>;
const Site = SiteFeedback as unknown as Any;
const Box = FeedbackBox as unknown as Any;
const Console = FeedbackConsole as unknown as Any;
const BUILD: BuildStamp = describeBuild({ sha: 'a1b2c3d', complete: true }, null);
const TYPED = 'A presentation engine for running student slides.';

const mounted: Mounted[] = [];
let restore: (() => void) | null = null;
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
	restore?.();
	restore = null;
});

/** Put an `isAdmin` answer behind `page.data`, the root layout's own key. */
function adminIs(value: boolean | undefined): void {
	const previous = page.data;
	page.data = value === undefined ? {} : { isAdmin: value };
	restore = () => {
		page.data = previous;
	};
}

function click(el: Element): void {
	el.dispatchEvent(new Event('click', { bubbles: true }));
}
function typeInto(m: Mounted, el: HTMLTextAreaElement, value: string): void {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	m.flush();
}

function site(props: Record<string, unknown> = {}) {
	const sent: FeedbackEntry[] = [];
	const m = mountInto(Site, {
		routeId: '/notebook',
		pathname: '/notebook',
		build: BUILD,
		dictation: null,
		submit: async (entry: FeedbackEntry): Promise<FeedbackResult> => {
			sent.push(entry);
			return { error: null, retryable: false };
		},
		...props
	});
	mounted.push(m);
	return { m, sent };
}

/** The box arrives on a dynamic import, so the press is followed by a bounded poll. */
async function openBox(m: Mounted): Promise<void> {
	click(m.one('.sfb-trigger'));
	for (let i = 0; i < 100; i++) {
		m.flush();
		if (m.all('#fb-msg').length) return;
		await new Promise((r) => setTimeout(r, 10));
	}
	throw new Error('the box did not mount within 1s of the press');
}

async function send(m: Mounted): Promise<void> {
	typeInto(m, m.one<HTMLTextAreaElement>('#fb-msg'), TYPED);
	click(m.one('button.fb-btn-primary'));
	for (let i = 0; i < 100; i++) {
		await m.settle();
		if (m.target.textContent?.includes('Thanks, that went through.')) return;
	}
	throw new Error('the send never acknowledged');
}

const links = (m: Mounted) => m.all<HTMLAnchorElement>('[data-testid="fb-console-link"]');

/* ------------------------------------------------------------ R15: the link */

describe('the console link in the report box (report R15)', () => {
	it('an admin gets it in the box header, opening the console in a new tab', async () => {
		adminIs(true);
		const { m } = site();
		await openBox(m);
		const found = links(m);
		expect(found).toHaveLength(1);
		expect(found[0]!.getAttribute('href')).toBe('/admin/feedback');
		expect(found[0]!.getAttribute('target')).toBe('_blank');
		expect(found[0]!.getAttribute('rel')).toBe('noopener');
		expect(found[0]!.closest('.fb-head')).not.toBeNull();
		// The word, not only an address: it says where it goes and how.
		expect(found[0]!.textContent).toContain('Feedback page');
		expect(found[0]!.textContent).toContain('opens in a new tab');
	});

	it('stays on screen, once, after a report has gone, which is when an admin most wants it', async () => {
		adminIs(true);
		const { m } = site();
		await openBox(m);
		await send(m);
		expect(m.target.textContent).toContain('Thanks, that went through.');
		const found = links(m);
		expect(found).toHaveLength(1);
		expect(found[0]!.closest('.fb-head')).not.toBeNull();
	});

	it('nobody else gets it: not a non-admin, not a page with no answer, not an explicit null', async () => {
		for (const [value, props] of [
			[false, {}],
			[undefined, {}],
			[true, { consoleHref: null }]
		] as const) {
			adminIs(value);
			const { m } = site(props);
			await openBox(m);
			expect(links(m), `isAdmin ${value}`).toHaveLength(0);
			// POSITIVE CONTROL in the same box: it rendered, with its kinds.
			expect(m.all('.fb-kinds[aria-label="Feedback type"] .fb-kind')).toHaveLength(4);
			await m.stop();
			restore?.();
			restore = null;
		}
	});

	it('an admin already ON the console is not handed a link to the page on screen', async () => {
		adminIs(true);
		const { m } = site({ routeId: '/admin/feedback', pathname: '/admin/feedback' });
		await openBox(m);
		expect(links(m)).toHaveLength(0);
		expect(m.all('#fb-msg')).toHaveLength(1);
	});
});

/* ---------------------------------------------------- 0230: the horizon */

describe('the horizon choice in the box (0230)', () => {
	it('the site box offers it, and an ordinary send carries no horizon key at all', async () => {
		adminIs(false);
		const { m, sent } = site();
		await openBox(m);
		const radios = m.all<HTMLButtonElement>('[role="radiogroup"][aria-label="When to act on this"] [role="radio"]');
		expect(radios.map((r) => r.textContent?.trim())).toEqual(['Fix soon', 'Long-term idea']);
		expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
		await send(m);
		expect(sent).toHaveLength(1);
		expect('horizon' in sent[0]!).toBe(false);
	});

	it('a chosen long-term idea travels as one, and SEND ANOTHER puts the choice back', async () => {
		adminIs(false);
		const { m, sent } = site();
		await openBox(m);
		click(m.one('[data-testid="fb-horizon-long_term"]'));
		m.flush();
		expect(m.one('[data-testid="fb-horizon-long_term"]').getAttribute('aria-checked')).toBe('true');
		expect(m.one('#fb-horizon-hint').textContent).toContain('a big idea for later');
		await send(m);
		expect(sent[0]!.horizon).toBe('long_term');

		const again = m.all<HTMLButtonElement>('.fb-done button').find((b) => b.textContent?.trim() === 'SEND ANOTHER');
		click(again!);
		m.flush();
		expect(m.one('[data-testid="fb-horizon-now"]').getAttribute('aria-checked')).toBe('true');
		await send(m);
		expect(sent).toHaveLength(2);
		expect('horizon' in sent[1]!).toBe(false);
	});

	it('a box mounted directly without the prop (GREENLINE) has no horizon control and sends no key', async () => {
		const sent: FeedbackEntry[] = [];
		const m = mountInto(Box, {
			app: 'greenline',
			dictation: null,
			onClose: () => {},
			submit: async (entry: FeedbackEntry) => {
				sent.push(entry);
				return { error: null, retryable: false };
			}
		});
		mounted.push(m);
		expect(m.all('[aria-label="When to act on this"]')).toHaveLength(0);
		expect(m.all('[data-testid^="fb-horizon-"]')).toHaveLength(0);
		expect(m.all('[data-testid="fb-console-link"]')).toHaveLength(0);
		// POSITIVE CONTROL: the same box has its kind group.
		expect(m.all('.fb-kinds[aria-label="Feedback type"] .fb-kind')).toHaveLength(4);
		await send(m);
		expect(sent).toHaveLength(1);
		expect('horizon' in sent[0]!).toBe(false);
	});
});

/* ------------------------------------------------- 0230: the console */

function row(id: string, horizon?: FeedbackHorizon, meta: Record<string, unknown> = {}): FeedbackRow {
	return {
		id,
		app: 'portal',
		context: '/',
		kind: 'idea',
		message: `report ${id}`,
		meta: { route: '/', ...meta },
		status: 'new',
		created_at: '2026-09-25T09:02:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'A Teacher',
		submitter_email: 'a@boscotech.edu',
		...(horizon ? { horizon } : {})
	};
}

const ROWS = [row('n1'), row('l1', 'long_term'), row('n2', 'now'), row('l2', undefined, { horizon: 'long_term' })];

function consoleWith(props: Record<string, unknown> = {}) {
	const calls: [string, FeedbackHorizon][] = [];
	const m = mountInto(Console, {
		rows: ROWS,
		setStatus: async () => ({ ok: true }),
		...props,
		...('setHorizon' in props
			? {}
			: {
					setHorizon: async (id: string, h: FeedbackHorizon) => {
						calls.push([id, h]);
						return { ok: true };
					}
				})
	});
	mounted.push(m);
	return { m, calls };
}

const listed = (m: Mounted) =>
	m.all<HTMLInputElement>('article.fb-row input.fb-select').map((i) => i.dataset.testid?.replace('fbc-select-', ''));

describe('the console splits fix soon from long-term ideas (0230)', () => {
	it('opens on Fix soon, which holds the now rows and none of the long-term ones', () => {
		const { m } = consoleWith();
		expect(m.one('[data-testid="fbc-horizon-now"]').getAttribute('aria-selected')).toBe('true');
		expect(listed(m)).toEqual(['n1', 'n2']);
		expect(m.all('[data-testid="fbc-long-term-chip"]')).toHaveLength(0);
		expect(m.one('[data-testid="fbc-horizon-now"]').textContent).toContain('Fix soon (2)');
		expect(m.one('[data-testid="fbc-horizon-long_term"]').textContent).toContain('Long-term ideas (2)');
		expect(m.one('[data-testid="fbc-horizon-both"]').textContent).toContain('Both (4)');
	});

	it('Long-term ideas holds exactly the two long-term rows, the meta-only one included, each chipped', () => {
		const { m } = consoleWith();
		click(m.one('[data-testid="fbc-horizon-long_term"]'));
		m.flush();
		expect(listed(m)).toEqual(['l1', 'l2']);
		expect(m.all('[data-testid="fbc-long-term-chip"]')).toHaveLength(2);
	});

	it('Both renders two lists under their own headings', () => {
		const { m } = consoleWith();
		click(m.one('[data-testid="fbc-horizon-both"]'));
		m.flush();
		const ids = (group: string) =>
			m
				.all<HTMLInputElement>(`[data-testid="fbc-group-${group}"] input.fb-select`)
				.map((i) => i.dataset.testid?.replace('fbc-select-', ''));
		expect(ids('now')).toEqual(['n1', 'n2']);
		expect(ids('long_term')).toEqual(['l1', 'l2']);
		expect(m.one('#fbc-group-long_term').textContent).toContain('Long-term ideas (2)');
	});

	it('a move goes through the transport, leaves this list, and says so above it', async () => {
		const { m, calls } = consoleWith();
		const btn = m.one<HTMLButtonElement>('[data-testid="fbc-horizon-move-n1"]');
		expect(btn.textContent?.trim()).toBe('Move to long-term');
		click(btn);
		await m.settle();
		expect(calls).toEqual([['n1', 'long_term']]);
		expect(listed(m)).toEqual(['n2']);
		expect(m.one('[data-testid="fbc-horizon-note"]').textContent).toContain('to Long-term ideas');
		click(m.one('[data-testid="fbc-horizon-long_term"]'));
		m.flush();
		expect(listed(m)).toEqual(['n1', 'l1', 'l2']);
		expect(m.one('[data-testid="fbc-horizon-move-n1"]').textContent?.trim()).toBe('Move to fix soon');
	});

	it('with no transport there is no move control, and the reason is said once', () => {
		const { m } = consoleWith({ setHorizon: undefined, horizonUnavailable: 'Not switched on yet.' });
		expect(m.all('[data-testid^="fbc-horizon-move-"]')).toHaveLength(0);
		expect(m.all('.fbc-horizon-unavailable')).toHaveLength(1);
		// POSITIVE CONTROL: the rows and their status keys are all there.
		expect(listed(m)).toEqual(['n1', 'n2']);
		expect(m.all('article.fb-row .fb-actions button').length).toBeGreaterThan(0);
	});
});
