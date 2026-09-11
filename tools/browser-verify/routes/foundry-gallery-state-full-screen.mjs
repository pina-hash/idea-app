/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * FULL SCREEN ON THE PATH A PHONE ACTUALLY TAKES.
 *
 * From a student report: Enrique Mercado, 2026-09-10, on `/foundry`, iPhone
 * running iOS 18.7 in landscape at 607x320 -- "doesn't full screen on mobile
 * good".
 *
 * The obvious reading is that the Fullscreen API is missing on iOS and the
 * control does nothing. It is not what happens: `AppStage.enterFull` puts the
 * class on BEFORE it feature-tests, so a browser with no element fullscreen
 * still gets a fixed overlay at the exact viewport box. What a phone gets
 * wrong is how much of that box is left for the app, and that is geometry --
 * which `tests/dom/` cannot measure at all (happy-dom has no layout engine)
 * and which is why this spec exists rather than another mount test.
 *
 * IT MEASURES THE OVERLAY PATH ON PURPOSE, AND REMOVES THE API TO GET THERE.
 * Two reasons, and the second is the one that matters more.
 *
 *   - It is the configuration iOS Safari gives every viewer, which is the
 *     configuration the report came from. Measuring the native path instead
 *     would measure the one no iPhone can reach.
 *   - It is DETERMINISTIC. Whether headless Chromium grants a real
 *     `requestFullscreen` varies between runs here -- measured, the same page
 *     answered `data-full="native"` on one route and `"overlay"` on another in
 *     the same session -- and a harness whose measured state flips between runs
 *     reports two different things under one label.
 *
 * The removal is a prepare step rather than a launch flag so it is visible in
 * the report and so the two clicks after it are the component's own.
 */

const REMOVE_ELEMENT_FULLSCREEN = {
	/* WHAT iOS HAS: no element fullscreen of any spelling. `webkitEnterFullscreen`
	   on a <video> is the only thing WebKit offers there, and nothing on this
	   path is a video. Returns a STRING so the report prints what it did -- a
	   step that silently removed nothing would leave every row below describing
	   the native path under an overlay label. */
	evaluate: `() => { delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen; delete Document.prototype.exitFullscreen; return typeof Element.prototype.requestFullscreen === 'function' ? 'STILL PRESENT' : 'element fullscreen removed'; }`
};

export default {
	path: '/dev/foundry-gallery?state=full-screen',
	aliasOf: '/dev/foundry-gallery',
	label: 'Foundry: a bundle in full screen, on the overlay path a phone takes',
	prepare: [
		REMOVE_ELEMENT_FULLSCREEN,
		{
			/* `.fdy-stage-bar` exists only while something is running, so this
			   predicate cannot be satisfied at rest and the click is a genuine
			   discriminator rather than a `force`. */
			click: '.fdy-launch',
			until: '() => !!document.querySelector(".fdy-stage-bar")'
		},
		{
			/* Same shape: `data-full` reads "no" until the press, and it reads
			   "overlay" or "native" afterwards -- so this also proves WHICH path
			   the removal above put the run on. */
			click: '.fdy-full',
			until: '() => document.querySelector(".fdy-stage")?.dataset.full === "overlay"'
		}
	],
	presence: [
		/* THE TWO CONTROLS ARE THE GUARANTEE ON THIS PATH. Escape is a keydown on
		   the window and a focused cross-origin frame never delivers one, so a
		   viewer whose Exit control went missing is a viewer with no way out of a
		   full-screen student app. Both are asserted VISIBLE, not merely present. */
		{ selector: '.fdy-stage.is-full .fdy-full', label: 'the Exit full screen control, in full screen', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fdy-stage.is-full .fdy-stop', label: 'the Stop app control, in full screen', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fdy-stage.is-full [data-testid="fullscreen-hint"]', label: 'the hint naming which Escape this viewer has', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* The label the row truncates. Present and visible at both widths: the
		   rule shortens it, it never removes it. */
		{ selector: '.fdy-stage.is-full .fdy-running-label', label: 'the running label, truncated rather than dropped', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* POSITIVE CONTROL FOR EVERY `is-full` SELECTOR ABOVE. One frame, still
		   mounted -- the whole design constraint is that entering full screen
		   does not swap it -- and exactly one, so a second stage on the page
		   (the review half of this harness) is not what is being measured. */
		{ selector: '.fdy-stage.is-full iframe.fdy-frame', label: 'the running bundle frame, still mounted inside the full-screen stage', expectPresent: 1, maxPresent: 1 }
	],
	orderResult: [
		{
			/* FULL SCREEN MEANS THE VIEWPORT, MEASURED RATHER THAN ASSERTED BY
			   CLASS NAME. `inset: 0` alone sizes against the initial containing
			   block, which WebKit resolves against the LARGE viewport -- the one
			   with the browser's toolbars retracted -- so the stage carries an
			   explicit `100dvh` beside it. Here the two are the same box and this
			   row proves the addition changed nothing; on a phone it is the
			   difference between the app's bottom edge being on screen and being
			   behind a toolbar. That half is NOT verified: no WebKit build exists
			   in this container. */
			label: 'the full-screen stage is exactly the viewport box',
			evaluate: `() => { const s = document.querySelector('.fdy-stage.is-full'); if (!s) return ['NO FULL-SCREEN STAGE']; const b = s.getBoundingClientRect(); const near = (a, c) => Math.abs(a - c) < 1; return [getComputedStyle(s).position, near(b.width, innerWidth) ? 'width = viewport' : 'width ' + b.width.toFixed(1) + ' vs ' + innerWidth, near(b.height, innerHeight) ? 'height = viewport' : 'height ' + b.height.toFixed(1) + ' vs ' + innerHeight, near(b.top, 0) ? 'top = 0' : 'top ' + b.top.toFixed(1)]; }`,
			expected: ['fixed', 'width = viewport', 'height = viewport', 'top = 0']
		},
		{
			/* ONE ROW, AND THE ROW IS READ FROM THE CHILDREN'S CENTRES rather
			   than their tops: the bar centres its items, so a 21.8px label and a
			   44px button on the SAME row have different tops and the same
			   centre. Counting tops reported three rows for a bar that had one,
			   which is a metric that would have passed this spec while the defect
			   stood. */
			label: 'the full-screen bar is one row, whatever the app is called',
			evaluate: `() => { const bar = document.querySelector('.fdy-stage.is-full .fdy-stage-bar'); if (!bar) return ['NO BAR']; const rows = new Set([...bar.children].map((c) => { const b = c.getBoundingClientRect(); return Math.round(b.top + b.height / 2); })); return [rows.size === 1 ? 'one row' : rows.size + ' rows', bar.children.length + ' item(s)']; }`,
			expected: ['one row', '3 item(s)']
		},
		{
			/* WHAT GIVES IS THE LABEL, NEVER A CONTROL. A button shrunk below its
			   own content is a 44px floor quietly lost to a long app title, which
			   is the same defect one step further on. `scrollWidth` against
			   `clientWidth` is the flex shrink, read off the element. */
			label: 'neither control is shrunk by the row; the label is what absorbs the width',
			evaluate: `() => ['.fdy-full', '.fdy-stop'].map((sel) => { const el = document.querySelector('.fdy-stage.is-full ' + sel); if (!el) return sel + ' MISSING'; return el.scrollWidth <= el.clientWidth + 1 ? sel + ' at full width' : sel + ' shrunk by ' + (el.scrollWidth - el.clientWidth) + 'px'; })`,
			expected: ['.fdy-full at full width', '.fdy-stop at full width']
		},
		{
			/* THE FRAME GETS WHAT IS LEFT, AND "what is left" IS THE NUMBER THE
			   REPORT WAS ABOUT. Stated as a floor rather than a figure so it does
			   not have to be re-typed every time a token moves: at 375 the hint
			   takes two lines and the chrome is 92.9px of 812, at 1440 one line
			   and 72.5px of 900 -- 88.6% and 91.9%. Anything under 80% means a
			   second row came back. */
			label: 'the running app gets at least 80% of the viewport height',
			evaluate: `() => { const f = document.querySelector('.fdy-stage.is-full iframe.fdy-frame'); if (!f) return ['NO FRAME']; const share = f.getBoundingClientRect().height / innerHeight; return [share >= 0.8 ? 'frame >= 80% of viewport height' : 'frame ' + (share * 100).toFixed(1) + '% of viewport height']; }`,
			expected: ['frame >= 80% of viewport height']
		}
	],
	tapTargets: [
		{ selector: '.fdy-stage.is-full .fdy-full', label: 'Exit full screen, in full screen', min: 44 },
		{ selector: '.fdy-stage.is-full .fdy-stop', label: 'Stop app, in full screen', min: 44 }
	],
	contrast: [
		{ selector: '.fdy-stage.is-full .fdy-running-label', label: 'the running label, on the full-screen plate', min: 4.5 },
		{ selector: '.fdy-stage.is-full [data-testid="fullscreen-hint"]', label: 'the way-out hint, on the full-screen plate', min: 4.5 },
		{ selector: '.fdy-stage.is-full .fdy-full', label: 'Exit full screen', min: 4.5 },
		{ selector: '.fdy-stage.is-full .fdy-stop', label: 'Stop app', min: 4.5 }
	],
	textContains: [
		/* THE HINT SAYS THE BUTTON, NOT THE KEY, ON THIS PATH -- because the key
		   is ours and a focused cross-origin frame never delivers it. A run that
		   drifted onto the native path would read the native sentence here, so
		   this row is also a second check on which path was measured. */
		{ selector: '.fdy-stage.is-full [data-testid="fullscreen-hint"]', label: 'the overlay hint promises the control, not the key', must: ['Use Exit full screen to come back.'], mustNot: ['Press Escape or use'] },
		{ selector: '.fdy-stage.is-full .fdy-full', label: 'the control names the way out', must: ['Exit full screen'] }
	]
};
