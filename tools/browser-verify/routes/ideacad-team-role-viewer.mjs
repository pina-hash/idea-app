/**
 * THE VIEWER STATE, whose entire point is what is NOT on screen.
 *
 * Mr. Pina's model has a view-only role, and the prompt's own constraint is
 * that a viewer must never be shown a control that will be refused. `0205`
 * refuses a share from anybody but the owner and `0207` refuses a claim from
 * anybody who is not on the assembly, so every control this route counts at
 * ZERO is one that would come back as a refusal if it were drawn.
 *
 * AN ABSENCE CLAIM IS WORTHLESS WITHOUT ITS POSITIVE CONTROL, and here the
 * control is a SIBLING ROUTE rather than a selector: `ideacad-team-role-owner`
 * drives the identical page with `role=owner` and counts 1 share form, 3 Takes
 * and 3 reassign pickers on the same three parts. Read the two reports
 * together -- 0 against 3 on one fixture is a result; 0 alone is a selector
 * that might simply be wrong.
 *
 * THE ROWS ARE THE IN-ROUTE CONTROL. `expectPresent: 3` on the part rows is
 * what says the panel rendered at all, so the zeros below cannot be a page that
 * failed to load.
 *
 * THE SENTENCE IS THE OTHER HALF. A list with nothing pressable and no
 * explanation reads as broken rather than as read-only, which is why the
 * view-only sentence is asserted PRESENT in the same breath as the controls are
 * asserted absent.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-team?role=viewer',
	label: 'IdeaCAD team: a viewer is shown the assembly and not one control that would be refused',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadTeamControls === "function"' },
		{ waitFor: '() => document.querySelectorAll("[data-testid=\\"ideacad-part-row\\"]").length === 3' }
	],
	orderResult: [
		{
			label: 'the write surface, counted, with the row count beside it as the control',
			evaluate:
				'() => { const c = window.__ideacadTeamControls(); return ["rows " + c.rows, "claim " + c.claim, "release " + c.release, "assign " + c.assign, "share " + c.share]; }',
			expected: ['rows 3', 'claim 0', 'release 0', 'assign 0', 'share 0']
		},
		{
			label: 'nothing runs off the window and every rendered control is inside its panel',
			evaluate: '() => window.__ideacadTeamVerdicts()',
			expected: [
				'the parts list is on screen ok',
				'every part has a row ok',
				'nothing is wider than the window ok',
				'every control sits inside the panel that owns it ok',
				'every sharing control sits inside the sharing panel ok'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-part-row"]', label: 'a row per part, which is the positive control for every zero below', expectPresent: 3, expectVisible: 3 },
		{ selector: '.act.claim', label: 'Take this part, which a viewer must not be offered', expectPresent: 0 },
		{ selector: '.act.release', label: 'Release', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-part-assign"]', label: 'the reassign picker', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-share-form"]', label: 'the share form', expectPresent: 0 },
		{ selector: '.rm', label: 'Remove, on somebody else’s grant', expectPresent: 0 },
		/* AND THE SENTENCE THAT SAYS WHY, present. Read-only without an
		   explanation is indistinguishable from broken. */
		{ selector: '[data-testid="ideacad-parts-viewonly"]', label: 'the sentence saying what a viewer can and cannot do', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-share-role"]', label: 'the role chip, which names it in a word', expectPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-parts"]',
			label: 'a viewer still learns who holds what',
			must: ['Parts', 'Blade body', 'has it', 'Taking a part is for the people the owner shared it with as editors'],
			mustNot: ['Take this part', 'Release', 'Owner: give to', 'undefined']
		},
		{
			selector: '[data-testid="ideacad-share"]',
			label: 'the sharing panel says what view-only means rather than showing an empty box',
			must: ['View only', 'Shared with you to look at'],
			mustNot: ['undefined', 'NaN']
		}
	],
	contrast: [
		{ selector: '[data-testid="ideacad-parts-viewonly"]', label: 'the view-only sentence', min: 4.5 },
		{ selector: '[data-testid="ideacad-part-holder"]', label: 'the holder line', min: 4.5 },
		{ selector: '[data-testid="ideacad-share-role"]', label: 'the role chip', min: 4.5 }
	],
	/* NO TAP TARGETS, deliberately: there is nothing to tap, which is the whole
	   claim of this route. An empty tap-target list here would report a pass over
	   zero measurements, which is exactly the vacuum this harness exists to
	   avoid -- the counts above are what carry the finding. */
	tapTargets: []
};
