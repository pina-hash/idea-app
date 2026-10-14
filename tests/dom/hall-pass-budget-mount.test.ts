// tests/dom/hall-pass-budget-mount.test.ts
//
// 0237 PART B on the REAL HallPass component (ledger 0380, report 7348d14c):
// the student reads their minutes and who is out before they tap, a spent day
// explains itself with the day it comes back, and an instructor sets the two
// numbers (empty means the default, a refusal is shown in words, and no
// `setLimits` transport means no control). Structure, events and calls; the
// browser pass owns every box.

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import HallPass from '../../src/lib/classroom/HallPass.svelte';
import type {
	HallPassBudget,
	HallPassManagerState,
	HallPassStudentState,
	HallPassTransports
} from '../../src/lib/classroom/hall-pass';
import { mountInto, type Mounted } from './mount';

const NOW = Date.parse('2026-09-02T18:20:00.000Z'); // Wednesday, 11:20 in Los Angeles
const SECTION = '11111111-1111-1111-1111-111111111111';
let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

const budget = (over: Partial<HallPassBudget> = {}): HallPassBudget => ({
	daily_seconds: 600,
	auto_checkin_seconds: 1800,
	allowance_seconds: 600,
	used_seconds: 240,
	remaining_seconds: 360,
	debt_seconds: 0,
	blocked: false,
	available_at: null,
	resets_at: '2026-09-07T07:00:00.000Z',
	...over
});
const student = (over: Partial<HallPassStudentState> = {}): HallPassStudentState => ({
	scope: 'student',
	section_id: SECTION,
	taken: false,
	mine: false,
	opened_at: null,
	limits: { budget_minutes: 10, auto_checkin_minutes: 30 },
	budget: budget(),
	...over
});
const manager = (over: Partial<HallPassManagerState> = {}): HallPassManagerState => ({
	scope: 'manager',
	section_id: SECTION,
	taken: false,
	mine: false,
	open: null,
	history: [],
	limits: { budget_minutes: 10, auto_checkin_minutes: 30 },
	roster: [{ student_email: 'ana@boscotech.net', student_name: 'Ana Reyes' }],
	...over
});
const quiet = (extra: Partial<HallPassTransports> = {}): HallPassTransports => ({
	load: async () => null,
	open: async () => ({ ok: true, data: { pass_id: 'p', opened_at: new Date(NOW).toISOString() } }),
	closeMine: async () => ({ ok: false, message: 'no' }),
	closeById: async () => ({ ok: false, message: 'no' }),
	...extra
});
const mount = (state: HallPassStudentState | HallPassManagerState, transports: HallPassTransports | null) =>
	(mounted = mountInto(HallPass as never, { sectionId: SECTION, state, transports, now: NOW, pollMs: 3_600_000 }));
const text = (m: Mounted) => m.target.textContent?.replace(/\s+/g, ' ') ?? '';

describe('a student reads the budget before tapping', () => {
	it('shows the minutes left and the auto check in line, and the control is live', () => {
		const m = mount(student(), quiet());
		expect(m.one('[data-testid="hall-pass-usage"]').textContent).toContain('6 minutes of pass time left today.');
		expect(m.one('[data-testid="hall-pass-auto"]').textContent).toContain('30 minutes is checked in for you');
		expect(m.one('[data-testid="hall-pass-open"]').getAttribute('aria-disabled')).toBe('false');
	});

	it('shows who is out, by shown name and since when', () => {
		const m = mount(student({ taken: true, out: { name: 'Ben Cho', opened_at: '2026-09-02T18:08:00.000Z' } }), quiet());
		expect(text(m)).toContain('Ben Cho is out');
		expect(m.one('[data-testid="hall-pass-chip"]').textContent).toContain('Taken');
		expect(m.one('[data-testid="hall-pass-open"]').getAttribute('aria-disabled')).toBe('true');
	});

	it('a spent day closes the control, and a tap anyway names the day it comes back', async () => {
		let opened = 0;
		const m = mount(
			student({ budget: budget({ used_seconds: 600, remaining_seconds: 0, blocked: true, available_at: '2026-09-03T07:00:00.000Z' }) }),
			quiet({
				open: async () => {
					opened++;
					return { ok: false, refusal: 'over_budget', availableAt: '2026-09-03T07:00:00.000Z', resetsAt: '2026-09-07T07:00:00.000Z', nowMs: NOW };
				}
			})
		);
		const btn = m.one<HTMLButtonElement>('[data-testid="hall-pass-open"]');
		expect(btn.getAttribute('aria-disabled')).toBe('true');
		btn.click();
		await m.settle();
		// The control mirrors the rule: the call is not made at all.
		expect(opened).toBe(0);
		expect(m.one('[data-testid="hall-pass-notice"]').textContent).toContain('You can go again tomorrow.');
	});

	it('a deployment before the migration shows no budget and blocks nothing', () => {
		const m = mount(student({ budget: undefined, limits: undefined }), quiet());
		expect(m.all('[data-testid="hall-pass-usage"]').length).toBe(0);
		expect(m.all('[data-testid="hall-pass-auto"]').length).toBe(0);
		expect(m.one('[data-testid="hall-pass-open"]').getAttribute('aria-disabled')).toBe('false');
	});
});

describe('an instructor sets the two numbers', () => {
	it('seeds the boxes from the payload and sends whole minutes', async () => {
		const sent: unknown[][] = [];
		const m = mount(
			manager(),
			quiet({
				setLimits: async (...args: unknown[]) => {
					sent.push(args);
					return { ok: true };
				}
			})
		);
		const daily = m.one<HTMLInputElement>('[data-testid="hall-pass-budget-input"]');
		const auto = m.one<HTMLInputElement>('[data-testid="hall-pass-auto-input"]');
		expect([daily.value, auto.value]).toEqual(['10', '30']);
		daily.value = '15';
		daily.dispatchEvent(new Event('input', { bubbles: true }));
		auto.value = '';
		auto.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		m.one<HTMLButtonElement>('[data-testid="hall-pass-limits-save"]').click();
		await m.settle();
		// An empty box is the default (null), a number is a number.
		expect(sent).toEqual([[SECTION, 15, null]]);
		expect(m.one('[data-testid="hall-pass-notice"]').textContent).toContain('Saved');
	});

	it('refuses a non-number without calling the server, and shows the database refusal in words', async () => {
		let calls = 0;
		const m = mount(
			manager(),
			quiet({
				setLimits: async () => {
					calls++;
					return { ok: false, message: 'Pass time a day has to be between 1 and 120 minutes.' };
				}
			})
		);
		const daily = m.one<HTMLInputElement>('[data-testid="hall-pass-budget-input"]');
		daily.value = 'ten';
		daily.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		m.one<HTMLButtonElement>('[data-testid="hall-pass-limits-save"]').click();
		await m.settle();
		expect(calls).toBe(0);
		expect(m.one('[data-testid="hall-pass-notice"]').textContent).toContain('whole minutes');
		daily.value = '500';
		daily.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		m.one<HTMLButtonElement>('[data-testid="hall-pass-limits-save"]').click();
		await m.settle();
		expect(calls).toBe(1);
		expect(m.one('[data-testid="hall-pass-notice"]').textContent).toContain('between 1 and 120');
	});

	it('no setLimits transport, or no limits in the payload, means no control', () => {
		expect(mount(manager(), quiet()).all('[data-testid="hall-pass-limits"]').length).toBe(0);
		const none = mountInto(HallPass as never, {
			sectionId: SECTION,
			state: manager({ limits: undefined }),
			transports: quiet({ setLimits: async () => ({ ok: true }) }),
			now: NOW,
			pollMs: 3_600_000
		});
		expect(none.all('[data-testid="hall-pass-limits"]').length).toBe(0);
		void none.stop();
	});

	it('lists the students who have used time, most first, with who is out of time', () => {
		const m = mount(
			manager({
				roster: [
					{ student_email: 'ana@boscotech.net', student_name: 'Ana Reyes' },
					{ student_email: 'ben@boscotech.net', student_name: 'Ben Ortiz' },
					{ student_email: 'cy@boscotech.net', student_name: 'Cy Park' }
				],
				budgets: {
					'ana@boscotech.net': budget({ used_seconds: 120 }),
					'ben@boscotech.net': budget({ used_seconds: 600, blocked: true, remaining_seconds: 0 }),
					'cy@boscotech.net': budget({ used_seconds: 0 })
				}
			}),
			quiet()
		);
		const rows = m.all('.hp-entry').map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
		expect(rows).toHaveLength(2);
		expect(rows[0]).toContain('Ben Ortiz');
		expect(rows[0]).toContain('out of time');
		expect(rows[1]).toContain('Ana Reyes');
	});
});
