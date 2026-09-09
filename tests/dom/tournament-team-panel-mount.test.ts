// tests/dom/tournament-team-panel-mount.test.ts
//
// THE ENTRY'S PEOPLE PANEL, MOUNTED (prompt 0110, items 6 and 7).
//
// `EntryTeamPanel` promises that a control exists exactly when its transport
// does AND the server would accept the click: a rename before the bracket,
// never after; add and remove inside the registration window; no Remove on
// a row the server would refuse (the last member, the captain's while
// teammates remain), with the sentence in its place. Each of those is a
// count over a real DOM, and the remove is a two-step inline confirm whose
// second click must reach the callback with the member's id -- a real
// click through a real handler, which no `svelte/server` render can make.
// The add row's account-email field is a MANAGER's (the email branch of the
// RPC refuses a captain), so it is asserted present with `manager` and absent
// without, in both directions, with the consent sentence in its place.
//
// WHAT IS ASSERTED: counts, text and callback payloads. NOT geometry: the
// 44px floors on these controls are `npm run verify:browser`'s
// (tools/browser-verify/routes/tournaments-view-team-*.mjs).

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';

import EntryTeamPanel from '$lib/tournaments/EntryTeamPanel.svelte';
import type { TournamentEntry, TournamentEntryMember } from '$lib/tournaments/tournaments';
import { mountInto, typeAt, type Mounted } from './mount';

const Panel = EntryTeamPanel as unknown as Component<Record<string, unknown>>;

const mounted: Mounted[] = [];
afterEach(async () => {
	while (mounted.length) await mounted.pop()!.stop();
});

const ENTRY: TournamentEntry = {
	id: 'e1',
	tournament_id: 't1',
	user_id: 'cap',
	display_name: 'Vortex',
	description: '',
	thumbnail_url: null,
	seed: null,
	created_at: '2026-09-01T00:00:00Z'
};
const CAPTAIN: TournamentEntryMember = {
	id: 'm-azad',
	entry_id: 'e1',
	tournament_id: 't1',
	user_id: 'cap',
	name: 'Azad',
	created_at: '2026-09-01T00:00:00Z'
};
const TEAMMATE: TournamentEntryMember = {
	id: 'm-diego',
	entry_id: 'e1',
	tournament_id: 't1',
	user_id: null,
	name: 'Diego',
	created_at: '2026-09-01T00:00:01Z'
};

const LOCK = 'Entry names lock once the bracket is generated.';

function mountPanel(props: Record<string, unknown> = {}) {
	const m = mountInto(Panel, {
		entry: ENTRY,
		members: [TEAMMATE, CAPTAIN],
		teamSize: 3,
		status: 'registration_open',
		viewerId: 'cap',
		onrename: () => {},
		onaddmember: () => {},
		onremovemember: () => {},
		onrenamemember: () => {},
		...props
	});
	mounted.push(m);
	return m;
}

function click(el: Element | null) {
	if (!el) throw new Error('nothing to click');
	(el as HTMLElement).click();
}

describe('the rename control and the lock', () => {
	it('is present before the bracket and replaced by the lock sentence once live', () => {
		for (const status of ['draft', 'registration_open', 'seeding']) {
			const m = mountPanel({ status });
			expect(m.all('[data-action="rename-entry"]'), status).toHaveLength(1);
			expect(m.all('[data-testid="entry-lock"]'), status).toHaveLength(0);
			expect(m.target.textContent).not.toContain(LOCK);
		}
		for (const status of ['live', 'complete']) {
			const m = mountPanel({ status });
			expect(m.all('[data-action="rename-entry"]'), status).toHaveLength(0);
			expect(m.all('[data-testid="entry-lock"]'), status).toHaveLength(1);
			expect(m.one('[data-testid="entry-lock"]').textContent?.trim()).toBe(LOCK);
			// Member renames lock with it; the rows are still listed.
			expect(m.all('[data-action="rename-member"]'), status).toHaveLength(0);
			expect(m.all('.row'), status).toHaveLength(2);
		}
	});

	it('an absent onrename removes the control AND the sentence (absence is the mechanism)', () => {
		const open = mountPanel({ onrename: undefined });
		expect(open.all('[data-action="rename-entry"]')).toHaveLength(0);
		expect(open.all('[data-testid="entry-lock"]')).toHaveLength(0);
		const live = mountPanel({ onrename: undefined, status: 'live' });
		expect(live.all('[data-testid="entry-lock"]')).toHaveLength(0);
	});

	it('a real rename reaches onrename with the trimmed name', () => {
		const calls: string[] = [];
		const m = mountPanel({ onrename: (n: string) => calls.push(n) });
		click(m.one('[data-action="rename-entry"]'));
		m.flush();
		const form = m.one<HTMLFormElement>('[data-form="rename-entry"]');
		const input = form.querySelector('input') as HTMLInputElement;
		expect(input.value).toBe('Vortex');
		typeAt(input, '  Vortex Mk II ');
		m.flush();
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		m.flush();
		expect(calls).toEqual(['Vortex Mk II']);
		expect(m.all('[data-form="rename-entry"]')).toHaveLength(0);
	});
});

describe('the roster rows', () => {
	it('lists members in registration order with the chosen names and nothing else', () => {
		const m = mountPanel();
		const names = m.all('.row .m-name').map((el) => el.textContent);
		expect(names).toEqual(['Azad', 'Diego']);
		expect(m.target.textContent).toContain('2 of 3');
	});

	it('offers Remove on the teammate and a sentence, not a button, on the captain', () => {
		const m = mountPanel();
		const captainRow = m.one('[data-member-id="m-azad"]');
		const teammateRow = m.one('[data-member-id="m-diego"]');
		expect(captainRow.querySelectorAll('[data-action="remove-member"]')).toHaveLength(0);
		expect(captainRow.textContent).toContain('The registering account stays on the entry.');
		expect(teammateRow.querySelectorAll('[data-action="remove-member"]')).toHaveLength(1);
		expect(teammateRow.querySelector('[data-action="remove-member"]')?.textContent?.trim()).toBe('Remove');
	});

	it('a lone member has no Remove and says why', () => {
		const m = mountPanel({ members: [CAPTAIN] });
		expect(m.all('[data-action="remove-member"]')).toHaveLength(0);
		expect(m.target.textContent).toContain('An entry needs at least one registrant.');
	});

	it('a real click on Remove, then the confirm, calls onremovemember with the id', () => {
		const calls: string[] = [];
		const m = mountPanel({ onremovemember: (id: string) => calls.push(id) });
		click(m.one('[data-member-id="m-diego"] [data-action="remove-member"]'));
		m.flush();
		// One click did NOT remove: the confirm is a second gesture.
		expect(calls).toEqual([]);
		const confirm = m.one('[data-member-id="m-diego"] [data-action="confirm-remove"]');
		expect(m.one('[data-member-id="m-diego"]').textContent).toContain('Remove Diego from this entry?');
		click(confirm);
		m.flush();
		expect(calls).toEqual(['m-diego']);
	});

	it('Keep on the confirm step backs out without calling anything', () => {
		const calls: string[] = [];
		const m = mountPanel({ onremovemember: (id: string) => calls.push(id) });
		click(m.one('[data-member-id="m-diego"] [data-action="remove-member"]'));
		m.flush();
		const keep = Array.from(m.one('[data-member-id="m-diego"]').querySelectorAll('button')).find(
			(b) => b.textContent?.trim() === 'Keep'
		);
		click(keep ?? null);
		m.flush();
		expect(calls).toEqual([]);
		expect(m.all('[data-action="confirm-remove"]')).toHaveLength(0);
		expect(m.all('[data-member-id="m-diego"] [data-action="remove-member"]')).toHaveLength(1);
	});

	it('an absent onremovemember removes every Remove; outside the window too', () => {
		expect(mountPanel({ onremovemember: undefined }).all('[data-action="remove-member"]')).toHaveLength(0);
		expect(mountPanel({ status: 'draft' }).all('[data-action="remove-member"]')).toHaveLength(0);
		expect(mountPanel({ status: 'seeding' }).all('[data-action="remove-member"]')).toHaveLength(1);
	});

	it('a teammate viewing their own entry gets Leave on their row and nothing on the captain', () => {
		const linked = { ...TEAMMATE, user_id: 'diego' };
		const m = mountPanel({ members: [CAPTAIN, linked], viewerId: 'diego' });
		const own = m.one('[data-member-id="m-diego"]');
		expect(own.querySelector('[data-action="remove-member"]')?.textContent?.trim()).toBe('Leave');
		expect(own.querySelectorAll('[data-action="rename-member"]')).toHaveLength(1);
		const cap = m.one('[data-member-id="m-azad"]');
		expect(cap.querySelectorAll('[data-action="rename-member"]')).toHaveLength(0);
		expect(cap.querySelectorAll('[data-action="remove-member"]')).toHaveLength(0);
		expect(own.textContent).toContain('you');
	});

	it('a member rename reaches onrenamemember with the id and the new name', () => {
		const calls: unknown[][] = [];
		const m = mountPanel({ onrenamemember: (...a: unknown[]) => calls.push(a) });
		click(m.one('[data-member-id="m-diego"] [data-action="rename-member"]'));
		m.flush();
		const form = m.one<HTMLFormElement>('[data-form="rename-member"]');
		typeAt(form.querySelector('input') as HTMLInputElement, 'Diego R.');
		m.flush();
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		m.flush();
		expect(calls).toEqual([['m-diego', 'Diego R.']]);
	});
});

describe('adding a teammate', () => {
	it('shows the add row with room and the full sentence when full', () => {
		const room = mountPanel({ teamSize: 3 });
		expect(room.all('[data-form="add-member"]')).toHaveLength(1);
		expect(room.all('[data-testid="entry-full"]')).toHaveLength(0);

		const full = mountPanel({ teamSize: 2 });
		expect(full.all('[data-form="add-member"]')).toHaveLength(0);
		expect(full.all('[data-testid="entry-full"]')).toHaveLength(1);
		expect(full.one('[data-testid="entry-full"]').textContent?.trim()).toBe('This entry is full (2 of 2).');
	});

	it('is absent without onaddmember, and outside the window', () => {
		expect(mountPanel({ onaddmember: undefined }).all('[data-form="add-member"]')).toHaveLength(0);
		expect(mountPanel({ onaddmember: undefined, teamSize: 2 }).all('[data-testid="entry-full"]')).toHaveLength(0);
		expect(mountPanel({ status: 'live' }).all('[data-form="add-member"]')).toHaveLength(0);
	});

	it('offers the account-email field to a manager and not to anyone else, both directions', () => {
		// The email branch of tournament_add_entry_member is a host's or an
		// admin's; a captain adds by name and a teammate with an account joins
		// through tournament_join_entry. So the field exists exactly when the
		// mount says `manager`, and the non-manager row says the consent path
		// in words where the field would have been.
		const NOTE = 'Teammates with an account can join your entry themselves while registration is open.';
		const manager = mountPanel({ manager: true });
		expect(manager.all('[data-form="add-member"]')).toHaveLength(1);
		expect(manager.all('[data-field="name"]')).toHaveLength(1);
		expect(manager.all('[data-field="email"]')).toHaveLength(1);
		expect(manager.all('[data-testid="entry-join-note"]')).toHaveLength(0);
		expect(manager.target.textContent).not.toContain(NOTE);

		const captain = mountPanel({ manager: false });
		expect(captain.all('[data-form="add-member"]')).toHaveLength(1);
		expect(captain.all('[data-field="name"]')).toHaveLength(1);
		expect(captain.all('[data-field="email"]')).toHaveLength(0);
		expect(captain.all('[data-testid="entry-join-note"]')).toHaveLength(1);
		expect(captain.one('[data-testid="entry-join-note"]').textContent?.trim()).toBe(NOTE);

		// The default is the captain's shape: omitting the prop offers no field.
		const omitted = mountPanel();
		expect(omitted.all('[data-field="email"]')).toHaveLength(0);
		expect(omitted.all('[data-testid="entry-join-note"]')).toHaveLength(1);
	});

	it('a non-manager add submits the name and a null email; nothing typed can reach the email branch', () => {
		const calls: unknown[][] = [];
		const m = mountPanel({ onaddmember: (...a: unknown[]) => calls.push(a) });
		const form = m.one<HTMLFormElement>('[data-form="add-member"]');
		typeAt(form.querySelector('[data-field="name"]') as HTMLInputElement, ' Priya ');
		m.flush();
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		m.flush();
		expect(calls).toEqual([['Priya', null]]);
	});

	it('a manager submits the name and a null email when none is typed, and the email when one is', () => {
		const calls: unknown[][] = [];
		const m = mountPanel({ manager: true, onaddmember: (...a: unknown[]) => calls.push(a) });
		const form = m.one<HTMLFormElement>('[data-form="add-member"]');
		const submit = form.querySelector('[data-action="add-member"]') as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
		typeAt(form.querySelector('[data-field="name"]') as HTMLInputElement, ' Priya ');
		m.flush();
		expect(submit.disabled).toBe(false);
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		m.flush();
		expect(calls).toEqual([['Priya', null]]);
		// The fields clear after a submit, so the next name starts empty.
		expect((form.querySelector('[data-field="name"]') as HTMLInputElement).value).toBe('');
		typeAt(form.querySelector('[data-field="name"]') as HTMLInputElement, 'Sam');
		typeAt(form.querySelector('[data-field="email"]') as HTMLInputElement, 'sam@boscotech.net ');
		m.flush();
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		m.flush();
		expect(calls[1]).toEqual(['Sam', 'sam@boscotech.net']);
	});
});
