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
 * THE PATTERN FLOWS, CONTINUOUSLY, WITH NO SEAM AND NO PAUSE (decision 61, Mr.
 * Pina 2026-10-14: "still glitching and pausing. they should be smoothly
 * continuous looping animations"). Read off the live layer:
 *
 *   - exactly one animation, running, with infinite iterations, animating the
 *     pattern's registered phase property from 0 to one period;
 *   - the layer says so (`data-flow="on"`) and draws the flowing background;
 *   - the phase actually advances over 400ms (the positive control: a layer
 *     that registered nothing would interpolate in one jump and read equal);
 *   - the loop is PHASE-LOCKED to the wall clock, so a remount lands on the
 *     frame the pattern was already showing (within 250ms of `Date.now()`
 *     modulo one loop);
 *   - the layer carries no transform and fills its clip, so nothing can ever
 *     uncover the banner (the overscan the transforms needed is gone).
 */
export const FLOW = `async () => {
	const layer = document.querySelector('[data-testid="class-banner-pattern"]');
	const clip = layer && layer.closest('.ct-pattern-clip');
	if (!layer || !clip) return ['layer=missing'];
	const anims = layer.getAnimations();
	if (anims.length !== 1) return ['flowing=false', 'animations=' + anims.length];
	const a = anims[0];
	const frames = a.effect.getKeyframes();
	const prop = Object.keys(frames[0]).find((k) => k.startsWith('--ct-'));
	const timing = a.effect.getComputedTiming();
	const read = () => getComputedStyle(layer).getPropertyValue(prop).trim();
	const before = read();
	await new Promise((r) => setTimeout(r, 400));
	const after = read();
	const duration = timing.duration;
	const want = Date.now() % duration;
	const have = (a.currentTime ?? 0) % duration;
	const drift = Math.min(Math.abs(want - have), duration - Math.abs(want - have));
	const lr = layer.getBoundingClientRect(), cr = clip.getBoundingClientRect();
	const fills = Math.abs(lr.left - cr.left) < 0.5 && Math.abs(lr.top - cr.top) < 0.5 && Math.abs(lr.width - cr.width) < 0.5 && Math.abs(lr.height - cr.height) < 0.5;
	return [
		'flowing=' + (a.playState === 'running' && layer.dataset.flow === 'on'),
		'drawn=' + /gradient/.test(getComputedStyle(layer).backgroundImage),
		'infinite=' + (timing.iterations === Infinity),
		'one period=' + (/^0(px|deg)$/.test(String(frames[0][prop])) && /^(12|14|16)px$|^9deg$/.test(String(frames[frames.length - 1][prop]))),
		'moved=' + (before !== after),
		'phase locked=' + (drift < 250),
		'no transform=' + (getComputedStyle(layer).transform === 'none'),
		'fills the banner=' + fills
	];
}`;

/** The same layer under the Still setting (`?motion=still`): drawn, and not moving. */
export const STILL = `() => {
	const layer = document.querySelector('[data-testid="class-banner-pattern"]');
	if (!layer) return ['layer=missing'];
	return [
		'drawn=' + (getComputedStyle(layer).backgroundImage !== 'none'),
		'animations=' + layer.getAnimations().length,
		'flow=' + layer.dataset.flow
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
