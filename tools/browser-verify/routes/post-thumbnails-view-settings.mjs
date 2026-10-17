/**
 * THE CLASS DEFAULT THUMBNAIL SHAPE on the class's Settings tab (ledger 0396):
 * the REAL ClassSettingsPanel with its Post thumbnails card over an in-memory
 * writer. A press on Banner writes `banner` and the preview redraws as banners.
 */
import { THUMBS, THUMBS_READY } from './_post-thumbnails.mjs';

export default {
	path: `${THUMBS}?view=settings`,
	label: 'The class default thumbnail shape, on the Settings tab',
	prepare: [
		THUMBS_READY,
		{
			click: '[data-testid="settings-thumb-shape"][data-shape="banner"]',
			until: `() => document.querySelector('[data-testid="settings-thumb-shape"][data-shape="banner"]')?.getAttribute('aria-pressed') === 'true'`,
			attempts: 20
		}
	],
	orderResult: [
		{ label: 'the writer was asked for banner', evaluate: `() => window.__thumbClassDefault ?? []`, expected: ['banner'] },
		{
			label: 'the preview is three banners',
			evaluate: `() => [...document.querySelectorAll('[data-testid="settings-thumb-preview"] [data-testid="post-thumb"]')].map((p) => p.getAttribute('data-shape'))`,
			expected: ['banner', 'banner', 'banner']
		}
	],
	presence: [
		{ selector: '[data-testid="settings-thumbnails"]', label: 'the Post thumbnails card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-thumb-shape"]', label: 'Built in, Off, Tile, Wide and Banner', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="settings-thumb-shape"][aria-pressed="true"]', label: 'exactly one lit', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [{ selector: '[data-testid="settings-thumb-msg"]', label: 'the save is said', must: ['Banner'] }],
	contrast: [
		{ selector: '[data-testid="settings-thumbnails"] .note', label: 'card sentences', min: 4.5 },
		{ selector: '[data-testid="settings-thumbnails"] .cths-title', label: 'preview titles', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="settings-thumb-shape"]', label: 'the shape keys', min: 44 }]
};
