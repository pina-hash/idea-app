/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE PLAY FIGURES ON THE PAGE A STUDENT LANDS ON, MEASURED.
 *
 * `0204` (decision 07, answered public by Mr. Pina on 2026-09-12) opened three
 * previously owner-only metrics and added a caller-scoped read of a person's
 * own time with one app. Both were reachable only through `/foundry/mine` and
 * `/foundry/review` -- so the numbers were public in the database and visible
 * through the ADMIN controls alone, which is the opposite of what public was
 * answered to mean. This measures them where a student actually meets them:
 * the gallery's detail pane, after tapping a card.
 *
 * WHY A SPEC AND NOT ONLY A MOUNT TEST. `tests/dom/foundry-detail-stats.test.ts`
 * proves the structure -- which blocks render, what the transport was called
 * with, that a viewer who has never played gets nothing. It cannot prove a
 * single thing about this block being READABLE, because happy-dom has no layout
 * engine: a box reads 0 and a colour reads the empty string, and both pass
 * vacuously. Two figure grids and four notes added to a pane that already holds
 * a cover, a frame, a share block and two prose sections is exactly the shape
 * that overflows a 375px column, and ledger 0175 found three defects at these
 * two widths after every threshold in the suite had passed -- including a
 * ranked gallery showing no rank numbers at 1440, because the counts sat on
 * plates the hover reveal was hiding. So every row here asks `expectVisible`
 * and not only `expectPresent`.
 *
 * THE STATE IT MEASURES. The harness opens with `gallerySlug` already set to
 * 'hostile-probe', so the gallery's detail pane is open at load and no click is
 * needed to reach it -- which is the deep-link case a student following a
 * shared card takes. App A carries a real personal row (6 sessions) under real
 * public totals (42 plays, 11 people), so BOTH layers are on screen at once,
 * which is the arrangement that has to be read rather than either alone.
 *
 * THE ABSENCE IS NOT MEASURED HERE AND IS NOT UNMEASURED. "A viewer who has
 * never played sees the totals and no personal row" is a structural claim with
 * a positive control beside it in `tests/dom/`, where it can be driven in four
 * variants in milliseconds. A geometry harness proving an element is missing
 * measures nothing a mount test does not; what it is for is the page that IS
 * on screen.
 */

export default {
	path: '/dev/foundry-gallery?state=detail-stats',
	aliasOf: '/dev/foundry-gallery',
	label: 'Foundry: both play-stats layers in the gallery detail pane',
	prepare: [
		{
			/*
				THE GALLERY'S OWN BLOCK, AND THE PREDICATE NAMES THE WRAPPER
				RATHER THAN THE COMPONENT. `[data-testid="foundry-play-stats"]`
				matches TWICE on this harness -- the review half mounts one inside
				`FoundryInspector` -- so a wait on the bare testid is satisfied by
				the review pane's copy and would pass with the gallery's own
				block entirely absent, which is the defect this spec exists for.
				`.fdy-gal-plays` is the gallery detail pane's own wrapper and
				exists nowhere else.
			*/
			waitFor:
				'() => !!document.querySelector(".fdy-gal-plays [data-testid=\'foundry-my-play-stats\']")'
		}
	],
	presence: [
		/* THE TWO LAYERS, EACH EXACTLY ONE, SCOPED TO THE GALLERY PANE. The
		   ceilings matter as much as the floors: a second copy of either block
		   in one pane would be a figure repeated under two headings. */
		{ selector: '.fdy-gal-plays [data-testid="foundry-play-stats"]', label: 'public totals block, in the gallery detail pane', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fdy-gal-plays [data-testid="foundry-my-play-stats"]', label: 'the viewer\'s own playtime row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE FOUR PUBLIC FIGURES, VISIBLE. Present-but-clipped is the failure
		   mode a 375px column produces and the one a DOM test cannot see. */
		{ selector: '.fdy-gal-plays [data-testid="fdy-plays"]', label: 'plays', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fdy-gal-plays [data-testid="fdy-players"]', label: 'different players', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fdy-gal-plays [data-testid="fdy-seconds"]', label: 'total time played', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fdy-gal-plays [data-testid="fdy-last"]', label: 'last played', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* AND THE FOUR PERSONAL ONES. */
		{ selector: '.fdy-gal-plays [data-testid="fdy-my-plays"]', label: 'your sessions', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fdy-gal-plays [data-testid="fdy-my-seconds"]', label: 'your time played', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fdy-gal-plays [data-testid="fdy-my-first"]', label: 'first played', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fdy-gal-plays [data-testid="fdy-my-last"]', label: 'last played, yours', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE POSITIVE CONTROL FOR EVERY `.fdy-gal-plays` SELECTOR ABOVE: the
		   student page this block sits under is itself rendered, once. Without
		   it, a scoping mistake that matched nothing would read as ten quiet
		   zeroes rather than as a pane that never opened. */
		{ selector: '.fdy-gal-detail', label: 'the gallery detail pane itself', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		/* EVERY TIER IN THE BLOCK, because they are three different tokens on
		   the forge plate and only the figure is at reading weight. The labels
		   and both notes are the ones a token move would quietly sink. */
		{ selector: '.fdy-gal-plays [data-testid="foundry-play-stats"] h3', label: 'the block heading', min: 4.5 },
		{ selector: '.fdy-gal-plays .fdy-plays-mine-head', label: 'the personal layer heading', min: 4.5 },
		{ selector: '.fdy-gal-plays .fdy-plays-grid dt', label: 'figure labels', min: 4.5 },
		{ selector: '.fdy-gal-plays .fdy-plays-grid dd', label: 'the figures themselves', min: 4.5 },
		{ selector: '.fdy-gal-plays .fdy-plays-note', label: 'the coverage and privacy notes', min: 4.5 }
	],
	domOrder: [
		{
			/* THE PERSONAL ROW COMES AFTER THE PUBLIC TOTALS, which is a claim
			   about reading order and not about styling: the page answers what
			   this app is, then what everyone did with it, then what you did.
			   Read from `compareDocumentPosition` rather than from a class. */
			before: '.fdy-gal-plays [data-testid="fdy-plays"]',
			after: '.fdy-gal-plays [data-testid="fdy-my-plays"]',
			label: 'the public totals precede the viewer\'s own row'
		},
		{
			/* AND THE WHOLE BLOCK COMES AFTER "How this was built", which is the
			   end of what the student wrote. A block that drifted above the
			   student's own account of their work would be the numbers talking
			   over them. */
			before: '.fdy-gal-detail .fdy-detail',
			after: '.fdy-gal-plays',
			label: 'the figures sit below the student page, not inside it'
		}
	],
	textContains: [
		/* THE COVERAGE SENTENCE IS PART OF THE FIGURE (CLAUDE.md: every surface
		   that renders one of these numbers renders it, zero included). A
		   surface that quietly lost it is one where a student reads a portal
		   count as everything that ever happened to their app. `mustNot` is the
		   direction `must` cannot see. */
		{ selector: '.fdy-gal-plays', label: 'the coverage note travels with the figures on this surface too', must: ['Opening it from its own share link is not counted'], mustNot: [] },
		{ selector: '.fdy-gal-plays', label: 'the two rules, said in words rather than inferred', must: ['Nobody can see which students played an app', 'Only you can see this row'] }
	],
	orderResult: [
		{
			/*
				THE TWO GRIDS SPREAD WITH THE PANE, which is the whole reason
				`auto-fit` with a `min()` track is used rather than a fixed column
				count -- and is not assertable without a layout engine. The COLUMN
				COUNT is derived from the children's own left edges, so nothing here
				depends on a pixel figure a token could move.

				MEASURED, BOTH GRIDS AGREEING: 2 columns at 375 and 4 at 1440. A
				FIRST DRAFT OF THIS ROW EXPECTED ONE COLUMN AT 375 AND WAS WRONG
				ABOUT THE PAGE RATHER THAN FINDING A DEFECT IN IT -- the track is
				`minmax(min(9rem, 100%), 1fr)`, 144px, and the detail pane at 375 is
				wide enough for two of them with the gap. Two short figures side by
				side on a phone is the arrangement that rule exists to produce; the
				expectation moved, not the stylesheet.

				THE THRESHOLD IS INSIDE THE PROBE BECAUSE `orderResult` HAS NO
				PER-WIDTH EXPECTATION, which is the shape the full-screen spec's own
				height check takes. A PASS therefore prints a sentence; the failure
				branch returns the measured count and the width, so a red row still
				names the number it was.
			*/
			label: 'the figure grids spread with the pane: 2 columns at 375, 4 at 1440',
			evaluate: `() => { const grids = [...document.querySelectorAll('.fdy-gal-plays .fdy-plays-grid')]; if (grids.length !== 2) return ['EXPECTED 2 GRIDS, GOT ' + grids.length]; const want = innerWidth < 700 ? 2 : 4; return grids.map((g) => { const cols = new Set([...g.children].map((c) => Math.round(c.getBoundingClientRect().left))).size; return cols === want ? 'grid spreads with its pane' : cols + ' column(s) at ' + innerWidth + ', wanted ' + want; }); }`,
			expected: ['grid spreads with its pane', 'grid spreads with its pane']
		},
		{
			/*
				NOTHING IN THE BLOCK RUNS PAST THE PANE. `horizontal-scroll`
				measures the DOCUMENT and would be satisfied by a figure clipped
				inside an `overflow: hidden` ancestor -- which is exactly what a
				long locale timestamp in a 9rem track does. This reads each
				figure's own right edge against its grid's content box, so a value
				that is cut off rather than wrapped is a finding here even when the
				page does not scroll.
			*/
			label: 'no figure overruns its own grid',
			evaluate: `() => { const over = []; for (const g of document.querySelectorAll('.fdy-gal-plays .fdy-plays-grid')) { const gb = g.getBoundingClientRect(); for (const dd of g.querySelectorAll('dd, dt')) { const b = dd.getBoundingClientRect(); if (b.right > gb.right + 1) over.push((dd.dataset.testid || dd.tagName) + ' by ' + (b.right - gb.right).toFixed(1) + 'px'); } } return over.length ? over : ['every figure inside its grid']; }`,
			expected: ['every figure inside its grid']
		},
		{
			/*
				THE PERSONAL ROW IS NOT LARGER THAN THE TOTAL IT SITS UNDER. This
				is a claim about the FIXTURE being coherent rather than about the
				component, and it is here because an incoherent fixture is how a
				reader learns to distrust the pair -- six sessions inside
				forty-two plays is a page that makes sense, and six inside three
				is not. Read from the rendered text, so it also proves the two
				blocks are drawing from the two different reads.
			*/
			label: 'the personal figures are consistent with the totals above them',
			evaluate: `() => { const n = (sel) => Number((document.querySelector('.fdy-gal-plays [data-testid=\\'' + sel + '\\']')?.textContent || '').trim()); const all = n('fdy-plays'); const mine = n('fdy-my-plays'); return [Number.isFinite(all) && Number.isFinite(mine) && mine > 0 && mine <= all ? 'mine within total' : 'mine ' + mine + ' of ' + all]; }`,
			expected: ['mine within total']
		}
	]
};
