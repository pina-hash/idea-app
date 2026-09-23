/**
 * THE IDEACAD FRONT DOOR WHILE A NEW MODEL IS BEING NAMED. Ledger 0296.
 *
 * Measures a different STATE of `/dev/ideacad-launch` (`aliasOf`): New model
 * pressed, so the naming form sits in the band where the button was. The
 * form is the one transient thing in the band that is wider than a control,
 * so it is where a row can spill, overlap or push a word onto its border; the
 * band takes a row of its own for it rather than squeezing the search to
 * nothing. The claims are `_ideacad-launch.mjs`'s, shared with the live view.
 */
import { LAUNCH_CLAIMS, LAUNCH_VERDICTS, UNFOLDED_INTERACTIVE } from './_ideacad-launch.mjs';

export default {
	path: '/dev/ideacad-launch?state=naming',
	aliasOf: '/dev/ideacad-launch',
	label: 'IdeaCAD: the launch page, naming a new model',
	prepare: [
		{ waitFor: '() => document.querySelectorAll(\'[data-testid="model-card"]\').length >= 7' },
		{ click: '[data-testid="new-model"]', until: '() => !!document.querySelector(\'.launch form.new-form input\')', attempts: 10, gapMs: 200 }
	],
	presence: [
		{ selector: '.launch .masthead form.new-form', label: 'the naming form, in the band', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="new-model-create"]', label: 'Create and open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.launch .new-form .cancel', label: 'Cancel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* The button it replaced is gone while the form is open, rather than drawn twice. */
		{ selector: '[data-testid="new-model"]', label: 'the New model control, replaced by the form', expectPresent: 0 }
	],
	orderResult: [{ label: 'the front door while naming: the band, the words off their borders, the models first', evaluate: LAUNCH_VERDICTS, expected: LAUNCH_CLAIMS }],
	contrast: [
		{ selector: '[data-testid="new-model-create"]', label: 'Create and open', min: 4.5 },
		{ selector: '.launch .new-form label', label: 'the Name label', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.launch button, .launch a, .launch select, .launch input', label: 'every control on the launch page', min: 44 }
	],
	layoutSanity: [{ root: '.launch', label: 'the launch page', reserved: null, interactive: UNFOLDED_INTERACTIVE }],
	ignoreConsole: []
};
