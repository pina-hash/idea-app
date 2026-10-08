/**
 * Shared pieces of the /dev/class-header specs (ledger 0360, reports R19, R21,
 * R22). `_`-prefixed, so `routes.mjs` does not load it as a route.
 *
 * WHAT A BROWSER IS FOR HERE. Mr. Pina's complaint about the class banner was
 * SPACE ("it's just taking up space and I don't have a lot of space to work
 * with"), so the header's height and where the class content starts under it
 * are measured, at both widths, and printed. The notices must be unmistakable,
 * so their words are measured for contrast on their own ground. And every key
 * the header grew is a tap target, measured at its centre.
 */

/** The header and its notices have painted. */
export const READY = `() => !!document.querySelector('[data-testid="class-header"] .pane-title') && !!document.querySelector('[data-testid="harness-after-header"]')`;

/** The theme vote's trigger joins the key row once its tally has read. */
export const THEME_READY = {
	waitFor: `() => !!document.querySelector('[data-testid="class-header-row"] [data-testid="class-theme-toggle"]')`,
	label: 'the class theme trigger is in the key row'
};

/**
 * THE MEASUREMENT, printed rather than asserted: the header's own height (the
 * banner when there is one), the height of everything above the class content
 * (header, notices and posted teams), and how many lines the key row wrapped to.
 */
export const MEASURE = `() => {
	const header = document.querySelector('[data-testid="class-header"]');
	const top = (header.closest('.ct-banner') || header).getBoundingClientRect();
	const after = document.querySelector('[data-testid="harness-after-header"]').getBoundingClientRect();
	/* Every box-drawing item of the row, the boxless tools' own triggers included. */
	const items = [...header.querySelectorAll('[data-testid="class-header-row"] > *, [data-testid="class-header-row"] .ctool, [data-testid="class-header-row"] .ld-door, [data-testid="class-header-row"] .disc-trigger')];
	const tops = new Set(items.map((c) => c.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => Math.round((r.top + r.height / 2) / 12)));
	return 'header ' + top.height.toFixed(1) + 'px; class content starts ' + (after.top - top.top).toFixed(1) + 'px below the header top; lines of keys=' + tops.size;
}`;

export const IGNORE = ['Failed to load resource: net::ERR_FAILED'];

/**
 * ON A PHONE THE TOOLS, THE CLASS THEME AND NEXT DUE ARE TILES, two to a line,
 * and a tile that cut its word or its status would be a key nobody can read.
 * So every word that must be read whole is checked two ways: it is not
 * ellipsized (its scroll width fits its box) and it lies inside its own key's
 * box. Only the Next due TITLE and the theme's voted words may give, and they
 * carry their whole in the key's title. The same answer is expected at 1440,
 * where nothing is a tile.
 */
export const WHOLE = `() => {
	const shown = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().height > 0);
	const whole = (sel) => {
		const els = shown(sel);
		if (!els.length) return 'none';
		return String(els.every((e) => {
			const r = e.getBoundingClientRect();
			const key = e.closest('button, a').getBoundingClientRect();
			return e.scrollWidth <= e.clientWidth + 1 && r.left >= key.left - 0.5 && r.right <= key.right + 0.5 && r.top >= key.top - 0.5 && r.bottom <= key.bottom + 0.5;
		}));
	};
	return [
		'tool words whole=' + whole('[data-testid="class-header-row"] :is(.ctool-word, .ld-word)'),
		'tool statuses whole=' + whole('[data-testid="class-header-row"] .ctool-chip'),
		'theme word whole=' + whole('[data-testid="class-header-row"] .disc-label'),
		'next due words whole=' + whole('[data-testid="class-next-due"] :is(.ch-lead, .ch-when)')
	];
}`;

/**
 * A teacher's Quick post, New post and Units share one line, at both widths.
 * The harness stands in for ClassView's own two keys (`harness-new-post`,
 * `harness-units`), so either spelling is read.
 */
export const POSTING_LINE = `() => {
	const keys = ['[data-testid="quick-post-open"]', ':is([data-testid="new-post"], [data-testid="harness-new-post"])', ':is([data-testid="units-toggle"], [data-testid="harness-units"])'].map((sel) => document.querySelector('[data-testid="class-header-row"] ' + sel));
	if (keys.some((k) => !k)) return ['posting keys present=false'];
	const tops = new Set(keys.map((k) => Math.round(k.getBoundingClientRect().top)));
	return ['posting keys present=true', 'posting keys on one line=' + (tops.size === 1)];
}`;

/**
 * DOES THE MOVING PATTERN EVER UNCOVER ITS BOX? The pattern moves on TWO nested
 * layers since ledger 0368 (report R02): the inner `.ct-pattern` carries the
 * arrival drift and the outer `.ct-pattern-loop` the hover loop, which is
 * attached from the start, paused, and resumed by a hover, so a pointer that
 * leaves halfway holds it at ANY phase while the arrival may still be running.
 * So every pairing is checked: the arrival at eleven points from its first
 * frame to its last, each composed with the loop at its start, its midpoint and
 * its far end. At each one the inner layer's box, mapped through its own
 * transform about its own origin and then through the loop's about the loop's,
 * must contain all four corners of the clip both move inside. A seam where the
 * layer has slid or turned past an edge is what this would see; a check of the
 * still frame alone cannot. `COVERS_MARGIN` prints the worst margin in px,
 * which is what says how close the rays' 72px overscan runs at this width.
 *
 * IT SAMPLES PROBES, NEVER THE PAGE'S OWN ANIMATIONS. The first version paused
 * the CSS animation itself through the Web Animations API, and Chromium then
 * kept that paused animation alive after `reduce` removed the rule, so the
 * motion row that runs after this one reported the layer "still animating
 * (none, paused)" on every pattern: a finding the instrument made. A probe
 * built from the same keyframes outranks the CSS animation in the composite
 * order while it exists, and `cancel()` removes it without a trace.
 */
const COVER_PROBE = `(() => {
	const layer = document.querySelector('[data-testid="class-banner-pattern"]');
	const loop = layer.parentElement;
	const clip = layer.closest('.ct-pattern-clip');
	if (!loop || !loop.classList.contains('ct-pattern-loop') || !clip) return ['layers=missing'];
	const inA = layer.getAnimations();
	const loopA = loop.getAnimations();
	if (!inA.length || !loopA.length) return ['animated=false'];
	const probe = (el, anim) => {
		const t = anim.effect.getTiming();
		const p = el.animate(anim.effect.getKeyframes(), { duration: t.duration, easing: t.easing, fill: 'both' });
		p.pause();
		return p;
	};
	const a = probe(layer, inA[0]);
	const b = probe(loop, loopA[0]);
	const aEnd = a.effect.getComputedTiming().endTime;
	const bEnd = b.effect.getComputedTiming().endTime;
	const W = layer.offsetWidth, H = layer.offsetHeight, Li = layer.offsetLeft, Ti = layer.offsetTop;
	const LW = loop.offsetWidth, LH = loop.offsetHeight, Ll = loop.offsetLeft, Tl = loop.offsetTop;
	const cw = clip.clientWidth, ch = clip.clientHeight;
	const matrix = (el) => {
		const cs = getComputedStyle(el);
		const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
		const [ox, oy] = cs.transformOrigin.split(' ').map(parseFloat);
		return { m, ox, oy };
	};
	let worst = Infinity;
	/* The positive control: probes that never moved either layer would cover
	   the banner trivially, so the answer says whether any sample transformed. */
	let moved = false;
	for (let j = 0; j <= 2; j++) {
		b.currentTime = (bEnd * j) / 2;
		const lo = matrix(loop);
		if (!lo.m.isIdentity) moved = true;
		for (let i = 0; i <= 10; i++) {
			a.currentTime = (aEnd * i) / 10;
			const inn = matrix(layer);
			if (!inn.m.isIdentity) moved = true;
			const map = (x, y) => {
				const p = inn.m.transformPoint(new DOMPoint(x - inn.ox, y - inn.oy));
				const qx = p.x + inn.ox + Li, qy = p.y + inn.oy + Ti;
				const r = lo.m.transformPoint(new DOMPoint(qx - lo.ox, qy - lo.oy));
				return [r.x + lo.ox + Ll, r.y + lo.oy + Tl];
			};
			const quad = [map(0, 0), map(W, 0), map(W, H), map(0, H)];
			const inside = ([px, py]) => {
				let d = Infinity;
				for (let k = 0; k < 4; k++) {
					const [x1, y1] = quad[k], [x2, y2] = quad[(k + 1) % 4];
					const cross = ((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)) / Math.hypot(x2 - x1, y2 - y1);
					d = Math.min(d, cross);
				}
				return d;
			};
			for (const c of [[0, 0], [cw, 0], [cw, ch], [0, ch]]) worst = Math.min(worst, inside(c));
		}
	}
	a.cancel();
	b.cancel();
	/* Half a pixel of tolerance for a layer that rests exactly on its box (rings
	   and ripples carry no overscan, so at rest every corner is ON an edge). */
	return { tokens: ['animated=true', 'moved=' + moved, 'covered=' + (worst >= -0.5)], readout: 'banner clip ' + cw + 'x' + ch + 'px, loop layer ' + LW + 'x' + LH + 'px, worst corner margin over every arrival and loop pairing ' + worst.toFixed(1) + 'px' };
})`;

export const COVERS = `() => { const r = ${COVER_PROBE}(); return Array.isArray(r) ? r : r.tokens; }`;

/** The same probe's margin, printed (a prepare `evaluate`), never asserted. */
export const COVERS_MARGIN = `() => { const r = ${COVER_PROBE}(); return Array.isArray(r) ? r.join(' ') : r.readout; }`;

/**
 * THE HOVER NEVER SWAPS THE ANIMATION (ledger 0368, report R02). A rule that
 * replaced the arrival on `:hover` restarted it from its first frame every time
 * the pointer left, which is the jump that was reported. Read off the live
 * stylesheet: the loop layer carries a paused loop, the pattern layer carries
 * the arrival, and every rule whose selector names `:hover` sets only
 * `animation-play-state`. A real hover cannot be driven from this harness's
 * prepare steps (a dispatched event never sets `:hover`); the measured hover is
 * in the history entry, and the source pin is
 * `tests/classroom-class-theme-render.test.ts`.
 */
export const LOOP_PAUSED = `() => {
	const layer = document.querySelector('[data-testid="class-banner-pattern"]');
	const loop = layer.parentElement;
	const loopA = loop.getAnimations();
	const inA = layer.getAnimations();
	const hoverRules = [];
	const walk = (rules) => {
		for (const r of rules) {
			if (r.selectorText && r.selectorText.includes(':hover') && r.selectorText.includes('ct-pattern')) hoverRules.push(r);
			if (r.cssRules?.length) walk(r.cssRules);
		}
	};
	for (const sheet of document.styleSheets) {
		try { walk(sheet.cssRules); } catch {}
	}
	const onlyPlayState = hoverRules.length > 0 && hoverRules.every((r) => r.style.length === 1 && r.style[0] === 'animation-play-state');
	return [
		'loop attached=' + (loopA.length === 1),
		'loop paused=' + (loopA[0]?.playState === 'paused'),
		'arrival on the pattern=' + (inA.length === 1 && /-in$/.test(inA[0].animationName ?? '')),
		'hover rules set only play state=' + onlyPlayState
	];
}`;

/* ------------------------------------------------------------------------ *
 * `?view=class`: THE REAL CLASS PAGE (ClassView) UNDER THE HEADER, over a
 * stored page layout (ledger 0360, R23 wired onto the R19 header).
 * ------------------------------------------------------------------------ */

/** The real class page has painted: its header and its posts. */
export const VIEW_READY = `() => !!document.querySelector('[data-testid="harness-class"] [data-testid="class-header"] .pane-title') && document.querySelectorAll('[data-testid="harness-class"] [data-testid="item-row"]').length > 0`;

/**
 * WHERE THE CLASS CONTENT STARTS, printed: the search row's top and the first
 * post's below the class pane's top, the numbers the R19 header was measured
 * by, with the header's and the notices' own tops beside them.
 */
export const VIEW_MEASURE = `() => {
	const pane = document.querySelector('[data-testid="harness-class"]').getBoundingClientRect();
	const at = (sel) => { const e = document.querySelector('[data-testid="harness-class"] ' + sel); return e ? (e.getBoundingClientRect().top - pane.top).toFixed(1) + 'px' : 'absent'; };
	return 'search row ' + at('[data-testid="stream-find"]') + '; first post ' + at('[data-testid="item-row"]') + '; header ' + at('[data-testid="class-header"]') + '; notices ' + at('[data-testid="quick-posts"]');
}`;

/** Display settings is open at the class page's arrangement. */
export const CLASS_EDITOR_OPEN = `() => !!document.querySelector('dialog[data-testid="classroom-settings"][open]') && document.querySelector('[data-testid="settings-arrange-class"]')?.getAttribute('aria-expanded') === 'true'`;
