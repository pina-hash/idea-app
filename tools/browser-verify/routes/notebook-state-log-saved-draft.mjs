import { IGNORE_PHOTO_PROXY, TYPE_IN_COMPOSER, WAIT_AUTOPICK, WAIT_EDITOR } from './_notebook-log.mjs';

/**
 * "THIS DRAFT IS SAVED." GOES AWAY THE MOMENT IT STOPS BEING TRUE (ledger
 * 0298 review). Save draft, pressed with nothing new since the last save,
 * says so where the press was. The composer's first cut cleared that sentence
 * only when `canSubmit` turned true -- and the saved words keep `canSubmit`
 * true the whole time, so the sentence stayed on screen over new typing that
 * nothing had saved yet. On a deployment with no autosave that is a student
 * reading "saved" over unsaved work.
 *
 * READ IN THE ORDER IT HAPPENED: an autosaved draft, an explicit Save draft
 * (the checkpoint), a second press that is refused -- the click's own `until`
 * is the positive control that the sentence appeared -- then more typing, and
 * the presence row at the end says the sentence has gone.
 */
const FIRST = 'Cut the base plate to 120 mm';
const MORE = 'then drilled the four corner holes';

export default {
	path: '/dev/notebook?state=log-saved-draft',
	label: 'Notebook log composer: "This draft is saved." clears as soon as there is new writing',
	prepare: [
		WAIT_AUTOPICK,
		WAIT_EDITOR,
		{ evaluate: TYPE_IN_COMPOSER(FIRST) },
		{
			waitFor: '() => !!document.querySelector(\'[data-testid="nb-compose"] .save-ind.saved\') && !!document.querySelector(\'[data-testid="nb-new-entry"]\')',
			timeoutMs: 15_000
		},
		{
			click: '[data-testid="nb-save-draft"]',
			until: '() => document.querySelector(\'[data-testid="nb-save-draft"]\')?.getAttribute("aria-disabled") === "true"'
		},
		{
			click: '[data-testid="nb-save-draft"]',
			until: '() => /This draft is saved/.test(document.querySelector(\'[data-testid="nb-compose-refusal"]\')?.textContent ?? "")'
		},
		{ evaluate: TYPE_IN_COMPOSER(MORE) }
	],
	presence: [
		{ selector: '[data-testid="nb-compose-refusal"]', label: '"This draft is saved." over new writing (must be absent)', expectPresent: 0 },
		{ selector: '[data-testid="nb-new-entry"]', label: 'New entry, the composer still on its draft', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	ignoreConsole: IGNORE_PHOTO_PROXY
};
