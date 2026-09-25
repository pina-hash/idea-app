/**
 * LEAVING IDEACAD MUST LEAVE THE PAGE SCROLLABLE. Ledger 0298, reports R29 and R07.
 *
 * THE DEFECT THIS FILE WAS WRITTEN AGAINST. `IdeaCadApp.svelte` and
 * `src/routes/ideacad/preview/+page.svelte` carried an unscoped
 * `:global(html), :global(body) { overflow: hidden; height: 100% }`. Svelte
 * compiles a `:global()` rule into the component's stylesheet with nothing
 * scoping it, the stylesheet arrives the moment the component's MODULE is
 * imported (so on every page that imports it, mounted or not), and a
 * client-side navigation never removes it. So after one visit to IdeaCAD by a
 * link, every later page in the tab was cut off at the window with no
 * scrollbar, until a reload -- "random pages cannot scroll and a refresh fixes
 * it". The fix gives the app shell `position: fixed; inset: 0` and deletes the
 * document rules, so there is nothing left to leak.
 *
 * WHAT THE RUN DOES. It opens the REAL `IdeaCadApp` on
 * `/ideacad/preview/chooser`, reads that the app holds the whole window (the
 * positive control: the fix must not unlock the app itself), then presses an
 * ordinary same-origin link to `/dev/tournaments` -- a long page -- which
 * SvelteKit's router takes client-side, exactly as a student's click on the
 * IDEA brand link does. On arrival it scrolls the document to the end and
 * reads where it got to.
 *
 * WHY THE CHOOSER AND NOT `/dev/ideacad-app`. `/dev/ideacad-app` mounts the
 * app only against a loopback test database; without one it renders a status
 * line. The leak reproduced from there too (its module import alone carried
 * the rule: measured html/body `overflow: hidden`, scrollY 0 on a page 9177px
 * tall), but that page cannot give the positive control, because no app is on
 * screen to hold the viewport. The chooser mounts the same component with an
 * inert client and needs no session, and the path is `aliasOf` so this file's
 * own name stays the one the brief gave it.
 *
 * THE NAVIGATION IS PROVEN CLIENT-SIDE, NOT ASSUMED. A marker is left on
 * `window` before the press; a full page load destroys it, so "arrived with
 * the marker" is the only way the predicate holds. Vite in dev reloads the
 * whole page the first time a route pulls in a dependency it had not
 * optimised yet, which would turn the press into a full load and pass this
 * spec vacuously (a fresh load has no leaked stylesheet). So the step is a
 * small state machine: arriving WITHOUT the marker sends it back to the
 * chooser by another client-side link and tries again, and the prepare line
 * prints which branch ran.
 *
 * BEFORE AND AFTER, MEASURED ON THIS SPEC. On the unfixed tree, at 375 and at
 * 1440 alike, the `order-result` row read html and body `overflow-y: hidden`
 * and scrollY 0 after scrolling to the end, on a page whose content runs to
 * about 9200px at 1440 (12686px at 375) in a 900px window. After the fix both
 * read not hidden and the end is reached (scrollY 8304 at 1440 and 11786 at
 * 375 in the measuring pass, each the content height less the window; the
 * tournament sim's live state moves the height by a few dozen pixels between
 * runs, which is why the row asserts "reachable" rather than a number). The
 * app still holds the whole window before the press, which is the half the
 * fix must not cost.
 *
 * THE COMPUTED `overflow-y` ROWS ARE THE LOAD-BEARING ONES, the scroll row
 * corroborates. `tour-mode-picker.mjs` measured that `body { overflow:
 * hidden }` ALONE stops a real wheel (0 -> 0) while a programmatic
 * `scrollTo` still moves the page; the old IdeaCAD rule also pinned the
 * height to the window, which is why `scrollTo` reads 0 against it, but a
 * leak of the body rule alone would pass the scroll row and fail the
 * overflow one.
 *
 * NEGATIVE CONTROL: `--break document-lock` injects the old rule into the
 * start page; the injected `<style>` survives the client-side navigation the
 * same way the compiled one did, and the `order-result` row goes red
 * (measured at 1440: "the content ends at 9177px in a 900px window", scrollY
 * 0). READ IT AT A WIDTH WHOSE PREPARE LINE SAYS ONE ATTEMPT. The first run
 * after the dev server boots usually takes the full reload described above,
 * a full reload throws away an injected style as surely as it throws away the
 * leaked one, and the control then comes back green having tested nothing.
 */

/* The start page: the real IdeaCadApp, mounted with an inert client. */
const START = '/ideacad/preview/chooser';
/* A long page on a different route, with its own positive control below. */
const TARGET = '/dev/tournaments';

/**
 * One reading of the document, shared by the prepare step and the result row.
 * It scrolls to the end, notes how far it got, and puts the scroll back, so
 * nothing measured after it reads a scrolled page.
 */
const READ = `() => {
	const de = document.documentElement;
	const b = document.body;
	const from = window.scrollY;
	window.scrollTo({ top: 1e7, behavior: 'instant' });
	const reached = window.scrollY;
	window.scrollTo({ top: from, behavior: 'instant' });
	const shell = document.querySelector('[data-testid="ideacad-app"]');
	const r = shell ? shell.getBoundingClientRect() : null;
	const main = document.querySelector('main');
	return {
		path: location.pathname,
		htmlOverflowY: getComputedStyle(de).overflowY,
		bodyOverflowY: getComputedStyle(b).overflowY,
		scrollHeight: de.scrollHeight,
		clientHeight: de.clientHeight,
		clientWidth: de.clientWidth,
		reached,
		mainBottom: main ? Math.round(main.getBoundingClientRect().bottom + from) : null,
		shell: r ? { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } : null
	};
}`;

/**
 * THE STATE MACHINE. Each call looks at where the tab is and takes the next
 * step; the `until` below is what decides it is done. Every branch returns a
 * sentence, so the prepare line says which one the run took.
 */
const LEAVE_BY_A_LINK = `() => {
	const go = (href) => {
		const a = document.createElement('a');
		a.href = href;
		a.textContent = 'probe link';
		document.body.appendChild(a);
		a.click();
		a.remove();
	};
	const at = location.pathname;
	if (at === ${JSON.stringify(START)}) {
		if (!document.querySelector('[data-testid="ideacad-app"]')) return 'on the chooser, waiting for the app shell';
		if (window.__lockProbe) return 'on the chooser, the press is in flight';
		window.__lockProbe = { start: (${READ})() };
		go(${JSON.stringify(TARGET)});
		return 'read the app, then pressed a link to ${TARGET}';
	}
	if (at === ${JSON.stringify(TARGET)}) {
		if (window.__lockProbe) return 'arrived client-side';
		go(${JSON.stringify(START)});
		return 'arrived by a FULL page load (the dev server reloaded), so going back by a link to try again';
	}
	return 'somewhere else: ' + at;
}`;

export default {
	path: '/dev/ideacad-leaves-no-scroll-lock',
	aliasOf: START,
	label: 'IdeaCAD: leaving by a link leaves the next page scrollable',
	prepare: [
		{
			evaluate: LEAVE_BY_A_LINK,
			/* Holds only on the long page, reached WITH the marker a full load
			   would have destroyed, once that page's own content is drawn. */
			until: `() => location.pathname === ${JSON.stringify(TARGET)} && !!window.__lockProbe && !!document.querySelector('[data-testid="event-rail"]')`,
			attempts: 30,
			gapMs: 1000
		}
	],
	settleMs: 900,
	/* THE DEV SERVER'S RELOAD, NOT THE PAGE. When Vite reloads the tab in the
	   middle of the press (the branch the step above handles), the navigation
	   in flight is aborted and the client hook logs it as a 500 with "Failed
	   to fetch" -- measured alongside 52 ERR_ABORTED module requests on the
	   same run. It is scoped to this route and this sentence; the tournaments
	   harness's own spec still counts every other error on that page. */
	ignoreConsole: ['500 /dev/tournaments route=/dev/tournaments TypeError: Failed to fetch'],
	presence: [
		/* The positive control that the run is on the page it meant to reach,
		   drawn in full: the tournaments harness's own event rail. */
		{ selector: '[data-testid="event-rail"]', label: 'the long page arrived (its event rail)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* And that IdeaCAD is gone from it, so nothing on screen could be
		   holding the document on purpose. */
		{ selector: '[data-testid="ideacad-app"]', label: 'no IdeaCAD shell on the page left to', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'the app held the window, and the page reached by a link afterwards scrolls to its end',
			evaluate: `() => {
				const probe = window.__lockProbe;
				if (!probe) return ['no marker: the navigation was a full page load, so this run proves nothing'];
				const s = probe.start;
				const now = (${READ})();
				const heldWindow =
					!!s.shell && s.shell.left === 0 && s.shell.top === 0 &&
					s.shell.width >= s.clientWidth - 1 && s.shell.height >= s.clientHeight - 1 && s.reached === 0;
				const belowFold = now.mainBottom !== null && now.mainBottom > now.clientHeight;
				const bottom = now.scrollHeight - now.clientHeight;
				return [
					'navigated client-side: yes',
					'the app held the whole window: ' + (heldWindow ? 'yes' : 'NO ' + JSON.stringify(s)),
					'the page left to has content below the fold: ' + (belowFold ? 'yes' : 'NO ' + JSON.stringify(now)),
					'html overflow-y: ' + (now.htmlOverflowY === 'hidden' ? 'hidden' : 'not hidden'),
					'body overflow-y: ' + (now.bodyOverflowY === 'hidden' ? 'hidden' : 'not hidden'),
					'its end is reachable by scrolling: ' +
						(now.reached > 0 && Math.abs(now.reached - bottom) <= 1
							? 'yes'
							: 'NO (scrollY ' + now.reached + '; the content ends at ' + now.mainBottom + 'px in a ' + now.clientHeight + 'px window)')
				];
			}`,
			expected: [
				'navigated client-side: yes',
				'the app held the whole window: yes',
				'the page left to has content below the fold: yes',
				'html overflow-y: not hidden',
				'body overflow-y: not hidden',
				'its end is reachable by scrolling: yes'
			]
		}
	]
};
