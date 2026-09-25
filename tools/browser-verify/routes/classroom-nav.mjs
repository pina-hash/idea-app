export default {
	path: '/dev/classroom-nav',
	label: "Section tab bar at five tabs, the class's Notebook tab inside the class, Duplicates out of the bar, and the GREENLINE card in three states",
	/* THE DOORS THIS LANE ADDED, at the two widths, mounted through the REAL
	   ClassroomShell fed by the REAL `sectionTabs()` and the REAL
	   GreenlineDashboardCard fed by real `GreenlinePending` values.

	   WHY THIS SPEC EXISTS RATHER THAN AN ASSERTION IN `tests/`. Everything
	   below is geometric or perceptual -- a tap box, a contrast ratio against
	   the ground the card actually sits on, whether five tabs still fit a
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
		{ selector: '[data-testid="section-tabs"] a', label: 'section tabs (five)', min: 44 },
		{ selector: '[data-testid="greenline-cards"] a.btn', label: 'GREENLINE card, Open panel', min: 44 }
	],
	presence: [
		/* Five tabs for a manager: ledger 0297 replaced 0081's Check-ins
		   departure with the class's own Notebook tab and added Live, and ledger
		   0298 (report 28) took Duplicates out of the bar. A floor AND a
		   ceiling, so a sixth tab appearing here is a finding. */
		{ selector: 'a[data-testid^="section-tab-"]', label: 'section tabs (manager)', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="section-tab-live"]', label: 'the Live tab', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="section-tab-notebook"]', label: "the class's Notebook tab", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="section-tab-check-ins"]', label: 'the retired check-ins departure (must be absent)', expectPresent: 0 },
		{ selector: '[data-testid="section-tab-grades"]', label: 'Grades', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* DUPLICATES IS NOT A TAB (ledger 0298, report 28): its page, its 404
		   gate and its palette command stay, and its door on the class page is
		   measured by classroom-tour-s-1-manage-1-tour-offered-dupes-2.mjs.
		   Asserted absent on the rendered bar, with Grades above as the
		   positive control; `tests/classroom-nav-doors.test.ts` holds the page
		   and its doors together. */
		{ selector: '[data-testid="section-tab-duplicates"]', label: 'the duplicates tab (out of the bar)', expectPresent: 0 },
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
			/* THE NEGATIVE CONTROL IS THE MEASUREMENT. Wrapping only means
			   something where the bar is one tab too wide for its box, so the
			   probe works out whether it IS -- from the tabs' own widths and
			   the bar's own content box, never from a pinned pixel figure --
			   and then asserts that forcing `nowrap` overflows the document
			   exactly when it is. At 375px that is true (measured 2026-09-06:
			   five tabs on two rows and a 375px document with wrap, one row and
			   a 401px document without it, on a 375px viewport). At 1440px
			   there is room either way and the same statement is true the other
			   way round, which is why it is phrased as an equivalence rather
			   than as a pixel count: a row count that differs between the two
			   widths cannot be one `expected`, and a fixture asserting 26px of
			   overflow at 1440 would be asserting a number the layout does not
			   produce. */
			evaluate: `() => {
				const d = document.documentElement;
				const bar = document.querySelector('[data-testid="section-tabs"]');
				const tabs = [...bar.querySelectorAll('a')];
				const cs = getComputedStyle(bar);
				const inner =
					bar.getBoundingClientRect().width -
					parseFloat(cs.paddingLeft) -
					parseFloat(cs.paddingRight);
				const gap = parseFloat(cs.columnGap) || 0;
				const needed =
					tabs.reduce((n, a) => n + a.getBoundingClientRect().width, 0) + gap * (tabs.length - 1);
				const tooWide = needed > inner + 0.5;
				const rows = () => new Set(tabs.map((a) => Math.round(a.getBoundingClientRect().top))).size;
				const overflowWrapped = d.scrollWidth > d.clientWidth;
				const rowsWrapped = rows();
				const style = document.createElement('style');
				style.textContent = '[data-testid="section-tabs"]{flex-wrap:nowrap !important}';
				document.head.appendChild(style);
				bar.getBoundingClientRect();
				/* Since ledger 0297 the chrome row contains its own overflow, so
				   forcing one line no longer widens the DOCUMENT: it pushes the
				   last tab past the viewport's edge, which is the harm itself. */
				const overflowNowrap =
					d.scrollWidth > d.clientWidth ||
					tabs.some((a) => a.getBoundingClientRect().right > d.clientWidth + 0.5);
				style.remove();
				bar.getBoundingClientRect();
				return [
					'tabs:' + tabs.length,
					'document-overflows-with-wrap:' + overflowWrapped,
					'rows-match-what-the-width-needs:' + (rowsWrapped === (tooWide ? 2 : 1)),
					'nowrap-overflows-exactly-when-the-bar-is-too-wide:' + (overflowNowrap === tooWide)
				];
			}`,
			expected: [
				'tabs:5',
				'document-overflows-with-wrap:false',
				'rows-match-what-the-width-needs:true',
				'nowrap-overflows-exactly-when-the-bar-is-too-wide:true'
			],
			label: 'the five shipped tabs wrap rather than pushing the document wider, and nowrap does overflow exactly where it would'
		}
	]
};
