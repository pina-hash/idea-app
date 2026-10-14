/**
 * THE OFF SWITCH (decision 61): with Class banner motion set to Still on this
 * device, the real banner draws its pattern and runs nothing, in either media
 * state. WCAG 2.2.2's "a way to stop it", measured.
 */
import { IGNORE, READY, STILL } from './_class-header.mjs';

export default {
	path: '/dev/class-header?pattern=stripes&motion=still',
	label: 'Class pattern under the Still setting: drawn, not moving',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: READY, label: 'the header has painted' }],
	motion: [{ selector: '[data-testid="class-banner-pattern"]', label: 'nothing moves under Still', expect: 'never' }],
	orderResult: [{ label: 'the still pattern is drawn and has no animation', evaluate: STILL, expected: ['drawn=true', 'animations=0', 'flow=off'] }]
};
