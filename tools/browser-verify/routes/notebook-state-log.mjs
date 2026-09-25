import { COMPOSER_CONTRAST, IGNORE_PHOTO_PROXY, WAIT_AUTOPICK, WAIT_EDITOR } from './_notebook-log.mjs';

/**
 * THE STUDENT'S FIRST SCREEN IS THEIR OWN LOG (ledger 0298, R32), measured as
 * a student lands on it with nothing opened: one box at the top of the feed,
 * filed on its own, and the check-in a chip rather than the first question.
 *
 * BOTH DIRECTIONS ON ONE FIXTURE. Present and visible: the composer at the
 * head of the log, its templates, "Filed to ..." with the check-in's state on
 * it, and the head's check-in chip with a word on it. Present and NOT visible:
 * the check-in picks (in the DOM behind "Change", so the auto-pick still runs,
 * and none on screen). Absent: the New entry / Close pair, a composer in the
 * detail pane, and the three how-to sentences the composer used to carry.
 * `notebook.mjs` opens "Change" and measures what is behind it.
 *
 * THE ORDER IS A GEOMETRY CLAIM, SO IT IS READ OFF THE PAGE: composer above
 * the list head above the first entry, at both widths; and above the
 * breakpoint the log is ONE pane (nothing open, no detail pane).
 * `notebook-state-log-bulk-1.mjs` scrolls a long log and reads where its head
 * went.
 */
export default {
	path: '/dev/notebook?state=log',
	label: "Notebook, student's first screen: the log (a composer at the top of the feed, filing behind one control)",
	prepare: [WAIT_AUTOPICK, WAIT_EDITOR],
	presence: [
		{ selector: '.nb-pane-card > .compose-card[data-testid="nb-compose"]', label: 'the composer, at the head of the log', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-compose"] [data-testid="note-editor-input"]', label: 'the one box', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-templates"] .template', label: 'the three templates', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="nb-filing-toggle"][aria-expanded="false"]', label: '"Filed to ..., Change", closed on arrival', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-filed-state"]', label: "the filed check-in's state, a word on a chip", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-next-check-in-state"]', label: "the head's check-in chip carries a word", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* Both directions on the picks: in the DOM (the auto-pick pressed one),
		   and not one of them on screen. */
		{ selector: '.pick', label: 'check-in picks: in the DOM, none on screen until Change', expectPresent: 5, expectVisible: 0, maxVisible: 0 },
		{ selector: '.cr-detail [data-testid="nb-compose"]', label: 'a composer in the detail pane (must be absent)', expectPresent: 0 },
		{ selector: '[data-testid="nb-compose-trigger"], [data-testid="nb-compose-close"]', label: 'the old New entry / Close pair (must be absent)', expectPresent: 0 },
		{ selector: '[data-testid="nb-autosave-note"], [data-testid="nb-submit-hint"], [data-testid="nb-draft-pending"]', label: 'the how-to sentences (must be absent)', expectPresent: 0 },
		{ selector: '[data-testid="nb-compose-refusal"]', label: 'a refusal before anything was pressed (must be absent)', expectPresent: 0 },
		{ selector: '[data-testid="nb-turn-in"][aria-disabled="true"]', label: 'Turn in says it has nothing to send, and can still be pressed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-turn-in"]:disabled', label: 'Turn in swallowing its own press (must be absent)', expectPresent: 0 }
	],
	contrast: [...COMPOSER_CONTRAST],
	tapTargets: [
		{ selector: '[data-testid="nb-templates"] .template', label: 'the three templates', min: 44 },
		{ selector: '[data-testid="nb-filing-toggle"]', label: '"Filed to ..., Change"', min: 44 },
		{ selector: '[data-testid="nb-turn-in"], [data-testid="nb-save-draft"]', label: 'Turn in / Save draft', min: 44 },
		{ selector: '.nb-head .chip-due', label: "the head's check-in chip", min: 44 }
	],
	orderResult: [
		{
			label: 'composer, then the list head, then the feed, top to bottom; one pane with nothing open',
			evaluate: `() => {
				const top = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? NaN;
				const c = top('[data-testid="nb-compose"]');
				const h = top('.nb-pane-card > .list-head');
				const f = top('.nb-pane-card .entries > li');
				const wide = window.innerWidth >= 1024;
				const detail = document.querySelectorAll('.cr-split.has-detail').length;
				return [
					c < h ? 'the composer is above the list head' : 'COMPOSER ' + c + ' HEAD ' + h,
					h < f ? 'the list head is above the first entry' : 'HEAD ' + h + ' ENTRY ' + f,
					!wide || detail === 0 ? 'nothing open is one pane' : 'A DETAIL PANE WITH NOTHING OPEN'
				];
			}`,
			expected: [
				'the composer is above the list head',
				'the list head is above the first entry',
				'nothing open is one pane'
			]
		}
	],
	ignoreConsole: IGNORE_PHOTO_PROXY
};
