// tests/tournament-class-teams.test.ts
//
// The host console's words for taking a class team set (ledger 0433, gap
// 5f6a37e8). The database decides; these pin the sentence a host reads and the
// reasons a set's button is replaced by words.

import { describe, expect, it } from 'vitest';
import { takeTeamSetSentence, teamSetBlocker, type TeamSetOption } from '../src/lib/tournaments/class-teams';

describe('takeTeamSetSentence', () => {
	it('words every count, singular and plural, with no em dash', () => {
		const s = takeTeamSetSentence({ created: 7, linked: 1, already: 0, players_added: 21, no_account: 2 });
		expect(s).toBe(
			"7 teams added, 1 entry you made by hand now follows its class team. 21 players put on their teams. 2 students have not signed in to the site yet; once they have, they can join their team's entry."
		);
		expect(s).not.toContain('—');
		expect(takeTeamSetSentence({ created: 0, linked: 0, already: 8, players_added: 0, no_account: 0 })).toBe(
			'8 teams already here.'
		);
		expect(takeTeamSetSentence({ created: 0, linked: 0, already: 0, players_added: 0, no_account: 0 })).toBe('Nothing to add.');
	});
});

describe('teamSetBlocker', () => {
	const o = (over: Partial<TeamSetOption> = {}): TeamSetOption => ({
		id: 's',
		label: 'Blade teams',
		class: 'IDEA 100 · Block 1',
		teams: 8,
		largest: 3,
		linked_here: 0,
		...over
	});
	it('offers the button only when the database would take the set', () => {
		expect(teamSetBlocker(o(), 4, 'registration_open')).toBeNull();
		expect(teamSetBlocker(o(), 3, 'seeding')).toBeNull();
	});
	it('says why otherwise', () => {
		expect(teamSetBlocker(o(), 4, 'draft')).toBe('Open registration first.');
		expect(teamSetBlocker(o({ teams: 0 }), 4, 'registration_open')).toBe('No teams in this draw.');
		expect(teamSetBlocker(o({ linked_here: 8 }), 4, 'registration_open')).toBe('Every team is already here.');
		expect(teamSetBlocker(o({ largest: 5 }), 4, 'registration_open')).toBe(
			'Its biggest team has 5; raise the team size to 5 in Settings first.'
		);
	});
});
