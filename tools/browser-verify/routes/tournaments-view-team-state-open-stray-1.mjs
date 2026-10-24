/**
 * THE REPORTED TEAM (ledger 0433, report 919e2a21): a team a HOST made, so the
 * entry has no registering account, and its first registrant is a no-account
 * name ("Blade Breakers") the viewer cannot get rid of. The viewer is Azad, a
 * member with an account, beside Mara, another member with one.
 *
 * Both directions, per row: Remove on the no-account row (0295 lets any member
 * of the entry take one off), Rename and Leave on the viewer's own row, and
 * NOTHING on Mara's row, because a member still cannot remove another
 * member's account. The team control is worded as the team's ("Rename team"),
 * and the add row says it is for a person, not the team name.
 */
export default {
	path: '/dev/tournaments?view=team&state=open&stray=1',
	label: 'Entry team panel, a host-made team: a member removes the no-account name, never a teammate',
	settleMs: 700,
	presence: [
		{ selector: '[data-testid="entry-team"]', label: 'the panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.team .roster .row', label: 'three registrant rows', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-member-id="mb-stray"] [data-action="remove-member"]', label: 'Remove on the no-account row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-member-id="mb-viewer"] [data-action="remove-member"]', label: 'Leave on the viewer row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-member-id="mb-viewer"] [data-action="rename-member"]', label: 'Rename on the viewer row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-member-id="mb-mate"] [data-action]', label: "no control on another member's account", expectPresent: 0 },
		{ selector: '[data-member-id="mb-stray"] [data-action="rename-member"]', label: 'no Rename on the no-account row (the rename rule is unchanged)', expectPresent: 0 },
		{ selector: '[data-action="rename-entry"]', label: 'the team rename control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-form="add-member"]', label: 'the add row (room on a team of four)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-action="rename-entry"]', label: 'the team control names the team', must: ['Rename team'] },
		{ selector: '[data-member-id="mb-stray"]', label: 'the stray row reads as a name with no account', must: ['Blade Breakers', 'no account', 'Remove'] },
		{ selector: '[data-member-id="mb-viewer"]', label: 'the viewer row', must: ['Azad', 'you', 'Leave'] },
		{ selector: '[data-form="add-member"]', label: 'the add row says it is for a person', must: ['Add a teammate', 'not the team name'], mustNot: ['–', '—'] }
	],
	tapTargets: [{ selector: '.team .btn', label: 'every control on the panel', min: 44 }],
	contrast: [
		{ selector: '.team .m-name', label: 'registrant names', min: 4.5 },
		{ selector: '.team .tag', label: 'row tags', min: 4.5 },
		{ selector: '.team .join-note', label: 'the add row notes', min: 4.5 },
		{ selector: '.team .btn.secondary', label: 'the secondary controls', min: 4.5 }
	]
};
