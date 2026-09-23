/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { FLIP, HYDRATED, PRESS, READ_BETWEEN, DOCUMENTS_AT_LEAST } from './_deploy-safety.mjs';

/**
 * A DECK IN FULL SCREEN ON THE PROJECTOR WHEN A NEW VERSION GOES LIVE, AND THE
 * TEACHER PRESSES THE DECK'S OWN BACK LINK: no full page load. Nothing is
 * reloaded out of full screen.
 *
 * The REAL `DeckViewer`, framing one slide, entered into native full screen by
 * a real click on its own Full screen control (a genuine user gesture, which
 * the Fullscreen API requires). Then the positive control: on the page it
 * lands on, out of full screen, the next link DOES take the new version --
 * which is what says the refusal was the full-screen rule and not a flag that
 * never flipped.
 *
 * The deck ROUTE's own entry in the projector registry is a second, separate
 * rule (a harness route cannot carry the real deck's route id); the node table
 * pins it, and `deploy-safety-case-projector` proves the registry in the
 * browser on a real registered route.
 */
export default {
	path: '/dev/deploy-safety?case=deck',
	label: 'Deploy safety: a deck in full screen, then its Back link, with a new version live',
	prepare: [
		{ waitFor: HYDRATED, timeoutMs: 45_000 },
		{ evaluate: FLIP },
		{
			click: '.deck-bar button.deck-btn',
			until: `() => document.fullscreenElement !== null`
		},
		{ evaluate: PRESS('.deck-bar a.deck-btn', 'click-deck'), waitMs: 100 },
		{ waitFor: `() => location.pathname === '/dev/deploy-safety/next'`, timeoutMs: 15_000 },
		{ waitFor: `() => document.fullscreenElement === null`, timeoutMs: 5_000 },
		{ evaluate: PRESS('[data-testid="link-back"]', 'click-after'), waitMs: 100 },
		{ waitFor: DOCUMENTS_AT_LEAST(2), timeoutMs: 15_000 }
	],
	orderResult: [
		{
			evaluate: READ_BETWEEN('click-deck', 'click-after'),
			expected: ['documents 0', 'to (none)', 'verdicts fullscreen/link', 'acknowledged first no-ack'],
			label: 'leaving a full-screen deck: no full page load, and the verdict names the full-screen rule'
		},
		{
			evaluate: READ_BETWEEN('click-after', null),
			expected: ['documents 1', 'to /dev/deploy-safety', 'verdicts reload/link', 'acknowledged first no-ack'],
			label: 'the positive control: out of full screen, the next link takes the new version'
		}
	]
};
