/**
 * THE CLASS LIST BESIDE AN OPEN ITEM, NARROWED (ledger 0368, report R09: "This
 * kind of squishing ... unacceptable it's very messy", with a screenshot of a
 * unit header reading "HOOK COMPETITIO N", titles two or three words a line and
 * the meta line one field per line). `_`-prefixed, so `routes.mjs` does not
 * load it as a route.
 *
 * NOTHING HAD EVER NARROWED THE PANE IN A BROWSER: no spec pressed the
 * separator, and CLAUDE.md's rule for a nested pane is that a breakpoint inside
 * it is dead code until it is measured there. So the sweep below steps the
 * REAL separator with its own keys (Home is the 18rem floor, ArrowRight one
 * rem), and at each width reads the list itself: how far the pane overflows
 * sideways, how many words are broken across two lines in a unit name or a row
 * title, the title's width and lines, the meta line's lines and whether any
 * meta field was split inside itself, and the row's height.
 *
 * ABOVE 1024px ONLY. Below it a split shows one pane, and with an item open
 * that pane is the item: there is no list beside it to narrow. Each token then
 * states the phone's own rule (the list pane is not on screen) and says yes
 * only after checking it, the way the split specs' `room-bounded` does.
 */

/** The widths the sweep visits, in rem, in this order. 18 is the store's floor. */
export const SWEEP_REM = [18, 20, 22, 24, 26, 30];

export const SWEEP = `async () => {
	const wide = window.matchMedia('(min-width: 1024px)').matches;
	const nav = document.querySelector('[data-testid="class-nav-pane"]');
	const sep = document.querySelector('[data-testid="split-separator"]');
	const out = { wide, rows: [], error: null };
	window.__narrowSweep = out;
	if (!wide) {
		out.phoneListHidden = !nav || getComputedStyle(nav).display === 'none' || nav.getBoundingClientRect().width === 0;
		return 'below 1024px: the item is the one pane on screen, list hidden=' + out.phoneListHidden;
	}
	if (!nav || !sep) { out.error = 'missing ' + (!nav ? 'nav pane' : 'separator'); return out.error; }
	const settle = () => new Promise((r) => setTimeout(r, 450));
	const key = (k) => sep.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
	const round = (n) => Math.round(n * 10) / 10;
	const brokenWords = (root) => {
		let broken = 0, words = 0;
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		for (let t = walker.nextNode(); t; t = walker.nextNode()) {
			const text = t.textContent;
			const re = /\\S+/g;
			for (let m = re.exec(text); m; m = re.exec(text)) {
				words++;
				const r = document.createRange();
				r.setStart(t, m.index);
				r.setEnd(t, m.index + m[0].length);
				const tops = new Set([...r.getClientRects()].filter((b) => b.width > 0.5).map((b) => Math.round(b.top)));
				if (tops.size > 1) broken++;
			}
		}
		return { broken, words };
	};
	const linesOf = (el) => {
		const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
		return Math.round(el.getBoundingClientRect().height / lh);
	};
	/* ONE KEY, THEN WAIT FOR IT TO LAND. The separator computes each step from
	   the width it is SHOWING, so a key sent before the last one has been
	   written steps from the old width. Each press waits until the shown width
	   moves, up to a second. */
	const at = () => Number(sep.getAttribute('aria-valuenow'));
	const step = async () => {
		const from = at();
		for (let t = 0; t < 20 && at() === from; t++) await new Promise((r) => setTimeout(r, 50));
	};
	/* PAINT IS NOT INTERACTIVITY (CLAUDE.md): the server-rendered separator is
	   on screen before hydration attaches its key handler, and a key sent then
	   does nothing. So press until the width moves (proof the handler is
	   live), up to fifteen seconds, then go to the 18rem floor. */
	const start = at();
	let live = false;
	for (let t = 0; t < 60 && !live; t++) {
		key(start >= 30 ? 'ArrowLeft' : 'ArrowRight');
		await new Promise((r) => setTimeout(r, 250));
		live = at() !== start;
	}
	if (!live) { out.error = 'separator never answered a key'; return out.error; }
	key('Home');
	await step();
	await settle();
	for (const rem of ${JSON.stringify(SWEEP_REM)}) {
		for (let guard = 0; at() < rem && guard < 40; guard++) {
			key('ArrowRight');
			await step();
		}
		await settle();
		const shown = Number(sep.getAttribute('aria-valuenow'));
		const labels = [...nav.querySelectorAll('.group-label')];
		const names = [...nav.querySelectorAll('.row-name')];
		let bw = 0, wc = 0;
		for (const el of [...labels, ...names]) { const b = brokenWords(el); bw += b.broken; wc += b.words; }
		/* The long-named assignment's row: its title and its meta. */
		const longRow = [...nav.querySelectorAll('[data-testid="item-row"]')].find((r) => /Solidworks Day/.test(r.textContent));
		const title = longRow?.querySelector('.row-name');
		const meta = longRow?.querySelector('.row-meta');
		const metaTops = meta ? new Set([...meta.querySelectorAll('.meta-bit')].map((b) => Math.round(b.getBoundingClientRect().top))) : new Set();
		/* A field split across lines although it would fit on a line of its own
		   (ledger 0281 lets a field break only when it is genuinely wider than
		   the meta box: the date in the narrowest pane, an authored category). */
		let splitBits = 0;
		const metaWidth = meta ? meta.getBoundingClientRect().width : 0;
		for (const b of meta ? meta.querySelectorAll('.meta-bit') : []) {
			const r = document.createRange();
			r.selectNodeContents(b);
			const parts = [...r.getClientRects()].filter((x) => x.width > 0.5);
			const lines = new Set(parts.map((x) => Math.round(x.top))).size;
			const oneLine = parts.reduce((w, x) => w + x.width, 0);
			if (lines > 1 && oneLine <= metaWidth - 1) splitBits++;
		}
		const unit = labels.find((l) => /Hook Design Competition/i.test(l.textContent));
		const past = [...nav.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > nav.getBoundingClientRect().right + 0.5 && e.getBoundingClientRect().width > 0).slice(0, 3).map((e) => (e.getAttribute('data-testid') || e.className || e.tagName).toString().slice(0, 40));
		const stream = nav.querySelector('.stream');
		const card = longRow?.closest('.group-card');
		const kindWord = longRow?.querySelector('.row-kind');
		out.rows.push({
			rem: shown,
			pane: round(nav.getBoundingClientRect().width),
			stream: stream ? round(stream.getBoundingClientRect().width) : -1,
			cardPad: card ? getComputedStyle(card).paddingLeft : '?',
			kindShown: kindWord ? kindWord.getBoundingClientRect().width > 2 : null,
			overflow: round(nav.scrollWidth - nav.clientWidth),
			past,
			brokenWords: bw,
			words: wc,
			unitLines: unit ? linesOf(unit) : -1,
			titleWidth: title ? round(title.getBoundingClientRect().width) : -1,
			titleLines: title ? linesOf(title) : -1,
			metaLines: metaTops.size,
			metaFieldsSplit: splitBits,
			rowHeight: longRow ? round(longRow.getBoundingClientRect().height) : -1,
			grip: getComputedStyle(nav.querySelector('.row-grip') || document.body).display,
			expand: getComputedStyle(nav.querySelector('.row-expand') || document.body).display
		});
	}
	key('Home');
	await settle();
	return out.rows.map((r) => r.rem + 'rem (pane ' + r.pane + 'px, stream ' + r.stream + 'px, card padding ' + r.cardPad + '): overflow ' + r.overflow + 'px' + (r.past.length ? ' [' + r.past.join(', ') + ']' : '') + ', words broken ' + r.brokenWords + '/' + r.words + ', unit name ' + r.unitLines + ' line(s), long title ' + r.titleWidth + 'px x ' + r.titleLines + ' line(s), meta ' + r.metaLines + ' line(s) with ' + r.metaFieldsSplit + ' field(s) split, row ' + r.rowHeight + 'px, grip ' + r.grip + ', expand ' + r.expand + ', kind word ' + (r.kindShown ? 'shown' : 'visually hidden')).join(' | ');
}`;

/**
 * THE VERDICT ON THE SWEEP ABOVE, read from what it left on `window`. The
 * tokens are the same at both widths when they hold; below 1024px each says yes
 * only once the phone's arrangement is confirmed (the list pane is not on
 * screen beside an open item).
 */
export const SWEEP_VERDICT = `() => {
	const s = window.__narrowSweep;
	if (!s) return ['sweep:did-not-run'];
	if (s.error) return ['sweep:' + s.error];
	if (!s.wide) {
		const t = s.phoneListHidden ? 'yes' : 'no-the-list-is-on-screen-beside-the-item';
		return ['visited every width:' + t, 'pane never overflows sideways:' + t, 'no word broken across lines:' + t, 'no meta field split that would fit whole:' + t];
	}
	const visited = s.rows.map((r) => r.rem).join(',');
	const over = s.rows.filter((r) => r.overflow > 0.5);
	const broken = s.rows.filter((r) => r.brokenWords > 0);
	const split = s.rows.filter((r) => r.metaFieldsSplit > 0);
	return [
		'visited every width:' + (visited === ${JSON.stringify(SWEEP_REM.join(','))} ? 'yes' : 'no-' + visited),
		'pane never overflows sideways:' + (over.length ? 'no-at-' + over.map((r) => r.rem + 'rem-' + r.overflow + 'px').join('-') : 'yes'),
		'no word broken across lines:' + (broken.length ? 'no-at-' + broken.map((r) => r.rem + 'rem-' + r.brokenWords).join('-') : 'yes'),
		'no meta field split that would fit whole:' + (split.length ? 'no-at-' + split.map((r) => r.rem + 'rem-' + r.metaFieldsSplit).join('-') : 'yes')
	];
}`;
