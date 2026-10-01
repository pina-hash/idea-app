/* NO `order` EXPORT -- see routes.mjs. */

/**
 * LINK HAND-INS ON A PORTED WORKSHEET (ledger 0360, Mr. Pina 2026-09-30), the
 * three surfaces a link meets, each the REAL component:
 *
 *   - the STUDENT's own check under the progress rail (`HtmlLinkCheck`), which
 *     reads what they pasted into a `link: "presentation"` field and either
 *     names the host with a Test it key or says, in words, that it is not a
 *     link yet;
 *   - the GRADER's Open keys (`AnswerLinks`): one per link in a student's
 *     answers, the declared field first, and a worded "Not a working link"
 *     with what they typed where the declared field holds no link;
 *   - the Answers list (`HtmlAnswerList`), which prints a block's `prompt`.
 *
 * `?state=invalid` and `?state=none` are the student check's other two
 * readings; this file is the valid one.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/html-links',
	label: 'Link hand-ins: the student’s check, the grader’s Open keys, the prompt in the answers',
	widths: WIDTHS,
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="html-links-harness"]')`, label: 'the harness has rendered' }],
	presence: [
		{ selector: '[data-testid="html-link-ok"]', label: 'the student sees their link named', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="html-link-bad"]', label: 'no not-a-link sentence on a valid link', expectPresent: 0 },
		{ selector: '[data-testid="hl-links-avery"] [data-testid="answer-link-open"]', label: 'an Open key per link in Avery’s answers', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="hl-links-blake"] [data-testid="answer-link-open"]', label: 'no Open key for words that are not a link', expectPresent: 0 },
		{ selector: '[data-testid="hl-links-blake"] [data-testid="answer-link-bad"]', label: 'the worded refusal in its place', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="hl-answers"] .answers-prompt', label: 'the two declared prompts in the answers', expectPresent: 2, maxPresent: 2, expectVisible: 2 }
	],
	textContains: [
		{ selector: '[data-testid="html-link-ok"]', label: 'the host the student will send', must: ['Your link', 'Google Slides', 'Test it'] },
		{ selector: '[data-testid="hl-links-blake"]', label: 'what Blake typed, beside the refusal', must: ['Not a working link', 'my slides'] },
		{ selector: '[data-testid="hl-answers"]', label: 'the question as the author wrote it', must: ['Link to your slides', 'Your name'] }
	],
	tapTargets: [
		{ selector: '[data-testid="html-link-test"]', label: 'Test it (a student surface)', min: 44 },
		{ selector: '[data-testid="answer-link-open"]', label: 'an Open key', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="html-link-ok"] .hlc-word', label: 'the student’s line', min: 4.5 },
		{ selector: '[data-testid="html-link-test"]', label: 'Test it', min: 4.5 },
		{ selector: '[data-testid="answer-link-host"]', label: 'a link’s host', min: 4.5 },
		{ selector: '.al-label', label: 'which answer the link is in', min: 4.5 },
		{ selector: '[data-testid="answer-link-bad"]', label: 'Not a working link', min: 4.5 },
		{ selector: '.al-raw', label: 'what the student typed', min: 4.5 },
		{ selector: '[data-testid="hl-answers"] .answers-prompt', label: 'a prompt', min: 4.5 }
	],
	orderResult: [
		{
			label: 'every link key opens in a new tab with no opener, the declared field first',
			evaluate: `() => Array.from(document.querySelectorAll('[data-testid="html-link-test"], [data-testid="hl-links-avery"] [data-testid="answer-link-open"]')).map((a) => a.getAttribute('href') + ' ' + a.getAttribute('target') + ' ' + a.getAttribute('rel'))`,
			expected: [
				'https://docs.google.com/presentation/d/trophy-deck/edit?usp=sharing _blank noopener noreferrer',
				'https://docs.google.com/presentation/d/trophy-deck/edit?usp=sharing _blank noopener noreferrer',
				'https://www.canva.com/design/trophy-refs/view _blank noopener noreferrer'
			]
		}
	]
};
