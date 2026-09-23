/**
 * THE FIRST SPEC IN THIS HARNESS THAT MEASURES WHETHER A PAGE CAN BE SCROLLED,
 * and it exists because report 0276 was a student saying it could not be:
 * "I cant scroll on the home page. I reloaded and tried different mouses."
 *
 * WHAT THE AUDIT FOUND, MEASURED AT THE REPORTER'S OWN 2707x1074. The wheel
 * was never blocked: `position: fixed` does not absorb a wheel event, so with
 * the first-login pathway sheet up a real trusted wheel moved the document its
 * full 415px range. It was INVISIBLE. Across that entire range, with every
 * animation stilled so the diff isolated scroll-induced change, 7.9% of the
 * viewport's pixels changed with the sheet up against 27.5% with it hidden on
 * the same page and the same scroll -- a 100%-viewport sheet with a fixed,
 * centred panel, and nothing in front of the reader moving. A scroll that
 * works and cannot be seen is worse than one that refuses, because a refusal
 * is legible and this reads as a broken mouse.
 *
 * SO THE PROPERTY THIS SPEC PINS IS A PAIR, AND EITHER HALF ALONE IS A
 * REGRESSION: while the sheet owns the screen the page is genuinely LOCKED
 * (the blocked state is true rather than nearly-true), and dismissing it
 * through the scrim RESTORES the scroll. A lock that leaks is the same defect
 * with a different cause, and it is the one nobody would report -- the sheet is
 * gone, so there is nothing on screen to blame.
 *
 * WHY THE LOCK IS ASSERTED THROUGH `body`'s COMPUTED `overflow-y` AND NOT
 * THROUGH A SCROLL. A route spec's only in-page verbs are `evaluate` and a
 * coordinate click; it cannot reach Playwright's `page.mouse.wheel`. And
 * `window.scrollTo` is NOT governed by the lock -- measured both ways: with
 * `body { overflow: hidden }` in force a real trusted wheel goes 0 -> 0 while
 * a programmatic `scrollTo(0, 99999)` still reaches 438px. A predicate written
 * on `scrollTo` would therefore have passed with the lock REMOVED, which is
 * the whole defect, and passed for the wrong reason. The computed value is the
 * thing the wheel actually responds to, and the equivalence was measured once
 * with a real wheel (locked 0 -> 0, cleared 0 -> 300, and again after a
 * reload) rather than assumed. The trusted-wheel reading itself lives in this
 * bundle's history entry, which is where a measurement no spec format can take
 * belongs.
 *
 * WIDTHS. This runs at the harness's own 375 and 1440. It is ALSO meant to be
 * driven at the reporter's width, which is not in the global list:
 *
 *     npm run verify:browser -- --route tour --width 2707
 *
 * Steps 1 and 3 are annotated "the predicate ALREADY HELD before the step
 * ran" and that is correct rather than a defect: both are pure ASSERTIONS
 * about a state the page arrives in, so there is nothing for their
 * predicate to discriminate. Step 2 is the one that changes state, and it
 * carries no such annotation -- which is the reading to check first if this
 * spec is ever edited.
 *
 * 2707 was deliberately NOT added to `WIDTHS` in `_shared.mjs`: that list is
 * global, so a third entry would drive all 236 specs at a width none of them
 * was designed against, adding 236 runs and a spray of findings on surfaces
 * this bundle does not own. See ../README.md.
 */

/* Every point sampled is inside the overlay's own 1rem padding ring or below
   the panel, so each is outside the panel at every width this is driven at --
   verified by hit test at 375x1074, 375x640, 1440x1074 and 2707x1074, where
   all three resolved to `.pwp-scrim`. */
const LOCKED_AND_REACHABLE = `() => {
	const overlay = document.querySelector('.pwp-overlay');
	const panel = document.querySelector('.pwp-panel');
	const scrim = document.querySelector('.pwp-scrim');
	const hint = document.querySelector('.pwp-hint');
	const later = document.querySelector('.pwp-later');
	if (!overlay || !panel || !scrim || !hint || !later) {
		return { ok: false, why: 'the sheet did not mount: ' + [['overlay',overlay],['panel',panel],['scrim',scrim],['hint',hint],['later',later]].filter((p) => !p[1]).map((p) => p[0]).join(', ') };
	}
	const bodyOverflow = getComputedStyle(document.body).overflowY;
	/* THE SCRIM HAS TO BE HIT, NOT MERELY PRESENT. Its own centre is INSIDE the
	   panel (the panel is centred over it), so a check that clicked the
	   element's midpoint would press a pathway tile instead and prove nothing
	   about the scrim at all. */
	const pts = [[4, 4], [8, 8], [Math.round(innerWidth / 2), innerHeight - 4]];
	const hits = pts.map(([x, y]) => {
		const el = document.elementFromPoint(x, y);
		return { at: x + ',' + y, isScrim: el === scrim, got: el ? (el.className || el.tagName) : 'null' };
	});
	const laterBox = Math.round(later.getBoundingClientRect().height);
	return {
		ok: bodyOverflow === 'hidden' && hits.every((h) => h.isScrim) && laterBox >= 44,
		bodyOverflowY: bodyOverflow,
		scrimHits: hits.filter((h) => h.isScrim).length + ' of ' + hits.length,
		missed: hits.filter((h) => !h.isScrim).map((h) => h.at + ' -> ' + h.got),
		chooseLaterHeight: laterBox,
		hint: hint.textContent.trim(),
		range: document.documentElement.scrollHeight - innerHeight
	};
}`;

/* Clicks WHATEVER IS AT the corner rather than the scrim by selector, so the
   step is sensitive to the scrim being covered: if anything else were on top,
   this would press that instead and the predicate below would not hold. */
const DISMISS_VIA_SCRIM = `() => {
	const el = document.elementFromPoint(8, 8);
	const which = el ? (el.className || el.tagName) : 'null';
	if (el) el.click();
	return 'pressed whatever sits at (8,8): ' + which;
}`;

export default {
	path: '/dev/tour?mode=picker',
	label:
		'Home page with the first-login pathway sheet up: the page is LOCKED behind it, and the scrim gives it back (report 0276)',
	/* `ssr = false` on this route, so nothing is in the markup until hydration;
	   the picker then waits on page data and the tour on a 500ms settle timer.
	   The default settle is short for that. */
	settleMs: 1200,
	prepare: [
		{
			evaluate: LOCKED_AND_REACHABLE,
			/* The POSITIVE CONTROL for everything below it. If the sheet does not
			   mount -- a fixture change, a render-gate change, a deferral left in
			   storage -- this reddens, rather than the dismissal quietly
			   succeeding against a page that never had an overlay on it. */
			until: `() => {
				const o = document.querySelector('.pwp-overlay');
				const s = document.querySelector('.pwp-scrim');
				return !!o && !!s && getComputedStyle(document.body).overflowY === 'hidden'
					&& document.elementFromPoint(8, 8) === s;
			}`,
			waitMs: 150
		},
		{
			evaluate: DISMISS_VIA_SCRIM,
			/* BOTH HALVES, AND THE SECOND IS THE ONE THAT WOULD GO UNREPORTED. The
			   overlay being gone is visible to anyone; a body left locked after it
			   unmounts is a page that silently never scrolls again, with nothing on
			   screen to blame for it. */
			until: `() => {
				const gone = !document.querySelector('.pwp-overlay') && !document.querySelector('.pwp-scrim');
				const unlocked = getComputedStyle(document.body).overflowY !== 'hidden';
				return gone && unlocked;
			}`,
			waitMs: 250
		},
		{
			/* THE SCROLL RANGE, REPORTED RATHER THAN THRESHOLDED. It is a property
			   of the viewport and of how many cards the fixture carries, so a
			   number pinned here would be a ratchet; what it is worth is being
			   READABLE at each width in the pass. Every home block is
			   `max-width: 1100px`, so this figure is IDENTICAL at 1440 and at 2707
			   and that is the point of printing it: measured 612px at both (this
			   harness drives a 900px-tall viewport), against 1107px at 375 where
			   the same content is one column. It is the structural floor behind
			   report 0276 -- a wider window buys a reader no extra scroll at all,
			   so at the reporter's own 2707x1074 there were only 438px of range
			   to begin with. The `until` asserts only that a range EXISTS, which
			   is the half that would mean a page nobody can scroll at all. */
			evaluate: `() => {
				const de = document.documentElement;
				return 'scroll range ' + (de.scrollHeight - innerHeight) + 'px (document ' + de.scrollHeight
					+ ', viewport ' + innerHeight + '), body overflow-y now ' + getComputedStyle(document.body).overflowY;
			}`,
			until: `() => document.documentElement.scrollHeight - innerHeight > 0`,
			waitMs: 100
		}
	],
	presence: [
		/* The sheet and all three of its parts are gone, and the page underneath
		   is the real home page rather than a blank shell. */
		{ selector: '.pwp-overlay', label: 'pathway sheet (dismissed)', expectPresent: 0, expectVisible: 0 },
		{ selector: '.pwp-scrim', label: 'scrim (gone with it)', expectPresent: 0, expectVisible: 0 },
		{ selector: '.pwp-hint', label: 'exit hint (gone with it)', expectPresent: 0, expectVisible: 0 },
		{ selector: '.legacy-index .hero h1', label: 'home hero heading', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* The subtitle is the SIGNED-OUT hero's since ledger 0297 (package F1b):
		   a signed-in viewer gets the compact hero, so this signed-in page
		   carries none. Its words and its contrast are pinned where its audience
		   is, in home-order-signedout-1.mjs. */
		{ selector: '.legacy-index .hero-sub', label: 'hero subtitle (signed-out only)', expectPresent: 0, maxPresent: 0 },
		{ selector: '.legacy-index header', label: 'sticky masthead', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.legacy-index .hero h1', label: 'hero title on the page plate', min: 4.5 }
	]
};
