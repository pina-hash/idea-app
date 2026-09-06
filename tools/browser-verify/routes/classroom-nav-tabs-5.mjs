export default {
	path: '/dev/classroom-nav?tabs=5',
	label: 'The tab bar the day the duplicates page lands: five tabs on a phone',
	/* THE STATE THE SHIPPING TREE CANNOT REACH, and the only one that says
	   anything about the wrapping rule.

	   `/classroom/[sectionId]/duplicates` is on the unmerged branch
	   `claude/duplicate-drafts-count-wzworl` behind an unapplied migration, so
	   its tab is a LOCAL fixture in the harness page rather than an entry in
	   `sectionTabs()` -- shipping the tab would offer every manager a 404,
	   which is worse than the typed URL it was meant to replace. What can be
	   measured now, and is measured here, is whether the BAR survives the tab.

	   MEASURED, 2026-09-06: with `flex-wrap: wrap` the five tabs take two rows
	   at 375px and the document stays 375px wide. With the rule forced to
	   `nowrap` on the same page, the same five tabs take one row and push the
	   document to 401px -- 26px of horizontal overflow on a phone, which is
	   the Coin Ledger reachability defect prompt 0025 spent a bundle undoing.
	   The negative control below is what makes the first number mean
	   something. */
	presence: [
		{ selector: '[data-testid^="section-tab-"]', label: 'five tabs (four shipped plus the duplicates fixture)', expectPresent: 5, maxPresent: 5, expectVisible: 5 }
	],
	tapTargets: [
		{ selector: '[data-testid="section-tabs"] a', label: 'section tabs at five', min: 44 }
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
				const overflowNowrap = d.scrollWidth > d.clientWidth;
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
			label: 'five tabs wrap rather than pushing the document wider, and nowrap does overflow where it would'
		}
	]
};
