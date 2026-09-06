export default {
	path: '/dev/classroom-nav',
	label: 'Section tab bar with the check-ins departure, and the GREENLINE card in three states',
	/* THE DOORS THIS LANE ADDED, at the two widths, mounted through the REAL
	   ClassroomShell fed by the REAL `sectionTabs()` and the REAL
	   GreenlineDashboardCard fed by real `GreenlinePending` values.

	   WHY THIS SPEC EXISTS RATHER THAN AN ASSERTION IN `tests/`. Everything
	   below is geometric or perceptual -- a tap box, a contrast ratio against
	   the ground the card actually sits on, whether four tabs still fit a
	   phone -- and `tests/dom/` has no layout engine, so every one of those
	   claims written there would read zero and pass vacuously. The structural
	   half (which tabs exist, which are offered to whom, which activates) is
	   asserted in `tests/classroom-nav-doors.test.ts` and is deliberately not
	   restated here. */
	contrast: [
		{ selector: '[data-testid="gl-case-waiting"] [data-testid="greenline-pending"]', label: 'GREENLINE card, queue holding work', min: 4.5 },
		{ selector: '[data-testid="gl-case-empty"] [data-testid="greenline-pending"]', label: 'GREENLINE card, nothing waiting', min: 4.5 },
		{ selector: '[data-testid="gl-case-unready"] [data-testid="greenline-pending"]', label: 'GREENLINE card, count unavailable', min: 4.5 },
		{ selector: '[data-testid="section-tabs"] .sec-tab', label: 'section tabs', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="section-tabs"] a', label: 'section tabs (four, including the departure)', min: 44 },
		{ selector: '[data-testid="greenline-cards"] a.btn', label: 'GREENLINE card, Open panel', min: 44 }
	],
	presence: [
		/* Four tabs for a manager, and the fourth is the one this lane added.
		   A floor AND a ceiling: a fifth tab appearing here means somebody
		   shipped the duplicates tab without the page, which is the 404 this
		   lane refused. */
		{ selector: '[data-testid^="section-tab-"]', label: 'section tabs (manager)', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="section-tab-check-ins"]', label: 'the check-ins departure', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE POSITIVE CONTROL FOR THE ABSENCE BELOW. Without it, "no
		   duplicates tab" cannot be told from "the selector was renamed". */
		{ selector: '[data-testid="section-tab-grades"]', label: 'Grades (positive control for the absence below)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="section-tab-duplicates"]', label: 'duplicates tab (absent: the page is not on this base)', expectPresent: 0 },
		{ selector: '[data-testid="greenline-pending"]', label: 'GREENLINE pending line, all three states', expectPresent: 3, maxPresent: 3, expectVisible: 3 }
	],
	textContains: [
		{ selector: '[data-testid="gl-case-waiting"]', label: 'the count, and which queue it is in', must: ['3 AWAITING REVIEW', '2 tracks', '1 decal'] },
		/* ZERO IS A SENTENCE. A card that read "0 AWAITING REVIEW", or that
		   simply dropped the line, is indistinguishable from a card that broke. */
		{ selector: '[data-testid="gl-case-empty"]', label: 'zero looks deliberate', must: ['NOTHING AWAITING REVIEW'], mustNot: ['0 AWAITING REVIEW'] },
		{ selector: '[data-testid="gl-case-unready"]', label: 'an unreadable count is not zero', must: ['REVIEW QUEUE'], mustNot: ['AWAITING REVIEW'] },
		/* The superseded copy: every noun in it was about a track that is
		   ALREADY published, on the one card that leads to a queue of tracks
		   that are not. */
		{ selector: '[data-testid="greenline-cards"]', label: 'the 0057 publish-then-moderate copy is gone', mustNot: ['Published GREENLINE community tracks'] }
	],
	orderResult: [
		{
			/* THE ONE CLAIM THAT NEEDS ITS OWN NEGATIVE CONTROL, taken in one
			   evaluation so both numbers come off the same layout: with the bar
			   wrapping, the four shipped tabs sit on one row at both widths and
			   the document never exceeds the viewport. Forcing `nowrap` on and
			   releasing it is what proves the wrap is a rule rather than
			   something incidentally true at this tab count -- at four tabs it
			   changes nothing, which is the honest answer here and is exactly
			   why the five-tab spec beside this one exists.

			   ARRAY OF LABELLED FACTS, because `orderResult` compares arrays
			   element for element and refuses anything else (see checks.mjs).
			   Every entry is width-independent on purpose: a row count that
			   differs between 375 and 1440 cannot be one `expected`. */
			evaluate: `() => {
				const d = document.documentElement;
				const bar = document.querySelector('[data-testid="section-tabs"]');
				const tabs = [...bar.querySelectorAll('a')];
				const rows = () => new Set(tabs.map((a) => Math.round(a.getBoundingClientRect().top))).size;
				const wrap = getComputedStyle(bar).flexWrap;
				const before = { overflow: d.scrollWidth > d.clientWidth, rows: rows() };
				const style = document.createElement('style');
				style.textContent = '[data-testid="section-tabs"]{flex-wrap:nowrap !important}';
				document.head.appendChild(style);
				bar.getBoundingClientRect();
				const forcedRows = rows();
				style.remove();
				bar.getBoundingClientRect();
				return [
					'wrap:' + wrap,
					'tabs:' + tabs.length,
					'document-overflows:' + before.overflow,
					'rows:' + before.rows,
					'rows-if-nowrap-forced:' + forcedRows
				];
			}`,
			expected: [
				'wrap:wrap',
				'tabs:4',
				'document-overflows:false',
				'rows:1',
				'rows-if-nowrap-forced:1'
			],
			label: 'the four shipped tabs fit one row at both widths, wrap on or off'
		}
	]
};
