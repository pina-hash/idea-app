/**
 * How far a dropped file and a pasted screenshot reach, measured in a real
 * browser.
 *
 * THE ONE CASE THIS ADDS OVER `tests/classroom-file-drop.test.ts` IS THE
 * NESTING. That file drives the state machine with synthetic objects, which is
 * the right place for the arithmetic and can put two controllers to one event.
 * What it cannot do is prove that the two handlers a teacher actually has --
 * the spec importer's drop target and the composer's own `onpaste`, with a
 * live Tiptap editor between them -- are wired into one real bubbling tree in
 * the order the fix assumes. `SpecImporter` renders INSIDE `ContentComposer`,
 * and a drop target there that claimed a screenshot and then refused it for
 * not being JSON would silently eat one on its way to the attachment list,
 * with nothing on screen to say so. That is what the last four verdicts
 * measure, against the real components.
 *
 * WHAT IS DISPATCHED IS NOT A SYSTEM PASTE OR A SYSTEM DRAG. The page builds
 * real `ClipboardEvent`/`DragEvent` objects carrying real `DataTransfer`s with
 * real `File`s and dispatches them at real nodes, so the browser's own event
 * classes, the real bubbling and the components' real handlers all run -- but
 * they are `isTrusted: false` and nothing here goes through the OS clipboard
 * or a real drag source. Prompt 0026 recorded that limit for the paste half
 * and it is unchanged; a real Ctrl+V and a real drag on the preview are Mr
 * Pina's check and are not claimed by this spec.
 *
 * A DROPPED FOLDER IS UNREACHABLE FROM HERE AT ALL, which matters because the
 * Foundry submit zone's whole reason for handing in a `resolve` hook is that it
 * accepts one. `DataTransferItem.webkitGetAsEntry()` cannot be synthesized -- a
 * script may add Files to a DataTransfer but not filesystem entries -- so the
 * directory walk is asserted in `tests/classroom-file-drop.test.ts` against an
 * injected resolver instead. Said here rather than left as a silent gap in a
 * passing report.
 *
 * NO NUMBER IS RETYPED. `expected` is the list of verdict labels the page
 * itself produces, so a probe that stops existing changes the array length and
 * fails rather than quietly reducing what was checked. The raw table is
 * printed by the prepare step, so a passing run still hands the next reader the
 * actual values.
 */
export default {
	path: '/dev/attach-reach',
	label: 'Attachment reach: drop and paste routing',
	prepare: [
		/* Neither box is open by default -- the roster import is a `<details>`
		   and the spec importer renders its body only once its Open control is
		   pressed -- and Tiptap is imported dynamically and browser-only. The
		   page opens both and stamps this once every element the probes read is
		   actually in the tree. Without it, every "was not claimed" verdict
		   passes against a page with nothing on it. */
		{ waitFor: '() => document.documentElement.hasAttribute("data-reach-ready")' },
		{ evaluate: '() => window.__reachTable()' }
	],
	orderResult: [
		{
			label: 'a drop reaches the box beside it, and a screenshot reaches past both panels',
			evaluate: '() => window.__reachVerdicts()',
			expected: [
				'roster drop csv fills the box: true',
				'roster drop csv cancels the default: true',
				'roster drop csv says nothing it should not: true',
				'roster does NOT claim a pasted screenshot: true',
				'roster reports no refusal for one: true',
				'roster box untouched by a screenshot: true',
				'roster leaves a plain-text paste alone: true',
				'roster drop png leaves the box alone: true',
				'roster drop png says why: true',
				'spec drop json fills the box: true',
				'spec drop json says nothing it should not: true',
				'screenshot pasted at the spec box reaches the composer: true',
				'the spec panel reported no refusal for it: true',
				'the spec box was untouched by it: true',
				'spec leaves a plain-text paste alone: true',
				'spec drop png leaves the box alone: true',
				'spec drop png says why: true'
			]
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'classroom room mounted', expectPresent: 1 },
		/* The two surfaces under test. Either one missing would satisfy every
		   "was not claimed" verdict vacuously, which is the failure mode this
		   whole spec is exposed to. */
		{
			selector: 'details.csv-import',
			label: 'the real roster CSV import',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="csv-text"]',
			label: "the roster import's own text box",
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.import-body',
			label: 'the real spec import, open',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="spec-paste"]',
			label: "the spec import's own text box",
			expectPresent: 1,
			expectVisible: 1
		},
		/* And the list a pasted screenshot has to reach THROUGH the spec panel.
		   Without this the reach verdict is a claim about a list nobody drew. */
		{
			selector: '.fup[data-role="attachment"]',
			label: 'the student-facing attachment list a screenshot must reach',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.rt-editor .ProseMirror',
			label: 'the real rich-text body editor between them',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	contrast: [{ selector: '.harness > h1', label: 'h1 on the classroom plate', min: 4.5 }]
};
