/**
 * Where a pasted screenshot lands in the composer, measured in a real browser.
 *
 * THE ONE CASE THIS ADDS OVER `tests/dom/composer-attach-*` IS THE BODY
 * EDITOR. Those files pin the routing arithmetic in happy-dom, which is the
 * cheaper place for it -- but happy-dom cannot run Tiptap, so the case where
 * ProseMirror sees the paste FIRST is unreachable there, and it is the case a
 * teacher actually hits: the caret is in the body when they press Ctrl+V.
 *
 * IT ALSO PRINTS WHETHER PROSEMIRROR CONSUMED THE EVENT, which is measured
 * rather than reasoned and came out `false` -- the editor finds no text and no
 * html on a screenshot paste and declines it. So a fix keying on
 * `event.defaultPrevented` would have worked here too, today, by accident. That
 * is the reason the composer asks `claimPaste` instead: see the note beside the
 * call in ContentComposer.
 *
 * WHAT IS DISPATCHED IS NOT A SYSTEM PASTE. The page builds a real
 * `ClipboardEvent` carrying a real `DataTransfer` with a real PNG `File` on it
 * and dispatches it at a real node, so the browser's own event class, the real
 * bubbling and ProseMirror's real handler are all exercised -- but the event is
 * `isTrusted: false` and nothing here goes through the OS clipboard. A real
 * Ctrl+V on the preview is a separate check and is not claimed by this spec.
 *
 * NO NUMBER IS RETYPED. `expected` is the list of verdict labels the page
 * itself produces, so a probe that stops existing changes the array length and
 * fails rather than quietly reducing what was checked. The raw counts are
 * printed by the prepare step so a passing run still hands the next reader the
 * actual table.
 */
export default {
	path: '/dev/composer-attach',
	label: 'Composer attach: paste routing',
	prepare: [
		/* Tiptap is imported dynamically and browser-only, so nothing is
		   measurable until the editor and both panels are actually in the tree.
		   Without this the body-editor probe reads MISSING and the run passes
		   over the only case this spec exists for. */
		{ waitFor: '() => document.documentElement.hasAttribute("data-composer-ready")' },
		{ evaluate: '() => window.__pasteTable()' },
		/* Printed, not asserted: this is a fact about ProseMirror, not a promise
		   this repo makes. It is here because the fix's design turns on it -- see
		   the note beside `__prosemirrorConsumes` on the page. */
		{ evaluate: '() => window.__prosemirrorConsumes()' }
	],
	orderResult: [
		{
			label: 'a pasted screenshot lands in exactly one list, and text is untouched',
			evaluate: '() => window.__pasteVerdicts()',
			expected: [
				'instructor paste ok',
				'student paste ok',
				'body editor paste ok',
				'title field paste ok',
				'plain text untouched ok'
			]
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'classroom room mounted', expectPresent: 1 },
		/* Both lists, told apart by the role each renders. A composer showing one
		   panel would satisfy every routing verdict vacuously. */
		{ selector: '.fup[data-role="attachment"]', label: 'student-facing file list', expectPresent: 1, expectVisible: 1 },
		{ selector: '.fup[data-role="instructor"]', label: 'instructor-only file list', expectPresent: 1, expectVisible: 1 },
		{ selector: '.rt-editor .ProseMirror', label: 'the real rich-text body editor', expectPresent: 1, expectVisible: 1 }
	],
	contrast: [{ selector: '.harness > h1', label: 'h1 on the classroom plate', min: 4.5 }]
};
