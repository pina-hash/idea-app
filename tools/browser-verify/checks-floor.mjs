/**
 * THE THREE FLOOR CHECKS (ledger 0469): text under 11px, a control under its
 * tap floor, and text squeezed into a column a few words wide.
 *
 * They run on EVERY route and width `run.mjs` drives, the way
 * `horizontalScroll` does, rather than per spec: each is a property of the
 * whole page a spec author would otherwise have to remember to ask for, and
 * the 2026-10-26 audit (`docs/design/site-ui-audit-2026-10-26/`) found all
 * three on pages whose specs never named them.
 *
 * WHERE THEY LOOK IS THE PLATE, READ OFF THE PLATE'S OWN STYLESHEET. The floor
 * is the Plate's (`--plate-label-size`, IDEA_INTERFACE_STANDARDS 10 and 14), so
 * the population is everything under `.cr-plate` or `.site-plate` and NOTHING
 * under the islands `src/lib/classroom/plate.css` scopes itself away from (an
 * item body, rendered markdown, a deck stage, an IdeaCAD embed, ...): somebody
 * else's content, or somebody else's design. `plateScope()` parses that one
 * `@scope (...) to (...)` line, so a new island added there is excluded here
 * with no second list to keep. A page with no plate on it (GAUNTLET, FRC, the
 * legacy rooms) measures 0 and SAYS it measured 0, which is a reading and not
 * a pass.
 *
 * THE SQUEEZE RULE IS THE HTML KIT'S, MOVED HERE AND IMPORTED BACK.
 * `tools/hx-kit/test.mjs` judged an assignment by it first ("any block of three
 * or more words narrower than 9 of its own letters' em and three lines or
 * taller"); it now calls `squeezedText` from this file, so the kit and the
 * site are held to one implementation of it. 1152 is a 1440 laptop at 125%
 * zoom, Mr. Pina's own setting, where resource cards squeezed their words into
 * a column one word wide (2026-10-27).
 *
 * The in-page functions are plain functions with no free variables: Playwright
 * serialises a function handed to `evaluate` by its source, so each one has to
 * carry everything it uses.
 */
import { readFileSync } from 'node:fs';

/* ------------------------------------------------------------------ *
 * The population: the plate, minus its islands, minus harness chrome.
 * ------------------------------------------------------------------ */

/**
 * The `/dev` harnesses' own chrome: the strips, notes and toggles a harness
 * draws around the component it mounts. Never `.harness` itself, which is the
 * ROOT of 61 harnesses and wraps the real component.
 */
export const HARNESS_CHROME =
	'.oracle, .harness-note, .harness-bar, .harness-strip, .harness-toggle, .harness-label, .harness-log, .harness-readout, .harness-controls, .tour-harness, .dev-toolbar, .dev-bar, .dev-tag, .dev-log, .dev-strip, [data-harness-chrome]';

let cachedScope = null;

/**
 * `{ root, islands }` from the first `@scope (<root>) to (<islands>)` rule in
 * the Plate's stylesheet. Throws rather than guessing: a population nobody can
 * state is a check whose zero means nothing.
 */
export function plateScope(css = null) {
	if (!css && cachedScope) return cachedScope;
	const text = css ?? readFileSync(new URL('../../src/lib/classroom/plate.css', import.meta.url), 'utf8');
	/* Comments first: the file's own header quotes the rule as `to (...)`. */
	const m = text.replace(/\/\*[\s\S]*?\*\//g, '').match(/@scope\s*\(([^)]*)\)\s*to\s*\(([^)]*)\)/);
	if (!m) throw new Error('plate.css has no `@scope (...) to (...)` rule; the floor checks cannot state their population');
	const scope = { root: m[1].trim(), islands: m[2].trim() };
	if (!css) cachedScope = scope;
	return scope;
}

/** The selector every floor check skips: the plate's islands plus harness chrome. */
export const skipSelector = (scope = plateScope()) => `${scope.islands}, ${HARNESS_CHROME}`;

/* ------------------------------------------------------------------ *
 * In-page functions. Self-contained: no closures over this module.
 * ------------------------------------------------------------------ */

/**
 * TEXT SQUEEZED INTO A COLUMN A FEW WORDS WIDE. The rule `tools/hx-kit/test.mjs`
 * applied first, byte for byte in what it counts:
 *
 *   - an element whose OWN text (its direct text nodes) is three or more words;
 *   - narrower than nine of its own font size;
 *   - three or more line boxes tall, counted from the text's own client rects
 *     and never from the element's height: a table cell is as tall as its row,
 *     so a one-line date beside a two-line note read as three lines. A line a
 *     clamp or a clip hides is not counted (ledger 0469: a two-line clamp read
 *     as three lines on the coin market's phone tiles).
 *
 * `line` is the kit's own report string, unchanged, so its report reads as it
 * did; `path` is for the site's report.
 */
export function squeezedText({ root = 'body', skip = '', words = 3, lines = 3, em = 9, vw = 0 } = {}) {
	const pathOf = (n) => {
		const parts = [];
		for (let e = n; e && e.nodeType === 1 && parts.length < 4; e = e.parentElement) {
			const cls = (e.getAttribute('class') || '').trim().split(/\s+/).filter((c) => c && !/^s(velte)?-[A-Za-z0-9_-]+$/.test(c));
			parts.unshift(e.tagName.toLowerCase() + (cls.length ? '.' + cls.slice(0, 2).join('.') : ''));
		}
		return parts.join(' > ');
	};
	const out = [];
	let measured = 0;
	for (const el of document.querySelectorAll(`:is(${root}) *`)) {
		if (!el.getClientRects().length || el.closest('[hidden]') || el.closest('svg')) continue;
		if (skip && el.closest(skip)) continue;
		const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim();
		const count = own.split(/\s+/).filter(Boolean).length;
		if (count < words) continue;
		measured++;
		const cs = getComputedStyle(el);
		const fs = parseFloat(cs.fontSize) || 16;
		const box = el.getBoundingClientRect();
		/* A line a clamp or a clip hides is not a line anybody reads: with
		   overflow other than visible, only line boxes that start inside the
		   element's own box count (a two-line clamp is two lines). */
		const clips = cs.overflow !== 'visible' || cs.overflowY !== 'visible';
		const tops = new Set();
		for (const n of el.childNodes) {
			if (n.nodeType !== 3 || !n.textContent.trim()) continue;
			const rg = document.createRange();
			rg.selectNodeContents(n);
			for (const q of rg.getClientRects()) {
				if (q.width < 1) continue;
				if (clips && q.top >= box.bottom - 1) continue;
				tops.add(Math.round(q.top / 4));
			}
		}
		const w = box.width;
		/* `vw`: a block at least that share of the window wide is as wide as
		   the page lets anything be, so a big heading wrapping on a phone is
		   not a card squeezing it. 0 (the kit's default) leaves it out. */
		const wide = vw > 0 && w >= vw * window.innerWidth;
		if (w < em * fs && !wide && tops.size >= lines && count >= words) {
			out.push({
				line: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} "${own.slice(0, 28)}" ${Math.round(w)}px wide, ${tops.size} lines`,
				path: pathOf(el),
				width: Math.round(w),
				lines: tops.size,
				fontSize: fs
			});
		}
	}
	return { measured, found: out };
}

/**
 * TEXT UNDER THE FLOOR. Every element in the population whose own text says
 * something (a letter or a digit: a lone caret or bullet glyph is a mark, not
 * a word) and that is painted, at a computed font size under `min`.
 * Visually hidden text (a box under 2px, the `.sr-only` shape) is skipped and
 * counted, because it is read aloud and never seen.
 */
export function smallText({ root = 'body', skip = '', min = 11 } = {}) {
	const pathOf = (n) => {
		const parts = [];
		for (let e = n; e && e.nodeType === 1 && parts.length < 4; e = e.parentElement) {
			const cls = (e.getAttribute('class') || '').trim().split(/\s+/).filter((c) => c && !/^s(velte)?-[A-Za-z0-9_-]+$/.test(c));
			parts.unshift(e.tagName.toLowerCase() + (cls.length ? '.' + cls.slice(0, 2).join('.') : ''));
		}
		return parts.join(' > ');
	};
	const painted = (el) => {
		for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
			const cs = getComputedStyle(e);
			if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) <= 0.01) return false;
		}
		return true;
	};
	const out = [];
	let measured = 0;
	let srOnly = 0;
	let miniature = 0;
	let smallest = null;
	for (const el of document.querySelectorAll(`:is(${root}) *`)) {
		if (!el.getClientRects().length || el.closest('[hidden]') || el.closest('svg')) continue;
		if (skip && el.closest(skip)) continue;
		const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim();
		if (!/[\p{L}\p{N}]/u.test(own)) continue;
		/* A MINIATURE is a picture of text, not text (a notebook entry's
		   thumbnail sets the note's own words at 3.5px, hidden from assistive
		   tech because the row beside it says the same thing at full size). It
		   declares itself with `data-miniature` and is counted, not judged. */
		if (el.closest('[data-miniature]')) {
			miniature++;
			continue;
		}
		const r = el.getBoundingClientRect();
		if (r.width < 2 || r.height < 2) {
			srOnly++;
			continue;
		}
		if (!painted(el)) continue;
		const fs = parseFloat(getComputedStyle(el).fontSize);
		/* `font-size: 0` is the other visually hidden shape (an accessible
		   name on a scrim that paints no word): counted with the 1px boxes. */
		if (fs < 1) {
			srOnly++;
			continue;
		}
		measured++;
		if (smallest === null || fs < smallest) smallest = fs;
		if (fs < min - 0.05) out.push({ fontSize: +fs.toFixed(2), text: own.slice(0, 32), path: pathOf(el) });
	}
	return { measured, srOnly, miniature, smallest, found: out };
}

/**
 * CONTROLS UNDER THEIR FLOOR. A control's floor is 44px in both dimensions
 * (IDEA_INTERFACE_STANDARDS 10, `--tap-min` in the kit), with three declared
 * exceptions and one delegated case:
 *
 *   - AN INLINE LINK IN A LINE OF TEXT takes the 24px absolute floor, measured
 *     at its LINE (the larger of its own box and its line-height): the line is
 *     what a finger lands on, and a 44px reach would steal the lines above and
 *     below (WCAG 2.5.8 exempts it for the same reason).
 *   - A CONTROL THAT DECLARES ITS EXCEPTION ON ITSELF (`data-tap-floor="24"`)
 *     takes 24px, and the source beside the attribute carries the reason (the
 *     class list's row checkbox, expand arrow and menu: 30px wide so they
 *     never overlap the grip and the row link beside them). The claim is
 *     written where this sweep reads it, never assumed from the page.
 *   - A CONTROL ON A DECLARED COMPACT INSTRUCTOR SURFACE
 *     (`[data-density='compact'] .cr-instructor-surface`) takes 24px: the
 *     surface says so on its own root, which is the only way the floor drops.
 *   - A `.tap-reach-44` CONTROL is counted and NOT judged here: its target is a
 *     pseudo-element, and `tapReach` hit-tests it where a spec asks.
 *
 * A control wrapped in a `<label>` is measured at the label, which is what a
 * finger hits, and one named by a `for=` label at the larger of the two; a
 * stretched link, at the absolutely positioned pseudo-element that carries
 * its taps. A disabled control is counted and not judged, and so is a shape
 * inside a SCALE DRAWING (`[data-scale-drawing]`, declared on the drawing's
 * own root: the Maps plan and elevation, where a 3in drawer is drawn 36px tall
 * because it is 3in, and inflating it would make the drawing lie).
 */
export function smallControls({ root = 'body', skip = '', min = 44, inline = 24, compact = '[data-density="compact"] .cr-instructor-surface' } = {}) {
	const pathOf = (n) => {
		const parts = [];
		for (let e = n; e && e.nodeType === 1 && parts.length < 4; e = e.parentElement) {
			const cls = (e.getAttribute('class') || '').trim().split(/\s+/).filter((c) => c && !/^s(velte)?-[A-Za-z0-9_-]+$/.test(c));
			parts.unshift(e.tagName.toLowerCase() + (cls.length ? '.' + cls.slice(0, 2).join('.') : ''));
		}
		return parts.join(' > ');
	};
	const painted = (el) => {
		for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
			const cs = getComputedStyle(e);
			if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) <= 0.01) return false;
		}
		return true;
	};
	const blockOf = (el) => {
		let p = el.parentElement;
		while (p && /^(inline|contents)$/.test(getComputedStyle(p).display)) p = p.parentElement;
		return p;
	};
	/* A link in a line of text: an inline `<a>` anywhere in a block with other
	   words, or a link-styled button sitting in a sentence (a paragraph, a
	   definition, a caption, a quote), which is an inline link in all but tag. */
	const inLineOfText = (el) => {
		const d = getComputedStyle(el).display;
		const block = blockOf(el);
		if (!block) return false;
		if (el.tagName === 'A') {
			if (d !== 'inline') return false;
		} else if (el.tagName === 'BUTTON') {
			if (!/^inline/.test(d) || !el.closest('p, dd, figcaption, blockquote')) return false;
		} else return false;
		const all = block.textContent || '';
		const mine = el.textContent || '';
		return /[\p{L}\p{N}]/u.test(all.replace(mine, ''));
	};
	/* A STRETCHED LINK (a card whose title link's `::after` covers the whole
	   card, the coin home's shape) is tapped on its pseudo-element, not on its
	   15px word: an absolutely positioned `::before` or `::after` that takes
	   pointer events is measured against its containing block, the way the
	   CSS lays it out. The larger of the two boxes is the target. */
	const pseudoBox = (el) => {
		let best = null;
		for (const which of ['::after', '::before']) {
			const ps = getComputedStyle(el, which);
			if (ps.content === 'none' || ps.content === 'normal' || ps.position !== 'absolute' || ps.pointerEvents === 'none' || ps.display === 'none') continue;
			let cb = el;
			while (cb && cb !== document.documentElement && getComputedStyle(cb).position === 'static') cb = cb.parentElement;
			if (!cb) continue;
			const r = cb.getBoundingClientRect();
			const cs = getComputedStyle(cb);
			const L = r.left + parseFloat(cs.borderLeftWidth);
			const T = r.top + parseFloat(cs.borderTopWidth);
			const R = r.right - parseFloat(cs.borderRightWidth);
			const B = r.bottom - parseFloat(cs.borderBottomWidth);
			const num = (v) => (v === 'auto' ? null : parseFloat(v));
			const w = parseFloat(ps.width);
			const h = parseFloat(ps.height);
			if (!(w > 0 && h > 0)) continue;
			const l = num(ps.left);
			const t = num(ps.top);
			const rr = num(ps.right);
			const b = num(ps.bottom);
			const x = l !== null ? L + l : rr !== null ? R - rr - w : L;
			const y = t !== null ? T + t : b !== null ? B - b - h : T;
			if (!best || w * h > best.width * best.height) best = { left: x, top: y, width: w, height: h };
		}
		return best;
	};
	const SEL =
		'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"], [role="option"]';
	const out = [];
	const counts = { measured: 0, at44: 0, inline: 0, compact: 0, declared: 0, reach: 0, disabled: 0, hidden: 0, drawn: 0 };
	let smallest = null;
	const seenTargets = new Set();
	for (const el of document.querySelectorAll(`:is(${root}) :is(${SEL})`)) {
		if (!el.getClientRects().length || el.closest('[hidden]')) continue;
		if (skip && el.closest(skip)) continue;
		if (!painted(el)) continue;
		if (el.matches(':disabled, [aria-disabled="true"]')) {
			counts.disabled++;
			continue;
		}
		if (el.classList.contains('tap-reach-44')) {
			counts.reach++;
			continue;
		}
		/* A WRAPPING label is the target (it holds the control). A label that
		   names the control from elsewhere (`for=`) is a SECOND target, so the
		   larger of the two is what a finger has: a 19px caption above a 44px
		   field is not a 19px control. */
		if (el.closest('[data-scale-drawing]')) {
			counts.drawn++;
			continue;
		}
		let target = el.closest('label');
		if (!target && el.id) {
			const named = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
			if (named) {
				const a = named.getBoundingClientRect();
				const b = el.getBoundingClientRect();
				if (Math.min(a.width, a.height) > Math.min(b.width, b.height)) target = named;
			}
		}
		if (!target || target === el) target = el;
		if (seenTargets.has(target)) continue;
		const r = target.getBoundingClientRect();
		if (r.width < 2 && r.height < 2) {
			counts.hidden++;
			continue;
		}
		seenTargets.add(target);
		let box = r;
		let measuredAt = target === el ? 'self' : 'label';
		const pb = target === el ? pseudoBox(el) : null;
		if (pb && pb.width * pb.height > r.width * r.height) {
			box = pb;
			measuredAt = 'pseudo-element';
		}
		let floor = min;
		let kind = 'control';
		let h = box.height;
		if (measuredAt === 'self' && inLineOfText(el)) {
			floor = inline;
			kind = 'inline link';
			const cs = getComputedStyle(el);
			const lh = cs.lineHeight === 'normal' ? 1.2 * parseFloat(cs.fontSize) : parseFloat(cs.lineHeight);
			h = Math.max(h, lh || 0);
			counts.inline++;
		} else if (target.closest('[data-tap-floor="24"]')) {
			floor = inline;
			kind = 'declared 24px';
			counts.declared++;
		} else if (compact && el.closest(compact)) {
			floor = inline;
			kind = 'compact instructor surface';
			counts.compact++;
		} else counts.at44++;
		counts.measured++;
		const minDim = Math.min(box.width, h);
		if (smallest === null || minDim < smallest.minDim) smallest = { minDim: +minDim.toFixed(1), w: +box.width.toFixed(1), h: +h.toFixed(1), floor, path: pathOf(target) };
		if (minDim < floor - 0.5) {
			out.push({
				w: +box.width.toFixed(1),
				h: +h.toFixed(1),
				floor,
				kind,
				measuredAt,
				text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 28),
				path: pathOf(target)
			});
		}
	}
	return { ...counts, smallest, found: out };
}

/* ------------------------------------------------------------------ *
 * The checks: one measured row each, the way every check reports.
 * ------------------------------------------------------------------ */

const noPlate = (measured) => (measured === 0 ? ' (nothing in scope: no .cr-plate or .site-plate on this page, or it holds no text)' : '');

/** Text under the 11px floor, inside the plate. */
export async function typeFloor(page, { min = 11, scope = plateScope() } = {}) {
	const data = await page.evaluate(smallText, { root: scope.root, skip: skipSelector(scope), min });
	return {
		check: 'type-floor',
		measured: `${data.found.length}/${data.measured} text element(s) under ${min}px; smallest ${data.smallest === null ? 'n/a' : data.smallest.toFixed(2) + 'px'}${data.miniature ? `; ${data.miniature} in a miniature not judged` : ''}${noPlate(data.measured)}`,
		threshold: `0 under ${min}px`,
		withinThreshold: data.found.length === 0,
		data: { ...data, found: data.found.slice(0, 40), foundCount: data.found.length }
	};
}

/** Controls under their floor, inside the plate. */
export async function controlFloor(page, { min = 44, inline = 24, scope = plateScope() } = {}) {
	const data = await page.evaluate(smallControls, { root: scope.root, skip: skipSelector(scope), min, inline });
	const s = data.smallest;
	return {
		check: 'control-floor',
		measured:
			`${data.found.length}/${data.measured} control(s) under their floor (${data.at44} at ${min}px; ${data.inline} inline link(s), ${data.declared} declared and ${data.compact} compact at ${inline}px)` +
			(s ? `; smallest ${s.w}x${s.h}` : '') +
			(data.reach ? `; ${data.reach} .tap-reach-44 left to tap-reach` : '') +
			(data.drawn ? `; ${data.drawn} shape(s) in a scale drawing not judged` : '') +
			noPlate(data.measured),
		threshold: `0 under ${min}px (${inline}px for an inline link, a declared exception or a declared compact surface)`,
		withinThreshold: data.found.length === 0,
		data: { ...data, found: data.found.slice(0, 40), foundCount: data.found.length }
	};
}

/** Text squeezed into a column a few words wide, inside the plate. */
export async function squeeze(page, { scope = plateScope() } = {}) {
	const data = await page.evaluate(squeezedText, { root: scope.root, skip: skipSelector(scope), vw: 0.5 });
	return {
		check: 'squeeze',
		measured: `${data.found.length}/${data.measured} block(s) of 3+ words narrower than 9em (and half the window) and 3+ lines tall${noPlate(data.measured)}`,
		threshold: '0 squeezed',
		withinThreshold: data.found.length === 0,
		data: { ...data, found: data.found.slice(0, 40), foundCount: data.found.length }
	};
}

/** All three, in the order the report prints them. */
export async function floorChecks(page, opts = {}) {
	return [await typeFloor(page, opts), await controlFloor(page, opts), await squeeze(page, opts)];
}
