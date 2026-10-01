/**
 * THE WALL TIMER WHEN TIME IS UP, UNDER SPACE WHITE, ON A WASHED-OUT
 * PROJECTOR (ledger 0298). The pinned finished face (0:00.00, over by 0:32)
 * judged by `PROJECTOR_MODEL`: the digits, the word and the overtime are
 * STATUS ink on the warning fill, which keeps 3.0 washed; the finish ring is a
 * boundary and keeps 2.0.
 */
import { PROJECTOR_MODEL } from '../checks.mjs';
import { EIGHT_H, PROJECTOR_READY, READOUT_PARTS, RING_FACE_CONTRAST, WALL_FITS_ANY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=done&clock=pinned&theme=space-white',
	label: 'Class projector (Space White): time is up, measured washed out',
	prepare: [
		PROJECTOR_READY,
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		{ waitFor: `() => !!document.querySelector('[data-testid="projector-timer-burst"]')`, timeoutMs: 10000 }
	],
	orderResult: [
		{ label: 'the face holds 0:00.00 once time is up', evaluate: READOUT_PARTS('[data-testid="projector-timer-digits"]'), expected: ['0:00', '.00'] },
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] },
		{ label: 'the digits on the ring face, 4.5 washed (the arc is empty once time is up)', evaluate: RING_FACE_CONTRAST(PROJECTOR_MODEL.contrast, PROJECTOR_MODEL.ambient, { arc: false }), expected: ['digits clear 4.5 washed on the ring face'] }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="projector-timer"][data-phase="done"]', label: 'the finished timer', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.lp-word', label: 'timer word, status ink (washed)', min: 3, projector: true },
		{ selector: '.lp-over', label: 'overtime line, status ink (washed)', min: 3, projector: true },
		{ selector: '.lp-ring', label: 'the finish ring, a boundary (washed)', min: 2, projector: true }
	],
	motion: [{ selector: '[data-testid="projector-timer"]', label: 'the finish, gated behind no-preference', expect: 'gated' }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
