/**
 * THE MISSING FILTER, pressed, as a student (report 19).
 *
 * The page after one press of "Missing": the assignment past its due TIME with
 * nothing turned in, and the check-in whose DAY is behind the loader's one
 * clock -- and nothing else. The check-in dated today (8pm Pacific on the
 * 27th, which is already the 28th in UTC) must NOT be here, which is the
 * one-clock claim this state exists to measure in a real browser.
 *
 * THE TEACHER'S UNITS STAY: the missing assignment still reads inside Unit 2,
 * and every unit with nothing left in it is gone rather than empty. The count
 * and the Clear control are on screen whenever something is narrowing.
 *
 * `/dev/classroom-palette/s-1?manage=0` is the positive control: the same
 * route at rest renders all 14 rows in the same order.
 */
import { READY, STREAM_ROWS, STUDENT } from './_classroom-palette.mjs';

export default {
	path: `${STUDENT}&state=missing`,
	aliasOf: STUDENT,
	label: 'Class search (student): Missing pressed',
	prepare: [
		READY,
		{
			click: '[data-testid="stream-status-missing"]',
			until: '() => document.querySelector(\'[data-testid="stream-status-missing"]\')?.getAttribute("aria-pressed") === "true"'
		}
	],
	orderResult: [
		{
			label: 'only what is missing, inside its own unit',
			evaluate: STREAM_ROWS,
			expected: ['u-2:item:i-missing', 'unfiled:checkin:Day 12 sketches']
		}
	],
	textContains: [
		{ selector: '[data-testid="stream-find-result"]', label: 'a count of what is shown', must: ['2 of 14 shown'] }
	],
	presence: [
		{ selector: '[data-testid="stream-clear"]', label: 'a Clear control while narrowing', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="unit-group"]', label: 'the two units with something left, never an empty one', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="stream-find-none"]', label: 'no "No items match" when something matched', expectPresent: 0 }
	],
	contrast: [{ selector: '[data-testid="stream-find-result"] span', label: 'the shown count', min: 4.5 }],
	tapTargets: [
		{ selector: '[data-testid="stream-clear"]', label: 'Clear' },
		{ selector: '.find-chip', label: 'status chips' }
	]
};
