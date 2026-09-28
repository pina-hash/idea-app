/**
 * MY CLASSES AND THE CLASS STRIP WITH ARCHIVED CLASSES (report R12,
 * 2026-09-28: "it is difficult to differentiate between archived classes and
 * active classes ... the top left quick class election buttons will be clogged
 * up pretty fast").
 *
 * The harness is /dev/classroom-todo, which mounts the REAL MyClasses inside
 * the REAL ClassroomShell; `?archived=1` adds three of last year's classes
 * (active: false) to the four the fixture always had. What must hold:
 *
 *   - My Classes lists the four ACTIVE classes first, and the three archived
 *     ones sit under one Archived disclosure that is CLOSED by default, with
 *     its count on its own line while closed;
 *   - the header strip carries the four active keys and ONE Archived key, and
 *     its list is not open until pressed;
 *   - no horizontal scroll at either width (the harness's own baseline).
 *
 * `classroom-todo-archived-1-state-strip-open` opens the strip's list, and
 * `classroom-todo-archived-1-current-s-old-eng` stands on an archived class.
 */
import { ARCHIVED, ARCHIVED_READY } from './_classroom-todo.mjs';

export default {
	path: ARCHIVED,
	label: 'My Classes with archived classes: active first, Archived closed below, one Archived key in the strip',
	prepare: [ARCHIVED_READY],
	presence: [
		{ selector: '[data-testid="my-classes-active"] a.class-card', label: 'the four active classes, in the grid', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="my-classes-archived-toggle"]', label: 'the Archived disclosure', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="my-classes-archived-toggle"][aria-expanded="false"]', label: 'closed by default', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="my-classes-archived-count"]', label: 'its count, visible while closed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="my-classes-archived"] a.class-card', label: 'the three archived cards, in the DOM and hidden', expectPresent: 3, maxPresent: 3, expectVisible: 0, maxVisible: 0 },
		{ selector: '[data-testid="my-classes-none-active"]', label: 'the "none running" sentence (absent: four classes are active)', expectPresent: 0 },
		/* The strip scrolls at 375, so its keys are counted, not required on
		   screen: the positive control is the four active keys. */
		{ selector: '[data-testid="class-strip"] [data-testid="class-icon"]', label: 'strip keys: the four active classes only', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="class-strip"] [data-testid="class-icon"].archived', label: 'no archived class keeps a key of its own here', expectPresent: 0 },
		{ selector: '[data-testid="class-strip-archived"]', label: 'the strip Archived key', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="class-strip-archived"][aria-expanded="false"]', label: 'its list closed', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="class-strip-archived-list"]', label: 'its list, in the DOM and hidden', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 0 }
	],
	textContains: [
		{ selector: '[data-testid="my-classes-archived-count"]', label: 'the count says how many, in words', must: ['3 classes'] },
		{ selector: '[data-testid="my-classes-archived-toggle"]', label: 'the disclosure names itself and says Show', must: ['Archived', 'Show'] },
		{ selector: '[data-testid="class-strip-archived"]', label: 'the strip key says Archived and how many', must: ['Archived', '3 classes'] }
	],
	domOrder: [
		{ before: '[data-testid="my-classes-active"]', after: '[data-testid="my-classes-archived"]', label: 'active classes come before the Archived section' }
	],
	tapTargets: [
		{ selector: '[data-testid="my-classes-archived-toggle"]', label: 'the Archived disclosure', min: 44 },
		{ selector: '[data-testid="class-strip-archived"]', label: 'the strip Archived key', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="my-classes-active"] .class-code', label: 'class code (the card ink, report R14)', min: 4.5 },
		{ selector: '[data-testid="my-classes-active"] .class-cta', label: 'Open (the card ink)', min: 4.5 },
		{ selector: '[data-testid="my-classes-archived-toggle"] .disc-label', label: 'the word Archived', min: 4.5 },
		{ selector: '[data-testid="my-classes-archived-count"]', label: 'the archived count', min: 4.5 },
		{ selector: '[data-testid="class-strip-archived"] .cls-code', label: 'the strip key word', min: 4.5 }
	],
	orderResult: [
		{
			label: 'the active cards are the four active classes, in the order the strip draws them',
			evaluate: `() => [...document.querySelectorAll('[data-testid="my-classes-active"] .class-code')].map((e) => e.textContent.trim())`,
			expected: ['ENG1H', 'FRC', 'IDEA100', 'IDEA209H']
		}
	]
};
