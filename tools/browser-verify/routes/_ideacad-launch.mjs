/**
 * THE IDEACAD FRONT DOOR'S OWN CLAIMS, stated once for every state of
 * `/dev/ideacad-launch` a spec measures (ledger 0296). A leading underscore
 * keeps the loader from reading this as a route (`routes/_shared.mjs`).
 *
 * WHY A PAGE-SIDE PROBE AND NOT THE STOCK CHECKS. Three of these claims
 * depend on the WIDTH: the folder rail folds into one row below 960px and is
 * a column above it, and the band holds a different number of rows at 375,
 * 960 and 1440. A presence row cannot say "visible here and hidden there", so
 * the probe reads `innerWidth` and asks the question that holds at every
 * width. The sentences carry no numbers; a failure appends what it measured.
 *
 * THE TEXT-TO-BORDER CLAIM IS THE REASON THIS EXISTS. Mr. Pina named it:
 * button text never touches its border. It was 0 to 1px on 25 controls here
 * before the room gave every button a padding floor. The probe measures the
 * text's own range rects against the INNER edge of the border, on every
 * visible bordered or filled control, and reports how many it examined, so a
 * sweep that found nothing cannot read as a pass.
 */
function launchVerdicts() {
	const out = [];
	const say = (claim, ok, detail) => out.push(ok ? `${claim} ok` : `${claim} FAILED: ${detail}`);
	const vis = (el) => {
		for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
			const cs = getComputedStyle(e);
			if (cs.display === 'none' || cs.visibility === 'hidden') return false;
		}
		const r = el.getBoundingClientRect();
		return r.width > 0.5 && r.height > 0.5;
	};
	const clear = (c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
	const root = document.querySelector('.launch');
	if (!root) return ['the launch page is on screen FAILED: no .launch'];

	/* 1. The word never touches its border. */
	let examined = 0;
	let worst = null;
	for (const el of root.querySelectorAll('button, a')) {
		if (!vis(el)) continue;
		const cs = getComputedStyle(el);
		const border = ['Left', 'Right', 'Top', 'Bottom'].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' && !clear(cs[`border${s}Color`]));
		if (!border && clear(cs.backgroundColor)) continue;
		const rects = [];
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		let n;
		while ((n = walker.nextNode())) {
			if (!n.textContent.trim() || !vis(n.parentElement)) continue;
			const range = document.createRange();
			range.selectNodeContents(n);
			for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5) rects.push(r);
		}
		if (!rects.length) continue;
		examined++;
		const b = el.getBoundingClientRect();
		const bw = (s) => parseFloat(cs[`border${s}Width`]) || 0;
		const h = Math.min(Math.min(...rects.map((r) => r.left)) - b.left - bw('Left'), b.right - bw('Right') - Math.max(...rects.map((r) => r.right)));
		const v = Math.min(Math.min(...rects.map((r) => r.top)) - b.top - bw('Top'), b.bottom - bw('Bottom') - Math.max(...rects.map((r) => r.bottom)));
		if ((h < 6 || v < 2) && (!worst || h < worst.h)) worst = { text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30), h: +h.toFixed(1), v: +v.toFixed(1) };
	}
	say('every bordered or filled control keeps its word 6px from its sides and 2px from its top and bottom', examined > 0 && !worst, worst ? JSON.stringify(worst) : `examined ${examined}`);

	/* 2. The site's own logo, home, beside the IdeaCAD lockup. */
	const logo = root.querySelector('.site-logo');
	say('the site logo is on screen and links home', !!logo && vis(logo) && logo.getAttribute('href') === '/' && !!logo.querySelector('img'), logo ? `href ${logo.getAttribute('href')}` : 'no .site-logo');
	const h1 = root.querySelector('h1');
	say('the IdeaCAD lockup is the page heading, cube and name', !!h1 && vis(h1) && !!h1.querySelector('svg') && /IdeaCAD/.test(h1.textContent), h1 ? h1.textContent.trim() : 'no h1');

	/* 3. The band holds only the rows it needs: its height is its rows, their gaps and its padding, and nothing in it overlaps. */
	const band = root.querySelector('.masthead');
	if (band) {
		const items = [...band.children].flatMap((c) => (getComputedStyle(c).display === 'contents' ? [...c.children] : [c])).filter(vis).map((el) => el.getBoundingClientRect());
		const rows = [];
		for (const r of items.sort((a, b) => a.top - b.top)) {
			const row = rows.find((x) => Math.abs(x.top - r.top) < 6 || (r.top < x.bottom - 2 && r.bottom > x.top + 2));
			if (row) { row.top = Math.min(row.top, r.top); row.bottom = Math.max(row.bottom, r.bottom); } else rows.push({ top: r.top, bottom: r.bottom });
		}
		const cs = getComputedStyle(band);
		const need = rows.reduce((s, r) => s + (r.bottom - r.top), 0) + Math.max(rows.length - 1, 0) * (parseFloat(cs.rowGap) || 0) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
		const have = band.getBoundingClientRect().height;
		say('the band is no taller than its rows', items.length > 0 && have <= need + 1.5, `${have.toFixed(1)}px for ${rows.length} row(s) needing ${need.toFixed(1)}px`);
		let hit = null;
		for (let i = 0; i < items.length && !hit; i++) for (let j = i + 1; j < items.length; j++) {
			const a = items[i], c = items[j];
			const w = Math.min(a.right, c.right) - Math.max(a.left, c.left), hh = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
			if (w > 0.5 && hh > 0.5) { hit = `${w.toFixed(1)}x${hh.toFixed(1)}`; break; }
		}
		say('nothing in the band overlaps', items.length > 1 && !hit, hit ?? `${items.length} item(s)`);
	} else if (!root.classList.contains('embedded')) say('the band is on screen', false, 'no .masthead');

	/* 4. The models come first: the first card starts in the top half of the first screen, and a group's rows sit one gap apart. */
	const cards = [...root.querySelectorAll('[data-testid="model-card"]')].filter(vis);
	if (cards.length) {
		const top = cards[0].getBoundingClientRect().top + window.scrollY;
		say('the first model starts in the top half of the first screen', top < innerHeight / 2, `top ${top.toFixed(1)} of ${innerHeight}`);
		let widest = 0;
		for (const g of root.querySelectorAll('.cards')) {
			const cs = [...g.children].map((c) => c.getBoundingClientRect());
			const tops = [...new Set(cs.map((c) => Math.round(c.top)))].sort((a, b) => a - b);
			for (let i = 1; i < tops.length; i++) widest = Math.max(widest, tops[i] - Math.max(...cs.filter((c) => Math.round(c.top) === tops[i - 1]).map((c) => c.bottom)));
		}
		say('the card rows in a group sit one gap apart', widest <= 16, `${widest.toFixed(1)}px between rows`);
	}

	/* 5. The folder rail folds into one row on a phone and stands as a column on a desktop. */
	const toggle = root.querySelector('[data-testid="filters-toggle"]');
	const folders = [...root.querySelectorAll('.rail .folder')];
	const phone = innerWidth < 960;
	const folded = !!toggle && vis(toggle) && folders.length > 0 && folders.every((f) => !vis(f));
	const standing = (!toggle || !vis(toggle)) && folders.length > 0 && folders.every(vis);
	say('the folders fold into one row below 960px and stand as a column above it', phone ? folded : standing, `at ${innerWidth}px: toggle drawn ${!!toggle && vis(toggle)}, ${folders.filter(vis).length}/${folders.length} folder rows drawn`);

	/* 6. Nothing is wider than the window. */
	say('nothing is wider than the window', document.documentElement.scrollWidth <= innerWidth, `${document.documentElement.scrollWidth} in ${innerWidth}`);
	return out;
}

export const LAUNCH_VERDICTS = String(launchVerdicts);

/**
 * The stock interactive selector (`checks-visual.mjs`'s `INTERACTIVE`), minus
 * anything inside a FOLDED Disclosure region. That region is `display: none`,
 * so the controls in it are not rendered at all, which layout-sanity's own
 * header says is not a zero box. The check asks only the element's OWN
 * display, so without this every folder and tag button reads as a 0x0 finding
 * at 375 while the fold is doing exactly what it is for. The fold itself is
 * asserted by the probe above, in both directions.
 */
export const UNFOLDED_INTERACTIVE = ['button', 'a[href]', 'input', 'select', 'textarea', 'summary', '[role="button"]', '[role="treeitem"]', '[role="tab"]', '[role="option"]', '[tabindex]:not([tabindex="-1"])']
	.map((s) => `${s}:not([data-open="false"] *)`)
	.join(', ');

/** The claims above, in the order the probe states them, for a state with model cards on screen. */
export const LAUNCH_CLAIMS = [
	'every bordered or filled control keeps its word 6px from its sides and 2px from its top and bottom ok',
	'the site logo is on screen and links home ok',
	'the IdeaCAD lockup is the page heading, cube and name ok',
	'the band is no taller than its rows ok',
	'nothing in the band overlaps ok',
	'the first model starts in the top half of the first screen ok',
	'the card rows in a group sit one gap apart ok',
	'the folders fold into one row below 960px and stand as a column above it ok',
	'nothing is wider than the window ok'
];
