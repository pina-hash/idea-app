/**
 * THE HOVER INK, FORCED AND MEASURED (ledger 0298, decision 40 item 1).
 *
 * Thirty-four classroom and shell `:hover` declarations that painted
 * `var(--gold)` now read `var(--hover-ink)`, which is the brass it always was
 * on the dark themes and the theme's green on Space White. Thirty-three named
 * `var(--gold)` outright; the thirty-fourth (MyClasses' class card) painted it
 * through an alias, `--acc`, which a literal sweep cannot see -- and which
 * this probe reports as "ink rules 0" rather than passing. These helpers are
 * what the `*state-hover-ink*` specs share.
 *
 * A HOVER CANNOT BE HELD BY A SPEC, so it is FORCED, one node at a time. For
 * each target the probe marks ONE host element `data-hv`, walks every
 * stylesheet for a `:hover` rule whose own declarations name `--hover-ink`
 * (or `--gold`, so a rule this sweep missed is caught rather than skipped),
 * rewrites the `:hover` in that rule's selector to `[data-hv]` and appends the
 * rule's OWN declarations under the rewritten selector -- the exact
 * declaration block the browser applies on a real hover, on exactly one node.
 * It prints how many rules it copied and how many nodes the copies matched,
 * so a forced state that reached nothing, or reached every row on the page,
 * reads as a number rather than as a pass.
 *
 * THE STYLESHEET WALK TESTS A DECLARATION BEFORE IT RECURSES, and recurses
 * only on `cssRules?.length`: CSS Nesting gave `CSSStyleRule` a `cssRules`
 * property and an empty list is truthy (CLAUDE.md, DOM traps). It reads the
 * rule's OWN `style`, never `cssText`, which with nesting carries children.
 *
 * COLOURS ARE READ BACK OFF A CANVAS, NEVER PARSED. A ground may be a
 * `color-mix()` or a `color(srgb ...)`, which a regex over computed styles
 * skips silently. Each ground is composited by painting every translucent
 * background from the first opaque ancestor down to the element onto one
 * pixel and reading it back; the ink is painted over that. The ratio is WCAG's,
 * and the washed ratio is PROJECTOR_MODEL's (a 300:1 projector with 10% of
 * white added as ambient light, ../checks.mjs).
 *
 * A BORDER IS MEASURED AGAINST BOTH SIDES OF ITSELF: the element's own
 * background (a border paints inside the border box) and the ground outside
 * it. The verdict number is the worse of the two.
 */

/** Put `theme` on <html> the way the classroom harnesses do (they hold no session). */
export const FORCE_THEME = (theme) => ({
	label: `force the ${theme} theme attribute`,
	evaluate: `() => {
		const el = document.documentElement;
		const want = ${JSON.stringify(theme === 'idea' ? null : theme)};
		const apply = () => {
			if (want === null) { if (el.hasAttribute('data-theme')) el.removeAttribute('data-theme'); }
			else if (el.getAttribute('data-theme') !== want) el.setAttribute('data-theme', want);
		};
		apply();
		if (!window.__hvThemeObs) {
			window.__hvThemeObs = new MutationObserver(apply);
			window.__hvThemeObs.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
		}
		return 'data-theme=' + (el.getAttribute('data-theme') ?? '(none)');
	}`,
	/* IDEA is the state a harness already has, so a predicate there could not
	   discriminate; the step still returns what it found, which is printed. */
	...(theme === 'idea' ? {} : { until: `() => document.documentElement.getAttribute('data-theme') === ${JSON.stringify(theme)}` })
});

/**
 * One target:
 *   name     -- what the verdict line calls it
 *   host     -- selector(s) for the element the `:hover` belongs to, tried in
 *               order; the first VISIBLE match is used
 *   measure  -- selector for the painted element inside the host, or omitted
 *               for the host itself
 *   prop     -- 'color' or 'border-top-color'
 *   state    -- 'hover' (forced) or 'rest' (read as it stands)
 */
export const HOVER_PROBE = (targets) => `async () => {
	const targets = ${JSON.stringify(targets)};
	const cv = document.createElement('canvas');
	cv.width = cv.height = 1;
	const ctx = cv.getContext('2d', { willReadFrequently: true });
	const px = (layers) => {
		ctx.clearRect(0, 0, 1, 1);
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, 1, 1);
		for (const c of layers) { ctx.fillStyle = '#000000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); }
		const d = ctx.getImageData(0, 0, 1, 1).data;
		return [d[0], d[1], d[2]];
	};
	const alphaOf = (c) => {
		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = '#000000';
		ctx.fillStyle = c;
		ctx.fillRect(0, 0, 1, 1);
		return ctx.getImageData(0, 0, 1, 1).data[3];
	};
	/* Backgrounds from the element up to the first opaque one, painted outermost first. */
	const groundLayers = (el) => {
		const layers = [];
		let image = false;
		for (let n = el; n; n = n.parentElement) {
			const cs = getComputedStyle(n);
			if (cs.backgroundImage && cs.backgroundImage !== 'none') image = true;
			const bg = cs.backgroundColor;
			if (bg && alphaOf(bg) > 0) { layers.unshift(bg); if (alphaOf(bg) === 255) break; }
		}
		return { layers, image };
	};
	const lum = ([r, g, b]) => {
		const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
		return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
	};
	const wash = (l) => l * (1 - 1 / 300) + 1 / 300 + 0.1;
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	const washed = (a, b) => { const x = wash(lum(a)), y = wash(lum(b)); return Math.max(x, y) / Math.min(x, y); };
	const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
	const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden'; };
	/* Every style rule, with the @media / @supports chain it sits in. */
	const rules = [];
	const walk = (list, wrap) => {
		for (const r of list) {
			if (r.style && r.selectorText) rules.push({ r, wrap });
			if (r.cssRules?.length) {
				const w = r.conditionText !== undefined && (r instanceof CSSMediaRule || r instanceof CSSSupportsRule)
					? [...wrap, (r instanceof CSSMediaRule ? '@media ' : '@supports ') + r.conditionText]
					: wrap;
				walk(r.cssRules, w);
			}
		}
	};
	for (const s of document.styleSheets) { try { walk(s.cssRules, []); } catch {} }
	const splitSel = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
	const names = (el) => {
		const cs = getComputedStyle(el);
		const out = {};
		for (const k of ['--green', '--gold', '--cyan', '--hover-ink']) { const v = cs.getPropertyValue(k).trim(); if (v) out[k] = hex(px([v])); }
		return out;
	};
	const nameOf = (c, el) => {
		const h = hex(c);
		const n = names(el);
		if (n['--green'] === h) return 'green';
		if (n['--gold'] === h) return 'gold';
		if (n['--cyan'] === h) return 'cyan';
		return h;
	};
	const style = document.createElement('style');
	style.setAttribute('data-hover-ink-probe', '');
	document.head.appendChild(style);
	const out = [];
	for (const t of targets) {
		const hosts = [].concat(t.host);
		let host = null;
		for (const sel of hosts) { host = [...document.querySelectorAll(sel)].find(visible) || null; if (host) break; }
		if (!host) { out.push({ name: t.name, verdict: t.name + ': NOT ON SCREEN', line: t.name + ': no visible host for ' + hosts.join(' | ') }); continue; }
		const el = t.measure ? host.querySelector(t.measure) : host;
		if (!el) { out.push({ name: t.name, verdict: t.name + ': NO MEASURED NODE', line: t.name + ': host found, ' + t.measure + ' not inside it' }); continue; }
		const read = () => getComputedStyle(el).getPropertyValue(t.prop);
		const before = read();
		let copied = 0, all = 0, nodes = new Set();
		if (t.state === 'hover') {
			const tag = 'hv' + out.length;
			host.setAttribute('data-hv', tag);
			const css = [];
			/* EVERY :hover rule that reaches the host is copied, so the ground
			   under the ink is the hovered ground too; the ones that name the
			   ink are counted apart, and they are the reach verdict. */
			for (const { r, wrap } of rules) {
				if (!r.selectorText.includes(':hover')) continue;
				const decl = r.style.cssText;
				const ink = /--hover-ink|--gold/.test(decl);
				for (const part of splitSel(r.selectorText)) {
					if (!part.includes(':hover')) continue;
					const forced = part.split(':hover').join('[data-hv="' + tag + '"]');
					let hit;
					try { hit = [...document.querySelectorAll(forced)]; } catch { continue; }
					if (!hit.includes(el) && !hit.includes(host)) continue;
					all++;
					if (ink) { hit.forEach((n) => nodes.add(n)); copied++; }
					let block = forced + ' { ' + decl + ' }';
					for (const w of [...wrap].reverse()) block = w + ' { ' + block + ' }';
					css.push(block);
				}
			}
			css.push('[data-hv="' + tag + '"], [data-hv="' + tag + '"] * { transition: none !important; }');
			style.textContent += css.join('\\n') + '\\n';
		}
		const after = read();
		const fgLayers = groundLayers(el);
		const outer = t.prop.startsWith('border') ? groundLayers(el.parentElement || el) : null;
		const g = px(fgLayers.layers);
		const fg = px([...fgLayers.layers, after]);
		const inner = { ratio: ratio(fg, g), washed: washed(fg, g), ground: hex(g) };
		let worst = inner, side = 'own ground';
		if (outer) {
			const og = px(outer.layers);
			const ofg = px([...outer.layers, after]);
			const o = { ratio: ratio(ofg, og), washed: washed(ofg, og), ground: hex(og) };
			if (o.ratio < worst.ratio) { worst = o; side = 'outside ground'; }
		}
		const colour = nameOf(fg, el);
		const restColour = nameOf(px([...fgLayers.layers, before]), el);
		const verdict = t.name + ': ' + t.state + ' ' + (t.prop === 'color' ? 'ink' : 'edge') + ' ' + colour;
		const line = verdict + ' ' + hex(fg) + ' ' + worst.ratio.toFixed(2) + ':1 (washed ' + worst.washed.toFixed(2) + ':1) on ' + worst.ground + ' [' + side + ']'
			+ (t.state === 'hover' ? ', rest ' + restColour + ', hover rules copied ' + all + ' (naming the ink ' + copied + '), ink nodes ' + nodes.size : '')
			+ (fgLayers.image || outer?.image ? ', a background image sits under it' : '');
		out.push({ name: t.name, state: t.state, verdict, line, ratio: +worst.ratio.toFixed(2), washed: +worst.washed.toFixed(2), copied, nodes: nodes.size, colour, restColour });
	}
	window.__hoverInk = out;
	return out.map((o) => o.line).join(' | ');
}`;

/** The verdict lines, for `orderResult`. */
export const HOVER_VERDICTS = `() => (window.__hoverInk || []).map((o) => o.verdict)`;

/** Every forced target copied at least one rule onto exactly one node. */
export const HOVER_REACH = `() => (window.__hoverInk || []).filter((o) => o.state === 'hover').map((o) => o.name + ': ' + (o.copied === undefined ? 'not measured' : o.copied > 0 && o.nodes === 1 ? 'one node forced' : 'ink rules ' + o.copied + ', nodes ' + o.nodes))`;

/**
 * Each target's ratio against its floor, as words, for `orderResult`. An ink
 * is text (4.5:1); an edge is a control boundary (3:1). `washed` adds the
 * projector floors the Space White specs gate -- an accent ink at 3.0 washed
 * and a load-bearing line at 2.0 -- and is left off where a dark theme is only
 * recorded, which the probe's own line still prints.
 */
export const floorOf = (t, washed) => {
	const ink = t.prop === 'color';
	return { wcag: ink ? 4.5 : 3, washed: washed ? (ink ? 3 : 2) : 0 };
};
export const HOVER_FLOORS = (targets, { washed }) => `() => {
	const floors = ${JSON.stringify(Object.fromEntries(targets.map((t) => [t.name, floorOf(t, washed)])))};
	return (window.__hoverInk || []).map((o) => {
		const f = floors[o.name];
		if (!f || o.ratio === undefined) return o.name + ': not measured';
		const w = o.ratio >= f.wcag ? 'clears ' + f.wcag : 'UNDER ' + f.wcag + ' at ' + o.ratio;
		return o.name + ': ' + w + (f.washed ? (o.washed >= f.washed ? ', clears ' + f.washed + ' washed' : ', UNDER ' + f.washed + ' washed at ' + o.washed) : '');
	});
}`;
export const floorVerdicts = (targets, { washed }) =>
	targets.map((t) => {
		const f = floorOf(t, washed);
		return `${t.name}: clears ${f.wcag}${f.washed ? `, clears ${f.washed} washed` : ''}`;
	});

/**
 * THE DARK ISLANDS KEEP THE BRASS HOVER. Space White restores every token it
 * moves inside `.ic-root`, `.nb-island` and `.deck-stage` (the deck viewer, the
 * photo corrector and camera, IdeaCAD), and --hover-ink is in that closure, so
 * a hover inside one reads the island's own gold. Read off a bare element of
 * each island class appended to <body> and removed again, and named against
 * that element's own --gold and --green, so the answer is the cascade's rather
 * than a number typed here.
 */
export const ISLAND_PROBE = `() => {
	const cv = document.createElement('canvas');
	cv.width = cv.height = 1;
	const ctx = cv.getContext('2d', { willReadFrequently: true });
	const hex = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); };
	return ['ic-root', 'nb-island', 'deck-stage'].map((cls) => {
		const el = document.createElement('div');
		el.className = cls;
		document.body.appendChild(el);
		const cs = getComputedStyle(el);
		const ink = hex(cs.getPropertyValue('--hover-ink').trim());
		const name = ink === hex(cs.getPropertyValue('--gold').trim()) ? 'gold' : ink === hex(cs.getPropertyValue('--green').trim()) ? 'green' : ink;
		el.remove();
		return cls + ': hover ink ' + name + ' ' + ink;
	});
}`;
