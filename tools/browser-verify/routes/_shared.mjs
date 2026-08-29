/**
 * Values shared by more than one route file -- widths every route is driven
 * at, and the entrance-settling helper several routes pass to `prepare`.
 *
 * A leading underscore marks this as infrastructure rather than a route spec:
 * the loader in `../../routes.mjs` skips any `_`-prefixed file when it reads
 * this directory, the same escape hatch `+server.ts` uses for a non-route
 * export (CLAUDE.md: "anything whose key starts with `_`"). A route file
 * imports from here with `./_shared.mjs`; nothing outside `routes/` needs to.
 */
export const WIDTHS = [375, 1440];

/**
 * SETTLE THE ENTRANCE CHROME, the way the components' own cleanup does.
 *
 * `.legacy-index .course-card` is `opacity: 0` in `src/app.css` until an
 * IntersectionObserver adds `.visible`; `AppLauncher` stamps `opacity: 0`
 * INLINE on every `.app-card` at mount and clears it from its own IO callback.
 * The harness never scrolls, so a card below the fold at a given viewport
 * genuinely never intersects and stays at opacity 0 -- real entrance chrome,
 * not a fixture gap.
 *
 * WHY THIS EXISTS AT ALL, AND IT IS NOT A CONVENIENCE. `opacity` is NOT
 * inherited, so a ROW INSIDE an opacity-0 card computes opacity 1. Until the
 * ancestor walk went into `isVisible` (see checks.mjs), every `.assignment-item`
 * assertion on these two routes reported "visible" about an element painted
 * nowhere -- so four presence rows and three tap-target rows were passing
 * VACUOUSLY, and the 44px figure the pass printed for a feed row was the
 * geometry of something no reader could see. Asserting `expectVisible: 0` on
 * the rows to match would have written the vacuum down as if it were the
 * intended reading.
 *
 * So the entrance is SETTLED instead, which CLAUDE.md's own prescription for
 * this case is: put the component into the state its cleanup produces -- which
 * is byte-identically what the reduced-motion path renders from the first frame
 * -- and SAY HOW MANY were settled, which the returned count does (the prepare
 * line prints it). Settling nothing would be a silent no-op the day a class
 * name changes; a count of 0 in the report is visible.
 */
export const SETTLE_ENTRANCE = `() => {
	/* A STYLE RULE, NOT A MUTATION OF THE ELEMENTS, and that is the second
	   attempt rather than the first. Adding \`.visible\` and clearing the inline
	   opacity settled /dev/home-order's student variant and left the teacher
	   variant and /dev/home-feed at opacity 0 -- because \`AppLauncher\`'s own
	   onMount re-stamps \`style.opacity = '0'\` on every card, and whether it has
	   run yet by the time a prepare step fires is a race that resolves
	   differently per route. A rule cannot be re-stamped over. */
	const css = '.legacy-index .course-card, .course-card { opacity: 1 !important; transform: none !important; }'
		+ '.app-card { opacity: 1 !important; transform: none !important; }';
	const tag = document.createElement('style');
	tag.setAttribute('data-bv-settle', '1');
	tag.textContent = css;
	document.head.appendChild(tag);
	const cards = document.querySelectorAll('.legacy-index .course-card, .course-card');
	const apps = document.querySelectorAll('.app-card');
	return 'settled entrance on ' + cards.length + ' course-card(s) and ' + apps.length + ' app-card(s)';
}`;
