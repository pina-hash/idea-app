/**
 * THE RAIL DURING A DATABASE STALL (ledger 0360, reports d983e776 and
 * 2d83c063). On 2026-09-29 every worksheet save timed out, was dropped after
 * one attempt, and the rail read 100% over answers the server never got, while
 * the class list said Missing. On `/dev/html-progress`'s stalled card the REAL
 * answer transport, controller, store and rail run over a fake database:
 *
 *   1. stall on, fill both answers: the transport retries the 57014 four times
 *      per block and stops; the rail reads 99, not 100, says the answers are
 *      not saved, and the save indicator shows Retry, which clears 44px; the
 *      server's own judgment (`hxCompletion` over the fake's rows) is false.
 *   2. stall off, press Retry: `html-progress-state-recovered.mjs`.
 *
 * The 42501 half (a lost session: exactly one attempt per block, never
 * retried) is `tests/html-assignment-save-retry.test.ts`'s, over the same real
 * transport; a browser adds nothing to an attempt count.
 */
import { CARD, RAIL, STALL_PREPARE } from './_html-progress-stall.mjs';

export default {
	path: '/dev/html-progress?state=stalled',
	aliasOf: '/dev/html-progress',
	label: 'HTML assignment progress rail: the database stalls',
	prepare: STALL_PREPARE,
	orderResult: [
		{
			label: 'stalled: 99 and not saved, Retry on screen, four attempts per block, and the server says not complete',
			evaluate: `() => {
				const rail = document.querySelector('${RAIL}');
				const s = window.__hxp.stalled;
				const retry = [...rail.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Retry');
				return [
					'percent=' + rail.dataset.percent,
					'line=' + (rail.querySelector('[data-hxp-save-line]')?.dataset.hxpSaveLine ?? 'none'),
					'retry=' + retry.length,
					'attempts=' + Object.entries(s.attempts).sort().map(([k, v]) => k + ':' + v).join(','),
					'server-complete=' + s.serverComplete,
					'all-filled-in=' + rail.textContent.includes('All filled in')
				];
			}`,
			expected: [
				'percent=99',
				'line=failed',
				'retry=1',
				'attempts=st-one:4,st-two:4',
				'server-complete=false',
				'all-filled-in=false'
			]
		}
	],
	textContains: [
		{
			selector: RAIL,
			label: 'the rail says the answers are not saved, in words, and the indicator says why',
			must: [
				'Some answers are not saved yet, so this does not count as finished.',
				'Not saved.',
				'the connection or the server is busy'
			],
			mustNot: ['All filled in', 'canceling statement', 'statement timeout']
		}
	],
	tapTargets: [{ selector: `${RAIL} .save-ind-btn.retry`, label: 'the Retry key above the worksheet', min: 44 }],
	contrast: [
		{ selector: `${RAIL} [data-hxp-save-line]`, label: 'the not-saved line', min: 4.5 },
		{ selector: `${RAIL} .save-ind-text`, label: 'the save indicator words', min: 4.5 }
	],
	ignoreConsole: ['ERR_CONNECTION_RESET', 'ERR_BLOCKED_BY_CLIENT']
};
