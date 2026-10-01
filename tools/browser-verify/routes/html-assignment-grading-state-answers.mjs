/* NO `order` EXPORT -- see routes.mjs. */

/**
 * THE ANSWERS VIEW OF A LIVE WORKSHEET (ledger 0360, report 41c7fcd5): "just
 * the questions and answers ... in a more compact area".
 *
 * Alice is opened and the work column's own `Answers` key is pressed, which is
 * what a teacher does. The frame goes (it would be a second, heavier copy of the
 * same answers), the list comes, read straight from the stored rows through the
 * one renderer the not-published branch also mounts. Then `Worksheet` is pressed
 * and the frame comes back, so both directions are measured on one page.
 *
 * THE LINKS FIXTURE: a prompt on the reflection and on the declared link field,
 * none on the checkbox or the photo, so both label readings are on screen; Alice
 * handed in a Slides link AND wrote a Canva link mid-sentence, so two Open keys.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/html-assignment-grading?state=answers',
	label: 'Grading console: the Answers view of a live worksheet, and back to the worksheet',
	widths: WIDTHS,
	prepare: [
		{ waitFor: `() => document.querySelectorAll('.roster-row').length === 3`, label: 'the roster has loaded (3 rows)' },
		{
			click: '.roster-row',
			until: `() => !!document.querySelector('[data-testid="work-view-answers"]')`,
			label: 'open Alice'
		},
		{
			click: '[data-testid="work-view-answers"]',
			until: `() => !!document.querySelector('[data-testid="work-answers"]')`,
			label: 'press Answers: the list replaces the worksheet'
		}
	],
	presence: [
		{ selector: '[data-testid="work-answers"]', label: 'the answers list', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.hx-frame-wrap', label: 'no worksheet frame while Answers is pressed', expectPresent: 0 },
		{ selector: '[data-testid="work-answers"] .answers-prompt', label: 'the two declared prompts', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="work-answers"] [data-testid="answer-link-open"]', label: 'an Open key per link in her answers', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="work-links"]', label: 'the work head’s links list', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{
			selector: '[data-testid="work-answers"]',
			label: 'whose answers, the question as written, and her words',
			must: ["Alice Alvarez's answers", 'What did you model today, and what took the longest?', 'Link to your presentation', 'Team Meridian']
		}
	],
	tapTargets: [
		{ selector: '[data-testid="work-view-worksheet"], [data-testid="work-view-answers"]', label: 'the Worksheet and Answers keys', min: 44 },
		{ selector: '[data-testid="work-answers"] [data-testid="answer-link-open"]', label: 'an Open key', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="work-answers"] .answers-value', label: 'an answer', min: 4.5 },
		{ selector: '[data-testid="work-answers"] .answers-prompt', label: 'a question', min: 4.5 },
		{ selector: '[data-testid="work-answers"] .answers-field', label: 'a field name', min: 4.5 },
		{ selector: '[data-testid="work-answers"] [data-testid="answer-link-host"]', label: 'a link’s host', min: 4.5 }
	],
	orderResult: [
		{
			label: 'the Open keys open the two links she handed in, in a new tab, with no opener',
			evaluate: `() => Array.from(document.querySelectorAll('[data-testid="work-answers"] [data-testid="answer-link-open"]')).map((a) => a.getAttribute('href') + ' ' + a.getAttribute('target') + ' ' + a.getAttribute('rel'))`,
			expected: [
				'https://www.canva.com/design/DAF-notes/view _blank noopener noreferrer',
				'https://docs.google.com/presentation/d/alice-deck/edit?usp=sharing _blank noopener noreferrer'
			]
		},
		{
			/* THE OTHER DIRECTION, ON THE SAME PAGE: Worksheet brings the frame
			   back and takes the list away. Pressed last, after every reading
			   above was taken on the Answers state. */
			label: 'pressing Worksheet brings the frame back and the list goes',
			evaluate: `async () => {
				const key = document.querySelector('[data-testid="work-view-worksheet"]');
				if (!key) return ['key=false'];
				key.click();
				for (let i = 0; i < 20 && !document.querySelector('.hx-frame-wrap'); i++) await new Promise((r) => setTimeout(r, 100));
				const back = ['frame=' + !!document.querySelector('.hx-frame-wrap'), 'list=' + !!document.querySelector('[data-testid="work-answers"]'), 'pressed=' + key.getAttribute('aria-pressed')];
				document.querySelector('[data-testid="work-view-answers"]')?.click();
				return back;
			}`,
			expected: ['frame=true', 'list=false', 'pressed=true']
		}
	]
};
