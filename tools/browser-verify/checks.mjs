/**
 * The reusable checks. Every one returns MEASURED VALUES.
 *
 * None of them returns a bare pass/fail: a number is auditable by the next
 * reader and a green tick is not. Where a threshold exists (44px, 4.5:1, 0px
 * of overflow) it is reported BESIDE the measurement, never instead of it.
 */

/* ------------------------------------------------------------------ *
 * In-page helper source. Injected as a string so every check shares one
 * implementation of "what colour is actually behind this element".
 * ------------------------------------------------------------------ */
const HELPERS = `
(() => {
  if (window.__bvHelpers) return window.__bvHelpers;

  /* Parse ANY CSS colour by painting it and reading the pixel back.
     A regex over computed styles skips color-mix() and color(srgb ...)
     silently and then reports the plate instead of the real ground. */
  const cv = document.createElement('canvas');
  cv.width = 1; cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  function toRGBA(str) {
    if (!str) return null;
    try {
      ctx.globalCompositeOperation = 'copy';
      ctx.fillStyle = '#000';
      ctx.fillStyle = str;               // invalid strings leave the previous value
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch { return null; }
  }

  /* src over dst */
  function over(src, dst) {
    if (!src) return dst;
    if (src.a >= 0.999) return { r: src.r, g: src.g, b: src.b, a: 1 };
    const a = src.a + dst.a * (1 - src.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (src.r * src.a + dst.r * dst.a * (1 - src.a)) / a,
      g: (src.g * src.a + dst.g * dst.a * (1 - src.a)) / a,
      b: (src.b * src.a + dst.b * dst.a * (1 - src.a)) / a,
      a
    };
  }

  function lum(c) {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function ratio(a, b) {
    const la = lum(a), lb = lum(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  function cssPath(el) {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 5) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + '#' + n.id); break; }
      const cls = (n.getAttribute('class') || '').trim().split(/\\s+/).filter((c) => c && !/^s-[A-Za-z0-9_-]+$/.test(c));
      if (cls.length) s += '.' + cls.slice(0, 2).join('.');
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' > ');
  }

  /* Walk up compositing every background-color until opaque, then land on the
     canvas colour. Reports which ancestor actually supplied the ground and
     whether a background-IMAGE was in the way (in which case the number is
     about the colour under the image, and says so). */
  function groundOf(el) {
    let acc = { r: 0, g: 0, b: 0, a: 0 };
    let node = el;
    let source = null;
    let sawImage = false;
    let hops = 0;
    while (node && node.nodeType === 1 && hops < 60) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') sawImage = true;
      const bg = toRGBA(cs.backgroundColor);
      if (bg && bg.a > 0) {
        if (acc.a === 0) source = cssPath(node);
        acc = over(acc, bg);
        if (acc.a >= 0.999) return { ground: acc, source, backgroundImage: sawImage, landedOnCanvas: false };
      }
      node = node.parentElement;
      hops++;
    }
    /* Nothing opaque up the tree: the canvas paints white by default, and the
       html/body background propagates to it. */
    const htmlBg = toRGBA(getComputedStyle(document.documentElement).backgroundColor);
    const bodyBg = document.body ? toRGBA(getComputedStyle(document.body).backgroundColor) : null;
    let canvas = { r: 255, g: 255, b: 255, a: 1 };
    if (bodyBg && bodyBg.a > 0) canvas = over(bodyBg, canvas);
    if (htmlBg && htmlBg.a > 0) canvas = over(htmlBg, canvas);
    return {
      ground: over(acc, canvas),
      source: source || 'canvas',
      backgroundImage: sawImage,
      landedOnCanvas: true
    };
  }

  function isVisible(el) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const reasons = [];
    if (cs.display === 'none') reasons.push('display:none');
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') reasons.push('visibility:' + cs.visibility);
    if (cs.contentVisibility === 'hidden') reasons.push('content-visibility:hidden');
    const op = parseFloat(cs.opacity);
    if (!Number.isNaN(op) && op <= 0.01) reasons.push('opacity:' + cs.opacity);
    if (rect.width <= 0 || rect.height <= 0) reasons.push('zero-box:' + rect.width.toFixed(1) + 'x' + rect.height.toFixed(1));
    if (el.hasAttribute('hidden')) reasons.push('[hidden]');
    /* aria-hidden is a THIRD question, not a visual one: an element can be on
       screen and correctly hidden from assistive tech (a decorative glyph
       beside a real label). Folding it into visibility reported a perfectly
       painted 15.2x15.2 icon as invisible. */
    const ariaHidden = !!el.closest('[aria-hidden="true"]');
    return {
      visible: reasons.length === 0,
      reasons,
      ariaHidden,
      rect: { w: rect.width, h: rect.height, x: rect.x, y: rect.y }
    };
  }

  window.__bvHelpers = { toRGBA, over, lum, ratio, groundOf, cssPath, isVisible };
  return window.__bvHelpers;
})()
`;

async function ensureHelpers(page) {
	await page.evaluate(HELPERS);
}

const rgbStr = (c) =>
	c ? `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})${c.a < 0.999 ? ` a=${c.a.toFixed(2)}` : ''}` : 'n/a';

/* ------------------------------------------------------------------ *
 * 1. Horizontal scroll
 * ------------------------------------------------------------------ */
export async function horizontalScroll(page, { tolerancePx = 0.5 } = {}) {
	await ensureHelpers(page);
	const data = await page.evaluate((tol) => {
		const h = window.__bvHelpers;
		const de = document.documentElement;
		const clientWidth = de.clientWidth;
		const scrollWidth = Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0);
		const offenders = [];
		for (const el of document.querySelectorAll('*')) {
			const cs = getComputedStyle(el);
			if (cs.display === 'none' || cs.visibility === 'hidden') continue;
			if (cs.position === 'fixed') continue; /* a fixed overlay does not extend the document */
			const r = el.getBoundingClientRect();
			if (r.width === 0 && r.height === 0) continue;
			const overhang = r.right - clientWidth;
			if (overhang > tol) offenders.push({ path: h.cssPath(el), right: +r.right.toFixed(1), overhangPx: +overhang.toFixed(1), width: +r.width.toFixed(1) });
		}
		offenders.sort((a, b) => b.overhangPx - a.overhangPx);
		return {
			clientWidth,
			scrollWidth,
			overflowPx: +(scrollWidth - clientWidth).toFixed(1),
			offenderCount: offenders.length,
			offenders: offenders.slice(0, 6)
		};
	}, tolerancePx);

	return {
		check: 'horizontal-scroll',
		measured: `${data.overflowPx}px overflow (scrollWidth ${data.scrollWidth} vs clientWidth ${data.clientWidth})`,
		threshold: '0px',
		withinThreshold: data.overflowPx <= tolerancePx,
		data
	};
}

/* ------------------------------------------------------------------ *
 * 2. Contrast against the REAL rendered ground
 * ------------------------------------------------------------------ */
export async function contrast(page, { selector, label = selector, min = 4.5, all = false } = {}) {
	await ensureHelpers(page);
	const data = await page.evaluate(
		({ selector, all }) => {
			const h = window.__bvHelpers;
			const nodes = Array.from(document.querySelectorAll(selector));
			const take = all ? nodes : nodes.slice(0, 1);
			const results = take.map((el) => {
				const cs = getComputedStyle(el);
				const g = h.groundOf(el);
				const fgRaw = h.toRGBA(cs.color);
				/* Text alpha composites over the ground before the ratio is taken. */
				const fg = h.over(fgRaw, g.ground);
				const vis = h.isVisible(el);
				return {
					path: h.cssPath(el),
					fg,
					fgDeclared: cs.color,
					ground: g.ground,
					groundSource: g.source,
					groundHasImage: g.backgroundImage,
					landedOnCanvas: g.landedOnCanvas,
					fontSizePx: parseFloat(cs.fontSize),
					fontWeight: cs.fontWeight,
					ratio: +h.ratio(fg, g.ground).toFixed(2),
					visible: vis.visible,
					invisibleBecause: vis.reasons
				};
			});
			return { matchCount: nodes.length, results };
		},
		{ selector, all }
	);

	const worst = data.results.reduce((a, r) => (a === null || r.ratio < a.ratio ? r : a), null);
	return {
		check: 'contrast',
		selector,
		label,
		measured:
			data.matchCount === 0
				? 'no match'
				: `${worst.ratio}:1  fg ${rgbStr(worst.fg)} on ${rgbStr(worst.ground)} (ground from ${worst.groundSource})`,
		threshold: `${min}:1`,
		withinThreshold: data.matchCount > 0 && worst.ratio >= min,
		matchCount: data.matchCount,
		data
	};
}

/* ------------------------------------------------------------------ *
 * 3. Tap target geometry
 * ------------------------------------------------------------------ */
export async function tapTargets(page, { selector, label = selector, min = 44, floor = 24 } = {}) {
	await ensureHelpers(page);
	const data = await page.evaluate(
		({ selector, min }) => {
			const h = window.__bvHelpers;
			const nodes = Array.from(document.querySelectorAll(selector));
			const results = nodes.map((el) => {
				/* A control wrapped in a <label> is measured at the label, which is
				   what a finger hits -- but BOTH numbers are reported. */
				const lab = el.closest('label');
				const target = lab && lab !== el ? lab : el;
				const r = target.getBoundingClientRect();
				const own = el.getBoundingClientRect();
				const cx = r.x + r.width / 2;
				const cy = r.y + r.height / 2;
				const hit = document.elementFromPoint(cx, cy);
				const hitsSelf = !!hit && (hit === target || target.contains(hit) || hit.contains(target));
				const vis = h.isVisible(target);
				return {
					path: h.cssPath(el),
					measuredAt: target === el ? 'self' : 'label',
					w: +r.width.toFixed(1),
					h: +r.height.toFixed(1),
					ownW: +own.width.toFixed(1),
					ownH: +own.height.toFixed(1),
					minDim: +Math.min(r.width, r.height).toFixed(1),
					centreHitsSelf: hitsSelf,
					hitPath: hit ? h.cssPath(hit) : null,
					visible: vis.visible,
					invisibleBecause: vis.reasons
				};
			});
			return { matchCount: nodes.length, results };
		},
		{ selector, min }
	);

	const measurable = data.results.filter((r) => r.visible);
	const smallest = measurable.reduce((a, r) => (a === null || r.minDim < a.minDim ? r : a), null);
	const under = measurable.filter((r) => r.minDim < min).length;
	const underFloor = measurable.filter((r) => r.minDim < floor).length;
	return {
		check: 'tap-target',
		selector,
		label,
		measured:
			measurable.length === 0
				? `${data.matchCount} matched, 0 visible/measurable`
				: `smallest ${smallest.w}x${smallest.h} (min dim ${smallest.minDim}px); ${under}/${measurable.length} under ${min}px, ${underFloor} under the ${floor}px floor`,
		threshold: `${min}px`,
		withinThreshold: measurable.length > 0 && under === 0,
		matchCount: data.matchCount,
		data
	};
}

/* ------------------------------------------------------------------ *
 * 4. Presence vs visibility -- two different questions
 * ------------------------------------------------------------------ */
export async function presence(page, { selector, label = selector, expectPresent = 1, expectVisible = undefined } = {}) {
	/* Present, visible and exposed-to-assistive-tech are THREE questions. A
	   collapsed Disclosure keeps its region in the DOM at a zero box on purpose
	   (CLAUDE.md: hidden in CSS, never removed), so `present 2, visible 0` is
	   the correct reading of a closed panel and not a defect. A spec that means
	   it says so with expectVisible. */
	const wantVisible = expectVisible === undefined ? expectPresent : expectVisible;
	await ensureHelpers(page);
	const data = await page.evaluate((selector) => {
		const h = window.__bvHelpers;
		const nodes = Array.from(document.querySelectorAll(selector));
		const results = nodes.map((el) => {
			const v = h.isVisible(el);
			return {
				path: h.cssPath(el),
				visible: v.visible,
				ariaHidden: v.ariaHidden,
				reasons: v.reasons,
				box: `${v.rect.w.toFixed(1)}x${v.rect.h.toFixed(1)}`
			};
		});
		return {
			present: nodes.length,
			visible: results.filter((r) => r.visible).length,
			ariaHidden: results.filter((r) => r.ariaHidden).length,
			results: results.slice(0, 12)
		};
	}, selector);

	return {
		check: 'presence',
		selector,
		label,
		measured: `present ${data.present}, visible ${data.visible}, aria-hidden ${data.ariaHidden}`,
		threshold: `>= ${expectPresent} present, >= ${wantVisible} visible`,
		withinThreshold: data.present >= expectPresent && data.visible >= wantVisible,
		data
	};
}

/* ------------------------------------------------------------------ *
 * 5. DOM order -- which of two rendered elements comes first
 * ------------------------------------------------------------------ */
export async function domOrder(page, { before, after, label, beforeLabel = before, afterLabel = after } = {}) {
	/* Reads document position of two ALREADY-RENDERED nodes, never a computed
	   boolean the page happens to expose. /dev/home-order exists because a
	   vitest probe asserting `managesAnySection` in isolation passed while
	   never once rendering the page it claims to describe -- this check has to
	   read the DOM the same way a screen reader or a tab order would, or it
	   inherits that exact blind spot. */
	await ensureHelpers(page);
	const data = await page.evaluate(
		({ before, after }) => {
			const b = document.querySelector(before);
			const a = document.querySelector(after);
			if (!b || !a) return { beforeFound: !!b, afterFound: !!a, order: null };
			const beforePrecedesAfter = !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
			return { beforeFound: true, afterFound: true, order: beforePrecedesAfter ? 'before-then-after' : 'after-then-before' };
		},
		{ before, after }
	);

	const withinThreshold = data.beforeFound && data.afterFound && data.order === 'before-then-after';
	return {
		check: 'dom-order',
		label,
		measured:
			!data.beforeFound || !data.afterFound
				? `not found (${beforeLabel} present=${data.beforeFound}, ${afterLabel} present=${data.afterFound})`
				: data.order === 'before-then-after'
					? `${beforeLabel} precedes ${afterLabel}`
					: `${afterLabel} precedes ${beforeLabel}`,
		threshold: `${beforeLabel} before ${afterLabel}`,
		withinThreshold,
		data
	};
}

/* ------------------------------------------------------------------ *
 * 6. Console errors during the run
 * ------------------------------------------------------------------ */
export function consoleErrors(collected, { ignore = [], blockedCount = 0 } = {}) {
	/* The harness aborts external requests on purpose, and Chromium logs a
	   console error for each one. Attributing our own policy to the page is how
	   a clean surface acquires a permanent finding -- so this pattern is added
	   ONLY when a block actually happened, and the entries are reported in the
	   `ignored` list rather than dropped. */
	const builtin = blockedCount > 0 ? [/Failed to load resource: net::ERR_FAILED/] : [];
	const patterns = [...builtin, ...ignore].map((p) => (p instanceof RegExp ? p : new RegExp(p)));
	const kept = [];
	const ignored = [];
	for (const e of collected) {
		(patterns.some((p) => p.test(e.text)) ? ignored : kept).push(e);
	}
	return {
		check: 'console-errors',
		measured: `${kept.length} error(s)${ignored.length ? `, ${ignored.length} ignored by pattern` : ''}`,
		threshold: '0',
		withinThreshold: kept.length === 0,
		data: { errors: kept.slice(0, 20), ignored: ignored.slice(0, 10), totalSeen: collected.length }
	};
}

export { ensureHelpers, rgbStr };
