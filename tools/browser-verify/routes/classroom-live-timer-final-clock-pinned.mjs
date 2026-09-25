/**
 * THE TEACHER'S TIMER IN ITS LAST TEN SECONDS (ledger 0298), in the REAL
 * control view with its clock pinned at load (`?timer=final&clock=pinned`:
 * a ten-minute countdown with 7.42 s left, running, adopted from the stored
 * frame exactly as a reload mid-period adopts it).
 *
 * WHAT IS MEASURED:
 *   - the face reads 0:07.42 and says it is in its last seconds;
 *   - the digits take the warning ink and still clear 4.5:1 on the panel;
 *   - the beat: the digits scale once per second under no-preference, and
 *     rest unscaled and painted under reduced motion.
 */
import { LIVE_READY, READOUT_PARTS } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-live?timer=final&clock=pinned',
	label: 'Live class control view: the timer in its last ten seconds, clock pinned',
	prepare: [LIVE_READY, { waitFor: `() => document.querySelector('[data-testid="live-timer-readout"]')?.dataset.final === 'true'`, timeoutMs: 10000 }],
	orderResult: [
		{ label: 'the face, in hundredths', evaluate: READOUT_PARTS('[data-testid="live-timer-digits"]'), expected: ['0:07', '.42'] },
		{
			label: 'running, in its last seconds, and the controls still offer Pause and one more minute',
			evaluate: `() => { const r = document.querySelector('[data-testid="live-timer-readout"]'); return [r.dataset.phase, r.dataset.final, document.querySelector('[data-testid="live-timer-toggle"]').textContent.trim(), document.querySelector('[data-testid="live-timer-extend"]').textContent.trim()]; }`,
			expected: ['running', 'true', 'Pause', '+1 min']
		}
	],
	presence: [{ selector: '[data-testid="live-timer-digits"]', label: 'the digits', expectPresent: 1, maxPresent: 1, expectVisible: 1 }],
	contrast: [
		{ selector: '.lc-root .lc-digits', label: 'digits in the warning ink', min: 4.5 },
		{ selector: '.lc-root .lc-frac', label: 'hundredths in the warning ink', min: 4.5 }
	],
	motion: [{ selector: '[data-testid="live-timer-readout"]', label: 'the beat, gated behind no-preference', expect: 'gated' }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
