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

		THIS WAITS ON A MEASURED SIGNAL RATHER THAN A GUESSED DELAY. There is no
		readiness flag to read from `ViewportBackground` itself (it is `src/`, off
		limits to this bundle, and CLAUDE.md's browser-pane section already warns a
		fixed sleep is a number that is too long on a fast machine and too short on a
		loaded one). So this arms an independent rAF chain of its own, entirely inside
		the page context this file controls, and waits for THREE CONSECUTIVE frames
		under 40ms apart -- the main thread refusing to schedule a queued rAF callback
		promptly is exactly the same starvation that delays `CountdownOverlay`'s
		`setTimeout`s, so "our own rAF is now landing on time" is a direct measurement
		of the condition the click needs, not a proxy for it. It self-disarms once
		satisfied (`tick` stops rescheduling itself), so it costs nothing once idle.
		`timeoutMs: 8000` is five times the measured 0.5-1.5s danger window -- a
		margin, not a guess at the window's size -- so a run that never goes idle
		still fails loudly rather than hanging.
	*/
	prepare: [
		{
			evaluate:
				'() => { window.__gtIdle = false; let last = 0; let streak = 0; const tick = (t) => { if (last) { streak = (t - last < 40) ? streak + 1 : 0; if (streak >= 3) window.__gtIdle = true; } last = t; if (!window.__gtIdle) requestAnimationFrame(tick); }; requestAnimationFrame(tick); return "main-thread idle monitor armed"; }'
		},
		{ waitFor: '() => window.__gtIdle === true', timeoutMs: 8000 },
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
