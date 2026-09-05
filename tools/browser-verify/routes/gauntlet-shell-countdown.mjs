// original array position 24 of 25 -- see ../README.md for what `order` means
export const order = 24;

export default {
	path: '/dev/gauntlet-shell-countdown',
	label: 'GAUNTLET viewport chrome, room-start countdown armed',
	aliasOf: '/dev/gauntlet-shell',
	/*
		The countdown is a 3-2-1-BUILD sequence that tears itself down at
		3.7s, so this variant asserts only what can be read inside that
		window and nothing that needs a long settle. That is a real limit,
		not a shortcut: the numeral is painted with `background-clip: text`
		over `color: transparent`, so it HAS no computed foreground colour
		and a contrast row on it would report the transparent value and
		pass vacuously. It is deliberately absent.

		What is worth reading is that the overlay is inert while it covers
		the page: `pointer-events: none` and `aria-hidden`, over a full
		`position: fixed; inset: 0` box at z-index 800.
	*/
	/*
		THE COUNTDOWN IS ARMED WHEN `ViewportBackground` HAS FINISHED ITS
		ONE-TIME WEBGL SETUP, AND THAT IS A DOM SIGNAL RATHER THAN A CLOCK.

		The hazard, diagnosed in docs/history/flaky-findings-countdown-notebook-h4qv9t.md
		and re-measured here: under this container's forced-software-WebGL
		Chromium, `ViewportBackground`'s dynamic `three` import plus
		`RoomEnvironment` PMREM pre-render monopolizes the main thread as ONE
		synchronous block, and `CountdownOverlay`'s `setTimeout` chain
		([0, 800, 1600, 2400, 3700]) cannot run inside it. Arm the countdown
		before that block and the whole 3.7s sequence bunches up and can tear
		itself down before the presence rows below are read -- which is the
		"0, 3 and 3 findings across three consecutive runs" this route was known
		for.

		THE BLOCK IS 4.5 SECONDS HERE, AND IT DOES NOT START WHEN THE PREVIOUS
		FIX ASSUMED. Sampled with a `setTimeout(50)` chain from
		domcontentloaded, three trials: lateness sits at 0-3ms, then ONE sample
		reports 4472/4576/4473ms, then settles to 0-84ms for the rest of the
		page's life. The block STARTED at t=2242ms in one of those trials --
		AFTER the 2000ms since-navigation margin this step used to spend would
		have expired. So that margin was not merely inert on a slow machine
		(hydration measures 5.1-5.4s here, so it waited 0ms every run); it was
		aimed at a window whose start it could not predict.

		AND PUNCTUALITY IS NOT THE SIGNAL EITHER, for the same reason. The
		thread is perfectly punctual BEFORE the block as well as after, so any
		"wait until a queued task fires on time" predicate is satisfiable at
		t=1300 and the block still lands at 2242.

		WHAT DOES SEPARATE THEM IS THE CANVAS. `<canvas>` starts at the HTML
		default 300x150 and `WebGLRenderer` resizes it; because the setup is one
		synchronous block, there is no observable moment inside it, so from
		outside the canvas is 300x150 before the block and sized after it, with
		nothing in between. Measured 3/3: `300x150` on every sample up to the
		block, `1440x900` on the first sample after it. The predicate compares
		against the DEFAULT PAIR rather than a width, so it reads the same at
		375 as at 1440.

		PROVED BY REPRODUCTION, not by a clean run. Arming as soon as the
		control exists (t=216/301/1278ms, which is what a fast machine does)
		reddens all three presence rows 3/3, with `present 0` -- the overlay
		gone entirely, exactly the reported signature. Arming on this predicate
		instead: 0/3 red, with the wait reported at 756-803ms. The step's own
		`waitFor` row prints that number, so the cost is visible on every run.

		IF WEBGL IS UNAVAILABLE the canvas is never resized and this step
		reports FAILED after its timeout, which is the honest outcome: the
		measurements below would be describing a state the run never reached.
		The old fixed margin proceeded silently in that case.
	*/
	prepare: [
		{
			waitFor:
				'() => { const c = document.querySelector(".gt-viewport-bg canvas"); return !!c && !(c.width === 300 && c.height === 150); }',
			timeoutMs: 30_000
		},
		{
			click: '[data-drive="countdown"]',
			until: '() => !!document.querySelector(".gt-countdown .numeral")',
			attempts: 6,
			waitMs: 120
		}
	],
	settleMs: 150,
	presence: [
		{ selector: '.gt-countdown', label: 'countdown overlay, armed', expectPresent: 1, expectVisible: 1 },
		{ selector: '.gt-countdown .numeral', label: 'the numeral currently on screen', expectPresent: 1, expectVisible: 1 },
		/*
			The overlay is decoration over a server-authoritative clock and
			announces nothing; it carries aria-hidden on its root, so the
			count reads 1 rather than 0.
		*/
		{ selector: '.gt-countdown[aria-hidden="true"]', label: 'overlay hidden from assistive tech', expectPresent: 1 }
	],
	orderResult: [
		{
			label: 'a tap reaches the page THROUGH the armed countdown overlay',
			evaluate:
				'() => { const b = document.querySelector(\'[data-testid="under-overlay"]\'); if (!b) return ["NO CONTROL"]; b.scrollIntoView({ block: "center", behavior: "instant" }); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [hit ? (hit.getAttribute("data-testid") || hit.className || hit.tagName) : "NOTHING"]; }',
			expected: ['under-overlay']
		}
	],
	contrast: [],
	tapTargets: []
};
