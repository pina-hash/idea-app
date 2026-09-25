/**
 * THE TEACHER'S TIMER WHEN TIME IS UP (ledger 0298), in the REAL control view
 * with its clock pinned (`?timer=done&clock=pinned`: a ten-minute countdown
 * that ran out 32 s ago).
 *
 * WHAT IS MEASURED:
 *   - the face holds 0:00.00, the word says time is up, the overtime counts in
 *     whole seconds, and the toggle offers a restart;
 *   - the finish: the digits bump once under no-preference and rest unscaled
 *     and painted under reduced motion.
 */
import { LIVE_READY, READOUT_PARTS } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-live?timer=done&clock=pinned',
	label: 'Live class control view: time is up, clock pinned',
	prepare: [LIVE_READY, { waitFor: `() => document.querySelector('[data-testid="live-timer-readout"]')?.dataset.phase === 'done'`, timeoutMs: 10000 }],
	orderResult: [
		{ label: 'the face holds 0:00.00', evaluate: READOUT_PARTS('[data-testid="live-timer-digits"]'), expected: ['0:00', '.00'] },
		{
			label: 'the word, the overtime and the toggle',
			evaluate: `() => [document.querySelector('.lc-root .lc-word').textContent.trim(), document.querySelector('.lc-root .lc-over').textContent.trim(), document.querySelector('[data-testid="live-timer-toggle"]').textContent.trim()]`,
			expected: ['Time is up', 'Over by 0:32', 'Restart']
		}
	],
	presence: [
		{ selector: '[data-testid="live-timer-readout"][data-phase="done"]', label: 'the finished timer', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="live-timer-readout"][data-final="true"]', label: 'no last-seconds state once time is up', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.lc-root .lc-digits', label: 'digits in the warning ink', min: 4.5 },
		{ selector: '.lc-root .lc-over', label: 'overtime line', min: 4.5 }
	],
	motion: [{ selector: '[data-testid="live-timer-readout"]', label: 'the finish, gated behind no-preference', expect: 'gated' }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
