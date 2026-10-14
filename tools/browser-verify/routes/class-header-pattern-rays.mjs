/**
 * THE RAYS PATTERN FLOWS CONTINUOUSLY (decision 61, 2026-10-14), at 375
 * and 1440: one infinite loop of exactly one period, phase-locked to the clock,
 * gated behind no-preference, with no transform and nothing that can uncover
 * the banner.
 */
import { FLOW, IGNORE, READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?pattern=rays',
	label: 'Class pattern, rays: a continuous seamless flow, still under reduce',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: READY, label: 'the header has painted' }],
	presence: [{ selector: '.ct-banner[data-pattern="rays"] [data-testid="class-banner-pattern"]', label: 'the rays layer', expectPresent: 1, maxPresent: 1 }],
	motion: [{ selector: '[data-testid="class-banner-pattern"]', label: 'the rays flow, gated behind no-preference', expect: 'gated' }],
	orderResult: [
		{
			label: 'the rays flow: one running infinite loop of one period, moving, phase-locked to the clock, untransformed and filling the banner',
			evaluate: FLOW,
			expected: ['flowing=true', 'drawn=true', 'infinite=true', 'one period=true', 'moved=true', 'phase locked=true', 'no transform=true', 'fills the banner=true']
		}
	]
};
