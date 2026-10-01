/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE FORGE'S LIGHT TWIN (ledger 0360, the Foundry half of Space White).
 *
 * `forge.css` declares `:root[data-theme='space-white'] .fg-root` with the
 * room's grounds, inks and the five status trios moved in lightness only. On
 * this tree `/foundry` is NOT in Space White's route scope (that list is the
 * site lane's `theme.ts`), so production never reaches this state yet; the
 * harness writes the attribute the classroom-teams way so the twin is
 * measured before anything turns it on.
 *
 * THE REVIEW SURFACE is the busiest page a light twin has to carry: the
 * shell with its review count hot, the review keys, the queue list and the
 * open app's inspector, all inside the real full-height column. The six
 * status tones are measured on `/dev/foundry-forge?theme=space-white`, which
 * renders every one of them; the queue renders only the two its fixture has.
 *
 * THE POUR HAS NO GLOW HERE: a box-shadow halo that reads as heat on iron
 * reads as a smudge on white, so the twin drops it and the row below pins it.
 */
export default {
	path: '/dev/foundry-room?surface=review&theme=space-white',
	label: 'Foundry room under Space White: the forge twin on the review queue',
	prepare: [
		/* Past the one cold-start reload first (see the play-quick spec), so
		   the theme attribute read below is the hydrated page's own. */
		{ waitFor: `() => !!document.querySelector('[data-room-hydrated="true"]')`, timeoutMs: 20000, waitMs: 2000 },
		{ waitFor: `() => !!document.querySelector('[data-room-hydrated="true"]')`, timeoutMs: 20000 },
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="foundry-review-page"]', label: 'the review page', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-review-work"]', label: 'the open app and its inspector', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			/* Tokens, not the ground: inside `.site-plate` the room's ground is
			   the site plate's (the site lane's), which forge.css's table
			   measures the twin's inks against as well. */
			label: 'the twin tokens are in force on the room',
			evaluate: `() => { const cs = getComputedStyle(document.querySelector('.fg-root')); return [cs.getPropertyValue('--fg-ink').trim(), cs.getPropertyValue('--fg-heat-glow').trim()]; }`,
			expected: ['#0d1311', 'transparent']
		},
		{
			label: 'the pour carries no glow under Space White',
			evaluate: `() => { const p = document.querySelector('.fg-pour'); return [p ? getComputedStyle(p).boxShadow : 'NO POUR']; }`,
			expected: ['none']
		}
	],
	contrast: [
		{ selector: '.fg-tabs .fg-tab', label: 'the shell tabs', min: 4.5, all: true },
		{ selector: '.fg-count[data-hot]', label: 'the hot review count', min: 4.5 },
		{ selector: '.fg-wordmark', label: 'the Foundry wordmark', min: 4.5 },
		{ selector: '[data-testid="foundry-review-page"] h1', label: 'the page heading', min: 4.5 },
		{ selector: '.fdy-page-lead', label: 'the page lead', min: 4.5 },
		{ selector: '.fdy-rnav a.fdy-rnav-key', label: 'the review keys', min: 4.5, all: true },
		{ selector: '.fdy-q-title', label: 'a queue row title', min: 4.5 },
		{ selector: '.fdy-q-by', label: 'who submitted it', min: 4.5 },
		{ selector: '.fdy-q-wait', label: 'how long it has waited', min: 4.5 }
	],
	tapTargets: [{ selector: '.fdy-rnav a.fdy-rnav-key', label: 'the Apps and Publishers keys', min: 44 }]
};
