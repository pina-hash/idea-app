/**
 * THE RAIL AFTER THE STALL CLEARS (ledger 0360, reports d983e776 and
 * 2d83c063). The second half of `html-progress-state-stalled.mjs`: the same
 * card, the stall turned off, ONE press of Retry. The indicator retries the
 * machine it speaks for; that write landing re-arms the other block that
 * stopped on the busy server, so one press sends everything owed. Only then
 * does the rail reach 100 and the server's own judgment agree.
 */
import { CARD, RAIL, STALL_PREPARE } from './_html-progress-stall.mjs';

export default {
	path: '/dev/html-progress?state=recovered',
	aliasOf: '/dev/html-progress',
	label: 'HTML assignment progress rail: one Retry after the stall sends everything owed',
	prepare: [
		...STALL_PREPARE,
		{
			click: `${CARD} [data-drive="stall-none"]`,
			until: `() => window.__hxp?.stalled?.mode === 'none'`
		},
		{
			click: `${RAIL} .save-ind-btn.retry`,
			until: `() => document.querySelector('${RAIL}')?.dataset.percent === '100' && window.__hxp?.stalled?.serverComplete === true`,
			attempts: 40,
			gapMs: 250
		}
	],
	orderResult: [
		{
			label: 'recovered: 100, All filled in, nothing unsaved, and the server holds both answers',
			evaluate: `() => {
				const rail = document.querySelector('${RAIL}');
				const s = window.__hxp.stalled;
				return [
					'percent=' + rail.dataset.percent,
					'all-filled-in=' + rail.textContent.includes('All filled in'),
					'unsaved=' + s.unsaved.length,
					'server-complete=' + s.serverComplete,
					'retry=' + rail.querySelectorAll('.save-ind-btn.retry').length
				];
			}`,
			expected: ['percent=100', 'all-filled-in=true', 'unsaved=0', 'server-complete=true', 'retry=0']
		}
	],
	ignoreConsole: ['ERR_CONNECTION_RESET', 'ERR_BLOCKED_BY_CLIENT']
};
