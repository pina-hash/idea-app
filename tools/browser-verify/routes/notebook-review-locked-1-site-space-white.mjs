import base from './notebook-review-locked-1.mjs';

/**
 * A CLASS'S NOTEBOOK TAB FOR ITS TEACHER, UNDER SPACE WHITE (ledger 0297,
 * package F4a). The compliance grid's seven states are a LOCKED contract --
 * glyph, 1.9rem cell, Share Tech Mono -- and only their inks and pinned fills
 * are a theme's to move; on paper they are re-authored for these grounds and
 * pinned by tests/notebook-theme.test.ts (every ink 4.5:1 on its own fill or
 * on the card). This row measures the legend's words and the grid in a real
 * browser on the white classroom, with the same fit assertion as the default.
 */
export default {
	...base,
	path: '/dev/notebook-review?locked=1&site=space-white',
	label: "A class's Notebook tab, manager, under Space White (the grid's inks on paper)",
	prepare: [
		{
			waitFor: '() => document.documentElement.getAttribute("data-theme") === "space-white"',
			timeoutMs: 5_000
		},
		...base.prepare
	],
	contrast: [
		...base.contrast,
		{ selector: 'button.cell.on_time', label: 'on-time glyph on its pinned fill', min: 4.5 },
		{ selector: 'button.cell.late', label: 'late glyph on its pinned fill', min: 4.5 },
		{ selector: 'button.cell.flagged', label: 'flagged glyph on its pinned fill', min: 4.5 },
		{ selector: 'button.cell.missing', label: 'missing glyph on the card', min: 4.5 },
		{ selector: 'button.cell.scheduled', label: 'scheduled glyph on the card', min: 4.5 }
	]
};
