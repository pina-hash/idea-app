/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { FLIP, HYDRATED, PRESS, READ_BETWEEN, DOCUMENTS_AT_LEAST } from './_deploy-safety.mjs';

/**
 * AN IDLE PAGE IS NEVER RELOADED. A new version goes live and nobody touches
 * the page for ten seconds: no full page load, no verdict at all (the only
 * trigger is a navigation, so there is nothing to judge). Then the positive
 * control: the first link pressed afterwards takes the new version.
 */
export default {
	path: '/dev/deploy-safety?case=idle',
	label: 'Deploy safety: an idle page for ten seconds, with a new version live',
	prepare: [
		{ waitFor: HYDRATED, timeoutMs: 45_000 },
		{ evaluate: FLIP },
		{ evaluate: `() => { window.__dsMark('flipped'); return 'marked flipped'; }` },
		{
			waitFor: `() => { const m = window.__dsLog().find((e) => e.label === 'flipped'); return m && Date.now() - m.at >= 10000; }`,
			timeoutMs: 15_000
		},
		{ evaluate: PRESS('[data-testid="link-next"]', 'click-after'), waitMs: 100 },
		{ waitFor: DOCUMENTS_AT_LEAST(2), timeoutMs: 15_000 }
	],
	orderResult: [
		{
			evaluate: `() => {
				const log = window.__dsLog();
				const f = log.find((e) => e.label === 'flipped').at;
				const c = log.find((e) => e.label === 'click-after').at;
				return ['idle for at least 10s ' + (c - f >= 10000)];
			}`,
			expected: ['idle for at least 10s true'],
			label: 'the page sat idle, flag flipped, for ten seconds or more'
		},
		{
			evaluate: READ_BETWEEN('flipped', 'click-after'),
			expected: ['documents 0', 'to (none)', 'verdicts (none)', 'acknowledged first no-ack'],
			label: 'ten idle seconds with a new version live: no full page load and nothing even judged'
		},
		{
			evaluate: READ_BETWEEN('click-after', null),
			expected: ['documents 1', 'to /dev/deploy-safety/next', 'verdicts reload/link', 'acknowledged first no-ack'],
			label: 'the positive control: the first link pressed takes the new version'
		}
	]
};
