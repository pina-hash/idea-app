/**
 * THE CAPTAIN'S ADD ROW, WITH ROOM ON THE ENTRY (prompt 0110, item 7).
 *
 * The open spec's entry is full by construction (team_size 2, two
 * registrants), so its add row never renders and "no account-email field
 * for the captain" is true there for the wrong reason. `?team=3` lifts the
 * sim's team_size so Vortex has room: the add-teammate form is on screen,
 * the name field is in it, and the account-email field is NOT -- adding a
 * teammate by account is a manager's act (the RPC refuses a captain's), so
 * the captain gets the name field alone and the sentence saying how a
 * teammate with an account joins instead. The name field and the sentence
 * are the positive controls for the absent field. The host reading of the
 * same state, where the field IS present, is
 * `tournaments-view-team-state-open-viewer-host.mjs`.
 */
export default {
	path: '/dev/tournaments?view=team&state=open&team=3',
	label: 'Entry team panel, registration open, room on the entry: the captain adds by name only',
	settleMs: 700,
	presence: [
		{ selector: '[data-testid="entry-team"][data-locked="false"][data-window="true"]', label: 'the panel, unlocked and inside the window', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.team .roster .row', label: 'two registrant rows (Azad, Diego)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-form="add-member"]', label: 'the add-teammate form (2 of 3: room on the entry)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-form="add-member"] [data-field="name"]', label: 'the roster-name field', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-form="add-member"] .field', label: 'exactly one field on the captain\'s add row', expectPresent: 1, maxPresent: 1 },
		/* THE MANAGER-ONLY FIELD, ABSENT, beside a form that is present. */
		{ selector: '[data-field="email"]', label: 'no account-email field for the captain (manager only)', expectPresent: 0 },
		{ selector: '[data-testid="entry-join-note"]', label: 'the join-yourself sentence where the field would have been', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-action="add-member"]', label: 'the Add teammate control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-action="add-member"]:disabled', label: 'disabled until a name is typed', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="entry-full"]', label: 'no full sentence with room on the entry', expectPresent: 0 },
		{ selector: '.team .tag.you', label: 'the viewer (the captain) is marked on their own row', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '.team .roster-label', label: 'the roster label counts against the lifted team size', must: ['Registrants', '2 of 3'] },
		{ selector: '[data-form="add-member"] .f-label', label: 'the one field label, and never the email one', must: ['Name on the roster'], mustNot: ['Account email'] },
		{ selector: '[data-testid="entry-join-note"]', label: 'the consent path, in words', must: ['Teammates with an account can join your entry themselves while registration is open.'], mustNot: ['–', '—'] },
		{ selector: '[data-action="add-member"]', label: 'the control carries its word', must: ['Add teammate'] }
	],
	tapTargets: [
		{ selector: '.team .btn', label: 'every control on the panel (Rename x3, Remove, Add teammate)', min: 44 },
		/* The text field is measured at its label, which is what a finger hits. */
		{ selector: '[data-form="add-member"] .field', label: 'the roster-name field (at its label)', min: 44 }
	],
	contrast: [
		{ selector: '.team .add-label', label: 'the Add a teammate label', min: 4.5 },
		{ selector: '[data-form="add-member"] .f-label', label: 'the field label', min: 4.5 },
		{ selector: '[data-testid="entry-join-note"]', label: 'the join-yourself sentence', min: 4.5 },
		{ selector: '[data-action="add-member"]', label: 'Add teammate (disabled at rest)', min: 4.5 }
	]
};
