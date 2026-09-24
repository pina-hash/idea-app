/**
 * THE UPDATE LOG, GROUPED BY MONTH (ledger 0297, LEARN). `/classroom/updates`
 * renders `UpdatesPage` over the committed `classroom-updates.json`; the
 * harness mounts the same component under the same measure.
 *
 * The newest month is open and every older one is a closed Disclosure with
 * its count beside its name, months run newest first, and inside a month each
 * day prints its date once with that day's changes under it. The intro names
 * the report control by the word the header actually prints (it used to say
 * "Feedback button", which no control on the page is called).
 *
 * The number of months grows with the log, so the month count is a floor.
 */
const TOGGLES = '[data-testid^="update-month-"]';

export default {
	path: '/dev/classroom?view=updates',
	label: 'Classroom update log: grouped by month, newest open, older closed',
	prepare: [
		{ waitFor: `() => document.querySelectorAll('[data-testid="update-month"]').length > 1`, timeoutMs: 20000 },
		{
			label: 'how tall the page is with one month open',
			evaluate: `() => 'document ' + Math.round(document.documentElement.scrollHeight) + 'px tall; ' + document.querySelectorAll('[data-testid="update-entry"]').length + ' entries in the DOM'`
		}
	],
	presence: [
		{ selector: '[data-testid="updates-lead"]', label: 'the intro', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="update-month"]', label: 'months (a floor: the log grows)', expectPresent: 2 },
		{ selector: `${TOGGLES}[aria-expanded="true"]`, label: 'exactly one month open', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="updates-lead"]', label: 'the intro names the control by its printed word', must: ['Report'], mustNot: ['Feedback button'] }
	],
	contrast: [
		{ selector: '[data-testid="updates-lead"]', label: 'intro', min: 4.5 },
		{ selector: '.update-when', label: 'day heading', min: 4.5 },
		{ selector: '.update-title', label: 'entry title', min: 4.5 },
		{ selector: '.update-body', label: 'entry body', min: 4.5 },
		{ selector: TOGGLES, label: 'month toggle', min: 4.5 }
	],
	tapTargets: [{ selector: TOGGLES, label: 'month toggles' }],
	orderResult: [
		{
			label: 'the first month is the open one, months run newest first, no date prints twice in a month',
			evaluate: `() => {
				const toggles = [...document.querySelectorAll('${TOGGLES}')];
				const months = [...document.querySelectorAll('[data-testid="update-month"]')];
				const keys = months.map((m) => m.getAttribute('data-month'));
				const sorted = [...keys].sort().reverse();
				const dupes = months.filter((m) => { const d = [...m.querySelectorAll('.update-when')].map((h) => h.textContent.trim()); return new Set(d).size !== d.length; }).length;
				return [String(toggles[0]?.getAttribute('aria-expanded')), String(JSON.stringify(keys) === JSON.stringify(sorted)), String(dupes)];
			}`,
			expected: ['true', 'true', '0']
		},
		{
			label: 'an older month opens on a press and stays one control',
			evaluate: `async () => {
				const t = [...document.querySelectorAll('${TOGGLES}')][1];
				t.click();
				await new Promise((r) => setTimeout(r, 120));
				return [t.getAttribute('aria-expanded')];
			}`,
			expected: ['true']
		}
	]
};
