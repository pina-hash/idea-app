/**
 * "NO PATHWAY YET" ON THE FIRST-SIGN-IN SHEET (ledger 0360, report R18), end
 * to end on /dev/pathways, whose mock student has no pathway -- so the REAL
 * root-layout `PathwayPicker` is up the moment the page paints, exactly as it
 * is for a freshman on their first sign-in.
 *
 * Mr. Pina: freshmen are confused by a sheet with no choice for "I have not
 * chosen yet". The seventh option is that choice. Pressing it and confirming
 * must (1) leave the column NULL -- no pathway is invented, and none is
 * guessed from an email -- (2) store the answer, dated today, in
 * `preferences.pathway`, which is what stops the sheet asking again this
 * school year on any device, and (3) take the sheet away at once.
 *
 * THE READOUTS ARE THE STORED ROW. `data-testid="pathway"` and
 * `data-testid="pathway-not-yet"` print what the stub's store holds after
 * `invalidateAll()`, so a sheet that merely hid itself without writing reddens
 * the second one. That the stored answer is what stops the next ask is
 * `pathwayPromptWanted`'s, asserted at pinned dates in
 * tests/pathway-choice.test.ts; `profile-menu-pathway-csee-state-not-yet.mjs`
 * shows the reloaded profile keeping the sheet away with no latch to help it.
 */
const TODAY = `new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })`;

export default {
	path: '/dev/pathways?state=not-yet',
	label: 'PathwayPicker: a freshman answers No pathway yet, and the sheet stops asking',
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED'],
	prepare: [
		{
			/* THE POSITIVE CONTROL: the sheet is up, with the seventh choice on it. */
			evaluate: `() => { const o = document.querySelector('.pwp-overlay'); const n = document.querySelector('[data-testid="pathway-none"]'); return (o ? 'the sheet is up' : 'NO SHEET') + ', ' + (n ? 'No pathway yet is offered: "' + n.textContent.replace(/\\s+/g, ' ').trim() + '"' : 'NO NOT-YET CHOICE'); }`,
			until: `() => !!document.querySelector('.pwp-overlay [data-testid="pathway-none"]')`,
			label: 'the first-sign-in sheet is up and offers No pathway yet'
		},
		{
			evaluate: `() => 'before: pathway=' + document.querySelector('[data-testid="pathway"]').textContent.trim() + ', not-yet=' + document.querySelector('[data-testid="pathway-not-yet"]').textContent.trim()`,
			label: 'the stored row before the answer'
		},
		{
			click: '[data-testid="pathway-none"]',
			until: `() => document.querySelector('[data-testid="pathway-none"]').classList.contains('selected') && /no pathway yet/i.test(document.querySelector('.pwp-confirm').textContent)`,
			label: 'choose No pathway yet: it is selected and the confirm says so in words'
		},
	],
	/* MEASURED WITH THE SHEET UP AND THE CHOICE MADE, before the confirm, so the
	   seventh option's words and target are read where a freshman meets them.
	   The confirm itself is the last row below: it runs after every static
	   check, presses Confirm, and reads the stored row back. */
	presence: [
		{ selector: '.pwp-overlay', label: 'the sheet is up (positive control for the after rows)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="pathway-none"]', label: 'No pathway yet, on the sheet', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="pathway-none"].selected', label: 'and selected', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pwp-option', label: 'six pathways plus No pathway yet', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '.pwp-later', label: 'Choose later is still offered beside it', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="pathway-none"] .pwp-code', label: 'No pathway yet, the words', min: 4.5 },
		{ selector: '.pwp-none-hint', label: 'what No pathway yet means', min: 4.5 },
		{ selector: '.pwp-confirm', label: 'the confirm, naming the choice', min: 4.5 },
		{ selector: '.pwp-sub', label: 'the sheet sentence that points at the choice', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="pathway-none"]', label: 'No pathway yet', min: 44 },
		{ selector: '.pwp-confirm', label: 'the confirm', min: 44 }
	],
	orderResult: [
		{
			label: 'confirm: the sheet goes, the column stays unset, and the answer is stored dated today (Los Angeles)',
			evaluate: `async () => {
				const today = ${TODAY};
				document.querySelector('.pwp-confirm').click();
				for (let i = 0; i < 80; i++) {
					if (!document.querySelector('.pwp-overlay') && document.querySelector('[data-testid="pathway-not-yet"]').textContent.trim() !== 'none') break;
					await new Promise((r) => setTimeout(r, 50));
				}
				const stored = document.querySelector('[data-testid="pathway-not-yet"]').textContent.trim();
				return [
					document.querySelector('.pwp-overlay') ? 'SHEET STILL UP' : 'sheet gone',
					document.querySelector('[data-testid="pathway"]').textContent.trim(),
					stored === today ? 'answered today' : 'NOT TODAY: ' + stored,
					document.querySelector('.pwp-error') ? 'REFUSED' : 'no refusal',
					document.querySelectorAll('.fake-header .pathway-chip').length === 0 ? 'no chip' : 'A CHIP APPEARED'
				];
			}`,
			expected: ['sheet gone', 'unset', 'answered today', 'no refusal', 'no chip']
		}
	]
};
