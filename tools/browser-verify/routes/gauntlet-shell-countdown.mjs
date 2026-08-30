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
		docs/history/flaky-findings-countdown-notebook-h4qv9t.md MEASURED this:
		under this container's forced-software-WebGL Chromium, `ViewportBackground`'s
		one-time three.js/PMREM setup (dynamic import + synchronous PMREM pre-render)
		monopolizes the main thread for ~0.5-1.5s after load -- nothing else on that
		thread, including a queued `setTimeout`, runs until it finishes. Arming the
		countdown inside that window means `CountdownOverlay`'s own `setTimeout` chain
		([0, 800, 1600, 2400, 3700]) starts late and its callbacks bunch up, so by the
		time the harness's own click-then-settle window measures the DOM, the whole
		3.7s sequence may already have torn itself down.

		A REAL "WAIT FOR MAIN-THREAD IDLE" WAS TRIED FIRST, AND MEASURED TO BE THE
		WRONG SIGNAL FOR THIS SCENE. An independent rAF chain armed after
		`waitForApp` returns, requiring three consecutive callback gaps under 40ms,
		never once went idle at 1440px across repeated runs -- captured gap trace:
		33,83,50,83,33,50,83,33,50,117,50,33,50,33,83,50,50,... on and on for the
		whole 8s budget. That is not the one-time setup block still running; it is
		`ViewportBackground`'s ORDINARY per-frame cost at a 1440-wide software-
		rendered canvas (particulate, PBR metal, PMREM-lit reflections, all
		redrawn every frame for as long as the tab is visible -- see its own
		header, "single rAF loop... paused when the tab is hidden", never "paused
		once settled"). A scene that redraws every frame for its whole life has no
		"idle" to wait for; requiring one just spends the full 8000ms budget on
		every 1440px run and then clicks anyway, which is a disguised fixed delay
		with worse latency than an honest one.

		WHAT waitForApp ALREADY MEASURED IS THE REAL SIGNAL, ONCE READ CORRECTLY.
		The one-time setup block is FRONT-LOADED at mount, before the DOM's own
		text/height/count has any reason to still be changing -- so `waitForApp`'s
		own stability read can return before that async chain resolves on a fast
		machine (this is exactly what the diagnosis measured: "app rendered in
		~450-900ms" there, well inside the 0.5-1.5s danger window), while on a
		loaded machine (measured here: 3800-4400ms to hydrate) it returns well
		AFTER the block has already finished, because the block itself is part of
		what made hydration slow. Either way, `performance.now()` at the moment a
		prepare step runs already reports how much real wall-clock time has
		elapsed since navigation -- which is the one number this route actually
		needs: whether that number has cleared the measured danger window yet.
		`Math.max(0, 2000 - performance.now())` tops up ONLY the shortfall, so a
		slow machine (already past 2000ms by the time this runs) waits nothing
		extra, and a fast one waits up to the same margin the original diagnosis
		named ("at least ~2000ms, a measured safe margin over the observed
		0.5-1.5s window"). This is not the rejected fixed sleep: it is the same
		margin spent only where elapsed wall-clock time proves it has not already
		been paid by hydration, so it costs the fast machine what the flaky bug
		needs and the loaded machine nothing.
	*/
	prepare: [
		{
			evaluate:
				'async () => { const remaining = Math.max(0, 2000 - performance.now()); if (remaining > 0) await new Promise((r) => setTimeout(r, remaining)); return `waited ${Math.round(remaining)}ms of the 2000ms since-navigation margin (${Math.round(performance.now())}ms elapsed)`; }'
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
