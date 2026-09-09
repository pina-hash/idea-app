/**
 * THE REGISTRATION FORM FOR A TEAM OF TWO (prompt 0110, item 7).
 *
 * The REAL RegisterEntry in the room with `teamSize` 2: the entry-name
 * field is labelled "Team name", a "Your name on the roster" field
 * appears, and exactly ONE teammate input (teamSize - 1), with the hint
 * that a teammate with an account can also join the entry themselves. The
 * form emits a draft and nothing else; the harness logs it. At rest the
 * submit is disabled (the name is blank), which is the server's 1..40 rule
 * mirrored rather than replaced, and there is no Decline because this is
 * not the invite shape (`invite=1` is).
 */
export default {
	path: '/dev/tournaments?view=register&team=2',
	label: 'Registration form, teams of up to 2: a team name, your roster name, one teammate',
	settleMs: 700,
	presence: [
		{ selector: '[data-testid="register-entry"]', label: 'the form', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-field="display_name"]', label: 'the team name field', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-field="member_name"]', label: 'the roster-name field (teams only)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-field="teammate"]', label: 'teammate inputs (teamSize - 1 = 1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.reg .teammates', label: 'the teammates fieldset', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-field="description"]', label: 'the description field', expectPresent: 1, maxPresent: 1 },
		/* `accept="image/*"` is allowed here: a thumbnail is a picture the
		   FEATURE consumes, not a hand-in (CLAUDE.md's picker rule). */
		{ selector: '[data-field="file"][accept="image/*"]', label: 'the thumbnail picker, image-only by design', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-action="register"]', label: 'the submit', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-action="register"]:disabled', label: 'the submit is disabled until a name is typed', expectPresent: 1, maxPresent: 1 },
		{ selector: '.reg .btn.secondary', label: 'no Decline outside the invite shape (the submit above is the positive control)', expectPresent: 0 }
	],
	textContains: [
		{ selector: '.reg h2', label: 'the heading', must: ['Register'] },
		{ selector: '.reg .f-label', label: 'the team labels, and never the solo one', must: ['Team name', 'Your name on the roster', 'Teammates (up to 1)', 'Teammate 1', 'Short description (optional)', 'Thumbnail (optional)'], mustNot: ['Entry name'] },
		{ selector: '.reg .hint', label: 'the join-yourself hint', must: ['Teammates with an account can also join your entry themselves from this page.'] },
		{ selector: '.reg .note', label: 'the identity sentence', must: ['Your public identity in this tournament is the display name and picture you choose here.'] },
		{ selector: '[data-action="register"]', label: 'the submit carries its word', must: ['Register'], mustNot: ['Accept'] }
	],
	tapTargets: [
		/* Text fields are measured at their label, which is what a finger
		   hits; the file picker likewise. */
		{ selector: '.reg input[type="text"]', label: 'the four text fields', min: 44 },
		{ selector: '.reg .field.file', label: 'the thumbnail picker (at its label)', min: 44 },
		{ selector: '[data-action="register"]', label: 'the submit', min: 44 }
	],
	contrast: [
		{ selector: '.reg h2', label: 'the heading', min: 4.5 },
		{ selector: '.reg .note', label: 'the identity sentence', min: 4.5 },
		{ selector: '.reg .f-label', label: 'field labels', min: 4.5 },
		{ selector: '.reg .hint', label: 'the join-yourself hint', min: 4.5 },
		{ selector: '.reg .teammates legend', label: 'the fieldset legend', min: 4.5 },
		/* A disabled submit: the pair is measured as painted, and the row
		   says which state it read. */
		{ selector: '[data-action="register"]', label: 'the submit (disabled at rest)', min: 4.5 }
	]
};
