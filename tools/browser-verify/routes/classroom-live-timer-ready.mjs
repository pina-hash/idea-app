/**
 * THE TEACHER'S TIMER, STARTED AND COUNTING (ledger 0298, R27's tail), in the
 * REAL control view on the real clock.
 *
 * The harness seeds a ten-minute countdown, set and not started
 * (`?timer=ready`, the fixture's `demoTimer`); the step presses the real
 * Start control until the face moves off 10:00.00.
 *
 * WHAT IS MEASURED:
 *   - the control view reads HUNDREDTHS, the fraction drawn apart;
 *   - it ticks on every frame: watched for a second, at least twenty different
 *     readings (a frame is about 16.7 ms and a hundredth 10 ms, so every
 *     painted frame is a new reading). The sample and this machine's frame
 *     pacing are printed by the prepare step and are not gated;
 *   - ten minutes is not the last ten seconds: no warning ink, no beat;
 *   - the digits and the hundredths clear 4.5:1.
 */
import { LIVE_READY, sampleTimer, timerTicked } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-live?timer=ready',
	label: 'Live class control view: the timer started, counting in hundredths',
	prepare: [
		LIVE_READY,
		/* The stored timer is adopted on MOUNT, after the grid has painted from
		   the server render, so the control exists only once the view is live. */
		{ waitFor: `() => !!document.querySelector('[data-testid="live-timer-toggle"]')`, timeoutMs: 15000 },
		{
			click: '[data-testid="live-timer-toggle"]',
			until: `() => document.querySelector('[data-testid="live-timer-readout"]')?.dataset.phase === 'running'`
		},
		{ evaluate: sampleTimer('[data-testid="live-timer-digits"]', 1000) }
	],
	orderResult: [
		{
			label: 'the control view reads hundredths',
			evaluate: `() => { const t = document.querySelector('[data-testid="live-timer-digits"]').textContent; return [/^\\d+:\\d\\d\\.\\d\\d$/.test(t) ? 'hundredths' : t]; }`,
			expected: ['hundredths']
		},
		{ label: 'the timer ticks on every frame: different readings in one second', evaluate: timerTicked(20), expected: ['at least 20 distinct readings'] },
		{ label: 'the start control now pauses', evaluate: `() => [document.querySelector('[data-testid="live-timer-toggle"]').textContent.trim()]`, expected: ['Pause'] }
	],
	presence: [
		{ selector: '[data-testid="live-timer-readout"][data-phase="running"]', label: 'the running timer', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="live-timer-readout"][data-final="true"]', label: 'not in its last seconds', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.lc-root .lc-digits', label: 'timer digits', min: 4.5 },
		{ selector: '.lc-root .lc-frac', label: 'hundredths', min: 4.5 },
		{ selector: '.lc-root .lc-word', label: 'timer word', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="live-timer"] button', label: 'timer buttons' }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
