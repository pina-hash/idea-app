/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE TWO RICH-TEXT EDITORS, LOADED NORMALLY: the plain-text fallback is
 * ABSENT and the real editors are present, each in its own room.
 *
 * The fallback itself (a working textarea in the editor's place when the
 * editor's download fails) cannot be reached from inside a page: nothing a
 * page can do makes a real `import()` fail. It is proven OUTSIDE this runner,
 * by a Playwright script that aborts every `@tiptap` request before the page
 * loads, types into both fallbacks and reads what `onchange` handed back; its
 * readings are in the F6 report (ledger 0297). This spec is the other half: a
 * normal load must never show the fallback, which is the absence the rows
 * below assert beside their positive controls.
 */
export default {
	path: '/dev/deploy-safety/editors',
	label: 'Deploy safety: both rich-text editors, loaded normally',
	prepare: [
		{
			waitFor: `() => !!document.querySelector('[data-testid="classroom-body-editor"]') && !!document.querySelector('[data-testid="note-editor-input"]')`,
			timeoutMs: 45_000
		}
	],
	presence: [
		{
			selector: '[data-testid="classroom-editor"] [data-testid="classroom-body-editor"]',
			label: 'the classroom body editor (positive control)',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="notebook-editor"] [data-testid="note-editor-input"]',
			label: 'the notebook note editor (positive control)',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="classroom-body-plain"]',
			label: 'the classroom plain-text fallback (absent on a normal load)',
			expectPresent: 0
		},
		{
			selector: '[data-testid="note-editor-plain"]',
			label: 'the notebook plain-text fallback (absent on a normal load)',
			expectPresent: 0
		}
	],
	textContains: [
		{
			selector: '[data-testid="classroom-ready"]',
			label: 'the classroom editor reported ready with the seeded body',
			must: ['Measure the span before you cut.', 'Photograph the joint from two sides.']
		},
		{
			selector: '[data-testid="notebook-ready"]',
			label: 'the notebook editor reported ready with the seeded note',
			must: ['The glue line failed first.', 'Next time clamp it overnight.']
		}
	],
	contrast: [
		{ selector: '[data-testid="classroom-ready"]', label: 'the classroom readout', min: 4.5 },
		{ selector: '[data-testid="notebook-ready"]', label: 'the notebook readout', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="link-back"]', label: 'Back to the assignment' }]
};
