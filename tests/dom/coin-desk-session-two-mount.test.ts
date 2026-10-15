// tests/dom/coin-desk-session-two-mount.test.ts
//
// The rewritten Coin Desk areas (IDEA Coin V2 session two), mounted for real
// over the harness's own in-memory ledger (src/routes/dev/coin-desk), so the
// components drive the same RPC shapes the /dev route does. Structure and
// events only (see ./mount.ts for why no geometry is asserted).
//
// THE TIER IS A GATING CLAIM, SO IT IS COUNTED IN BOTH DIRECTIONS (CLAUDE.md):
// on the SAME student a full coin admin gets the tools, the amount edit, the
// look-up-anyone box and the whole-economy export, and section staff get none
// of them while keeping the telemetry, the history and the one-student
// export. Each mount is the other's positive control.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import type { SupabaseClient } from '@supabase/supabase-js';
import StudentView from '$lib/coin-desk/StudentView.svelte';
import ContractsManager from '$lib/coin-desk/ContractsManager.svelte';
import RolesManager from '$lib/coin-desk/RolesManager.svelte';
import LogView from '$lib/coin-desk/LogView.svelte';
import SettingsPanel from '$lib/coin-desk/SettingsPanel.svelte';
import { mountInto, type Mounted } from './mount';
import {
	createFakeLedger,
	HARNESS_CLASSES,
	HARNESS_USER_ID,
	listCategories,
	setHarnessScope
} from '../../src/routes/dev/coin-desk/fake-ledger';

let m: Mounted | null = null;
afterEach(async () => {
	await m?.stop();
	m = null;
	setHarnessScope('full');
});

async function settleMany(v: Mounted, n = 4) {
	for (let i = 0; i < n; i++) await v.settle();
}

async function openStudent(scope: 'full' | 'section'): Promise<Mounted> {
	const supabase = createFakeLedger() as unknown as SupabaseClient;
	setHarnessScope(scope);
	const categories = listCategories();
	m = mountInto(StudentView as unknown as Component<Record<string, unknown>>, {
		supabase,
		scope,
		classes: HARNESS_CLASSES,
		categories,
		categoryKinds: Object.fromEntries(categories.map((c) => [c.id, c.kind]))
	});
	await settleMany(m);
	const rows = m.all<HTMLButtonElement>('[data-testid="cd-students-roster"] .roster-row');
	expect(rows.length).toBe(3);
	rows[0].click();
	await settleMany(m);
	return m;
}

const FULL_ONLY = [
	'[data-testid="cd-full-tools"]',
	'[data-testid="cd-edit-amount"]',
	'[data-testid="cd-export-economy-csv"]',
	'[data-testid="cd-students-email"]',
	'[data-testid="cd-spool"]',
	'[data-testid="cd-auditor-toggle"]'
];
const BOTH = [
	'[data-testid="cd-student-stats"]',
	'[data-testid="cd-balance-chart"] svg',
	'[data-testid="cd-history-row"]',
	'[data-testid="cd-export-student-csv"]',
	'[data-testid="cd-export-class-csv"]'
];

describe('the Students area, by tier', () => {
	it('a full coin admin gets every tool, the edit and the whole-economy export', async () => {
		const v = await openStudent('full');
		const counts = Object.fromEntries([...FULL_ONLY, ...BOTH].map((s) => [s, v.all(s).length]));
		for (const s of [...FULL_ONLY, ...BOTH]) expect(counts[s], s).toBeGreaterThan(0);
		expect(counts['[data-testid="cd-history-row"]']).toBeGreaterThanOrEqual(5);
	});

	it('section staff get the telemetry, the history and the export, and nothing else', async () => {
		const v = await openStudent('section');
		for (const s of BOTH) expect(v.all(s).length, s).toBeGreaterThan(0);
		for (const s of FULL_ONLY) expect(v.all(s).length, s).toBe(0);
		// The trail of an edit is still READ by section staff; only the edit is
		// a full admin's. healthy.student has one edited row.
		expect(v.all('[data-testid="cd-edited-chip"]').length).toBe(1);
		expect(v.all('[data-testid="cd-edit-trail"]').length).toBe(1);
		expect(v.all('[data-testid="cd-undo-edit"]').length).toBe(0);
	});

	it('an amount edit shows the row as edited, with the old value underneath, and Undo edit puts it back', async () => {
		const v = await openStudent('full');
		expect(v.all('[data-testid="cd-edited-chip"]').length).toBe(1);
		const editable = v.all<HTMLButtonElement>('[data-testid="cd-edit-amount"]');
		// The undone pair, the physical row and the autopay rows are not all
		// the rows; at least one ordinary row offers an edit.
		expect(editable.length).toBeGreaterThan(0);
		editable[0].click();
		v.flush();
		const input = v.one<HTMLInputElement>('[data-testid="cd-edit-value"]');
		input.value = '7';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		v.flush();
		v.one<HTMLButtonElement>('[data-testid="cd-edit-save"]').click();
		await settleMany(v);
		expect(v.all('[data-testid="cd-edited-chip"]').length).toBe(2);
		expect(v.target.textContent).toContain('Changed from');

		const undoEdit = v.all<HTMLButtonElement>('[data-testid="cd-undo-edit"]');
		expect(undoEdit.length).toBe(2);
		undoEdit[0].click();
		v.flush();
		v.one<HTMLButtonElement>('[data-testid="cd-undo-edit-confirm"]').click();
		await settleMany(v);
		expect(v.all('[data-testid="cd-edited-chip"]').length).toBe(1);
	});
});

describe('the Contracts area', () => {
	it('lists the open contracts with claimant states, and offers no Complete control', async () => {
		const supabase = createFakeLedger() as unknown as SupabaseClient;
		m = mountInto(ContractsManager as unknown as Component<Record<string, unknown>>, {
			supabase,
			classes: HARNESS_CLASSES,
			queueHref: '/coin-desk/queue'
		});
		await settleMany(m);
		const cancels = m.all('[data-testid="cd-contract-cancel"]');
		expect(cancels.length).toBe(3);
		expect(m.all('[data-testid="cd-contract-complete"]').length).toBe(0);
		expect(m.all('[data-testid="cd-contract-claimants"] [data-state="marked_done"]').length).toBe(1);
		expect(m.all('[data-testid="cd-contract-queue-link"]').length).toBe(1);
		expect(m.all('[data-testid="cd-contract-debt-only"]').length).toBe(1);
	});

	it('removes the queue link when no queue address is handed in', async () => {
		const supabase = createFakeLedger() as unknown as SupabaseClient;
		m = mountInto(ContractsManager as unknown as Component<Record<string, unknown>>, {
			supabase,
			classes: HARNESS_CLASSES,
			queueHref: null
		});
		await settleMany(m);
		expect(m.all('[data-testid="cd-contract-cancel"]').length).toBe(3);
		expect(m.all('[data-testid="cd-contract-queue-link"]').length).toBe(0);
	});
});

describe('the Roles area', () => {
	it('accepts the first application for a one-seat class, then refuses the second in words', async () => {
		const supabase = createFakeLedger() as unknown as SupabaseClient;
		m = mountInto(RolesManager as unknown as Component<Record<string, unknown>>, { supabase });
		await settleMany(m);
		expect(m.all('[data-testid="cd-role-app"]').length).toBe(3);
		expect(m.all('[data-testid="cd-role-holder"]').length).toBe(2);
		m.all<HTMLButtonElement>('[data-testid="cd-role-accept"]')[0].click();
		await settleMany(m);
		expect(m.all('[data-testid="cd-role-app"]').length).toBe(2);
		expect(m.all('[data-testid="cd-role-holder"]').length).toBe(3);
		m.all<HTMLButtonElement>('[data-testid="cd-role-accept"]')[0].click();
		await settleMany(m);
		expect(m.all('[data-testid="cd-role-app"]').length).toBe(2);
		expect(m.target.textContent).toContain('This class is full for that role');
	});
});

describe('the Log area over IDEA Classroom classes', () => {
	it("logs one amount to every student on the first class's roster, in one call", async () => {
		const supabase = createFakeLedger() as unknown as SupabaseClient;
		const calls: { fn: string; params: Record<string, unknown> }[] = [];
		const spy = {
			...supabase,
			rpc: (fn: string, params: Record<string, unknown>) => {
				calls.push({ fn, params });
				return supabase.rpc(fn, params);
			},
			from: (t: string) => supabase.from(t)
		} as unknown as SupabaseClient;
		m = mountInto(LogView as unknown as Component<Record<string, unknown>>, {
			supabase: spy,
			categories: listCategories(),
			classes: HARNESS_CLASSES
		});
		await settleMany(m);
		expect(m.all('[data-testid="cd-roster"] .roster-row').length).toBe(3);
		const whole = m.all<HTMLButtonElement>('.mode-toggle button').find((b) => b.textContent?.includes('Whole class'));
		expect(whole).toBeTruthy();
		whole!.click();
		await settleMany(m);
		expect(m.one('[data-testid="cd-class-count"]').textContent).toContain('3 students');
		const cat = m.one<HTMLInputElement>('#cd-category');
		cat.dispatchEvent(new Event('focus'));
		m.flush();
		const option = m
			.all<HTMLButtonElement>('[data-testid="cd-category-list"] .combo-option')
			.find((o) => o.querySelector('.combo-name')?.textContent?.trim() === 'Above and Beyond');
		expect(option).toBeTruthy();
		option!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		await settleMany(m);
		const range = m.one<HTMLInputElement>('#cd-range');
		range.value = '2';
		range.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		m.one<HTMLButtonElement>('[data-testid="cd-submit"]').click();
		await settleMany(m);
		const bulk = calls.filter((c) => c.fn === 'coin_bulk_log_students');
		expect(bulk.length).toBe(1);
		expect(bulk[0].params).toEqual({
			p_emails: ['debt.student@boscotech.net', 'healthy.student@boscotech.net', 'quinn.patel@boscotech.net'],
			p_category_id: 'above_and_beyond',
			p_amount: 2,
			p_note: null
		});
		// No retired coin-section RPC was asked for anything on the way.
		expect(calls.some((c) => /section_students|list_sections|bulk_log_section/.test(c.fn))).toBe(false);
		expect(m.one('[data-testid="cd-bulk-results"]').textContent).toContain('3 succeeded');
	});
});

describe('the Settings area, session two', () => {
	it('renders every new group and panel, and a calendar day saves through coin_settings_set', async () => {
		const supabase = createFakeLedger() as unknown as SupabaseClient;
		m = mountInto(SettingsPanel as unknown as Component<Record<string, unknown>>, { supabase, userId: HARNESS_USER_ID });
		await settleMany(m);
		for (const id of ['cd-set-calendars', 'cd-set-group-debt', 'cd-set-group-backgrounds', 'cd-set-group-donations', 'cd-set-group-roles', 'cd-set-group-digest', 'cd-set-full-admins', 'cd-set-donation-items', 'cd-set-auditors']) {
			expect(m.all(`[data-testid="${id}"]`).length, id).toBe(1);
		}
		// A full coin admin who is not a site admin says so beside the name.
		expect(m.one('[data-testid="cd-set-full-admins"]').textContent).toContain('Not a site admin, so not full');
		const quarters = m.one('[data-testid="cd-set-quarter_ends"]');
		const before = quarters.querySelectorAll('.chips li').length;
		const input = quarters.querySelector<HTMLInputElement>('input[type="date"]')!;
		input.value = '2027-08-20';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		[...quarters.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Add')!.click();
		await settleMany(m);
		expect(m.one('[data-testid="cd-set-quarter_ends"]').querySelectorAll('.chips li').length).toBe(before + 1);
	});
});
