/**
 * A CONFIG THE ENGINE CANNOT BUILD A PART FROM: refused HERE, before the call.
 *
 * WHY THIS IS THE STATE WITH ITS OWN SPEC. `ideacad_open_document` mints a
 * student's FIRST CONCEPT out of `config->'defaultFeatures'`, so an editor row
 * written with a config `validateBladeTree` refuses is an assignment that
 * accepts a student and then will not open for them -- days later, in class, in
 * front of the wrong person. The database has no opinion about this: 0201 takes
 * whatever jsonb it is handed. The validation is the client's, it has to run
 * BEFORE the write, and the only observable difference between running it
 * before and after is a call count.
 *
 * SO `calls 0` IS THE MEASUREMENT, and `error 1` beside it is the positive
 * control -- a press that did nothing at all would report the same zero.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-attach?role=teacher&state=badconfig',
	label: 'Blade editor switch: a config that cannot build a part is refused before anything is written',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__attachControls === "function"' },
		/* THE PRESS IS A PREPARE STEP, NOT THE FIRST CHECK, SO THE PICTURE IS OF
		   THE REFUSAL. `tools/browser-verify/_shot.mjs` replays a spec's
		   `waitFor` and `evaluate` steps and nothing else, and the refused state
		   is the only one on this route worth looking at -- a sentence rendered
		   somewhere it does not fit is invisible to every check here. An
		   `evaluate` rather than a `click` for the same reason. */
		{
			evaluate:
				'() => { const b = document.querySelector(\'[data-testid="ideacad-attach-on"]\'); if (b) b.click(); return true; }',
			until: '() => !!document.querySelector(\'[data-testid="ideacad-attach-error"]\')'
		}
	],
	orderResult: [
		{
			label: 'the press refused locally, said nothing changed, and never reached the transport',
			evaluate:
				'() => window.__attachPressOn().then((c) => ["calls " + c.calls, "error " + c.error, "notice " + c.notice, "reloads " + c.reloads, "saysNothingChanged " + c.errorText.includes("Nothing changed")])',
			expected: [
				'calls 0',
				'error 1',
				'notice 0',
				'reloads 0',
				'saysNothingChanged true'
			]
		},
		{
			label: 'and the refusal sits inside the block rather than running off it',
			evaluate: '() => window.__attachVerdicts()',
			expected: [
				'nothing is wider than the window ok',
				'the block has a box ok',
				'the block sits inside the inspector ok',
				'every control and sentence sits inside the block ok',
				'every control clears the declared 24px floor ok',
				'no control stretches the whole block ok',
				'the block never offers both directions at once ok'
			]
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'the room production is in', expectPresent: 1, expectVisible: 1 },
		{
			selector: '[data-testid="ideacad-attach-on"]',
			label: 'the control, which is offered because the config is not knowable from the markup',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	ignoreConsole: [
		'Failed to load resource: the server responded with a status of 401',
		'Failed to load resource: net::ERR_FAILED'
	]
};
