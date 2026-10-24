// tests/dom/class-team-details.test.ts
//
// THE CLASS TEAM'S SHARED RECORD ON THE CLASS PAGE (0296, ledger 0433, gap
// 5f6a37e8), on the real `ClassTeams`. A team's description, picture and the
// tournaments it plays in show on its card; a member gets Edit details on
// their own card, a classmate's card offers none, and a mount with no
// `details` transport offers none anywhere (absence is the mechanism). A save
// reaches the transport with the trimmed values and the card shows them at
// once. Structure and payloads only; the look is the browser pass's.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import ClassTeams from '../../src/lib/classroom/ClassTeams.svelte';
import { withSharedTeams, type ClassTeamSet, type TeamDetailsInput } from '../../src/lib/classroom/class-teams';
import { mountInto, typeAt, type Mounted } from './mount';

const Teams = ClassTeams as unknown as Component<Record<string, unknown>>;
const mounted: Mounted[] = [];
afterEach(async () => {
	while (mounted.length) await mounted.pop()!.stop();
});

const team = (id: string, name: string, mine: boolean) => ({
	id,
	team_number: id === 't-1' ? 1 : 2,
	name,
	accent_color: null,
	background_type: null,
	background_value: null,
	badge: null,
	flourish: null,
	tagline: null,
	mine,
	members: ['A', 'B']
});
const BASE: ClassTeamSet = {
	id: 'set-1',
	label: 'IDEA-Blade teams',
	posted_at: '2026-10-20T15:00:00.000Z',
	visible_until: null,
	edited: false,
	teams: [team('t-1', 'Edge Lords', true), team('t-2', 'Breakers', false)]
};
const SETS = withSharedTeams(
	[BASE],
	[
		{
			team_id: 't-1',
			description: 'We spin fast',
			picture_url: 'https://example.org/t1.png',
			tournaments: [{ id: 'tour-1', name: 'IDEA-Blade Rotation 2', status: 'registration_open' }]
		},
		{ team_id: 't-2', description: null, picture_url: 'javascript:alert(1)', tournaments: [] }
	]
);

describe('the shared record on a class team card', () => {
	it('shows the description, a safe picture and the tournament link, and refuses an unsafe picture', () => {
		const m = mountInto(Teams, { sets: SETS });
		mounted.push(m);
		const own = m.one('[data-testid="class-team-mine"]');
		expect(own.querySelector('[data-testid="class-team-description"]')?.textContent).toBe('We spin fast');
		expect(own.querySelector('[data-testid="class-team-picture"]')?.getAttribute('src')).toBe('https://example.org/t1.png');
		const link = own.querySelector('[data-testid="class-team-tournaments"] a') as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('/tournaments/tour-1');
		expect(link.textContent).toBe('IDEA-Blade Rotation 2');
		expect(m.all('[data-testid="class-team-picture"]').map((el) => el.getAttribute('src'))).not.toContain('javascript:alert(1)');
		// No transport: no Edit details anywhere.
		expect(m.all('[data-testid="class-team-details-edit"]')).toHaveLength(0);
	});

	it('offers Edit details on the own card only, and a save reaches the transport and the card', async () => {
		const calls: TeamDetailsInput[] = [];
		const m = mountInto(Teams, {
			sets: SETS,
			details: async (input: TeamDetailsInput) => {
				calls.push(input);
				return { ok: true };
			}
		});
		mounted.push(m);
		const edits = m.all('[data-testid="class-team-details-edit"]');
		expect(edits).toHaveLength(1);
		expect(m.one('[data-testid="class-team-mine"]').contains(edits[0])).toBe(true);
		(edits[0] as HTMLElement).click();
		m.flush();
		const form = m.one<HTMLFormElement>('[data-testid="class-team-details-form"]');
		typeAt(form.querySelector('textarea') as HTMLTextAreaElement, '  Fastest tops in Block 1 ');
		typeAt(form.querySelector('input') as HTMLInputElement, ' https://example.org/new.png ');
		m.flush();
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await Promise.resolve();
		await Promise.resolve();
		m.flush();
		expect(calls).toEqual([{ teamId: 't-1', description: 'Fastest tops in Block 1', pictureUrl: 'https://example.org/new.png' }]);
		const own = m.one('[data-testid="class-team-mine"]');
		expect(own.querySelector('[data-testid="class-team-description"]')?.textContent).toBe('Fastest tops in Block 1');
		expect(m.one('[data-testid="class-team-saved"]').textContent).toContain('Saved');
	});

	it('gives a teacher Edit details on every board card', () => {
		const m = mountInto(Teams, { sets: SETS, canManage: true, details: async () => ({ ok: true }) });
		mounted.push(m);
		// The own card (t-1) plus both board cards.
		expect(m.all('[data-testid="class-team-details-edit"]')).toHaveLength(3);
	});
});
