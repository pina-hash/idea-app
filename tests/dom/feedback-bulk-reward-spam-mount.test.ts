// tests/dom/feedback-bulk-reward-spam-mount.test.ts
//
// Ledger 0432 on the MOUNTED feedback console and the spam fine prompt:
//   * a selection moves in ONE call when the bulk transport is handed in, and
//     only what the database moved leaves the selection;
//   * the reward control is on a student's report and nowhere else, sends the
//     amount typed, and a rewarded report says so instead;
//   * the fine prompt fines nobody until the press, fines exactly the reports
//     on its card, and offers no key without a transport.
// Structure and events only (happy-dom); geometry is the browser pass.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import FeedbackConsole from '$lib/classroom/FeedbackConsole.svelte';
import SpamFinePrompt from '$lib/feedback/SpamFinePrompt.svelte';
import { spamPrompts, type SpamReport } from '$lib/feedback/spam';
import type { FeedbackRow, FeedbackStatus } from '$lib/feedback/feedback';
import { mountInto, type Mounted } from './mount';

type Box = Component<Record<string, unknown>>;
const Console = FeedbackConsole as unknown as Box;
const Prompt = SpamFinePrompt as unknown as Box;

function row(id: string, over: Partial<FeedbackRow> = {}): FeedbackRow {
	return {
		id,
		app: 'portal',
		context: '/classroom',
		kind: 'bug',
		message: `report ${id}`,
		meta: { route: '/classroom', path: '/classroom', role: 'student' },
		status: 'new',
		created_at: '2026-10-22T19:02:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'A Student',
		submitter_email: 'a@boscotech.net',
		...over
	};
}

const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});
const click = (el: Element) => el.dispatchEvent(new Event('click', { bubbles: true }));
function tick(el: HTMLInputElement) {
	el.checked = !el.checked;
	el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('a selection in one call', () => {
	it('sends every selected id once, and keeps selected only what did not move', async () => {
		const one: string[] = [];
		const many: [string[], FeedbackStatus][] = [];
		const m = mountInto(Console, {
			rows: [row('a'), row('b'), row('c')],
			setStatus: async (id: string) => {
				one.push(id);
				return { ok: true };
			},
			setStatusMany: async (ids: string[], status: FeedbackStatus) => {
				many.push([ids, status]);
				return { ok: true, landed: ids.filter((x) => x !== 'b') };
			}
		});
		mounted.push(m);
		for (const id of ['a', 'b', 'c']) tick(m.one<HTMLInputElement>(`[data-testid="fbc-select-${id}"]`));
		m.flush();
		click(m.one('[data-testid="fbc-bulk-spam"]'));
		await m.settle();
		expect(many).toEqual([[['a', 'b', 'c'], 'spam']]);
		expect(one).toEqual([]);
		expect(m.one<HTMLInputElement>('[data-testid="fbc-select-b"]').checked).toBe(true);
		expect(m.all('[data-testid="fbc-select-a"]')).toHaveLength(0);
	});
});

describe('the reward control', () => {
	const rows = [row('s'), row('t', { meta: { role: 'teacher' }, submitter_email: 't@boscotech.edu' }), row('x', { anonymous: true, submitter_name: null, submitter_email: null, meta: {} }), row('r')];
	it('is on a student report with the transport, never on staff, signed-out or with no transport', () => {
		const sent: [string, number][] = [];
		const m = mountInto(Console, { rows, setStatus: async () => ({ ok: true }), rewardReport: async (id: string, a: number) => (sent.push([id, a]), { ok: true }), rewarded: { r: 3 } });
		mounted.push(m);
		expect(m.all('[data-testid="fbc-reward-s"]')).toHaveLength(1);
		expect(m.all('[data-testid="fbc-reward-t"]')).toHaveLength(0);
		expect(m.all('[data-testid="fbc-reward-x"]')).toHaveLength(0);
		expect(m.all('[data-testid="fbc-reward-r"]')).toHaveLength(0);
		expect(m.one('[data-testid="fbc-rewarded-r"]').textContent).toContain('3');
		const none = mountInto(Console, { rows, setStatus: async () => ({ ok: true }) });
		mounted.push(none);
		expect(none.all('[data-testid^="fbc-reward-"]')).toHaveLength(0);
		expect(none.all('[data-testid^="fbc-rewarded-"]')).toHaveLength(0);
	});
	it('sends the amount typed, and only after Award', async () => {
		const sent: [string, number][] = [];
		const m = mountInto(Console, { rows, setStatus: async () => ({ ok: true }), rewardReport: async (id: string, a: number) => (sent.push([id, a]), { ok: true }) });
		mounted.push(m);
		click(m.one('[data-testid="fbc-reward-s"]'));
		m.flush();
		const input = m.one<HTMLInputElement>('[data-testid="fbc-reward-form"] input');
		input.value = '4';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		expect(sent).toEqual([]);
		m.one<HTMLFormElement>('[data-testid="fbc-reward-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await m.settle();
		expect(sent).toEqual([['s', 4]]);
		// The reward resolves the report, so it leaves the New list with its form.
		expect(m.all('[data-testid="fbc-reward-form"]')).toHaveLength(0);
		expect(m.all('[data-testid="fbc-select-s"]')).toHaveLength(0);
	});
});

describe('the spam fine prompt', () => {
	const rep = (user: string, id: string, at: string, over: Partial<SpamReport> = {}): SpamReport => ({
		id, user_id: user, email: `${user}@boscotech.net`, name: `Student ${user}`, created_at: at, message: 'hi', app: 'portal', page: '/',
		auto_spam: 'greeting_or_test', evidence: {}, device_key: null, device_label: null, ...over
	});
	const prompts = spamPrompts({
		reports: [rep('q', 'q1', '2026-10-22T19:00:00Z'), rep('q', 'q2', '2026-10-22T19:00:20Z'), rep('q', 'q3', '2026-10-22T19:00:40Z'), rep('w', 'w1', '2026-10-22T20:00:00Z', { device_key: 'lab' })],
		deviceAccounts: { lab: 4 },
		usualAgents: {}
	});
	it('fines nobody until the press, then exactly that card\'s reports at its amount', async () => {
		const fines: [string[], number][] = [];
		const m = mountInto(Prompt, { prompts, fine: async (ids: string[], a: number) => (fines.push([ids, a]), { ok: true }), dismiss: async () => ({ ok: true }) });
		mounted.push(m);
		expect(m.all('[data-testid="spam-fine-account"]')).toHaveLength(2);
		expect(m.one('[data-testid="spam-burst-sentence"]').textContent).toContain('A burst is 3 or more spam reports');
		expect(fines).toEqual([]);
		const cards = m.all('[data-testid="spam-fine-account"]');
		const q = cards.find((c) => c.textContent?.includes('Student q'))!;
		expect(q.querySelector('[data-testid="spam-fine-go"]')!.textContent?.trim()).toBe('Fine 5i¢');
		click(q.querySelector('[data-testid="spam-fine-go"]')!);
		await m.settle();
		expect(fines).toEqual([[['q3', 'q2', 'q1'], 5]]);
		expect(m.all('[data-testid="spam-fine-account"]')).toHaveLength(1);
		expect(m.one('[data-testid="spam-fine-done"]').textContent).toContain('dispute');
	});
	it('a card whose evidence points away from the owner says so and asks Fine anyway', () => {
		const m = mountInto(Prompt, { prompts, fine: async () => ({ ok: true }), dismiss: async () => ({ ok: true }) });
		mounted.push(m);
		const w = m.all('[data-testid="spam-fine-account"]').find((c) => c.textContent?.includes('Student w'))!;
		expect(w.querySelector('[data-testid="spam-fine-doubts"]')!.textContent).toContain('shared lab computer');
		expect(w.querySelector('[data-testid="spam-fine-go"]')!.textContent?.trim()).toBe('Fine anyway, 1i¢');
	});
	it('offers no key without a transport, and still shows the evidence (both directions)', () => {
		const m = mountInto(Prompt, { prompts });
		mounted.push(m);
		expect(m.all('[data-testid="spam-fine-account"]')).toHaveLength(2);
		expect(m.all('[data-testid="spam-fine-go"], [data-testid="spam-fine-dismiss"]')).toHaveLength(0);
	});
});
