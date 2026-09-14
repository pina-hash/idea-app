/**
 * THE HISTORY TIMELINE, AT BOTH WIDTHS, MEASURED RATHER THAN DESCRIBED.
 *
 * WHY THIS IS A BROWSER CLAIM AND CANNOT BE ASKED ANYWHERE ELSE.
 *
 *   * THE FOLD. This is a LONG SCROLLING LIST, which is exactly the shape where
 *     a content check passes over a broken layout: every row is in the DOM and
 *     two of them are unreachable. Ledger 0171 shipped that on THIS SAME RAIL.
 *     happy-dom reads every box as zero, so `tests/dom/` cannot tell a reachable
 *     row from a clipped one at all -- and `tests/dom/ideacad-timeline-mount.test.ts`
 *     says so in its own header rather than pretending otherwise.
 *
 *   * THE SCROLLBAR IS NOT A CUE HERE. This Chromium paints NO SCROLLBAR into a
 *     screenshot at any colour -- ledger 0186 proved it with a magenta-on-green
 *     control -- so "the student can see there is more" cannot rest on one. Two
 *     things stand in for it and both are measured: the list RESERVES the
 *     gutter (`scrollbar-gutter: stable`, so no row is ever drawn under an
 *     invisible bar) and the heading carries a STEP COUNT (so eleven-of-forty
 *     is a number on screen rather than something to discover by dragging).
 *     The gutter rule is the ONE mutant `tests/dom/` could not kill, which is
 *     the correct outcome and is why it is asserted here.
 *
 *   * A ROW SAYS WHAT CHANGED, NOT WHERE. `/features/1/acrossFlats` is what
 *     replays; it is not what a fifteen-year-old reads. The pure suite proves
 *     the namer over the real corpus; this proves the sentence reached the
 *     screen.
 *
 * THE STATE IS REACHED THROUGH THE REAL CONTROL. `__ideacadOpenHistory` presses
 * the History button in the header, which is exactly what a student does --
 * `BladeEditor` has no prop that opens the panel and must not gain one, the
 * same rule `openMaterials` and `openPropertyManager` already follow.
 *
 * THE LOG IS BUILT BY THE REAL `diffTrees`, not hand-written row by row. A
 * fixture the producer cannot emit would let the namer pass over a pointer
 * shape that never occurs while the shapes that DO occur went unread.
 *
 * TAP TARGETS ARE MEASURED WITH NO 24px EXCEPTION, as everywhere in IdeaCAD:
 * this is a student surface at every width and carries no instructor-density
 * class on its root.
 */
import { IDEACAD_DRAWN } from './_ideacad-drawn.mjs';

/* THE THREE "WAS ANYTHING ACTUALLY DRAWN" CHECKS (ledger 0247). Stated once in
   `_ideacad-drawn.mjs` because they are properties of the Blade editor rather
   than of this state; see that file for which routes take them and why. */

export default {
	...IDEACAD_DRAWN,
	path: '/dev/ideacad?role=student&state=history',
	label: 'IdeaCAD: the history timeline, every row reachable, every row a sentence',
	prepare: [
		{ waitFor: '() => typeof window.__ideacadTimelineVerdicts === "function"' },
		{ waitFor: '() => !!window.__ideacadCamera?.()' },
		{ evaluate: '() => window.__ideacadOpenHistory()' },
		{ waitFor: '() => !!document.querySelector("[data-testid=\\"ideacad-timeline\\"]")' }
	],
	orderResult: [
		{
			label: 'every step is listed, reachable, and readable',
			evaluate: '() => window.__ideacadTimelineVerdicts()',
			expected: [
				'the timeline is on screen ok',
				'every step of the log has a row ok',
				'it is inside the pane the feature tree was in ok',
				/* THE FOLD CHECK. A row below the scrollport is fine; a row that
				   cannot be brought INTO it is the 0171 defect. */
				'every row can be scrolled into view ok',
				/* MEASURED AGAINST THE PANE. The first spelling of the check asked
				   whether a row was inside the LIST after scrolling the list, which
				   every row trivially is -- it passed while three rows sat below the
				   pane's own bottom edge. A screenshot found that, not this file. */
				'the list is inside the pane rather than hanging out of it ok',
				'there is exactly one scroll region, and it is the list ok',
				'the list reserves room for its scrollbar ok',
				'no row runs past the list box ok',
				'no row prints a JSON pointer ok',
				/* THE OTHER HALF OF "NOT A JSON PATH": a stored id is not a name.
				   `aluminum-0125` reached the screen and every check above passed. */
				'no row prints a stored stock id ok',
				'a material change names the material a picker offers ok',
				'a row names a feature in the words the controls use ok',
				'a row names a parameter in the words the controls use ok',
				'the origin says the part was created ok',
				/* THE APPEND-ONLY SHAPE ON SCREEN: 0189 chose append-an-inverse
				   over move-a-pointer, so an undone step is STILL a row and a
				   redone one is a second row after it. A UI that hid either would
				   be the cursor this feature refused, wearing a list's clothes. */
				'an undone step is still listed ok',
				'a redone step is still listed ok',
				'nothing is wider than the window ok'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-timeline"]', label: 'the history panel', expectPresent: 1, expectVisible: 1 },
		/* REPLACED IN PLACE, which is exactly this pair of counts and cannot be
		   asserted by either one alone: the panel present AND the tree gone. */
		{ selector: '.tree [role="tree"]', label: 'the FeatureManager list, replaced', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-timeline-count"]', label: 'the step count, which stands in for the scrollbar nobody paints', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-timeline-undo"]', label: 'Undo, inside the panel', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-timeline-redo"]', label: 'Redo, inside the panel', expectPresent: 1, expectVisible: 1 },
		/* AN UNDONE STEP IS STILL A ROW. A count, because a row rendering twice
		   and a row missing look the same to a selector. */
		{ selector: '[data-state="undone"]', label: 'the undone step, still listed', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-state="origin"]', label: 'the creation of the part', expectPresent: 1, expectVisible: 1 },
		/* NOTHING IS PREVIEWING ON ARRIVAL. The preview banner is a claim that
		   the document on screen is not the current one, so it must be absent
		   until a row is pressed. */
		{ selector: '[data-testid="ideacad-timeline-preview"]', label: 'the "looking at an earlier step" banner, absent until a row is pressed', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-timeline"]',
			label: 'a row names a part and a parameter in the words the controls use, and the list explains why an undone step is still here',
			must: [
				'Part created',
				'Hex Extension',
				'Extension height',
				'Circular Pattern',
				'Spin direction',
				/* The stored value read as the word the picker shows. */
				'counter-clockwise',
				/* The material NAME the picker offers, which is what replaced the
				   stored id. */
				'6061 aluminum',
				'Undid',
				'Redid',
				/* A student who knows other CAD expects an undone step to vanish.
				   Saying so once is cheaper than them concluding it is broken. */
				'Undo adds a step here, it never removes one',
				/* WHO MADE EACH EDIT (decision 27). The reader's own rows and a
				   classmate's row are two different WORDS, which is what makes
				   them distinguishable without colour. `system` is the origin,
				   which this fixture backfilled -- it must read as a word and
				   never as `migration:0209`. */
				'You',
				'm.reyes',
				'system'
			],
			/* THE WHOLE POINT OF THE SURFACE. A pointer on screen is a debugging
			   view wearing a student's clothes. */
			mustNot: [
				'/features/',
				'/materials/',
				/* The stored stock ids, by name: these were on screen on the first
				   rasterized pass, under a check that forbade pointers and had
				   nothing to say about values. */
				'steel-0125',
				'aluminum-0125',
				/* A RAW EMAIL ADDRESS, which is what this surface printed until
				   decision 27 was answered deliberately. `@` is the whole test
				   and it is a single character on purpose: every address has
				   one, so the check cannot be satisfied by a shorter address or
				   a different domain. It is safe as a blanket ban HERE because
				   no other word on this panel carries one. */
				'@',
				/* The backfill's own value. `0209` deliberately refused to claim
				   a student created a part it did not see created, and a row
				   naming the migration at a student is that refusal undone. */
				'migration:0209',
				'undefined',
				'NaN',
				'[object Object]'
			]
		}
	],
	contrast: [
		{ selector: '[data-testid="ideacad-timeline"] h3', label: 'the History heading on the pane ground', min: 4.5 },
		{ selector: '[data-testid="ideacad-timeline"] h3 i', label: 'the step count beside it', min: 4.5 },
		{ selector: '.tl .where', label: 'the part a row is about', min: 4.5 },
		{ selector: '.tl .what', label: 'what happened to it', min: 4.5 },
		{ selector: '.tl .seq', label: 'the step number', min: 4.5 },
		{ selector: '.tl .meta', label: 'who and when', min: 4.5 },
		/* WHO MADE IT, MEASURED AS TWO INKS BECAUSE IT IS TWO INKS. A
		   classmate's name steps up to `--text-1` and the reader's own "You"
		   sits at the meta row's `--text-2`, so a single `.meta` reading
		   measures one of them and says nothing about the other -- which is
		   exactly the shape of "a green check is a claim about the question it
		   asked". Both are held to the TEXT threshold: the word is the signal
		   here, not a tint on one. */
		{ selector: '.tl .who.is-you', label: "the reader's own rows", min: 4.5 },
		{ selector: '.tl .who:not(.is-you):not(.is-system)', label: "a classmate's name", min: 4.5 },
		{ selector: '.tl .who.is-system', label: 'the origin, which is not a person', min: 4.5 },
		/* THE VERB AND THE CHIP CARRY THE UNDONE STATE IN WORDS, which is why
		   they are held to the TEXT threshold rather than the 3:1 a decorative
		   mark would take: they are the signal, not a tint on one. */
		{ selector: '.tl .verb', label: 'the Undid/Redid verb', min: 4.5 },
		{ selector: '.tl .undone-chip', label: 'the "undone" chip', min: 4.5 },
		{ selector: '.tl .note', label: 'the sentence explaining the append-only list', min: 4.5 },
		{ selector: '.tl .act', label: 'the Undo and Redo labels', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.tl .hit', label: 'a step, which is what a scrub is pressed on' },
		{ selector: '.tl .act', label: 'Undo and Redo inside the panel' },
		{ selector: '.tl .back', label: 'the way back to the feature tree' },
		{ selector: 'button.hist', label: 'the History toggle in the header' }
	]
};
