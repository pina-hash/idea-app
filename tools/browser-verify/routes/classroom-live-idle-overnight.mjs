/**
 * THE LIVE GRID'S IDLE WORDS FOR A STUDENT WHO LAST TYPED YESTERDAY (report
 * R11, "Some odd numbers here").
 *
 * 0200 keeps one presence row per student per item for life, so a student on
 * the page today whose last keystroke on the assignment was yesterday read
 * "No typing for 1463 min" (24 h 23 min) and "No typing for 1509 min · other
 * tab". The harness's `?idle=overnight` adds exactly those two rows (Gus Varga
 * and Hana Ito, on the page now, last input 24 h 23 min and 25 h 9 min ago,
 * the second in another tab).
 *
 * WHAT IS MEASURED:
 *   - their rows read "No typing today" and "No typing today · other tab";
 *   - no detail anywhere on the grid prints a count of three or more digits of
 *     minutes (the absence), beside the same-day idle rows that still read in
 *     minutes (its positive control: "No typing for 7 min", "No typing for 11
 *     min");
 *   - the row detail clears 4.5:1.
 */
import { LIVE_READY } from './_classroom-live.mjs';

const DETAIL_OF = (name) => `() => {
	const cell = [...document.querySelectorAll('[data-testid="live-cell"]')].find((c) => c.querySelector('.lg-name')?.textContent.trim() === ${JSON.stringify(name)});
	return [cell ? cell.getAttribute('data-state') + ' / ' + (cell.querySelector('.lg-detail')?.textContent.trim() ?? '-') : 'no row'];
}`;

export default {
	path: '/dev/classroom-live?idle=overnight',
	label: 'Live grid: idle since yesterday reads "No typing today", never a four-digit minute count (R11)',
	prepare: [
		LIVE_READY,
		{ waitFor: `() => [...document.querySelectorAll('.lg-detail')].some((d) => d.textContent.includes('today'))`, timeoutMs: 20000 }
	],
	orderResult: [
		{ label: 'a student on the page who last typed yesterday', evaluate: DETAIL_OF('Gus Varga'), expected: ['idle / No typing today'] },
		{ label: 'the same, in another tab', evaluate: DETAIL_OF('Hana Ito'), expected: ['idle / No typing today · other tab'] },
		{
			label: 'no detail prints three or more digits of minutes, and same-day idle rows still read in minutes',
			evaluate: `() => {
				const details = [...document.querySelectorAll('.lg-detail')].map((d) => d.textContent.trim());
				const big = details.filter((t) => /\\b\\d{3,} min\\b/.test(t));
				const minutes = details.filter((t) => /^No typing for \\d{1,2} min/.test(t));
				return [big.length === 0 ? 'no 3-digit minute counts' : 'found: ' + big.join(' | '), minutes.length >= 2 ? 'same-day rows in minutes' : 'only ' + minutes.length + ' same-day minute rows: ' + details.join(' | ')];
			}`,
			expected: ['no 3-digit minute counts', 'same-day rows in minutes']
		}
	],
	contrast: [{ selector: '.lc-root .lg-detail', label: 'row detail', min: 4.5 }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
