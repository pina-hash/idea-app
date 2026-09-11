// original array position 17 of 25 -- see ../README.md for what `order` means
export const order = 17;

export default {
	path: '/dev/notebook-review',
	label: 'Notebook review grid, the locked density contract and its seven states',
	/*
		THE GRID IS A LOCKED CONTRACT (CLAUDE.md): its density, its status
		glyphs, Share Tech Mono and the 1.9rem cell box are verified
		byte-identical after any restyle, and every status value carries a
		glyph, a label, a fill STYLE no other state uses, a `--nb-cell-*`
		token declared on all three plates AND A MEASURED CONTRAST FIGURE FOR
		EACH. That last clause is a standing obligation on a surface nothing
		automated has ever measured, which is the whole argument for listing
		this route: a token missing from one plate, or an ink that quietly
		stops clearing on the ground it is actually painted on, is invisible
		on screen and reddens no type check.

		0140 IS WHY IT IS URGENT RATHER THAN TIDY. `scheduled` is the seventh
		answer to the same question the other six answer, so it arrived with
		all of it -- key, label, glyph, dashed-vs-dotted fill, per-plate token
		-- and its contrast figure is now measured here (6.19:1) instead of
		once, by hand, in the bundle that added it.

		THE STATES PRESENT IN THIS FIXTURE ARE FIVE OF THE SEVEN, and the two
		absent ones are asserted as absent rather than left unmentioned: the
		section fixture produces no `ontime` and no `await` cell, so a
		contrast row naming either would report "no match" forever and read as
		a finding about the ink. The LEGEND is the assertion that covers all
		seven regardless -- it renders the same array the grid dispatches
		from, so a state that stopped being drawn stops being advertised.
	*/
	/*
		THE COLD-LOAD RACE, AND WHY THIS ROUTE NEEDS `waitFor`. The compliance
		grid arrives on an async transport. The FIRST visit to any route also
		pays vite's module-graph compile, and the run visits 375 before 1440 --
		so on the cold pass the grid had not landed 700ms after `waitForApp`
		returned and the page measured 0 cells, while the warm 1440 pass
		measured 30. That reads exactly like a console that renders no grid at
		phone width, and it is nothing of the kind: warm, BOTH widths render
		the identical 30 cells (`narrow="stack-nav-first"` puts the grid pane
		first, it is not dropped). A longer `settleMs` would paper over it
		until the payload got slower again; the predicate cannot.
	*/
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".cell").length > 0', timeoutMs: 20000 },
		/* The channel status lands on a microtask after subscribe, like the real
		   one; without this the pill row races the join on a cold pass. */
		{ waitFor: '() => !!document.querySelector(\'[data-testid="live-pill"]\')', timeoutMs: 10000 }
	],
	presence: [
		{ selector: '[data-testid="grid-scroll"]', label: 'compliance grid', expectPresent: 1 },
		{ selector: '.cell', label: 'grid cells', expectPresent: 30, maxPresent: 30 },
		/* SEVEN STATES PLUS THE not-reviewed DOT. The legend is always
		   visible on purpose -- CLAUDE.md forbids putting words in a cell to
		   satisfy a label audit, so this row and the hint above the grid are
		   what carry the meaning. */
		/* A CEILING, because "7 states + not-reviewed" is a closed set: a ninth
		   legend row means a state was added without the five contrast rows
		   below it being asked about, which is exactly what the locked contract
		   forbids arriving quietly. */
		{ selector: '.legend li', label: 'always-visible legend (7 states + not-reviewed)', expectPresent: 8, maxPresent: 8 },
		/* The two states this fixture does not produce, asserted as absent so
		   the five contrast rows below cannot be read as covering all seven. */
		{ selector: '.cell.ontime, .cell.await', label: 'states absent from this fixture (ontime, await)', expectPresent: 0, expectVisible: 0 },
		/*
			THE LIVE PILL, AND ITS PAIR ON `?realtime=stalled`. The default mode
			here JOINS, so this is the surface where the green pill is correct --
			and it is the POSITIVE CONTROL for the stalled route's absence row.
			Neither alone proves anything: an absence assertion with no matching
			presence is a selector that could have stopped matching, and a
			presence assertion with no matching absence is a pill that renders
			unconditionally, which is exactly what the defect was.
		*/
		{ selector: '[data-testid="live-pill"]', label: 'green Live pill (this mode joins)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="stalled-pill"]', label: '"not live" pill (must NOT render when the join succeeded)', expectPresent: 0, expectVisible: 0 }
	],
	contrast: [
		{ selector: '.cell.late', label: 'cell: late', min: 4.5 },
		{ selector: '.cell.flagged', label: 'cell: flagged', min: 4.5 },
		{ selector: '.cell.excused', label: 'cell: excused', min: 4.5 },
		{ selector: '.cell.missing', label: 'cell: missing', min: 4.5 },
		/* 0140's new value, measured rather than asserted. */
		{ selector: '.cell.scheduled', label: 'cell: scheduled (0140)', min: 4.5 }
	],
	/*
		24px, NOT 44px, AND THAT IS THE DOCUMENTED EXCEPTION RATHER THAN A
		RELAXATION. `IDEA_INTERFACE_STANDARDS` 10 exempts a control inside a
		locked density contract, because inflating the cell box to 44px would
		break the invariant the contract exists to hold -- and this grid is an
		instructor console, not a phone surface. Measured 30.4x30.4, which
		clears the floor that actually applies with room to spare.
	*/
	tapTargets: [{ selector: '.cell', label: 'grid cells (locked density: 24px floor)', min: 24 }],
	orderResult: [
		/*
			THE STICKY ROW HEADER MUST WIN AGAINST THE CELLS SCROLLING UNDER IT,
			AND NOTHING BUT A HIT TEST CAN SAY WHETHER IT DOES.

			The column is `position: sticky; left: 0` with an opaque background,
			and every `.cell` is `position: relative` for its badge -- so both
			are POSITIONED boxes, and until `z-index` was put on the column the
			cells (later in tree order) painted straight over it. Reported from
			production 2026-09-11 as rows reading "Abundiz, <chip>mma"; measured
			here at 375px scrolled to the end, 28.3% of "Newcomer, Dana" was
			under a chip and 3 of 13 probe points across the name's own text
			landed on a `button.cell`.

			EVERY STRING WAS STILL PRESENT while that was true, which is why no
			presence or textContains row caught it and why this is a hit test.
			It probes the name's OWN text box, left to right, and reports which
			element is actually on top at each point -- the same question a
			finger asks.

			IT NARROWS THE SCROLLPORT AND SCROLLS FULLY RIGHT FIRST. At rest the
			column overlaps nothing, so the check would pass at any stacking
			order; and at 1440 this fixture's grid overflows by only 24px against
			a 176px header, which is not enough room to slide a cell under the
			name at all -- mutated, the defect showed at 375 and could not show
			at 1440. Capping the scrollport to the header plus 120px puts both
			widths in the regime a class of thirty check-ins is in all the time,
			and the width is restored before the probe returns. The two trailing
			rows are the vacuity control: they say there was something to scroll
			and that the probe used all of it.
		*/
		{
			label: 'student names are not painted over by the cells (grid scrolled fully right)',
			evaluate: `async () => {
				const sc = document.querySelector('[data-testid="grid-scroll"]');
				if (!sc) return ['no grid'];
				const th = sc.querySelector('tbody th.name-col');
				if (!th) return ['no row header'];
				const widthWas = sc.style.maxWidth;
				sc.style.maxWidth = Math.round(th.getBoundingClientRect().width + 120) + 'px';
				await new Promise((r) => setTimeout(r, 150));
				sc.scrollLeft = sc.scrollWidth;
				await new Promise((r) => setTimeout(r, 300));
				const out = [];
				const rows = [...sc.querySelectorAll('tbody tr')].slice(0, 4);
				for (const tr of rows) {
					const name = tr.querySelector('th.name-col .student-name');
					if (!name) { out.push('no name cell'); continue; }
					const b = name.getBoundingClientRect();
					let covered = 0;
					for (let i = 0; i <= 12; i++) {
						const x = Math.min(b.left + (b.width * i) / 12, b.right - 0.5);
						const hit = document.elementFromPoint(x, b.top + b.height / 2);
						if (hit && hit.closest('.cell')) covered++;
					}
					out.push(covered + '/13 points under a cell');
				}
				const max = sc.scrollWidth - sc.clientWidth;
				out.push(max > 0 ? 'the grid does overflow' : 'nothing to scroll, so this check is vacuous');
				out.push(sc.scrollLeft >= max - 1 ? 'scrolled to the end' : 'did not reach the end');
				sc.style.maxWidth = widthWas;
				return out;
			}`,
			/* The two trailing rows are the control and are NOT a px figure: the
			   amount there is to scroll is a function of the width the run is
			   driving, so a number here would be right at one width and a
			   finding at the other. What has to hold at both is that there was
			   something to scroll and that the probe used all of it. */
			expected: [
				'0/13 points under a cell',
				'0/13 points under a cell',
				'0/13 points under a cell',
				'0/13 points under a cell',
				'the grid does overflow',
				'scrolled to the end'
			]
		},
		/*
			AND A CELL MUST STAY REACHABLE ONCE THE COLUMN PAINTS OVER IT. The
			two are one decision: the moment the header correctly covers the
			cells, a cell brought to the scrollport's left edge by
			`scrollIntoView({ inline: 'nearest' })` -- which the cursor effect
			calls on every arrow key -- lands BEHIND the header and cannot be
			clicked. `.table-scroll`'s `scroll-padding-left` is what tells the
			scroll the overlay is there; without it this route's own
			`.cell.late` prepare-click failed six attempts at 375px.
		*/
		/*
			THE FIRST data cell, REACHED FROM THE FAR RIGHT, and both halves of
			that matter. `inline: 'nearest'` scrolls the least it can, so a cell
			brought in from the right lands against the scrollport's RIGHT edge,
			which the header is nowhere near -- the defect cannot show there
			however the stacking is set, and a first draft of this row that
			scrolled that way had a positive control which refused to reproduce
			it. It is only a cell arriving at the LEFT edge, where the header
			sits, that the scroll can park underneath, and that is the cell an
			instructor reaches by holding the left arrow key.

			IT NARROWS THE SCROLLPORT FIRST, and that is what makes the row mean
			the same thing at both widths. The defect needs more overflow than
			the header is wide, and at 1440 this fixture's grid overflows by 24px
			against a 176px header -- so there is simply no room to park a cell
			behind it and the control came back "did NOT reproduce", which is a
			true statement about the fixture and a useless one about the code.
			Capping the scrollport to the header plus 120px puts both widths in
			the regime a real class of thirty check-ins is in all the time. The
			width is restored before the probe returns.

			(No backticks in the probe below. `evaluate` is a template literal,
			so one inside it ends the string and the file stops parsing.)
		*/
		{
			label: 'a cell scrolled into view lands clear of the sticky header, not behind it',
			evaluate: `async () => {
				const sc = document.querySelector('[data-testid="grid-scroll"]');
				const th = sc && sc.querySelector('tbody th.name-col');
				if (!sc || !th) return ['missing grid parts'];
				const target = sc.querySelector('tbody tr:first-child td .cell');
				if (!target) return ['no cell to scroll to'];
				const widthWas = sc.style.maxWidth;
				sc.style.maxWidth = Math.round(th.getBoundingClientRect().width + 120) + 'px';
				await new Promise((r) => setTimeout(r, 150));
				const run = async () => {
					sc.scrollLeft = sc.scrollWidth;
					await new Promise((r) => setTimeout(r, 150));
					target.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'instant' });
					await new Promise((r) => setTimeout(r, 250));
					return target.getBoundingClientRect().left >= th.getBoundingClientRect().right - 0.5;
				};
				const withPadding = await run();
				/* THE POSITIVE CONTROL, and it is the whole reason this row is
				   not vacuous: take the scroll padding away and the SAME scroll
				   must park the same cell behind the header. A check that has
				   never failed has not been tested. */
				const was = sc.style.scrollPaddingLeft;
				sc.style.scrollPaddingLeft = '0px';
				const withoutPadding = await run();
				sc.style.scrollPaddingLeft = was;
				sc.style.maxWidth = widthWas;
				return [
					withPadding ? 'clear of the header' : 'behind the header',
					withoutPadding ? 'control did NOT reproduce the defect' : 'control reproduces it without the padding'
				];
			}`,
			expected: ['clear of the header', 'control reproduces it without the padding']
		}
	]
};
