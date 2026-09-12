/**
 * The assembly OWNER's view of sharing and part checkout, at both widths.
 *
 * WHY THESE ARE BROWSER CLAIMS AND NOT `tests/dom/` ONES. Three halves, and
 * none of them can be asked anywhere else in this repository.
 *
 *   * GEOMETRY. happy-dom has no layout engine -- every box reads 0x0 and
 *     `getComputedStyle().color` is the empty string -- so a control rendered
 *     past the edge of its panel passes every structural check ever written
 *     about it. Ledger 0186 found a panel 446px over its box exactly this way.
 *
 *   * THE SELECT AND ITS LABEL. The other defect 0186 caught only by looking:
 *     a side-by-side label clipped a select and cut off exactly the marker that
 *     mattered. `PartsPanel` stacks every label above its control for that
 *     reason, and the only way to prove a stacked label is a geometric read --
 *     the picker as wide as the box reserved for it, and its top below the
 *     label's.
 *
 *   * THIS CHROMIUM PAINTS NO SCROLLBAR INTO A SCREENSHOT at any colour, proved
 *     with a magenta-on-green control, so a control below a fold is invisible
 *     to the eye AND to every content check. Space is reserved rather than
 *     relying on a painted cue, and `nothing is wider than the window` is what
 *     says the reserving worked.
 *
 * THE STATE IS REACHED THROUGH THE REAL CONTROLLER. `/dev/ideacad-team` mounts
 * the shipping `createIdeacadCheckout` over an in-memory transport that answers
 * the exact `IdeacadHoldResult` shapes `0207`'s RPCs return; no prop puts a
 * phase on screen that the controller has no path to.
 *
 * TAP TARGETS ARE MEASURED WITH NO 24px EXCEPTION. This is a student surface at
 * every width and its root carries no instructor-density class.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-team?role=owner',
	label: 'IdeaCAD team: the owner shares, sees who holds what, and reassigns live',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadTeamVerdicts === "function"' },
		/* The controller's first read has to have landed, or every row below is
		   measured on an assembly that is not there yet. */
		{ waitFor: '() => document.querySelectorAll("[data-testid=\\"ideacad-part-row\\"]").length === 3' }
	],
	orderResult: [
		{
			label: 'every control sits inside the panel that owns it, and the picker fills the width reserved for it',
			evaluate: '() => window.__ideacadTeamVerdicts()',
			expected: [
				'the parts list is on screen ok',
				'every part has a row ok',
				'nothing is wider than the window ok',
				'every control sits inside the panel that owns it ok',
				'every sharing control sits inside the sharing panel ok',
				'the reassign picker fills the width reserved for it ok',
				'its label is above it, not beside it ok',
				'the viewer-or-editor picker fills the width reserved for it ok',
				'its label is above it, not beside it ok'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-share"]', label: 'the sharing panel', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-share-form"]', label: 'the share form, which only an owner gets', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-share-list"] li', label: 'the two people this document is shared with', expectPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-parts"]', label: 'the parts list', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-part-row"]', label: 'a row per part', expectPresent: 3, expectVisible: 3 },
		/* ONE PRIMARY CONTROL PER FREE ROW. Three parts, none held at this state,
		   so three Takes and no Release -- a count, because one row rendering two
		   controls and one rendering none look the same to a selector. */
		{ selector: '.act.claim', label: 'Take this part, once per free part', expectPresent: 3, expectVisible: 3 },
		{ selector: '.act.release', label: 'Release, absent while nothing is held', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-part-assign"]', label: 'the owner’s reassign picker, once per row', expectPresent: 3, expectVisible: 3 },
		/* The view-only sentence, ABSENT, with the controls above as the positive
		   control that the panel rendered at all. */
		{ selector: '[data-testid="ideacad-parts-viewonly"]', label: 'the view-only sentence, absent for a writer', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-parts"]',
			label: 'every row says who holds the part in words, never a colour alone',
			must: ['Blade body', 'Hub and bore', 'Tip weight', 'Free', 'Take this part', 'Owner: give to', 'Nobody'],
			mustNot: ['undefined', 'NaN', '[object Object]']
		},
		{
			selector: '[data-testid="ideacad-share"]',
			label: 'the sharing panel names the roles in words and says what the owner’s is',
			must: ['Sharing', 'Owner', 'Can edit', 'View only', 'Share', 'school email'],
			mustNot: ['undefined', 'NaN']
		}
	],
	contrast: [
		{ selector: '[data-testid="ideacad-share"] h3', label: 'the sharing heading on the panel ground', min: 4.5 },
		{ selector: '[data-testid="ideacad-share"] .note', label: 'the sentence saying what this role means', min: 4.5 },
		{ selector: '[data-testid="ideacad-parts"] h3', label: 'the parts heading', min: 4.5 },
		{ selector: '[data-testid="ideacad-part-holder"]', label: 'the holder line, which is the row’s real content', min: 4.5 },
		{ selector: '.act.claim', label: 'Take this part', min: 4.5 },
		{ selector: '[data-testid="ideacad-parts"] .lab', label: 'the reassign picker’s own label', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.act.claim', label: 'Take this part' },
		{ selector: '[data-testid="ideacad-part-assign"]', label: 'the reassign picker' },
		{ selector: '[data-testid="ideacad-share-form"] input', label: 'the classmate address box' },
		{ selector: '[data-testid="ideacad-share-form"] select', label: 'the viewer-or-editor picker' },
		{ selector: '.go', label: 'Share' },
		{ selector: '.rm', label: 'Remove, on a person already shared with' }
	]
};
