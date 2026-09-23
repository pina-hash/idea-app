/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { FLIP, HYDRATED, PRESS, READ_BETWEEN, DOCUMENTS_AT_LEAST } from './_deploy-safety.mjs';

/**
 * LEAVING A PROJECTOR SURFACE WHEN A NEW VERSION GOES LIVE: no full page load.
 *
 * `/fsp/live` is a REAL route in the projector registry (the FSP question
 * display) and renders without a session, so the registry is proven here on a
 * real route id rather than on one a harness could carry. The harness reaches
 * it in-app, the flag is flipped THERE, and an ordinary link the router
 * intercepts takes the page back to `/dev/deploy-safety/next`. Then the
 * positive control: from that ordinary page, the next link DOES reload.
 */
const LINK_OUT = `() => {
	const host = document.body.firstElementChild;
	const a = document.createElement('a');
	a.href = '/dev/deploy-safety/next';
	a.textContent = 'back to the harness';
	host.appendChild(a);
	window.__dsMark('click-projector');
	a.click();
	return 'pressed an in-app link on ' + location.pathname;
}`;

export default {
	path: '/dev/deploy-safety?case=projector',
	label: 'Deploy safety: leaving the FSP live display, with a new version live',
	prepare: [
		{ waitFor: HYDRATED, timeoutMs: 45_000 },
		{ evaluate: PRESS('[data-testid="link-projector"]', 'to-projector'), waitMs: 100 },
		{ waitFor: `() => location.pathname === '/fsp/live'`, timeoutMs: 30_000 },
		{ evaluate: FLIP },
		{ evaluate: LINK_OUT, waitMs: 100 },
		{ waitFor: `() => location.pathname === '/dev/deploy-safety/next'`, timeoutMs: 15_000 },
		{ evaluate: PRESS('[data-testid="link-back"]', 'click-after'), waitMs: 100 },
		{ waitFor: DOCUMENTS_AT_LEAST(2), timeoutMs: 15_000 }
	],
	orderResult: [
		{
			evaluate: READ_BETWEEN('to-projector', 'click-projector'),
			expected: ['documents 0', 'to (none)', 'verdicts not-updated/link', 'acknowledged first no-ack'],
			label: 'reaching the display in-app, before the new version (the flag was genuinely false then)'
		},
		{
			evaluate: READ_BETWEEN('click-projector', 'click-after'),
			expected: ['documents 0', 'to (none)', 'verdicts projector/link', 'acknowledged first no-ack'],
			label: 'leaving the display: no full page load, and the verdict names the projector registry'
		},
		{
			evaluate: READ_BETWEEN('click-after', null),
			expected: ['documents 1', 'to /dev/deploy-safety', 'verdicts reload/link', 'acknowledged first no-ack'],
			label: 'the positive control: from an ordinary page, the next link takes the new version'
		}
	],
	ignoreConsole: [
		/* The display asks Supabase for its feed; the harness blocks every
		   non-loopback request, so that read fails by the harness's own policy. */
		'Failed to load resource: net::ERR_FAILED'
	]
};
