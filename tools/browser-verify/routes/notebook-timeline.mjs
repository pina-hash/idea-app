/**
 * ONE CLASS'S NOTEBOOK TIMELINE (ledger 0297, package F4b): the student's
 * entries, hand-ins and assignment photos in date order, in the real shell on
 * the Notebook tab. Asserted: three school days, the three kinds of event all
 * present (the assignment's photos are the point: paper photographed into an
 * assignment counts here without being photographed twice), the streak in
 * words, and every link clearing 44px.
 */
export default {
	path: '/dev/notebook-timeline',
	label: "A class's notebook timeline, student (entries, hand-ins and assignment photos, with the streak)",
	prepare: [{ waitFor: '() => document.querySelectorAll(\'[data-testid="nbt-event"]\').length >= 5', timeoutMs: 20_000 }],
	presence: [
		{ selector: '[data-testid="section-tab-notebook"][aria-current="page"]', label: 'Notebook tab, current', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="nbt-day"]', label: 'school days', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="nbt-event"][data-kind="entry"]', label: 'notebook entries', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="nbt-event"][data-kind="hand-in"]', label: 'hand-ins', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="nbt-event"][data-kind="photos"]', label: "an assignment's photos", expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="nbt-streak"]', label: 'the streak', expectPresent: 1, maxPresent: 1 }
	],
	orderResult: [
		{
			label: 'the streak reads three class days, and days run newest first',
			evaluate: `() => [
				document.querySelector('[data-testid="nbt-streak"]').textContent.replace(/\\s+/g, ' ').trim(),
				[...document.querySelectorAll('.nbt-day-head')].map((h) => h.textContent.trim()).join(' | ')
			]`,
			expected: ['▮ 3 class days in a row', 'Today | Sep 22 | Sep 21']
		}
	],
	contrast: [
		{ selector: '.nbt-kind', label: 'event kinds', min: 4.5 },
		{ selector: '.nbt-link', label: 'event links', min: 4.5 },
		{ selector: '.nbt-day-head', label: 'day headings', min: 4.5 },
		{ selector: '[data-testid="nbt-streak"]', label: 'streak', min: 4.5 }
	],
	tapTargets: [{ selector: '.nbt-link', label: 'event links', min: 44 }],
	ignoreConsole: ['\\[40[0-9] http://127\\.0\\.0\\.1:\\d+/api/classroom/submission-file/']
};
