/**
 * THE SAME PANEL AS A HOST (prompt 0110, item 7, the orchestrator's
 * manager-only decision).
 *
 * `viewer=host` mounts EntryTeamPanel with `manager` on and a viewer who is
 * nobody's row, the way the host console mounts it. Adding a teammate by
 * ACCOUNT is a host's or an admin's act (the RPC refuses anyone else with
 * one sentence), so this is the one reading where the add row carries the
 * optional account-email field beside the name field -- and no
 * join-yourself sentence, because the consent path is what a captain is
 * told instead. `aliasOf` adds `team=3` for the same reason the captain
 * spec carries it: at the sim's team_size of 2 the entry is full and the
 * add row does not render for anyone.
 *
 * A manager acts on every row: Rename on both, Remove on Diego, the short
 * sentence on Azad's row (the registering account stays), and no "you" tag
 * anywhere because the host holds no row.
 */
export default {
	path: '/dev/tournaments?view=team&state=open&viewer=host',
	aliasOf: '/dev/tournaments?view=team&state=open&viewer=host&team=3',
	label: 'Entry team panel as a host: the account-email field on the add row, every row actionable',
	settleMs: 700,
	presence: [
		{ selector: '[data-testid="entry-team"][data-locked="false"][data-window="true"]', label: 'the panel, unlocked and inside the window', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.team .roster .row', label: 'two registrant rows (Azad, Diego)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-action="rename-entry"]', label: 'Rename on the entry', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-action="rename-member"]', label: 'Rename on both rows (a manager acts on every row)', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-action="remove-member"]', label: 'Remove on the teammate only', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.team .roster .row .why', label: 'the captain row says why it carries no Remove', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.team .tag.you', label: 'no "you" tag: the host holds no row (the two rows above are the control)', expectPresent: 0 },
		{ selector: '[data-form="add-member"]', label: 'the add-teammate form (room on the entry)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-form="add-member"] [data-field="name"]', label: 'the roster-name field', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE MANAGER-ONLY FIELD, PRESENT. The captain specs are the other
		   direction. */
		{ selector: '[data-form="add-member"] [data-field="email"]', label: 'the account-email field for a manager', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-form="add-member"] .field', label: 'exactly two fields on a manager\'s add row', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="entry-join-note"]', label: 'no join-yourself sentence for a manager (the field is offered instead)', expectPresent: 0 },
		{ selector: '[data-action="add-member"]', label: 'the Add teammate control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="entry-full"]', label: 'no full sentence with room on the entry', expectPresent: 0 }
	],
	textContains: [
		{ selector: '.team .roster-label', label: 'the roster label counts against the lifted team size', must: ['Registrants', '2 of 3'] },
		{ selector: '[data-form="add-member"] .f-label', label: 'both field labels, the email one marked optional', must: ['Name on the roster', 'Account email (optional)'] },
		{ selector: '.team .roster .row .why', label: 'the captain row explains itself', must: ['The registering account stays on the entry.'], mustNot: ['–', '—'] },
		{ selector: '[data-testid="entry-team"]', label: 'the consent sentence is a captain\'s, not a host\'s', mustNot: ['can join your entry themselves'], must: ['Add a teammate'] }
	],
	tapTargets: [
		{ selector: '.team .btn', label: 'every control on the panel (Rename x3, Remove, Add teammate)', min: 44 },
		/* Both fields are measured at their labels, which is what a finger hits. */
		{ selector: '[data-form="add-member"] .field', label: 'the two add-row fields (at their labels)', min: 44 }
	],
	contrast: [
		{ selector: '.team .add-label', label: 'the Add a teammate label', min: 4.5 },
		{ selector: '[data-form="add-member"] .f-label', label: 'both field labels', min: 4.5 },
		{ selector: '.team .roster .row .why', label: 'the no-Remove sentence', min: 4.5 },
		{ selector: '[data-action="add-member"]', label: 'Add teammate (disabled at rest)', min: 4.5 }
	]
};
