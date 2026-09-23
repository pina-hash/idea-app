/**
 * THE TO-DO'S MISSING VIEW, reached by PRESSING it (ledger 0297).
 *
 * Missing is the one predicate the class page's Missing filter and its row
 * chip also ask: an assignment past its due TIME with nothing turned in (a
 * saved draft included), and a check-in whose DAY is behind the loader's one
 * clock. So at 8pm Pacific on the 27th:
 *   - 8am today is missing and 11:58pm tonight is not;
 *   - the check-in dated yesterday is missing and the one dated today is not
 *     (it stays on Assigned, which `classroom-todo-todo` measures);
 *   - a draft past its deadline reads "Missing, draft saved", never
 *     "In progress".
 * Grouped This week, Last week, Earlier, by the school's Sunday-start week.
 *
 * THE PRESS WRITES THE VIEW INTO THE ADDRESS WITHOUT A NAVIGATION, so the
 * back button and a copied link land on the same view: `?view=missing` after
 * the press is read back below.
 */
import { TODO, TODO_COUNTS, TODO_PRESSED, TODO_READY, TODO_ROWS, TODO_STATES } from './_classroom-todo.mjs';

export default {
	path: `${TODO}?state=missing`,
	aliasOf: TODO,
	label: "A student's to-do: Missing pressed",
	prepare: [
		TODO_READY,
		{
			click: '[data-testid="todo-view-missing"]',
			until: '() => document.querySelector(\'[data-testid="todo-view-missing"]\')?.getAttribute("aria-pressed") === "true"'
		}
	],
	orderResult: [
		{
			label: 'only what is missing, by the school week',
			evaluate: TODO_ROWS,
			expected: [
				'this-week: item:i-truss',
				'this-week: item:i-bracket',
				'this-week: check-in:ns-12:s-eng',
				'this-week: check-in:ns-10:s-idea',
				'last-week: item:i-gears',
				'earlier: item:i-safety'
			]
		},
		{
			label: 'each missing row says so in words',
			evaluate: TODO_STATES,
			expected: ['Missing', 'Missing, draft saved', 'Not filed yet', 'Draft, not turned in', 'Missing', 'Missing']
		},
		{
			label: 'every missing row wears the missing tone',
			evaluate: `() => [...new Set([...document.querySelectorAll('[data-testid="todo-row"]')].map((r) => r.getAttribute('data-tone')))]`,
			expected: ['missing']
		},
		{ label: 'the counts do not move with the view', evaluate: TODO_COUNTS, expected: ['9', '6', '4'] },
		{ label: 'Missing is the pressed view, and only Missing', evaluate: TODO_PRESSED, expected: ['missing'] },
		{ label: 'the view is in the address', evaluate: '() => [location.search]', expected: ['?view=missing'] }
	],
	presence: [
		{ selector: '[data-testid="todo-row"]', label: 'missing rows', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		/* The deadline later tonight and the check-in dated today are owed, not
		   missing: absent here, beside the six present above. */
		{ selector: '[data-testid="todo-row"][data-key="item:i-loadlog"], [data-testid="todo-row"][data-key="check-in:ns-13:s-idea"]', label: 'nothing due later today', expectPresent: 0 },
		{ selector: '.todo-chip .todo-chip-mark', label: 'a mark beside every missing word (colour is never the only signal)', expectPresent: 6, maxPresent: 6, expectVisible: 6 }
	],
	contrast: [
		{ selector: '[data-testid="todo-state"]', label: 'missing chip', min: 4.5 },
		{ selector: '.todo-view[aria-pressed="true"] .todo-view-word', label: 'pressed view word', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.todo-view', label: 'view controls' },
		{ selector: '[data-testid="todo-row"]', label: 'rows' }
	]
};
