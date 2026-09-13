/**
 * THE INSTRUCTOR ARCHIVE, at both widths, in the state it exists for: one
 * archived document already shared with a class, and one off-roster document
 * nobody has decided about yet.
 *
 * WHY THESE ARE BROWSER CLAIMS AND NOT `tests/dom/` ONES. Three halves, and
 * none of them can be asked anywhere else in this repository.
 *
 *   * GEOMETRY. happy-dom has no layout engine -- every box reads 0x0 and
 *     `getComputedStyle().color` is the empty string -- so a control rendered
 *     past the edge of its panel passes every structural check ever written
 *     about it. Ledger 0186 found a panel 446px over its box exactly this way,
 *     one component over from this one.
 *
 *   * THE PICKER AND ITS LABEL. The other defect 0186 caught only by looking: a
 *     label beside a select clips it and cuts off exactly the marker that
 *     matters. `ArchivePanel` stacks every label above its control and declares
 *     an explicit single grid column for it, and the only way to prove either
 *     is a geometric read.
 *
 *   * CONTRAST AGAINST THE REAL GROUND. The reason chip on an off-roster row is
 *     tinted `--amber` on `--surface-2`, and the whole point of the tint is that
 *     it marks the row somebody has to act on -- a ratio nothing but a real
 *     browser can composite.
 *
 * TAP TARGETS ARE MEASURED WITH NO 24px EXCEPTION. The 24px floor is a property
 * a surface DECLARES, in a named class on its own root, and this panel's root
 * carries none -- so it clears 44px at every width, which is the standard's own
 * default for anything that has not said otherwise.
 *
 * EVERY WRITE PATH IS MOUNTED. The read-only state is a spec of its own
 * (`ideacad-archive-state-readonly.mjs`), and the pair is what makes either
 * one mean something: a count of zero controls is also what a panel that
 * rendered nothing reports.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-archive',
	label: 'IdeaCAD archive: the instructor keeps a departed student’s work and shows it to a class',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadArchiveVerdicts === "function"' },
		/* Both rows have to be on screen, or every measurement below is taken on
		   a panel that is still half-rendered. */
		{
			waitFor:
				'() => document.querySelectorAll("[data-testid=\\"ideacad-archive-row\\"]").length === 2'
		}
	],
	orderResult: [
		{
			label: 'every control sits inside the panel that owns it, and the picker fills the width reserved for it',
			evaluate: '() => window.__ideacadArchiveVerdicts()',
			expected: [
				'the archive panel is on screen ok',
				'there are controls to measure ok',
				'every control sits inside the panel that owns it ok',
				'nothing is wider than the window ok',
				'the class picker fills the width reserved for it ok',
				'its label is above it, not beside it ok',
				'the sentence about sharing sits above the picker ok'
			]
		}
	],
	presence: [
		{
			selector: '[data-testid="ideacad-archive"]',
			label: 'the archive panel',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-archive-row"]',
			label: 'a row per archived or off-roster document',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="ideacad-archive-reason"]',
			label: 'the reason chip, one per row, a WORD and not a hue alone',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="ideacad-archive-undecided"]',
			label: 'the count of rows still needing a decision, rendered even at zero',
			expectPresent: 1,
			expectVisible: 1
		},
		/* THE DISCLOSURE SENTENCE, ONCE -- on the archived row and not on the
		   live one, because a live document cannot be shared with a class at
		   all. One, never two, is the assertion. */
		{
			selector: '[data-testid="ideacad-archive-share-note"]',
			label: 'the sentence saying a whole class will see whose work this is',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="ideacad-archive-shares"] li',
			label: 'the one class this document is already shared with',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		/* ABSENCES, each beside a positive control above. */
		{
			selector: '[data-testid="ideacad-archive-empty"]',
			label: 'the empty note, absent while there are rows',
			expectPresent: 0
		},
		{
			selector: '[data-testid="ideacad-archive-off"]',
			label: 'the no-migration note, absent on a deployment that has 0214',
			expectPresent: 0
		},
		{
			selector: '[data-testid="ideacad-archive-refusal"]',
			label: 'a refusal, absent before anybody has pressed anything',
			expectPresent: 0
		}
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-archive"]',
			label: 'the panel names both reasons in words, and says what each one means',
			must: [
				'Archive',
				'Off roster',
				'no longer on the roster',
				'reference work',
				'Restore',
				'Open',
				'Show this to',
				'Stop sharing'
			],
			mustNot: ['undefined', 'NaN', '[object Object]', 'null']
		},
		{
			selector: '[data-testid="ideacad-archive-share-note"]',
			label: 'the disclosure names the attribution, which is the half worth saying out loud',
			must: ['whose work it is', 'cannot change'],
			mustNot: ['undefined']
		}
	],
	contrast: [
		{ selector: '[data-testid="ideacad-archive"] h3', label: 'the archive heading', min: 4.5 },
		{
			selector: '[data-testid="ideacad-archive"] .who',
			label: 'the owner address, which is the row’s real content',
			min: 4.5
		},
		{
			selector: '[data-testid="ideacad-archive-share-note"]',
			label: 'the disclosure sentence on the row ground',
			min: 4.5
		},
		{
			selector: '[data-testid="ideacad-archive"] .note.small',
			label: 'the sentence saying what a reason means',
			min: 4.5
		},
		{
			selector: '[data-testid="ideacad-archive"] .lab',
			label: 'the picker’s own label',
			min: 4.5
		},
		{
			selector: '[data-reason="off_roster"] [data-testid="ideacad-archive-reason"]',
			label: 'the tinted chip on the row that still needs a decision',
			min: 4.5
		}
	],
	tapTargets: [
		{ selector: '[data-testid="ideacad-archive"] select', label: 'the class picker' },
		{ selector: '[data-testid="ideacad-archive"] .go', label: 'Open, and Share with class' },
		{ selector: '[data-testid="ideacad-archive"] .rm', label: 'Stop sharing' }
	]
};
