/**
 * OLD STUDENT ACTIVITY IS NOT SHOWN (reports R12, R13). The control view reads
 * presence every 30 s while it is open and in front; a control view that is
 * hidden or covered stops reading, and a wall that went on showing its last
 * counts would be showing a class that has moved on. The frame here carries
 * activity read ten minutes ago, past `WALL_ACTIVITY_STALE_MS` (three), so the
 * wall paints no activity card; everything else on the frame still shows.
 *
 * The positive control is `classroom-projector-demo-counts`: the same frame
 * with activity read twelve seconds ago, where the card is there.
 */
import { PROJECTOR_READY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=stale',
	label: 'Class projector: activity older than three minutes is not shown (R12, R13)',
	prepare: [PROJECTOR_READY, { waitFor: `() => !!document.querySelector('[data-testid="projector-agenda"]')`, timeoutMs: 10000 }],
	presence: [
		{ selector: '[data-testid="projector-activity"], [data-testid="projector-count"]', label: 'no activity card for old counts', expectPresent: 0 },
		{ selector: '[data-testid="projector-agenda"]', label: 'the rest of the frame still shows: the agenda', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-timer"]', label: 'the timer', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
