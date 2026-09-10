export default {
	path: '/dev/html-rubric?state=single',
	label: 'HTML assignment rubric: one grading console, the shape the real app has',
	/*
		THE REAL PAGE SHAPE, AND THE REASON IT NEEDS ITS OWN STATE.

		The default state mounts TWO grading consoles so the comparison can
		happen inside one page load. That is a shape the real app never has, and
		it costs one thing precisely: `GradingConsole` binds
		`<svelte:window onkeydown>` and resolves a level with a document-wide
		`document.querySelector('[data-grade-level=...]')`, so with two mounted a
		digit press fires in both and focus lands in the first. Nothing about the
		RENDER is affected -- which is what the default state measures -- but
		anything about focus or the keyboard is not assertable there.

		So this state mounts ONE console, over the MANIFEST rubric with
		`spec = null`, which is exactly the configuration an HTML assignment
		really runs in. It is the positive control for the caveat above as much
		as it is a measurement: ONE `.grading-page`, one keyboard.
	*/
	prepare: [
		{
			waitFor:
				'() => document.querySelectorAll(".grading-page .roster-list .roster-row").length === 2'
		},
		{
			click: '[data-testid="hx-console-manifest"] .roster-row',
			until:
				'() => document.querySelectorAll(\'[data-testid="hx-console-manifest"] .level-btn\').length === 13'
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'the classroom room', expectPresent: 1, expectVisible: 1 },
		/* ONE CONSOLE. The whole point of this state. */
		{ selector: '.grading-page', label: 'the grading console', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* AND NO SPEC-DERIVED HALF AT ALL -- absence is the mechanism, so the
		   comparison markup is not merely hidden here. */
		{ selector: '[data-testid="hx-console-spec"]', label: 'the spec-derived console', expectPresent: 0 },
		{ selector: '[data-testid="hx-view-manifest"]', label: 'the side-by-side student rubrics', expectPresent: 0 },
		{ selector: '[data-testid="hx-console-manifest"] .level-btn', label: 'level buttons over the manifest rubric', expectPresent: 13, maxPresent: 13, expectVisible: 13 },
		{ selector: '[data-testid="hx-console-manifest"] .level-short', label: 'the one-line form on every level button', expectPresent: 13, maxPresent: 13, expectVisible: 13 }
	],
	contrast: [
		{ selector: '[data-testid="hx-console-manifest"] .level-short', label: "the level button's one-line form", min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="hx-console-manifest"] .level-btn', label: 'a level button', min: 44 }
	],
	orderResult: [
		{
			/* THE KEYBOARD, WHICH ONLY THIS STATE CAN ASK. One console means one
			   `[data-grade-level]` per position in the whole document, so
			   `focusLevel`'s document-wide lookup resolves to the console it was
			   called from. Reported as the count rather than as a boolean, so a
			   selector that stopped matching reads as 0 rather than as a pass. */
			evaluate: `() => {
				const keys = [...document.querySelectorAll('[data-grade-level]')].map((e) => e.getAttribute('data-grade-level'));
				return [keys.length, new Set(keys).size, document.querySelectorAll('.grading-page').length];
			}`,
			expected: [13, 13, 1],
			label: 'every level key is unique in the document, which is what the console\'s own focus lookup needs'
		}
	],
	ignoreConsole: ['ERR_CONNECTION_RESET', 'ERR_BLOCKED_BY_CLIENT']
};
