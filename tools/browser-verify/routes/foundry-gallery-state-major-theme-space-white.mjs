/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { MAJOR_DRIVE, STAR_CONTRAST } from './foundry-gallery-state-major.mjs';

/**
 * THE MAJOR RELEASE MARK'S ROOM TONE UNDER SPACE WHITE.
 *
 * In a page (the detail pane and the inspector) the mark is not pinned: its
 * word takes the room's `--text-1` and its star `--violet-ink`, which Space
 * White re-declares for a light ground (#624697, lightness only). So it is
 * measured here on the light twin, after the same drive as the dark spec.
 */
export default {
	path: '/dev/foundry-gallery?state=major&theme=space-white',
	aliasOf: '/dev/foundry-gallery?theme=space-white',
	label: 'Foundry: the major release mark and its control under Space White',
	prepare: [
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		...MAJOR_DRIVE,
		STAR_CONTRAST
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="foundry-detail-major"]', label: 'the mark in the review pane (the gallery detail was read open, then closed)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-major-remove"]', label: 'Remove', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="foundry-detail-major"] .fdy-major-word', label: 'the mark word, detail pane', min: 4.5 },
		{ selector: '[data-testid="foundry-major-release"] .fdy-major-word', label: 'the mark word, inspector', min: 4.5 },
		{ selector: '[data-testid="foundry-major-said"]', label: 'the acknowledgement', min: 4.5 },
		{ selector: '[data-testid="foundry-major-remove"]', label: 'Remove control', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="foundry-major-remove"]', label: 'Remove control', min: 44 }]
};
