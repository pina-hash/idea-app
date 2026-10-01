/**
 * THE STALLED RAIL UNDER MATRIX (ledger 0360): the same steps and rows as
 * `html-progress-state-stalled.mjs`, re-measured on Matrix's ground.
 */
import stalled from './html-progress-state-stalled.mjs';
import { STALL_PREPARE } from './_html-progress-stall.mjs';

export default {
	...stalled,
	path: '/dev/html-progress?state=stalled&theme=matrix',
	aliasOf: undefined,
	label: 'HTML assignment progress rail: the database stalls, under Matrix',
	prepare: [
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'matrix'`, timeoutMs: 10000 },
		...STALL_PREPARE
	],
	presence: [{ selector: 'html[data-theme="matrix"]', label: 'Matrix is on', expectPresent: 1, maxPresent: 1 }]
};
