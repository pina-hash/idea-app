/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * MARKING A MAJOR RELEASE, DRIVEN END TO END ON THE REAL COMPONENTS (0233).
 *
 * The harness mounts the real gallery above the real review queue, with an
 * in-memory `setMajor` that moves the page's own state, so a press in the
 * review half's inspector has to show up in the GALLERY half's Major releases
 * section and in both detail panes. Both halves open on the hostile probe app,
 * which is published and not hidden, so Mark is offered.
 *
 * THE DRIVE, AND WHY IT ENDS MARKED: Mark (the section appears with the app,
 * the acknowledgement reads back), Remove (the section is gone and the app is
 * STILL in the full list), Mark again. The measured state is the marked one,
 * so the room-tone mark and the Remove control are on screen for every row
 * below. Each press is a `click` whose `until` only the press can satisfy.
 *
 * THE BUTTON IS HIT-TESTED AT ITS CENTRE, because a 44px box that something
 * else paints over is not a tap target; a box read alone cannot tell the two
 * apart.
 *
 * THE ACKNOWLEDGEMENT IS READ AFTER THE ROUTE'S RE-READ, NOT BEFORE IT. The
 * harness's review half hands the inspector a fresh app object with the same
 * id on `onDecided`, as `invalidateAll()` does on /foundry/review, and the
 * re-read count is on the page (`review-reads`). Each acknowledgement step
 * waits for its write's re-read AND the sentence, so a note that a reload
 * wipes can no longer pass here: it shipped once that way, because a harness
 * with no `onDecided` never produced the second hand-over.
 */

/** The harness's count of review-half re-reads, read in the page. */
const READS = `Number(document.querySelector('[data-testid="review-reads"]')?.textContent ?? 0)`;
const SECTION_HAS_PROBE = `() => !!document.querySelector('[data-testid="foundry-gallery-major"] [data-app-slug="hostile-probe"]')`;

export const MAJOR_DRIVE = [
	{
		click: '[data-testid="foundry-major-mark"]',
		until: SECTION_HAS_PROBE
	},
	{
		evaluate: `() => 'after ' + ${READS} + ' re-read(s), acknowledged: ' + (document.querySelector('[data-testid="foundry-major-said"]')?.textContent.trim() ?? 'NOTHING')`,
		until: `() => ${READS} >= 1 && /Marked as a major release/.test(document.querySelector('[data-testid="foundry-major-said"]')?.textContent ?? '')`
	},
	{
		click: '[data-testid="foundry-major-remove"]',
		until: `() => !document.querySelector('[data-testid="foundry-gallery-major-section"]') && !!document.querySelector('[data-testid="foundry-gallery-grid"] [data-app-slug="hostile-probe"]')`
	},
	{
		evaluate: `() => 'after Remove and ' + ${READS} + ' re-read(s): sections ' + document.querySelectorAll('[data-testid="foundry-gallery-major-section"]').length + ', probe still in the full list ' + document.querySelectorAll('[data-testid="foundry-gallery-grid"] [data-app-slug="hostile-probe"]').length + ', detail marks ' + document.querySelectorAll('[data-testid="foundry-detail-major"]').length + ', said: ' + (document.querySelector('[data-testid="foundry-major-said"]')?.textContent.trim() ?? 'NOTHING')`,
		until: `() => ${READS} >= 2 && document.querySelectorAll('[data-testid="foundry-detail-major"]').length === 0 && /No longer a major release/.test(document.querySelector('[data-testid="foundry-major-said"]')?.textContent ?? '')`
	},
	{
		click: '[data-testid="foundry-major-mark"]',
		until: SECTION_HAS_PROBE
	},
	/* BOTH DETAIL PANES SAY SO: the gallery's and the review queue's, which
	   mount the same `FoundryDetail` with no staff branch in it. */
	{
		evaluate: `() => 'detail panes carrying the mark: ' + document.querySelectorAll('[data-testid="foundry-detail-major"]').length`,
		until: `() => document.querySelectorAll('[data-testid="foundry-detail-major"]').length === 2`
	},
	/* THEN CLOSE THE GALLERY HALF'S DETAIL, the routes' own "nothing open"
	   state, because below 1024px the split SWAPS and an open detail hides the
	   list: closing it is what puts the section and the full list on screen at
	   every width for the rows below. */
	{
		click: '[data-testid="gallery-deselect"]',
		until: `() => !document.querySelector('.fdy-gal-detail')`
	},
	{
		evaluate: `() => {
			const b = document.querySelector('[data-testid="foundry-major-remove"]');
			if (!b) return 'NO REMOVE CONTROL';
			b.scrollIntoView({ block: 'center', behavior: 'instant' });
			const r = b.getBoundingClientRect();
			const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
			window.__fdyMajorHit = { own: !!hit && (hit === b || b.contains(hit)), h: r.height, w: r.width };
			return 'Remove control ' + r.width.toFixed(1) + 'x' + r.height.toFixed(1) + ', the point at its centre answers ' + (hit ? hit.tagName.toLowerCase() + (hit === b ? ' (the control itself)' : '') : 'nothing');
		}`,
		until: `() => { const h = window.__fdyMajorHit; return !!h && h.own && h.h >= 44; }`
	}
];

/*
	THE STAR IS A GRAPHIC, so it clears the 3:1 non-text floor, and an SVG fill
	is not a text colour the ordinary contrast row reads. The ground is the
	real one: every background colour up the ancestor chain, composited from the
	first opaque one inward. Both room-tone marks are read (the detail pane's
	and the inspector's) and the worst is reported.
*/
export const STAR_CONTRAST = {
	evaluate: `() => {
		const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
		const ratio = (a, b) => { const L1 = lum(a[0], a[1], a[2]), L2 = lum(b[0], b[1], b[2]); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
		const nums = (s) => (s.match(/-?\\d+(?:\\.\\d+)?/g) || []).map(Number);
		const ground = (el) => {
			const layers = [];
			for (let n = el; n; n = n.parentElement) {
				const c = nums(getComputedStyle(n).backgroundColor);
				if (c.length < 3) continue;
				const a = c.length > 3 ? c[3] : 1;
				if (a === 0) continue;
				layers.push({ rgb: c.slice(0, 3), a });
				if (a >= 1) break;
			}
			let g = [255, 255, 255];
			for (const l of layers.reverse()) g = g.map((v, i) => l.rgb[i] * l.a + v * (1 - l.a));
			return g;
		};
		const stars = [...document.querySelectorAll('[data-fdy-major-mark="room"] .fdy-major-glyph')];
		const rs = stars.map((s) => ratio(nums(getComputedStyle(s).fill).slice(0, 3), ground(s)));
		window.__fdyStar = rs;
		return stars.length + ' room-tone star(s), on their real grounds ' + rs.map((r) => r.toFixed(2) + ':1').join(', ');
	}`,
	until: `() => { const r = window.__fdyStar; return !!r && r.length >= 2 && r.every((x) => x >= 3); }`
};

export default {
	path: '/dev/foundry-gallery?state=major',
	aliasOf: '/dev/foundry-gallery',
	label: 'Foundry: an admin marks a major release in the review inspector, and the gallery shows it',
	prepare: [...MAJOR_DRIVE, STAR_CONTRAST],
	presence: [
		{ selector: '[data-testid="foundry-major-release"]', label: 'the inspector section', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-major-remove"]', label: 'Remove, now that it is marked', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-major-mark"]', label: 'Mark (gone once marked)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="foundry-major-said"][role="status"]', label: 'the acknowledgement, a status', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-gallery-major-section"]', label: 'the gallery half grew the section', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-gallery-major"] > li', label: 'one marked app in it (this harness passes no house cards)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="foundry-gallery-grid"] [data-testid="fdy-card"]', label: 'the full list, still all three', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="foundry-gallery-grid"] [data-testid="fdy-card-major"]', label: 'the badge on the marked list card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* The gallery half's detail is closed by the drive (both panes were
		   read with it open); the review queue's pane still says so. */
		{ selector: '[data-testid="foundry-detail-major"]', label: 'the mark under the title, in the review pane', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="foundry-major-said"]', label: 'the acknowledgement of the second mark', must: ['Marked as a major release'] },
		{ selector: '[data-testid="foundry-major-release"]', label: 'the section says since when', must: ['Major release', 'since'] },
		{ selector: '[data-testid="last-decision"]', label: 'the transport was handed this app and true', must: ['"setMajor"', '"major":true'] },
		/* POSITIVE CONTROL that the route's re-read really ran after each of the
		   three presses, so the acknowledgement above survived one. */
		{ selector: '[data-testid="review-reads"]', label: 'the review half re-read after every press', must: ['3'] }
	],
	contrast: [
		{ selector: '[data-testid="foundry-detail-major"] .fdy-major-word', label: 'the mark word, room tone, detail pane', min: 4.5 },
		{ selector: '[data-testid="foundry-major-release"] .fdy-major-word', label: 'the mark word, room tone, inspector', min: 4.5 },
		{ selector: '[data-testid="foundry-major-said"]', label: 'the acknowledgement', min: 4.5 },
		{ selector: '[data-testid="foundry-major-remove"]', label: 'Remove control', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="foundry-major-remove"]', label: 'Remove control', min: 44 }]
};
