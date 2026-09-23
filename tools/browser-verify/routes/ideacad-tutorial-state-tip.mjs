/**
 * A PALETTE TOOL'S CARD, OPEN: `/dev/ideacad-tutorial?state=tip` with the
 * pointer on Extrude. Ledger 0296. The harness reads nothing from the query;
 * it names this state so the spec has a path of its own.
 *
 * The prepare step hands the Extrude tool the pointer-enter a real pointer
 * would, then waits past the student's delay (400 ms by default) for the card:
 * a card that opened at once would be on screen in the first poll, and one
 * that never opened fails the wait. Measured open: the heading with the key,
 * the one-line description, and the moving picture of the gesture, and the
 * card clear of the whole palette rather than over any tool in it (the wait
 * itself refuses a card that overlaps the palette's box; the placement's own
 * cases are in `tests/ideacad-solid-learn.test.ts`).
 */
export default {
	path: '/dev/ideacad-tutorial?state=tip',
	label: 'IdeaCAD: a tool card open on Extrude, with its moving picture',
	prepare: [
		{ waitFor: '() => !!window.ideaCadTutorial && !!document.querySelector(\'[data-command="extrude"]\')', timeoutMs: 30000 },
		{ evaluate: '() => { const w = document.querySelector(\'[data-command="extrude"]\').closest(".tool-wrap"); w.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false })); return !!w; }' },
		{ waitFor: '() => { const t = document.querySelector(\'[data-command="extrude"] ~ .tip\'); if (!t || t.hidden || getComputedStyle(t).visibility !== "visible") return false; const a = document.querySelector(\'[data-command="extrude"]\').closest(".tools").getBoundingClientRect(), b = t.getBoundingClientRect(); return b.right <= a.left || b.left >= a.right || b.bottom <= a.top || b.top >= a.bottom; }', timeoutMs: 5000 }
	],
	presence: [
		{ selector: '[data-command="extrude"] ~ .tip:not([hidden])', label: 'the Extrude card, open and clear of the whole palette', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-command="extrude"] ~ .tip .demo', label: 'the moving picture of the gesture', expectPresent: 1, expectVisible: 1 },
		{ selector: '.tip:not([hidden])', label: 'only one card at a time', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-command="extrude"] ~ .tip', label: 'the name, the key and the line', must: ['Extrude', 'E', 'Pull a sketch into a solid'] }
	],
	contrast: [
		{ selector: '[data-command="extrude"] ~ .tip .tip-head', label: 'the card heading', min: 4.5 },
		{ selector: '[data-command="extrude"] ~ .tip .tip-line', label: 'the card line', min: 4.5 }
	],
	tapTargets: [{ selector: '.tools button', label: 'every palette tool', min: 44 }],
	layoutSanity: [{ root: '[data-command="extrude"] ~ .tip', label: 'the open card', reserved: null }],
	ignoreConsole: []
};
