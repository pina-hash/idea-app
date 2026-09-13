/**
 * ALREADY ON: the Off control, and the typed confirmation in front of it.
 *
 * WHY A TYPED CONFIRMATION AND NOT A TWO-STEP INLINE ONE. Measured against
 * 0201 rather than assumed: turning the editor off deletes the
 * `ideacad_editors` row and clears `assignment_schema_version`, and
 * `ideacad_documents` / `ideacad_concepts` / `ideacad_predictions` cascade off
 * `classroom_items` and never off that table -- so NOTHING IS DELETED, and
 * every student is STRANDED until it goes back on, because
 * `ideacad_open_document` raises without the row. That is not destruction and
 * it is not nothing, and the confirmation has to say both halves.
 *
 * THE MEASUREMENT THAT MATTERS HERE IS THE ZERO. A confirm pressed with the
 * wrong word must not reach the transport, and the only way to know it did not
 * is a counted call. `aria-disabled` is deliberately not `disabled` -- a
 * genuinely disabled control swallows the pointer event, so the press has to
 * land and be refused by the same predicate that greys the control.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-attach?role=teacher&state=on',
	label: 'Blade editor switch: a schema-4 assignment offers to turn it off, behind a typed confirmation',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__attachControls === "function"' },
		/* ARMED WITH AN `evaluate` RATHER THAN A `click`, AND THE REASON IS THE
		   PICTURE. It clicks the SAME real control either way, so nothing about
		   what is verified changes -- but `tools/browser-verify/_shot.mjs`
		   replays a spec's `waitFor` and `evaluate` steps and NOT its `click`
		   steps, so a spec armed by a click rasterizes to the DISARMED state.
		   The typed confirmation is exactly the arrangement worth looking at (a
		   text box in a row of 24px chips), and a screenshot of the wrong state
		   is the one failure that looks like it worked. */
		{
			evaluate:
				'() => { const b = document.querySelector(\'[data-testid="ideacad-attach-off"]\'); if (b) b.click(); return true; }',
			until: '() => !!document.querySelector(\'[data-testid="ideacad-attach-off-input"]\')'
		}
	],
	orderResult: [
		{
			label: 'armed: the warning, the box and both controls are on screen and nothing has been called',
			evaluate:
				'() => { const c = window.__attachControls(); return ["warning " + c.warning, "input " + c.input, "confirm " + c.confirm, "cancel " + c.cancel, "on " + c.on, "calls " + c.calls]; }',
			expected: ['warning 1', 'input 1', 'confirm 1', 'cancel 1', 'on 0', 'calls 0']
		},
		{
			label: 'the WRONG word does not reach the transport -- the zero is the whole check',
			evaluate:
				'() => window.__attachPressOff("turn it off").then((c) => ["calls " + c.calls, "confirm " + c.confirm, "notice " + c.notice, "error " + c.error])',
			expected: ['calls 0', 'confirm 1', 'notice 0', 'error 0']
		},
		{
			label: 'the right word does, once, with a null editor, and the teacher is told what happened',
			evaluate:
				'() => window.__attachPressOff("TURN OFF").then((c) => ["calls " + c.calls, "last " + c.lastCall, "notice " + c.notice, "error " + c.error, "reloads " + c.reloads])',
			expected: [
				'calls 1',
				'last setEditor(i-crowded, null)',
				'notice 1',
				'error 0',
				'reloads 1'
			]
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'the room production is in', expectPresent: 1, expectVisible: 1 },
		{
			selector: '[data-testid="ideacad-attach-off-warning"]',
			label: 'what turning it off costs, named before the confirm',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-attach-off-input"]',
			label: 'the typed confirmation box',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-attach-off-cancel"]',
			label: 'the way out, which must be beside the way through',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="ideacad-attach-on"]',
			label: 'the On control, which must not be offered while it is on',
			expectPresent: 0
		}
	],
	contrast: [
		{
			selector: '[data-testid="ideacad-attach-off-warning"]',
			label: 'the warning sentence',
			min: 4.5
		}
	],
	tapTargets: [
		{ selector: '[data-testid="ideacad-attach-off-input"]', label: 'the confirmation box', min: 24 },
		{
			selector: '[data-testid="ideacad-attach-off-cancel"]',
			label: 'Leave it on',
			min: 24
		}
	],
	ignoreConsole: [
		'Failed to load resource: the server responded with a status of 401',
		'Failed to load resource: net::ERR_FAILED'
	]
};
