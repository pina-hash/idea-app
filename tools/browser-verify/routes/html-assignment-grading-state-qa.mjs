/* NO `order` EXPORT -- see routes.mjs. */

/**
 * ANSWERS BY QUESTION (ledger 0360, report 41c7fcd5): one question, every
 * student's answer to it, read from the manifest's blocks.
 *
 * The header key a teacher presses is pressed, with nobody open, so the panel
 * takes the work slot. Five questions (the team name, the reflection, the
 * checkbox, the photo and the declared link field), three students. The second
 * question is chosen through the list, which is how a teacher moves.
 *
 * WHAT ONLY A BROWSER CAN SAY: at 1440 the question list and the answers are
 * two regions that each scroll on their own inside the pane, so a long list
 * never pushes the answers off screen; at 375 they stack and the document
 * scrolls; and nothing scrolls sideways at either width (the run's own
 * horizontal-scroll check).
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/html-assignment-grading?state=qa',
	label: 'Grading console: Answers by question, five questions and three students',
	widths: WIDTHS,
	prepare: [
		{ waitFor: `() => document.querySelectorAll('.roster-row').length === 3`, label: 'the roster has loaded (3 rows)' },
		{
			click: '[data-testid="qa-toggle"]',
			until: `() => !!document.querySelector('[data-testid="qa-panel"]')`,
			label: 'press Answers by question'
		},
		{
			click: '[data-testid="qa-questions"] > li:nth-child(2) [data-testid="qa-question"]',
			until: `() => document.querySelector('[data-testid="qa-questions"] > li:nth-child(2) [data-testid="qa-question"]')?.getAttribute('aria-pressed') === 'true'`,
			label: 'choose the second question (the reflection)'
		}
	],
	presence: [
		{ selector: '[data-testid="qa-panel"]', label: 'the panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="qa-question"]', label: 'one key per question', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="qa-answer"]', label: 'one answer per student', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="qa-export-csv"]', label: 'the Answers CSV key beside it', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.work-head', label: 'no student open (the panel has the work slot)', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="qa-chosen"]', label: 'the chosen question, as the author wrote it', must: ['What did you model today, and what took the longest?'] },
		{ selector: '[data-testid="qa-toggle"]', label: 'the header key names the view', must: ['Answers by question'] }
	],
	tapTargets: [
		{ selector: '[data-testid="qa-question"]', label: 'a question key', min: 44 },
		{ selector: '[data-testid="qa-open"]', label: 'a student’s name, which opens their work', min: 44 },
		{ selector: '[data-testid="qa-toggle"]', label: 'the header key', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="qa-question"] .qa-label', label: 'a question on its key', min: 4.5 },
		{ selector: '[data-testid="qa-count"]', label: 'how many answered', min: 4.5 },
		{ selector: '[data-testid="qa-chosen"]', label: 'the chosen question', min: 4.5 },
		{ selector: '.qa-value', label: 'an answer', min: 4.5 },
		{ selector: '[data-testid="qa-open"]', label: 'a student’s name', min: 4.5 }
	],
	orderResult: [
		{
			label: 'the questions in the worksheet’s order, the prompt where declared and “group: field” (the CSV header) where not',
			evaluate: `() => Array.from(document.querySelectorAll('[data-testid="qa-question"] .qa-label')).map((n) => n.textContent.trim())`,
			expected: ['Identity: teamName', 'What did you model today, and what took the longest?', 'Work: checkedOff', 'Work: photo', 'Link to your presentation']
		},
		{
			label: 'the count of who answered the chosen question',
			evaluate: `() => [document.querySelector('[data-testid="qa-questions"] > li:nth-child(2) [data-testid="qa-count"]')?.textContent.trim() ?? 'none']`,
			expected: ['3 of 3']
		},
		{
			/* EACH REGION ITS OWN SCROLL ABOVE 1024, the panel's own rule. Below
			   it they stack and the document scrolls, so the reading there is the
			   stacked order. */
			label: 'at desktop the two regions sit side by side and each scrolls on its own',
			evaluate: `() => {
				const q = document.querySelector('[data-testid="qa-questions"]');
				const a = document.querySelector('.qa-answers');
				if (!q || !a) return ['regions=false'];
				const qb = q.getBoundingClientRect();
				const ab = a.getBoundingClientRect();
				const desk = window.innerWidth >= 1024;
				const stacked = ab.top >= qb.bottom - 1;
				const beside = ab.left >= qb.right - 1;
				const own = getComputedStyle(q).overflowY === 'auto' && getComputedStyle(a).overflowY === 'auto';
				return ['arrangedForWidth=' + (desk ? beside : stacked), 'ownScrollAtDesktop=' + (desk ? own : true)];
			}`,
			expected: ['arrangedForWidth=true', 'ownScrollAtDesktop=true']
		}
	]
};
