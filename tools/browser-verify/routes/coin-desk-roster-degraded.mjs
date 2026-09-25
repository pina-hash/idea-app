import { CHOOSE_CLASS, OPEN_MANAGE, WAIT_FOR_CLASSES } from './_coin-roster-import.mjs';

/**
 * "Import from class roster" against a roster that CANNOT SAY WHO TEACHES THE
 * CLASS (`?roster=degraded`: the pre-0138 rung of `loadSectionRoster`, with no
 * `manages` flag). "Cannot tell" must never read as "nobody manages it" -- a
 * teacher imported into a coin section is paid a weekly wage -- so the import
 * refuses in words and offers no add button.
 */
export default {
	path: '/dev/coin-desk?roster=degraded',
	label: 'Coin desk: class roster with no manager flag, import refused',
	prepare: [
		...OPEN_MANAGE(),
		WAIT_FOR_CLASSES,
		CHOOSE_CLASS(
			'class-idea100-b3',
			'() => !!document.querySelector(".cd-root [data-testid=\\"cd-roster-import-error\\"]")'
		)
	],
	presence: [
		{ selector: '.cd-root [data-testid="cd-roster-import-error"]', label: 'the refusal', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-roster-import-go"]', label: 'no add button', expectPresent: 0 },
		{ selector: '.cd-root [data-testid="cd-roster-import-plan"]', label: 'no preview', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '.cd-root [data-testid="cd-roster-import-error"]',
			label: 'the refusal says why',
			must: ['cannot say which people on it teach the class', 'nothing can be imported']
		}
	],
	contrast: [
		{ selector: '.cd-root [data-testid="cd-roster-import-error"]', label: 'the refusal text', min: 4.5 }
	]
};
