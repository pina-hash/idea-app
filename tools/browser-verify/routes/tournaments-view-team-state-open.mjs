/**
 * THE ENTRY'S OWN PANEL WHILE REGISTRATION IS OPEN (prompt 0110, items 6 and 7).
 *
 * The REAL EntryTeamPanel for the sim's entry 1 -- Vortex, a team of two:
 * Azad, the captain whose account is the harness's own viewer, and Diego,
 * an unlinked walk-up -- against the sim's 0192 transports, viewed as the
 * captain, with the tournament at `registration_open`. Every transport is
 * supplied, so what is on screen is what the WINDOW allows: Rename on the
 * entry (names lock only once the bracket is generated), Rename on both
 * rows (the captain acts on every row), Remove on the teammate and a
 * sentence in its place on the captain's row (the registering account
 * stays), and the "full" sentence where the add-teammate form would be,
 * because the sim's team_size is 2 and this entry holds two.
 */
export default {
	path: '/dev/tournaments?view=team&state=open',
	label: 'Entry team panel, registration open: rename offered, the roster editable, the entry full',
	settleMs: 700,
	presence: [
		{ selector: '[data-testid="entry-team"]', label: 'the panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="entry-team"][data-locked="false"][data-window="true"]', label: 'the panel reports unlocked, inside the window', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-action="rename-entry"]', label: 'the Rename control on the entry (present before the bracket)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="entry-lock"]', label: 'no lock sentence while renaming is allowed', expectPresent: 0 },
		{ selector: '.team .roster .row', label: 'two registrant rows (Azad, Diego)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-action="rename-member"]', label: 'Rename on both rows (the captain acts on every row)', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-action="remove-member"]', label: 'Remove on the teammate only', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.team .roster .row .why', label: 'the captain row says why it carries no Remove', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.team .tag.you', label: 'the viewer is marked on their own row', expectPresent: 1, maxPresent: 1 },
		/* Full (2 of 2): the sentence renders where the form would, and the
		   form does not. The sentence is the positive control for the
		   absent form. */
		{ selector: '[data-testid="entry-full"]', label: 'the full sentence (team_size 2, two registrants)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-form="add-member"]', label: 'no add-teammate form when the entry is full', expectPresent: 0 },
		/* THE ACCOUNT-EMAIL FIELD IS A MANAGER'S, and this viewer is the
		   captain. Absent here twice over (the whole add row is gone because
		   the entry is full), so the row is the WEAK reading; the strong one,
		   with the add row on screen and the name field beside the absence,
		   is `tournaments-view-team-state-open-team-3.mjs`, and the host
		   alias spec is where the field is PRESENT. */
		{ selector: '[data-field="email"]', label: 'no account-email field for the captain (manager only)', expectPresent: 0 },
		{ selector: '[data-testid="entry-join-note"]', label: 'no join-yourself sentence either: the add row is gone, not offered', expectPresent: 0 },
		{ selector: '[data-form="rename-entry"], [data-form="rename-member"]', label: 'no inline form open at rest', expectPresent: 0 }
	],
	textContains: [
		{ selector: '.team .head .name', label: 'the entry name', must: ['Vortex'] },
		{ selector: '[data-action="rename-entry"]', label: 'the rename control carries its word', must: ['Rename'] },
		{ selector: '.team .roster-label', label: 'the roster label counts against the team size', must: ['Registrants', '2 of 2'] },
		{ selector: '.team .roster', label: 'both names and their tags', must: ['Azad', 'Diego', 'registered the entry', 'no account', 'you'] },
		/* The panel's inline sentence is the SHORT form (`removeBlocker`); the
		   RPC's and the sim's refusal carry the second half naming who can
		   withdraw the entry. No dash in either. */
		{ selector: '.team .roster .row .why', label: 'the captain row explains itself', must: ['The registering account stays on the entry.'], mustNot: ['–', '—'] },
		{ selector: '[data-testid="entry-full"]', label: 'the full sentence states the count', must: ['This entry is full (2 of 2).'] },
		{ selector: '[data-testid="entry-team"]', label: 'the lock sentence is nowhere on an open panel', mustNot: ['Entry names lock once the bracket is generated.'], must: ['Rename'] }
	],
	tapTargets: [
		{ selector: '.team .btn', label: 'every control on the panel (Rename x3, Remove)', min: 44 }
	],
	contrast: [
		{ selector: '.team .head .name', label: 'the entry name', min: 4.5 },
		{ selector: '.team .roster-label', label: 'the roster label (mono, dim)', min: 4.5 },
		{ selector: '.team .roster-label .count', label: 'the roster count', min: 4.5 },
		{ selector: '.team .m-name', label: 'registrant names', min: 4.5 },
		{ selector: '.team .tag', label: 'row tags (registered the entry, no account, you)', min: 4.5 },
		{ selector: '.team .roster .row .why', label: 'the no-Remove sentence', min: 4.5 },
		{ selector: '[data-testid="entry-full"]', label: 'the full sentence', min: 4.5 },
		{ selector: '.team .btn.secondary', label: 'the secondary controls', min: 4.5 }
	]
};
