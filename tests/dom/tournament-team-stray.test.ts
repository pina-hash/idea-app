// tests/dom/tournament-team-stray.test.ts
//
// LEDGER 0433, ITEM 13 (report 919e2a21), MOUNTED. A host-made team: no
// registering account, a no-account row named for the team, and two members
// who joined. Before 0295 each member saw Rename and Leave on their own row
// only, so the stray name could not be removed by anybody on the team.
//
// Both directions: the viewer gets Remove on the NO-ACCOUNT row and on no
// other member's row, and the add form refuses the team's own name in place
// with its submit disabled, while a real name stays submittable.

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
	id: 'e3',
	tournament_id: 't1',
	user_id: null,
	display_name: 'Team 3',
	description: '',
	thumbnail_url: null,
	seed: null,
	created_at: '2026-10-01T00:00:00Z'
};
const row = (id: string, user_id: string | null, name: string, at: string): TournamentEntryMember => ({
	id,
	entry_id: 'e3',
	tournament_id: 't1',
	user_id,
	name,
	created_at: at
});
const STRAY = row('m-stray', null, 'Blade Breakers', '2026-10-01T00:00:00Z');
const ME = row('m-me', 'me', 'Me', '2026-10-01T00:00:01Z');
const MATE = row('m-mate', 'mate', 'Mate', '2026-10-01T00:00:02Z');

function mountPanel(props: Record<string, unknown> = {}) {
	const m = mountInto(Panel, {
		entry: ENTRY,
		members: [STRAY, ME, MATE],
		teamSize: 4,
		status: 'registration_open',
		viewerId: 'me',
		onrename: () => {},
		onaddmember: () => {},
		onremovemember: () => {},
		onrenamemember: () => {},
		...props
	});
	mounted.push(m);
	return m;
}

describe('a member of a host-made team', () => {
	it('gets Remove on the no-account row, Leave on their own, and nothing on a teammate', () => {
		const m = mountPanel();
		const actions = (id: string) =>
			[...m.one(`[data-member-id="${id}"]`).querySelectorAll('[data-action]')].map((b) => b.textContent?.trim());
		expect(actions('m-stray')).toEqual(['Remove']);
		expect(actions('m-me')).toEqual(['Rename', 'Leave']);
		expect(actions('m-mate')).toEqual([]);
	});

	it('removing the stray row reaches the callback with its id', () => {
		const calls: string[] = [];
		const m = mountPanel({ onremovemember: (id: string) => calls.push(id) });
		(m.one('[data-member-id="m-stray"] [data-action="remove-member"]') as HTMLElement).click();
		m.flush();
		(m.one('[data-action="confirm-remove"]') as HTMLElement).click();
		m.flush();
		expect(calls).toEqual(['m-stray']);
	});

	it('a viewer who is not on the team gets the manager reach, unchanged', () => {
		const m = mountPanel({ viewerId: 'host' });
		expect(m.all('[data-action="remove-member"]')).toHaveLength(3);
	});

	it('names the team control and refuses the team name in the add form', () => {
		const m = mountPanel();
		expect(m.one('[data-action="rename-entry"]').textContent?.trim()).toBe('Rename team');
		const input = m.one<HTMLInputElement>('[data-form="add-member"] [data-field="name"]');
		const submit = () => m.one<HTMLButtonElement>('[data-form="add-member"] [data-action="add-member"]');
		typeAt(input, ' team 3 ');
		m.flush();
		expect(m.all('[data-testid="entry-add-team-name"]')).toHaveLength(1);
		expect(submit().disabled).toBe(true);
		typeAt(input, 'Ana');
		m.flush();
		expect(m.all('[data-testid="entry-add-team-name"]')).toHaveLength(0);
		expect(submit().disabled).toBe(false);
	});
});
