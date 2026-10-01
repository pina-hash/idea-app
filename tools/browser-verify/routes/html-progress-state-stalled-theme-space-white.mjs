/**
 * THE STALLED RAIL UNDER SPACE WHITE (ledger 0360): the same steps and rows
 * as `html-progress-state-stalled.mjs`, re-measured on the white classroom
 * ground, which is where a status red is weakest. The harness forces the
 * attribute (`?theme=`), since a harness holds no session.
 */
import stalled from './html-progress-state-stalled.mjs';
import { STALL_PREPARE } from './_html-progress-stall.mjs';

export default {
	...stalled,
	path: '/dev/html-progress?state=stalled&theme=space-white',
	/* The query is read by the page (it forces the theme), so this spec visits
	   its own path rather than the stalled spec's alias. */
	aliasOf: undefined,
	label: 'HTML assignment progress rail: the database stalls, under Space White',
	prepare: [
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		...STALL_PREPARE
	],
	presence: [{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 }]
};
