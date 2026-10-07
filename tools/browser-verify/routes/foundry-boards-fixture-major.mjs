/* NO `order` EXPORT, deliberately -- see routes.mjs. */
import { choose, DEAD_SPACE, SIDEWAYS_SCROLLERS, SLUGS } from './foundry-boards.mjs';

/**
 * THE MAJOR RELEASES SECTION, MEASURED (report 927b1c69, decision 39 narrowed).
 *
 * The same nine apps as `/dev/foundry-boards`, with Maze Maker and Tide Pool
 * marked as major releases and the two house cards (IDEA GREENLINE, IDEA
 * VANGUARD) passed, exactly as the /foundry route passes them. So the section
 * holds four cards and the full list below it still holds nine.
 *
 * WHAT DECISION 39 WAS ABOUT, AND WHAT IS MEASURED AGAINST IT. The ranked
 * sections it removed left dead space (one portrait cover made a whole flex
 * ROW tall) and a stack of sideways scrollbars. The section here is the same
 * multicol mosaic under its own class, so this spec reads, at every width:
 *
 *   - the worst gap between two cards in one of the SECTION's columns, and the
 *     empty strip right of its last column, both scoped to the section's own
 *     list (the shared `DEAD_SPACE` reads `.fdy-gal-mosaic`, which is the FULL
 *     LIST and nothing else, so it measures the list exactly as it always did);
 *   - the space BETWEEN the two lists: from the section's lowest card to the
 *     "All apps" rule, and from that heading to the list's first card, each of
 *     which must be the layout's own spacing and nothing more;
 *   - how many regions in the pane scroll sideways (none).
 *
 * THE SECTION FOLLOWS THE ONE SORT CONTROL, which is the other half of the
 * narrowing: Maze Maker leads under Most played (96 plays against 12) and
 * Tide Pool under Newest (60 days old against 300), and both are driven.
 *
 * THE TWO TEXTS ON A CARD SIT ON GRADIENTS, so the badge, the house title and
 * the house kicker are measured by compositing the real computed values, the
 * way `foundry-mosaic.mjs` measures the name plate, and not by the ordinary
 * contrast walk, which would report the card's bed.
 */

/* The section's own dead space, the `DEAD_SPACE` arithmetic scoped to its list. */
const SECTION_DEAD_SPACE = {
	evaluate: `() => {
		const ul = document.querySelector('[data-testid="foundry-gallery-major"]');
		if (!ul) return 'NO SECTION';
		const lis = [...ul.querySelectorAll(':scope > li')];
		const cols = new Map();
		for (const li of lis) { const b = li.getBoundingClientRect(); const x = Math.round(b.left); if (!cols.has(x)) cols.set(x, []); cols.get(x).push(b); }
		let worst = 0; const bottoms = [];
		for (const bs of cols.values()) { bs.sort((a, b) => a.top - b.top); for (let i = 1; i < bs.length; i++) worst = Math.max(worst, bs[i].top - bs[i - 1].bottom); bottoms.push(bs[bs.length - 1].bottom); }
		const top = Math.min(...lis.map((li) => li.getBoundingClientRect().top));
		const strip = ul.getBoundingClientRect().right - Math.max(...lis.map((li) => li.getBoundingClientRect().right));
		return 'section: ' + lis.length + ' cards in ' + cols.size + ' column(s) at ' + window.innerWidth + 'px; worst gap in a column ' + worst.toFixed(1) + 'px; empty strip right ' + strip.toFixed(1) + 'px; column heights ' + bottoms.map((b) => Math.round(b - top)).join('/') + 'px';
	}`,
	until: `() => {
		const ul = document.querySelector('[data-testid="foundry-gallery-major"]');
		if (!ul) return false;
		const lis = [...ul.querySelectorAll(':scope > li')];
		if (lis.length !== 4) return false;
		const cols = new Map();
		for (const li of lis) { const b = li.getBoundingClientRect(); const x = Math.round(b.left); if (!cols.has(x)) cols.set(x, []); cols.get(x).push(b); }
		for (const bs of cols.values()) { bs.sort((a, b) => a.top - b.top); for (let i = 1; i < bs.length; i++) if (bs[i].top - bs[i - 1].bottom > 13) return false; }
		const strip = ul.getBoundingClientRect().right - Math.max(...lis.map((li) => li.getBoundingClientRect().right));
		return strip <= 1;
	}`
};

/*
	THE SPACE BETWEEN THE TWO LISTS. What is allowed is the layout's own
	spacing: the section's last card margin (12px) plus the pane's flex gap
	(16px) above the "All apps" rule, and the flex gap (16px) under the heading
	before the list's first card. Anything more is a void. The ragged end of
	the section's balanced columns is reported beside it, unasserted.
*/
const BETWEEN_SECTIONS = {
	evaluate: `() => {
		const sec = document.querySelector('[data-testid="foundry-gallery-major"]');
		const head = document.querySelector('[data-testid="foundry-gallery-all-heading"]');
		const list = document.querySelector('[data-testid="foundry-gallery-grid"]');
		if (!sec || !head || !list) return 'MISSING a section, the heading or the list';
		const cards = [...sec.querySelectorAll(':scope > li')].map((li) => li.getBoundingClientRect());
		const lowest = Math.max(...cards.map((b) => b.bottom));
		const highestEnd = Math.min(...[...new Set(cards.map((b) => Math.round(b.left)))].map((x) => Math.max(...cards.filter((b) => Math.round(b.left) === x).map((b) => b.bottom))));
		const firstCard = Math.min(...[...list.querySelectorAll(':scope > li')].map((li) => li.getBoundingClientRect().top));
		const h = head.getBoundingClientRect();
		window.__fdyBetween = { above: h.top - lowest, below: firstCard - h.bottom, ragged: lowest - highestEnd };
		return 'lowest section card to the All apps rule ' + (h.top - lowest).toFixed(1) + 'px; heading to the first list card ' + (firstCard - h.bottom).toFixed(1) + 'px; heading ' + h.height.toFixed(1) + 'px tall; the section ragged end ' + (lowest - highestEnd).toFixed(1) + 'px (unasserted)';
	}`,
	until: `() => { const b = window.__fdyBetween; return !!b && b.above >= 0 && b.above <= 29 && b.below >= 0 && b.below <= 17; }`
};

/*
	CONTRAST, COMPOSITED.

	THE BADGE is a pinned chip on a student's picture, so its worst ground is a
	PURE WHITE picture under the chip; the word and the star are measured there
	(the chip's alpha read off the page, never assumed). The HOUSE CARD's title
	sits on its own opaque gradient and is measured against both stops; its
	kicker sits on the scrim over the gradient's LIGHTER stop, at the scrim's
	alpha where the glyphs' top edge is, which is the thinnest it gets.
*/
export const MAJOR_CONTRAST = {
	evaluate: `() => {
		const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
		const ratio = (a, b) => { const L1 = lum(a[0], a[1], a[2]), L2 = lum(b[0], b[1], b[2]); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
		const nums = (s) => (s.match(/-?\\d+(?:\\.\\d+)?/g) || []).map(Number);
		const out = {};
		const chip = document.querySelector('[data-testid="fdy-card-major"] .fdy-major');
		if (chip) {
			const bg = nums(getComputedStyle(chip).backgroundColor);
			const a = bg.length > 3 ? bg[3] : 1;
			const ground = [0, 1, 2].map((i) => bg[i] * a + 255 * (1 - a));
			out.badgeWord = ratio(nums(getComputedStyle(chip.querySelector('.fdy-major-word')).color), ground);
			out.badgeStar = ratio(nums(getComputedStyle(chip.querySelector('.fdy-major-glyph')).fill), ground);
			out.chipAlpha = a;
		}
		const house = document.querySelector('[data-testid="fdy-house-card"]');
		if (house) {
			const stops = (getComputedStyle(house).backgroundImage.match(/rgba?\\([^)]*\\)/g) || []).map((c) => nums(c).slice(0, 3));
			const title = house.querySelector('.fdy-house-title');
			out.houseTitle = Math.min(...stops.map((s) => ratio(nums(getComputedStyle(title).color), s)));
			const plate = house.querySelector('.fdy-house-plate');
			const pstops = (getComputedStyle(plate).backgroundImage.match(/rgba?\\([^)]*\\)\\s+[\\d.]+%/g) || []).map((piece) => { const n = nums(piece); return { rgb: [n[0], n[1], n[2]], a: n.length > 4 ? n[3] : 1, at: n[n.length - 1] / 100 }; });
			const pr = plate.getBoundingClientRect();
			const range = document.createRange(); range.selectNodeContents(plate); const tr = range.getBoundingClientRect();
			const at = Math.max(0, Math.min(1, (pr.bottom - tr.top) / pr.height));
			let lo = pstops[0], hi = pstops[pstops.length - 1];
			for (let i = 0; i < pstops.length - 1; i++) { if (at >= pstops[i].at && at <= pstops[i + 1].at) { lo = pstops[i]; hi = pstops[i + 1]; } }
			const t = hi.at === lo.at ? 0 : (at - lo.at) / (hi.at - lo.at);
			const alpha = lo.a + (hi.a - lo.a) * t;
			const lighter = stops.reduce((m, s) => (lum(...s) > lum(...m) ? s : m), stops[0]);
			const ground = lo.rgb.map((c, i) => c * alpha + lighter[i] * (1 - alpha));
			out.houseKicker = ratio(nums(getComputedStyle(plate).color), ground);
		}
		window.__fdyMajorContrast = out;
		return Object.entries(out).map(([k, v]) => k + ' ' + (typeof v === 'number' ? v.toFixed(2) : v)).join('; ');
	}`,
	until: `() => { const c = window.__fdyMajorContrast; return !!c && c.badgeWord >= 4.5 && c.badgeStar >= 3 && c.houseTitle >= 4.5 && c.houseKicker >= 4.5; }`
};

const SECTION_SLUGS = `() => [...document.querySelectorAll('[data-testid="foundry-gallery-major"] [data-testid="fdy-card"]')].map((c) => c.getAttribute('data-app-slug'))`;

export const MAJOR_PREPARE = [
	{ evaluate: '() => new Promise((r) => setTimeout(() => r("settled"), 600))', until: '() => true' },
	SECTION_DEAD_SPACE,
	DEAD_SPACE,
	BETWEEN_SECTIONS,
	MAJOR_CONTRAST
];

export default {
	path: '/dev/foundry-boards?fixture=major',
	label: 'Foundry gallery: the Major releases section above the full list (decision 39 narrowed)',
	prepare: [
		...MAJOR_PREPARE,
		/* THE ONE CONTROL ORDERS THE SECTION: Newest puts Tide Pool first, then
		   Most played puts Maze Maker back, which is the state measured below. */
		choose(
			'new',
			`() => { const s = [...document.querySelectorAll('[data-testid="foundry-gallery-major"] [data-testid="fdy-card"]')].map((c) => c.getAttribute('data-app-slug')); return s.join(',') === 'tide-pool,maze-maker'; }`
		),
		choose(
			'played',
			`() => { const s = [...document.querySelectorAll('[data-testid="foundry-gallery-major"] [data-testid="fdy-card"]')].map((c) => c.getAttribute('data-app-slug')); return s.join(',') === 'maze-maker,tide-pool'; }`
		)
	],
	presence: [
		{ selector: '[data-testid="foundry-gallery-major-section"]', label: 'one Major releases section', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-gallery-major"] > li', label: 'two marked apps and two house cards in it', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="foundry-gallery-major"] [data-testid="fdy-house-card"]', label: 'house cards, in the section only', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="fdy-house-card"] [data-testid="fdy-house-kicker"]', label: 'each house card says IDEA original, permanently', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		/* THE LIST IS STILL EVERY APP: the positive control for the section
		   never replacing it. */
		{ selector: '[data-testid="foundry-gallery-grid"] [data-testid="fdy-card"]', label: 'the full list, all nine', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		/* THE BADGE IS PERMANENT, at 1440 under the hover rule too: it is not
		   the name plate. Two in the list, none in the section. */
		{ selector: '[data-testid="foundry-gallery-grid"] [data-testid="fdy-card-major"]', label: 'major badges on the two marked list cards', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="foundry-gallery-major"] [data-testid="fdy-card-major"]', label: 'no badge inside the section (the heading says it)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="foundry-gallery-all-heading"]', label: 'the All apps heading over the list', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.fdy-gal-mosaic', label: '`.fdy-gal-mosaic` still means the full list alone', expectPresent: 1, maxPresent: 1 },
		{ selector: 'select[data-testid="foundry-gallery-sort"]', label: 'still one sort control, above both', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-gallery-boards"]', label: 'ranked sections (still gone)', expectPresent: 0, maxPresent: 0 },
		{ selector: '.fdy-gal-board', label: 'a ranked section (still gone)', expectPresent: 0, maxPresent: 0 }
	],
	domOrder: [
		{ before: '[data-testid="foundry-gallery-sort"]', after: '[data-testid="foundry-gallery-major-section"]', label: 'the sort control sits above the section it orders' },
		{ before: '[data-testid="foundry-gallery-major-section"]', after: '[data-testid="foundry-gallery-grid"]', label: 'the section sits above the full list' }
	],
	textContains: [
		{ selector: '#fdy-gal-major-h', label: 'the section heading', must: ['Major releases'] },
		{ selector: '.fdy-gal-major-note', label: 'what the section is and who chose it', must: ['picked out by IDEA staff'] },
		{ selector: '[data-testid="foundry-gallery-all-heading"]', label: 'the list heading', must: ['All apps'] }
	],
	orderResult: [
		{ label: 'the section, under Most played: marked apps in the order in force', evaluate: SECTION_SLUGS, expected: ['maze-maker', 'tide-pool'] },
		{
			label: 'the house cards come last, in the registry order, linking out',
			evaluate: `() => [...document.querySelectorAll('[data-testid="foundry-gallery-major"] [data-testid="fdy-house-card"]')].map((a) => a.getAttribute('href'))`,
			expected: ['/greenline', '/vanguard/']
		},
		{
			label: 'the full list is ranked exactly as it is with no section',
			evaluate: SLUGS,
			expected: ['cookie-press', 'maze-maker', 'orbit-lab', 'sprout-sim', 'frog-frenzy', 'tide-pool', 'pixel-forge', 'bolt-run', 'quiet-quest']
		},
		{ label: 'regions in the gallery pane that scroll sideways', evaluate: SIDEWAYS_SCROLLERS, expected: ['0'] }
	],
	contrast: [
		{ selector: '#fdy-gal-major-h', label: 'section heading', min: 4.5 },
		{ selector: '.fdy-gal-major-note', label: 'section note', min: 4.5 },
		{ selector: '[data-testid="foundry-gallery-all-heading"]', label: 'All apps heading', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="fdy-house-card"]', label: 'house cards', min: 44 },
		{ selector: '[data-testid="foundry-gallery-major"] [data-testid="fdy-card"]', label: 'section cards', min: 44 }
	]
};
