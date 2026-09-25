/**
 * THE VIDEOS SECTION UNDER SPACE WHITE (ledger 0298, R08). The harness holds
 * no session, so the attribute is forced the way /dev/classroom-live forces
 * it. The same cards as the student spec, re-measured on the white class page.
 */
import { CARDS, OPEN_VIDEOS, VIDEOS_READY } from './_class-videos.mjs';

export default {
	path: '/dev/class-videos?theme=space-white',
	label: 'Videos in a class under Space White',
	prepare: [
		VIDEOS_READY,
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		OPEN_VIDEOS
	],
	orderResult: [
		{
			label: 'the same three cards',
			evaluate: `() => (${CARDS})().map((c) => c.split(' | ')[0])`,
			expected: ['Cal1perDial', 'Zero1ngStep', 'GearRat1o42']
		}
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="class-video"]', label: 'three cards', expectPresent: 3, maxPresent: 3, expectVisible: 3 }
	],
	contrast: [
		{ selector: '[data-testid="class-video"] .cvid-label', label: 'card title', min: 4.5 },
		{ selector: '[data-testid="class-video"] .cvid-meta', label: 'card meta line', min: 4.5 },
		{ selector: '[data-testid="class-video"] .cvid-from-title', label: 'item link', min: 4.5 },
		{ selector: '[data-testid="class-video"] .cvid-from-word', label: 'Posted in', min: 4.5 },
		{ selector: '[data-testid="class-video"] .cvid-also-label', label: 'Also in', min: 4.5 },
		{ selector: '[data-testid="class-videos-count"]', label: 'the count', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="class-video"] .cvid-from', label: 'Posted in / Also in', min: 44 }]
};
