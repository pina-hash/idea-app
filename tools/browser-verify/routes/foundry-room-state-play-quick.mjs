/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * TWO PRESSES FROM THE GALLERY TO A FULL-SCREEN GAME (ledger 0360, report
 * 94e312c4: "The functionality to actually open and play a game can be
 * expedited much better").
 *
 * It used to be four: the card, a scroll past an up-to-18rem cover, Launch
 * app, then Full screen once it ran. Now the cover is the stage's idle face
 * with "Launch full screen" on it, and that one key starts the app and takes
 * the screen in the same click. The two prepare steps below are the two
 * presses, and each is a click whose `until` only the click can satisfy.
 *
 * THE OVERLAY PATH, BY REMOVING THE API, for the reason the existing
 * full-screen spec gives: whether headless Chromium grants a real
 * `requestFullscreen` varies between runs, and the overlay is the floor every
 * engine reaches first.
 */
const REMOVE_ELEMENT_FULLSCREEN = {
	evaluate: `() => { delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen; delete Document.prototype.exitFullscreen; return typeof Element.prototype.requestFullscreen === 'function' ? 'STILL PRESENT' : 'element fullscreen removed'; }`
};

export default {
	path: '/dev/foundry-room?state=play-quick',
	aliasOf: '/dev/foundry-room',
	label: 'Foundry room: a card, then Launch full screen, is a running game on the whole screen',
	prepare: [
		/* HYDRATION FIRST, TWICE. A card is a real link to `/foundry?app=...`,
		   so a click that lands before hydration FOLLOWS it, and a signed-out
		   harness is sent home. Measured on a cold server at 375: Vite reloaded
		   the page 0.5s after the first load, the first click landed 0.3s
		   after that reload, and the run navigated to `/` -- where the next
		   attempt waited on a card that no longer existed, with no timeout, and
		   the whole pass hung. So: wait for the harness's `onMount` marker,
		   give the one cold-start reload time to happen, and wait again. The
		   full-screen removal comes after both, because a reload restores it. */
		{ waitFor: `() => !!document.querySelector('[data-room-hydrated="true"]')`, timeoutMs: 20000, waitMs: 2000 },
		{ waitFor: `() => !!document.querySelector('[data-room-hydrated="true"]')`, timeoutMs: 20000 },
		REMOVE_ELEMENT_FULLSCREEN,
		{
			/* PRESS ONE: a card. Nothing is open at rest, so the stage cannot
			   exist until this click lands. */
			click: '[data-testid="foundry-gallery-grid"] [data-testid="fdy-card"]',
			until: '() => !!document.querySelector(".fdy-launch-full")'
		},
		{
			/* PRESS TWO: the key on the cover. `data-full` reads "no" at rest. */
			click: '.fdy-launch-full',
			until: '() => document.querySelector(".fdy-stage")?.dataset.full === "overlay"'
		}
	],
	presence: [
		{ selector: '.fdy-stage.is-full iframe.fdy-frame', label: 'the game frame, running inside the full-screen stage', expectPresent: 1, maxPresent: 1 },
		{ selector: '.fdy-stage.is-full .fdy-full', label: 'the way out, on screen', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fdy-stage.is-full .fdy-stop', label: 'Stop app, on screen', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'the full-screen stage is exactly the viewport box',
			evaluate: `() => { const s = document.querySelector('.fdy-stage.is-full'); if (!s) return ['NO FULL-SCREEN STAGE']; const b = s.getBoundingClientRect(); const near = (a, c) => Math.abs(a - c) < 1; return [near(b.width, innerWidth) ? 'width = viewport' : 'width ' + b.width.toFixed(1), near(b.height, innerHeight) ? 'height = viewport' : 'height ' + b.height.toFixed(1)]; }`,
			expected: ['width = viewport', 'height = viewport']
		}
	],
	tapTargets: [
		{ selector: '.fdy-stage.is-full .fdy-full', label: 'Exit full screen', min: 44 },
		{ selector: '.fdy-stage.is-full .fdy-stop', label: 'Stop app', min: 44 }
	]
};
