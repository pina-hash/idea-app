/**
 * THE TIMER-ONLY WALL UNDER SPACE WHITE, ON A WASHED-OUT PROJECTOR (reports
 * R12, R13). Space White is the theme the classroom projects in (Mr. Pina's
 * own wall is on it), so this is the one judged by the projector model
 * (`PROJECTOR_MODEL` in ../checks.mjs: 300:1 native, ambient light at 10% of
 * white): text 4.5 washed, a boundary 2 washed.
 *
 * THE RING'S FACE IS AN SVG GRADIENT, which the contrast walk cannot see: it
 * reads ancestors' background-color and would report the page plate. So the
 * digits are judged by `RING_FACE_CONTRAST`, which reads the two colour stops
 * the browser RESOLVED for the face and the digits' own colour, and the arc
 * against the wall's flattened track (the Plate's two-tone track put the green
 * arc on its own darker stop here, which the flattening exists to stop).
 */
import { PROJECTOR_MODEL } from '../checks.mjs';
import { EIGHT_H, PROJECTOR_READY, RING_FACE_CONTRAST, RING_FILLS, WALL_FITS_ANY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=timer&theme=space-white',
	label: 'Class projector (Space White): the ring timer, measured washed out (R12)',
	prepare: [
		PROJECTOR_READY,
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		{ waitFor: `() => !!document.querySelector('[data-testid="projector-timer"] [data-testid="plate-ring"]')`, timeoutMs: 10000 }
	],
	orderResult: [
		{ label: 'the ring is the timer and fills the wall; the digits read from the back', evaluate: RING_FILLS(0.6, 0.08), expected: ['a ring drawn', 'the ring fills the wall', 'the digits read from the back'] },
		{
			label: 'the digits on the ring face (4.5 washed) and the arc on its track (2 washed), from the resolved SVG stops',
			evaluate: RING_FACE_CONTRAST(PROJECTOR_MODEL.contrast, PROJECTOR_MODEL.ambient),
			expected: ['digits clear 4.5 washed on the ring face', 'the arc clears 2 washed on its track']
		},
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 }],
	contrast: [
		{ selector: '.lp-class', label: 'class name (washed)', min: 4.5, projector: true },
		{ selector: '.lp-clock', label: 'clock (washed)', min: 4.5, projector: true },
		{ selector: '.lp-word', label: 'timer word, muted (washed)', min: 3, projector: true }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
