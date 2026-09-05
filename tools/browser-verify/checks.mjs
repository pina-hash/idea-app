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
    /* OPACITY IS NOT INHERITED, SO THE ELEMENT'S OWN VALUE IS NOT THE ANSWER.
       A child of an \`opacity: 0\` parent computes opacity 1 and is painted
       nowhere -- which is precisely the false green this check exists to
       prevent, and the check had it. Found by a LIVE negative control:
       \`--break invisible\` set opacity 0 on the room wrapper of three routes
       and every presence row came back visible. Walk up and name the ancestor,
       so the reason says which element actually did it rather than reporting a
       bare "opacity:1" nobody can act on. Capped like \`groundOf\`'s walk. */
    if (!reasons.some((r) => r.startsWith('opacity'))) {
      let anc = el.parentElement;
      for (let hops = 0; anc && hops < 60; hops++, anc = anc.parentElement) {
        const ao = parseFloat(getComputedStyle(anc).opacity);
        if (!Number.isNaN(ao) && ao <= 0.01) {
          reasons.push('ancestor-opacity:' + ao + ' on ' + cssPath(anc));
          break;
        }
      }
    }
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
/**
 * THE OFFENDER LIST SKIPS A WHOLE FIXED SUBTREE, NOT ONLY THE FIXED ELEMENT
 * ITSELF, AND THAT ONE WORD COST WEEKS.
 *
 * This loop used to read `if (cs.position === 'fixed') continue`, which tests
 * the ELEMENT'S OWN position and never walks up. A fixed overlay was skipped
 * and its static and absolute children were not -- and those children carry
 * the overlay's viewport coordinates, so on `/dev/coins` the Ledger's
 * `#student-drawer` (parked at `right` = 727-750 against a 375 viewport) put
 * six descendants at the top of every list sorted by overhang while
 * contributing nothing to the overflow at all. The Coin Ledger's real cause,
 * an unwrapped tab bar, sat below them and was not read for weeks. Six true
 * measurements of a non-cause is the worst thing a diagnostic can print.
 *
 * IS A FIXED ELEMENT'S STATIC DESCENDANT CAPABLE OF EXTENDING THE DOCUMENT?
 * MEASURED IN THIS CONTAINER'S CHROMIUM (141.0.7390.37) AT 375px, NOT REASONED
 * FROM THE SPEC, because getting it wrong in this direction HIDES REAL
 * OVERFLOW -- a false positive gets investigated and a false negative does not:
 *
 *   a 1200px static box                        scrollWidth 1200  GREW  (control)
 *   a fixed box 1200px wide                    scrollWidth  375  did not grow
 *   a 300px fixed box, 1200px STATIC child     scrollWidth  375  did not grow
 *   a fixed drawer at left:100%, static child  scrollWidth  375  did not grow
 *   a 300px fixed box, 1200px ABSOLUTE child   scrollWidth  375  did not grow
 *
 * The reason is the containing block chain rather than the `position` value: a
 * fixed box's containing block is the viewport, every descendant's containing
 * block chain runs up through it, and the viewport's scrollable overflow region
 * does not take contributions from a subtree it is not the scroll container
 * for. So the whole subtree is invisible to `scrollWidth`, and skipping only
 * its root reports its children as causes of an overflow they cannot cause.
 *
 * THE EXCEPTION IS REAL AND IS THE WHOLE REASON THIS IS NOT A ONE-LINE
 * `closest()`. A `position: fixed` box whose ancestor establishes a containing
 * block for fixed descendants is NOT viewport-fixed: it scrolls with the
 * document and it DOES extend it. Measured, same fixture, a 1200px fixed child
 * of a 10px ancestor:
 *
 *   ancestor `transform: translateZ(0)`   scrollWidth 1200  CAPTURES
 *   ancestor `translate` / `rotate` / `scale`               CAPTURES
 *   ancestor `perspective: 100px`                           CAPTURES
 *   ancestor `filter: blur(0px)`, `backdrop-filter`         CAPTURES
 *   ancestor `will-change:` transform/filter/perspective/
 *            backdrop-filter/translate/rotate/scale/contain CAPTURES
 *   ancestor `contain:` paint/layout/strict/content         did not grow
 *   ancestor `container-type`, `opacity`, `overflow`,
 *            `content-visibility`, `will-change: opacity`   did not grow
 *
 * `CAPTURES_FIXED` therefore FAILS OPEN: it names every property measured to
 * capture plus the few measured not to (`contain`, `container-type`) and any
 * non-`auto` `will-change` at all, because the cost of calling a capturing
 * ancestor viewport-fixed is a hidden overflow and the cost of the reverse is
 * one extra line in a diagnostic list. `will-change: opacity` does not capture
 * and is treated as if it did, deliberately: a value-by-value allowlist is the
 * thing that goes stale when a browser adds one.
 *
 * THE WALK IS PAID ONLY FOR A NODE ALREADY PAST THE EDGE. Every element's own
 * `getComputedStyle` was already being read; the ancestor walk runs after the
 * overhang test, so it costs nothing on the overwhelming majority of a page.
 *
 * AND THE SKIPS ARE COUNTED AND REPORTED (`IDEA_VERIFICATION_ADDENDA` 13: a
 * sweep reports the population it traversed, or its zero is not a finding). An
 * empty offender list beside `12px overflow` is otherwise indistinguishable
 * from a sweep that skipped the cause.
 */
export async function horizontalScroll(page, { tolerancePx = 0.5 } = {}) {
	await ensureHelpers(page);
	const data = await page.evaluate((tol) => {
		const h = window.__bvHelpers;
		const de = document.documentElement;
		const clientWidth = de.clientWidth;
		const scrollWidth = Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0);

		/* Does this element establish a containing block for a `position: fixed`
		   descendant? See the measured table above; this errs toward "yes". */
		const capturesFixed = (cs) =>
			cs.transform !== 'none' ||
			cs.translate !== 'none' ||
			cs.rotate !== 'none' ||
			cs.scale !== 'none' ||
			cs.perspective !== 'none' ||
			cs.filter !== 'none' ||
			cs.backdropFilter !== 'none' ||
			(cs.willChange && cs.willChange !== 'auto') ||
			(cs.contain && cs.contain !== 'none') ||
			(cs.containerType && cs.containerType !== 'normal');

		/* 'viewport-fixed'  -- in a fixed subtree the viewport holds; skip it.
		   'captured-fixed'  -- in a fixed subtree an ancestor holds; it scrolls
		                        with the document and counts.
		   null              -- not in a fixed subtree at all. */
		const fixedContext = (el) => {
			let n = el;
			for (let hops = 0; n && n.nodeType === 1 && hops < 60; hops++, n = n.parentElement) {
				if (getComputedStyle(n).position !== 'fixed') continue;
				let a = n.parentElement;
				for (let up = 0; a && up < 60; up++, a = a.parentElement) {
					if (capturesFixed(getComputedStyle(a))) return 'captured-fixed';
				}
				return 'viewport-fixed';
			}
			return null;
		};

		const offenders = [];
		let fixedSkipped = 0;
		let capturedFixed = 0;
		for (const el of document.querySelectorAll('*')) {
			const cs = getComputedStyle(el);
			if (cs.display === 'none' || cs.visibility === 'hidden') continue;
			const r = el.getBoundingClientRect();
			if (r.width === 0 && r.height === 0) continue;
			const overhang = r.right - clientWidth;
			if (overhang <= tol) continue;
			const ctx = fixedContext(el);
			if (ctx === 'viewport-fixed') {
				fixedSkipped++;
				continue;
			}
			if (ctx === 'captured-fixed') capturedFixed++;
			offenders.push({
				path: h.cssPath(el),
				right: +r.right.toFixed(1),
				overhangPx: +overhang.toFixed(1),
				width: +r.width.toFixed(1),
				fixedContext: ctx
			});
		}
		offenders.sort((a, b) => b.overhangPx - a.overhangPx);
		return {
			clientWidth,
			scrollWidth,
			overflowPx: +(scrollWidth - clientWidth).toFixed(1),
			offenderCount: offenders.length,
			fixedSkipped,
			capturedFixed,
			offenders: offenders.slice(0, 6)
		};
	}, tolerancePx);

	/* The skip count rides in `measured` only when it is non-zero: a "0 skipped"
	   on all 188 rows is noise, and a non-zero one is exactly the sentence a
	   reader needs beside an empty offender list. `data` carries it always. */
	const skipNote = data.fixedSkipped
		? `; ${data.fixedSkipped} node(s) past the edge skipped as viewport-fixed (they cannot extend the document)`
		: '';
	return {
		check: 'horizontal-scroll',
		measured: `${data.overflowPx}px overflow (scrollWidth ${data.scrollWidth} vs clientWidth ${data.clientWidth})${skipNote}`,
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
 * 3a. Tap REACH -- a `.tap-reach-44` control's expanded hit area, MEASURED
 * ------------------------------------------------------------------ */
/**
 * `.tap-reach-44` (app.css) grows a control's HIT AREA with a centred
 * `::after` pseudo-element instead of growing the control's own box, for a
 * control sitting inside a line of text or a table header where inflating
 * the box would reflow the writing around it (CLAUDE.md, IDEA_INTERFACE_
 * STANDARDS 10). `tapTargets` measures the element's own rendered box, which
 * for one of these is BY DESIGN under 44px -- so pointing that check at a
 * `.tap-reach-44` selector reports a finding on every one of them, on a
 * surface that is actually fine.
 *
 * THIS CHECK HIT-TESTS THE REACH RATHER THAN COMPUTING IT, AND IT USED TO DO
 * THE OPPOSITE. Until 2026-09-05 the reported geometry was RECONSTRUCTED from
 * the CSS -- `reachH = Math.max(ownHeight, 44)`, `reachW = Math.max(ownWidth,
 * --tap-reach-w)` -- so `reachH` was 44 BY CONSTRUCTION for every control the
 * pair applied to, and the `under` gate could only ever fire on the width. A
 * `button.info-tip-trigger.tap-reach-44` whose real reach measured 34.5px was
 * reported as `smallest reach 140.7x44 ... 0/4 reaches under 44px`. The
 * sentence a reader consults said 44 about a control that was delivering 34.5,
 * and the number came from the class name by way of the stylesheet rather than
 * from the page.
 *
 * The reach is now WALKED: from the control's centre outward in each of the
 * four directions, `WALK_STEP` at a time, counting only points that genuinely
 * hit the control. `walkedW`/`walkedH` are that measurement and are the only
 * thing the gate reads, so `min - <something>` is a real shortfall rather than
 * a modelling choice. `reachW`/`reachH` keep their old, reconstructed meaning
 * and keep their names, because the `--tap-reach-w` knob-parsing controls in
 * `selftest.mjs` assert on them and that parsing is still worth asserting;
 * they decide nothing now.
 * The reconstructed box is a DIAGNOSTIC AND NEVER A SECOND GATE: where the two
 * disagree, the difference is what something clipped or covered, and having
 * both in the row is what lets a reader tell a clipped reach from a reach that
 * was never declared at all. Only the walked numbers decide `withinThreshold`.
 *
 * A HIT IS THE CONTROL, SOMETHING INSIDE IT, OR A `<label>` THAT ACTIVATES IT
 * -- NEVER A PLAIN ANCESTOR, and the ancestor clause is exactly how a miss was
 * scoring as a hit. `hitsSelf` used to read
 * `hit === el || el.contains(hit) || hit.contains(el)`, and that third term is
 * true for every ancestor: a `<td>`, a `<div>`, the disclosure body around the
 * whole module. Those are precisely the elements a CLIPPED reach falls through
 * to, so the one case the hit test exists to catch was the one it scored as a
 * pass. Measured on `/dev/spec-table?empty=1` at 1440 before this change: at
 * 14px and 16px above the trigger's centre the top element is
 * `div.disc-body`, `hit.contains(el)` is true, and the sample counted as a
 * hit on a point where the reach is not there and a finger would press
 * nothing. Pressing the cell does not press the button.
 *
 * A `<label>` is the deliberate exception and not a softening of that rule:
 * clicking a label that owns a control activates the control, so the label's
 * box IS the control's hit area, which is the thing CLAUDE.md means by
 * measuring a wrapped input at its label. `label.control` covers the wrapping
 * form, `for=`/`id` covers the detached form.
 *
 * `document.elementFromPoint` answers null OUTSIDE the viewport, so this check
 * SCROLLS each control to the middle of the window before walking it and puts
 * every scroll position back afterwards. That is the one place it departs from
 * the harness's never-scroll rule, and it departs deliberately: a hit test
 * cannot be taken on a point that is not in the window, and the alternative --
 * the /dev/foundry-submit shape, where five controls ~3000px down all read
 * `centreHitsSelf: false` -- is a row that reports the instrument rather than
 * the page. A control whose centre is STILL offscreen after that (it is inside
 * a container that cannot bring it into view) is reported as `offscreen`, and
 * a walk that runs into a viewport edge before reaching its limit is marked
 * `clampedByViewport`. Both are excluded from the gate and both are counted in
 * the sentence, so a shrinking denominator cannot hide behind a clean verdict.
 */
/**
 * Hit-test resolution of the walk, in CSS px.
 *
 * THE WALK REPORTS THE FIRST DISTANCE THAT MISSES, NOT THE LAST THAT HITS, and
 * that is forced by the geometry rather than chosen. A box occupies a
 * half-open interval, so a sample taken at exactly its far edge belongs to the
 * next element: a perfect 44px reach with pixel-aligned edges hits at 21.75 and
 * misses at 22.0 on each side, and reporting last-hit gives 43.5 for a reach
 * that is exactly 44. Measured on the selftest's own fixture, which reproduces
 * the real `.tap-reach-44` rule pair: last-hit reported 43 and failed a control
 * that is correct. Reporting the first miss gives 44.0 there, and on the four
 * healthy call sites in `src/` at both widths.
 *
 * The cost is that a reach can be over-credited by up to one step per side. At
 * 0.25px that is 0.5px worst case on a 44px floor, which is why the step is a
 * quarter pixel rather than a half: at 0.5 the same fixture measurements showed
 * a 43.4px reach reporting a clean 44.
 */
export const WALK_STEP = 0.25;

export async function tapReach(page, { selector, label = selector, min = 44 } = {}) {
	await ensureHelpers(page);
	const data = await page.evaluate(
		({ selector, min, step }) => {
			const h = window.__bvHelpers;
			const nodes = Array.from(document.querySelectorAll(selector));
			/* EVERY SCROLL THIS CHECK MAKES IS PUT BACK. `scrollIntoView` can
			   move any scrollable ancestor as well as the document, so the
			   whole chain is recorded first and restored last, and the check
			   leaves the page where it found it for whatever runs next. */
			const scrollers = [document.scrollingElement, ...document.querySelectorAll('*')]
				.filter((n) => n && (n.scrollTop !== 0 || n.scrollLeft !== 0 || n.scrollHeight > n.clientHeight || n.scrollWidth > n.clientWidth))
				.map((n) => ({ n, top: n.scrollTop, left: n.scrollLeft }));
			const results = nodes.map((el) => {
				/* THE HARNESS DOES NOT SCROLL AND THIS CHECK HAS TO. A hit test
				   needs the point to be inside the viewport --
				   `elementFromPoint` answers null outside it -- so a control
				   below the fold was previously reported with five offscreen
				   sample points and passed on its MODELLED geometry alone, or,
				   once the model stopped deciding anything, could not be
				   measured at all. `/dev/classroom-images` is the case: all
				   four attachment links sit below 900px at both widths, and
				   walking them after a scroll gives a clean 44 that neither
				   earlier shape could report. `behavior: 'instant'` because
				   `src/app.css` sets a global `scroll-behavior: smooth`
				   (CLAUDE.md), and a smooth scroll would still be in flight
				   when the walk reads its first point. */
				try {
					el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
				} catch {
					/* An element in a container that cannot scroll is measured
					   where it is; the viewport clamp below reports it. */
				}
				const vis = h.isVisible(el);
				const own = el.getBoundingClientRect();
				const cs = getComputedStyle(el);
				/* THE PSEUDO-ELEMENT MUST ACTUALLY EXIST. There is no API for a
				   pseudo-element's own geometry, so the MODELLED box below
				   recomputes it the way the CSS computes it -- but only for a
				   control the CSS pair actually applies to. `content: none` is
				   what a `::after` reports when no rule defines one. The model
				   no longer decides anything; it is carried so a reader can
				   compare it against the walk. */
				const after = getComputedStyle(el, '::after');
				const hasReach = after.content !== 'none' && after.content !== '';
				/* `|| 44` SWALLOWED A DELIBERATE ZERO, AND ZERO IS THE COMMON
				   CASE RATHER THAN AN EXOTIC ONE. `--tap-reach-w: 0px` is the
				   documented width knob and CLAUDE.md says most reaches must
				   set it. `parseFloat` returns 0 for `0px`, `0 || 44` is 44.
				   The UNSET case still defaults to 44, because that is what
				   `var(--tap-reach-w, 44px)` in `src/app.css` does; the
				   distinction is between "absent" and "zero", which `||`
				   cannot make. The raw declared string rides in
				   `reachWDeclared` for a reader to audit. */
				const reachDeclared = cs.getPropertyValue('--tap-reach-w').trim();
				const reachParsed = parseFloat(reachDeclared);
				const knobW = hasReach ? (Number.isFinite(reachParsed) ? reachParsed : 44) : 0;
				const modelledW = hasReach ? Math.max(own.width, knobW) : own.width;
				const modelledH = hasReach ? Math.max(own.height, 44) : own.height;

				const cx = own.x + own.width / 2;
				const cy = own.y + own.height / 2;
				const inView = (x, y) => x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
				/* THE ONE DEFINITION OF A HIT. The element, anything inside it,
				   or a <label> that activates it. An ancestor is not a hit. */
				const isHit = (hit) => {
					if (!hit) return false;
					if (hit === el || el.contains(hit)) return true;
					for (let n = hit; n; n = n.parentElement) {
						if (n.tagName !== 'LABEL') continue;
						if (n.control === el) return true;
						if (n.htmlFor && document.getElementById(n.htmlFor) === el) return true;
					}
					return false;
				};
				const centreOffscreen = !inView(cx, cy);
				const centreHit = centreOffscreen ? null : isHit(document.elementFromPoint(cx, cy));

				/* THE WALK IS CAPPED PER DIRECTION AND THE FLOOR IS READ OFF THE
				   TOTAL, WHICH IS NOT THE SAME AS CAPPING EACH SIDE AT
				   `min / 2`. Measured on five healthy `.tap-reach-44` controls
				   at both widths, a correct 44px reach walks 22.5px one way and
				   21.5px the other: the pseudo-element is centred on the
				   control's box, the control's own centre lands on a fraction
				   of a pixel, and the browser's hit test resolves the two edges
				   half a step apart. The sum is 44.0 every time. A per-side cap
				   of 22 would have reported 43.5 for all of them and failed
				   every passing call site in the repo. `blockedBy` is the
				   element that took the tap at the first miss, which is what
				   names a clip or a neighbour. */
				const limit = min;
				const walk = (dx, dy) => {
					if (!centreHit) return { px: 0, clamped: false, blockedBy: null };
					let lastHit = 0;
					for (let d = step; d <= limit + 1e-9; d += step) {
						const x = cx + dx * d;
						const y = cy + dy * d;
						if (!inView(x, y)) return { px: lastHit, clamped: true, blockedBy: null };
						const took = document.elementFromPoint(x, y);
						/* `d` and not `lastHit`: the edge lies in (lastHit, d],
						   and a box's far edge belongs to the next element, so
						   the miss distance is the extent. See WALK_STEP. */
						if (!isHit(took)) return { px: d, clamped: false, blockedBy: took ? h.cssPath(took) : null };
						lastHit = d;
					}
					return { px: lastHit, clamped: false, blockedBy: null };
				};
				const up = walk(0, -1);
				const down = walk(0, 1);
				const left = walk(-1, 0);
				const right = walk(1, 0);
				/* A SIDE THE WINDOW CUT OFF IS MIRRORED FROM ITS OPPOSITE; A SIDE
				   AN ELEMENT CUT OFF IS NOT, AND THE WHOLE VALUE OF THE CHECK IS
				   IN THAT DIFFERENCE. The pseudo-element is centred on the
				   control by construction (`top:50%; left:50%;
				   translate(-50%,-50%)` in app.css), so the two sides of an axis
				   are equal in the CSS and a measured difference can only come
				   from the window or from something on the page. `clamped` is
				   set ONLY when a point left the viewport, which after the
				   scroll above means the document was too short to give the
				   control `min` of headroom -- a fact about the window, and the
				   same artefact this check already refuses to report as a
				   finding. Something on the page stopping the walk sets
				   `blockedBy` instead and is never mirrored, so the clipped
				   `.tap-reach-44` case this rewrite exists to catch (top blocked
				   by an ancestor, bottom clear) still reports its real
				   shortfall. An axis clamped on BOTH sides has nothing to mirror
				   from and excludes the control. */
				const pair = (a, b) => {
					if (a.clamped && b.clamped) return { px: null, mirrored: false };
					if (a.clamped) return { px: b.px * 2, mirrored: true };
					if (b.clamped) return { px: a.px * 2, mirrored: true };
					return { px: a.px + b.px, mirrored: false };
				};
				const vert = pair(up, down);
				const horiz = pair(left, right);
				const clamped = vert.px === null || horiz.px === null;
				const walkedW = horiz.px === null ? 0 : +horiz.px.toFixed(1);
				const walkedH = vert.px === null ? 0 : +vert.px.toFixed(1);
				const blockers = [up, down, left, right].map((w) => w.blockedBy).filter(Boolean);

				return {
					path: h.cssPath(el),
					hasReach,
					reachWDeclared: reachDeclared || '(unset -- app.css defaults it to 44px)',
					ownW: +own.width.toFixed(1),
					ownH: +own.height.toFixed(1),
					/* WHAT THE CSS SAYS, kept under the names it has always had so
					   the knob-parsing controls in selftest.mjs keep asserting
					   the thing they were written for. These decide NOTHING. */
					reachW: +modelledW.toFixed(1),
					reachH: +modelledH.toFixed(1),
					/* WHAT THE PAGE ACTUALLY GIVES, walked. The gate reads these
					   and only these. */
					walkedW,
					walkedH,
					up: +up.px.toFixed(1),
					down: +down.px.toFixed(1),
					left: +left.px.toFixed(1),
					right: +right.px.toFixed(1),
					mirroredFromViewportClamp: vert.mirrored || horiz.mirrored,
					minDim: +Math.min(walkedW, walkedH).toFixed(1),
					blockedBy: blockers.length ? Array.from(new Set(blockers)) : null,
					centreHit,
					offscreen: centreOffscreen,
					clampedByViewport: clamped,
					visible: vis.visible,
					invisibleBecause: vis.reasons
				};
			});
			for (const s of scrollers) {
				s.n.scrollTop = s.top;
				s.n.scrollLeft = s.left;
			}
			return { matchCount: nodes.length, results };
		},
		{ selector, min, step: WALK_STEP }
	);

	/* A control the harness could not put a point on is not a finding about
	   the page. Both exclusions are reported as counts so a shrinking
	   denominator cannot hide behind a clean verdict. */
	const visible = data.results.filter((r) => r.visible);
	const excluded = visible.filter((r) => r.offscreen || r.clampedByViewport);
	const measurable = visible.filter((r) => !r.offscreen && !r.clampedByViewport);
	const smallest = measurable.reduce((a, r) => (a === null || r.minDim < a.minDim ? r : a), null);
	const under = measurable.filter((r) => r.minDim < min).length;
	return {
		check: 'tap-reach',
		selector,
		label,
		measured:
			measurable.length === 0
				? `${data.matchCount} matched, ${visible.length} visible, 0 measurable (${excluded.length} offscreen or clamped by the viewport -- an artefact of the harness, not a finding)`
				: `smallest walked reach ${smallest.walkedW}x${smallest.walkedH} (min dim ${smallest.minDim}px, own box ${smallest.ownW}x${smallest.ownH}, CSS models ${smallest.reachW}x${smallest.reachH}); ${under}/${measurable.length} reaches under ${min}px${under ? `, first blocked by ${(smallest.blockedBy || ['nothing -- the walk ran out']).join(' / ')}` : ''}; ${excluded.length} offscreen or clamped, excluded`,
		threshold: `${min}px walked reach in both axes`,
		withinThreshold: measurable.length > 0 && under === 0,
		matchCount: data.matchCount,
		data
	};
}

/* ------------------------------------------------------------------ *
 * 3b. Active-vs-inactive state distinctness
 * ------------------------------------------------------------------ */
/**
 * A segmented control that carries `aria-pressed` is only readable by a
 * SIGHTED user if the pressed member actually looks different from the
 * others -- `aria-pressed` says so to a screen reader, never to an eye.
 * The Foundry gallery's sort control shipped a first draft where the
 * active rule set `color: var(--green)`, which `.btn` was ALREADY
 * setting: pressed and unpressed rendered the identical foreground on
 * the identical ground, both at 8.28:1, and the only thing distinguishing
 * them was the attribute. Two individually-passing `contrast` checks
 * would not have caught that -- 8.28:1 clears 4.5:1 twice over -- because
 * a plain per-element minimum has nothing to say about whether two
 * elements agree with EACH OTHER.
 *
 * This check reads the foreground colour AND the contrast ratio of one
 * "active" element and one "inactive" element and asserts they actually
 * differ, by either signal: a real RGB separation in the ink (catches the
 * green-on-green case) or a materially different ratio against their own
 * ground (catches a same-hue-different-weight case the colour distance
 * alone might miss). Colour is never the only signal on this platform,
 * and it is not the only signal this check trusts either.
 */
export async function statePairContrast(page, { activeSelector, inactiveSelector, label, minFgDelta = 12, minRatioDelta = 0.05 } = {}) {
	await ensureHelpers(page);
	const data = await page.evaluate(
		({ activeSelector, inactiveSelector }) => {
			const h = window.__bvHelpers;
			function read(selector) {
				const el = document.querySelector(selector);
				if (!el) return null;
				const cs = getComputedStyle(el);
				const g = h.groundOf(el);
				const fgRaw = h.toRGBA(cs.color);
				const fg = h.over(fgRaw, g.ground);
				return {
					path: h.cssPath(el),
					fg,
					ground: g.ground,
					ratio: +h.ratio(fg, g.ground).toFixed(2)
				};
			}
			return { active: read(activeSelector), inactive: read(inactiveSelector) };
		},
		{ activeSelector, inactiveSelector }
	);

	const found = !!data.active && !!data.inactive;
	const fgDelta = found
		? Math.sqrt(
				(data.active.fg.r - data.inactive.fg.r) ** 2 +
					(data.active.fg.g - data.inactive.fg.g) ** 2 +
					(data.active.fg.b - data.inactive.fg.b) ** 2
			)
		: 0;
	const ratioDelta = found ? Math.abs(data.active.ratio - data.inactive.ratio) : 0;
	const distinct = found && (fgDelta >= minFgDelta || ratioDelta >= minRatioDelta);

	return {
		check: 'state-pair-contrast',
		label,
		measured: found
			? `active ${data.active.ratio}:1 ${rgbStr(data.active.fg)} vs inactive ${data.inactive.ratio}:1 ${rgbStr(data.inactive.fg)}; Δfg=${fgDelta.toFixed(1)} Δratio=${ratioDelta.toFixed(2)}`
			: `not found (active=${!!data.active}, inactive=${!!data.inactive})`,
		threshold: `Δfg >= ${minFgDelta} or Δratio >= ${minRatioDelta} (states must render differently, not just both clear their own minimum)`,
		withinThreshold: distinct,
		data
	};
}

/* ------------------------------------------------------------------ *
 * 4. Presence vs visibility -- two different questions
 * ------------------------------------------------------------------ */
export async function presence(page, { selector, label = selector, expectPresent = 1, maxPresent = undefined, expectVisible = undefined, maxVisible = undefined } = {}) {
	/* Present, visible and exposed-to-assistive-tech are THREE questions. A
	   collapsed Disclosure keeps its region in the DOM at a zero box on purpose
	   (CLAUDE.md: hidden in CSS, never removed), so `present 2, visible 0` is
	   the correct reading of a closed panel and not a defect. A spec that means
	   it says so with expectVisible.

	   `expectVisible` IS A FLOOR AND ONLY A FLOOR, which makes every
	   `expectVisible: 0` row in routes.mjs vacuous in its second half: `visible
	   >= 0` holds for any number of visible nodes, so a panel that started
	   painting itself open would still come back green and the "visible 0" in
	   the report would simply become "visible 2". `maxVisible` is the CEILING
	   the floor cannot express. It exists because two rules in this repo are
	   stated as a prohibition rather than a minimum -- GAUNTLET-DESIGN's
	   "the FeatureManager rail is hidden by default; do not make it visible by
	   default", and CLAUDE.md's "a closed Disclosure keeps its region in the
	   DOM at a zero box" -- and CLAUDE.md's own verification standard requires
	   asserting BOTH directions of a visibility claim. Omitted, nothing
	   changes; every existing row keeps its exact previous semantics. */
	/* `expectPresent` IS A FLOOR TOO, AND AT ZERO THAT FLOOR ASSERTS NOTHING AT
	   ALL -- which is the same defect one axis over, and the worse one, because
	   every absence row in `routes/` is written as `expectPresent: 0`. `present
	   >= 0` holds for any number of nodes, so a row reading "no mark of any kind
	   inside the trademark footer" comes back green with a mark inside the
	   trademark footer. MEASURED, not reasoned: a `<svg>` injected into
	   `TrademarkFooter.svelte` gave `ok presence [no mark of any kind inside the
	   footer] present 1, visible 1` and a run reporting 0 outside threshold.

	   `maxPresent` is the ceiling, and IT DEFAULTS TO ZERO WHEN
	   `expectPresent` IS ZERO. That default is the fix rather than the
	   parameter: a caller asking for zero is stating an absence in every one of
	   the ~30 rows that do it across this directory, and a floor of zero is not
	   a weaker assertion than they wanted, it is no assertion. There is no
	   legitimate `>= 0`, so nothing is taken away by refusing to offer one. A
	   row that genuinely wants a floor above zero (`/dev/pathways` counts chips
	   across every stage on purpose) simply leaves `maxPresent` unset and keeps
	   the floor it always had.

	   A ceiling ON AN ABSENCE ROW STILL CANNOT SEE A SELECTOR THAT MATCHES
	   NOTHING because the markup was renamed -- `present 0` is the same reading
	   either way, and no ceiling can tell those apart. That is why every
	   absence row in this directory sits beside a positive control in the same
	   spec (the footer's own `.gt-tm`, the queue's `[aria-disabled]` twin, the
	   30 grid cells beside the two absent states), and why `--selftest` carries
	   a control PROVING the limit rather than leaving it to be rediscovered. */
	const presentCeiling = maxPresent === undefined ? (expectPresent === 0 ? 0 : undefined) : maxPresent;
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

	const ceilingOk = maxVisible === undefined || data.visible <= maxVisible;
	const presentOk = presentCeiling === undefined || data.present <= presentCeiling;

	/* THE THRESHOLD STRING SAYS WHERE THERE IS NO CEILING, IN WORDS. A row
	   printing ">= 0 visible" reads like a measurement and is a blank; printing
	   "visible unconstrained" is the same fact stated so the next reader sees
	   it. The remaining unconstrained half in this directory is deliberate --
	   `.gt-tree` is painted at 1440 and not at 375 and the spec says so -- but
	   deliberate and invisible are different things. */
	const presentPart =
		presentCeiling === undefined
			? `>= ${expectPresent} present`
			: presentCeiling === expectPresent
				? `exactly ${expectPresent} present`
				: `${expectPresent} to ${presentCeiling} present`;
	const visiblePart =
		maxVisible !== undefined
			? `${wantVisible} to ${maxVisible} visible`
			: wantVisible > 0
				? `>= ${wantVisible} visible`
				: 'visible unconstrained';

	return {
		check: 'presence',
		selector,
		label,
		measured: `present ${data.present}, visible ${data.visible}, aria-hidden ${data.ariaHidden}`,
		threshold: `${presentPart}, ${visiblePart}`,
		withinThreshold: data.present >= expectPresent && presentOk && data.visible >= wantVisible && ceilingOk,
		data
	};
}

/* ------------------------------------------------------------------ *
 * 4b. Text content -- what an element SAYS, not merely that it exists
 * ------------------------------------------------------------------ */
export async function textContains(page, { selector, label = selector, must = [], mustNot = [] } = {}) {
	/* `presence` proves an element is in the DOM and paints; `contrast` proves
	   its ink is readable. NEITHER READS A WORD OF IT. For a compliance
	   surface that is the whole question: GAUNTLET's trademark footer is
	   `docs/GAUNTLET-DESIGN.md`'s nominative-attribution requirement, and a
	   footer whose sentence had lost "Dassault Systemes" -- or gained a claim
	   of endorsement -- is present, visible, and clears 4.5:1 exactly as
	   before. Every other check in this file comes back green on it.
	   `--break blank-text` is its live control on the real surface.

	   Whitespace is COLLAPSED on both sides before matching, because the text
	   is authored across source lines and an editor rewrapping a paragraph
	   must not redden a compliance check. The comparison is otherwise literal
	   and case-sensitive: "SOLIDWORKS" is a trademark spelling, not a word.

	   `mustNot` is not decoration. It is the direction a `must` list cannot
	   see -- a sentence can keep every required phrase and still add one that
	   reverses it -- and CLAUDE.md requires both directions of any claim like
	   this. */
	const data = await page.evaluate(
		({ selector, must, mustNot }) => {
			const nodes = Array.from(document.querySelectorAll(selector));
			const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
			const text = norm(nodes.map((el) => el.textContent).join(' '));
			return {
				nodes: nodes.length,
				text,
				missing: must.filter((n) => !text.includes(norm(n))),
				forbidden: mustNot.filter((n) => text.includes(norm(n)))
			};
		},
		{ selector, must, mustNot }
	);

	/* Zero matched nodes is a FAILURE, never a vacuous pass: a selector that
	   matches nothing satisfies "no forbidden phrase appears" perfectly. */
	const withinThreshold = data.nodes > 0 && data.missing.length === 0 && data.forbidden.length === 0;
	const excerpt = data.text.length > 120 ? `${data.text.slice(0, 117)}...` : data.text;
	const faults = [
		data.nodes === 0 ? 'selector matched NOTHING' : null,
		data.missing.length ? `missing ${JSON.stringify(data.missing)}` : null,
		data.forbidden.length ? `forbidden ${JSON.stringify(data.forbidden)}` : null
	].filter(Boolean);

	return {
		check: 'text-contains',
		selector,
		label,
		measured: `${data.nodes} node(s), ${data.text.length} chars${faults.length ? `; ${faults.join('; ')}` : '; all phrases present, none forbidden'} -- "${excerpt}"`,
		threshold: `${must.length} required phrase(s), ${mustNot.length} forbidden, over >= 1 node`,
		withinThreshold,
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
 * 6. Order result -- did an in-page action write the id array it should
 * ------------------------------------------------------------------ */
export async function orderResult(page, { evaluate, expected, label } = {}) {
	/* Reads a value the page itself computed and wrote (a transport's own log),
	   never a DOM position -- a drag-and-drop reorder in a harness backed by a
	   static fixture can move a control without the fixture's rendered order
	   ever changing, so a DOM read here would pass while a broken transport
	   silently dropped the write on the floor. This is the counterpart to
	   domOrder: that check proves an ordering claim by reading what painted;
	   this one proves a WRITE claim by reading what the write path recorded,
	   which is the only place "the drop persisted" is observable at all. */
	/* ARRAYS, AND ONLY ARRAYS -- AND A NON-ARRAY NOW SAYS SO INSTEAD OF
	   PRINTING TWO IDENTICAL VALUES OVER A RED VERDICT.

	   The comparison below is element-for-element and always was, so a probe
	   returning a JOINED STRING can never pass however right its content is.
	   That is the correct contract -- an array cannot be confused by an id
	   holding the separator, and `docs/history/classes-block-course-identity-
	   twrmsn.md` records the repo choosing it deliberately -- but it was
	   enforced SILENTLY: `measured` and `threshold` are both `JSON.stringify`,
	   so a row written `expected: 'a,b,c'` against a probe returning `'a,b,c'`
	   printed `"a,b,c"` twice and was still counted outside threshold. Prompt
	   0027 wrote four such rows, read four identical pairs beside four red
	   verdicts, and had to work out why from the source.

	   THE FIX IS TO REFUSE LOUDLY, NOT TO ACCEPT STRINGS. Accepting them would
	   make the check pass on a shape the rest of this directory has agreed not
	   to write, and would hand back the separator ambiguity the array contract
	   exists to remove. So the contract is unchanged and the REPORT changes:
	   `measured` names the violation and the type it got, which makes it
	   impossible for the two columns to read the same. An `evaluate` that threw
	   is reported the same way, for the same reason -- it used to print a bare
	   `{"__evalError":"..."}` object against an array. */
	const actual = await page
		.evaluate(`(${evaluate})()`)
		.catch((e) => ({ __evalError: e.message }));
	const evalError = actual && typeof actual === 'object' && !Array.isArray(actual) && actual.__evalError;
	const shapeProblem = evalError
		? `the page-side probe threw: ${evalError}`
		: !Array.isArray(expected)
			? `this spec's \`expected\` is a ${typeof expected}, not an array -- this check compares arrays element for element and a non-array can never pass. Write the expectation as an array.`
			: !Array.isArray(actual)
				? `the probe returned a ${actual === null ? 'null' : typeof actual} (${JSON.stringify(actual)}), not an array -- this check compares arrays element for element and a non-array can never pass. Return an array from \`evaluate\`.`
				: null;
	const withinThreshold =
		!shapeProblem && actual.length === expected.length && actual.every((v, i) => v === expected[i]);
	return {
		check: 'order-result',
		label,
		measured: shapeProblem ? `CANNOT COMPARE: ${shapeProblem}` : JSON.stringify(actual),
		threshold: Array.isArray(expected) ? JSON.stringify(expected) : `an array; got ${JSON.stringify(expected)}`,
		withinThreshold,
		data: { actual, expected, shapeProblem: shapeProblem || null }
	};
}

/* ------------------------------------------------------------------ *
 * 7. Datalist order -- an input's `list` attribute resolves to a REAL
 * datalist element, with its options in the order a page-side function
 * produces.
 * ------------------------------------------------------------------ */
export async function datalistOrder(page, { inputSelector, evaluateExpected, label } = {}) {
	/* `input.list` is the DOM's own resolution of the `list` attribute to a
	   real <datalist> element (or null if the attribute is absent, stale, or
	   points at nothing) -- reading it rather than re-deriving the id by hand
	   is what proves the ATTRIBUTE resolves, not merely that a datalist with
	   a plausible id exists somewhere on the page.

	   `evaluateExpected` is a function SOURCE (a string), invoked exactly the
	   way `orderResult`'s `evaluate` is: it calls a page-side probe the route
	   under test exposes on `window`, which runs the SAME pure function the
	   real render path calls, so "the order the code produces" is measured by
	   calling that code, never by retyping its expected output into a route
	   spec. */
	const result = await page
		.evaluate(`(async () => {
			const input = document.querySelector(${JSON.stringify(inputSelector)});
			if (!input) return { error: 'input not found' };
			const dl = input.list;
			const actual = dl ? Array.from(dl.options).map((o) => o.value) : null;
			const expected = await (${evaluateExpected})();
			return { resolved: !!dl, actual, expected };
		})()`)
		.catch((e) => ({ error: e.message }));
	const withinThreshold =
		!result.error &&
		result.resolved &&
		Array.isArray(result.actual) &&
		Array.isArray(result.expected) &&
		result.expected.length > 0 &&
		result.actual.length === result.expected.length &&
		result.actual.every((v, i) => v === result.expected[i]);
	return {
		check: 'datalist-order',
		label,
		measured: result.error
			? `error: ${result.error}`
			: `list resolves=${result.resolved}  options=${JSON.stringify(result.actual)}`,
		threshold: result.error ? 'a resolved datalist' : `options === ${JSON.stringify(result.expected)}`,
		withinThreshold,
		data: result
	};
}

/* ------------------------------------------------------------------ *
 * 8. Motion under prefers-reduced-motion -- BOTH directions, per element
 * ------------------------------------------------------------------ */

/**
 * THE PROBE, run once per media state. Returns one row per element in each
 * matched subtree, in document order.
 *
 * `Element.getAnimations()` IS THE DISCOVERY MECHANISM, not a parse of the
 * stylesheet. Walking `document.styleSheets` for rules that declare an
 * animation was the other candidate and it is the worse instrument here for a
 * reason CLAUDE.md already names: `CSSStyleRule` has a `cssRules` property now
 * (CSS Nesting) and an empty `CSSRuleList` is truthy, so the ordinary shape for
 * walking a sheet skips every plain rule's declarations and comes back with
 * zero matches, which reads exactly like a clean result. `getAnimations()` asks
 * the ELEMENT what is actually attached to it, in the media state the page is
 * currently in, so there is no selector to fail to parse and no sheet to fail
 * to read. It reports a `animation-play-state: paused` animation too (FoundryMark
 * pauses rather than removes), which is correct: paused is attached.
 *
 * `paintedOf` IS NOT `isVisible`, DELIBERATELY. `isVisible` flags a zero-area
 * box, which is the right answer for a laid-out element and the WRONG one for
 * SVG stroke geometry: `<path d="M5 10v20" />` is a vertical line, so its
 * bounding box is 0px wide and every animated rail, tick and node in these
 * marks would report itself invisible. What "nothing is hidden in a base state"
 * asks is whether the element is PAINTED, which is the opacity/display/
 * visibility half of that predicate and not the geometry half. The ancestor
 * opacity walk is kept verbatim, because `opacity` is not inherited and a child
 * of an `opacity: 0` group computes 1 -- the exact false green `isVisible`'s own
 * walk exists to prevent.
 */
const MOTION_PROBE = `(selector) => {
  const h = window.__bvHelpers;
  /* Force a style recalc so a media-state flip has landed before anything is
     read. Chromium recomputes lazily and getComputedStyle is what pays for it. */
  void document.body.offsetHeight;
  const paintedOf = (el) => {
    const cs = getComputedStyle(el);
    const reasons = [];
    if (cs.display === 'none') reasons.push('display:none');
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') reasons.push('visibility:' + cs.visibility);
    if (el.hasAttribute && el.hasAttribute('hidden')) reasons.push('[hidden]');
    const op = parseFloat(cs.opacity);
    if (!Number.isNaN(op) && op <= 0.01) reasons.push('opacity:' + cs.opacity);
    else {
      let anc = el.parentElement;
      for (let hops = 0; anc && hops < 60; hops++, anc = anc.parentElement) {
        const ao = parseFloat(getComputedStyle(anc).opacity);
        if (!Number.isNaN(ao) && ao <= 0.01) { reasons.push('ancestor-opacity:' + ao + ' on ' + h.cssPath(anc)); break; }
      }
    }
    return { painted: reasons.length === 0, reasons, opacity: Number.isNaN(op) ? 1 : op };
  };
  const rows = [];
  for (const root of document.querySelectorAll(selector)) {
    const all = [root, ...root.querySelectorAll('*')];
    for (const el of all) {
      const anims = typeof el.getAnimations === 'function' ? el.getAnimations() : [];
      const cs = getComputedStyle(el);
      const p = paintedOf(el);
      rows.push({
        path: h.cssPath(el),
        tag: el.tagName.toLowerCase(),
        animations: anims.length,
        animationNames: anims.map((a) => (a.animationName || (a.effect && a.effect.getKeyframes ? 'effect' : 'anim'))).slice(0, 4),
        playStates: anims.map((a) => a.playState).slice(0, 4),
        animationName: cs.animationName,
        transform: cs.transform,
        opacity: +p.opacity.toFixed(3),
        painted: p.painted,
        reasons: p.reasons
      });
    }
  }
  return rows;
}`;

/**
 * `prefers-reduced-motion`, measured in BOTH states, per ELEMENT.
 *
 * WHAT IT ASSERTS is CLAUDE.md's rule for the app marks, which is stated in
 * three places and is not identical in any two of them. The narrowest and
 * strongest wording is the one under the launcher-card section: "Every other
 * app mark is a component in `$lib/marks` with a 3-4.6s loop gated behind
 * `prefers-reduced-motion: no-preference`, and **nothing is hidden in a base
 * state**: with the animation cancelled every animated element is at full
 * opacity and no transform, so a reduced-motion reader sees the whole glyph."
 * Two more say the same thing more loosely: "Everything animated is gated
 * behind `prefers-reduced-motion`", and AnimatedLogo's "spin is gated behind
 * `prefers-reduced-motion: no-preference`". The FRC half is the other
 * direction: "THE FRC MARK IS NEVER ANIMATED ... FIRST's brand guidelines
 * prohibit altering the mark, and motion is an alteration."
 *
 * THE HARD PART IS THE CANCELLED STATE, AND MEASURING THE ANIMATION RUNNING
 * PROVES NOTHING ABOUT IT. So this flips Chromium's own emulation of the media
 * feature and measures the SAME elements twice:
 *
 *   phase RUNNING (`prefers-reduced-motion: no-preference`) -- discover which
 *     elements are animated at all. That set is the POSITIVE CONTROL: an
 *     `expect: 'gated'` entry that finds nothing to animate FAILS, because a
 *     sweep with an empty case list satisfies "nothing moves under reduce"
 *     perfectly and is the shape a renamed class silently produces.
 *   phase REDUCED (`prefers-reduced-motion: reduce`) -- re-read exactly those
 *     elements. Each must have NO animation attached, `animation-name: none`,
 *     `transform: none`, and must still be PAINTED.
 *
 * `expect: 'never'` is the FRC direction: zero animated elements in the RUNNING
 * phase, which is the phase where every other mark is moving. Asserting it in
 * the reduced phase alone would be satisfied by an animation that is merely
 * gated -- the one thing this mark may not have.
 *
 * ONE CALL SWEEPS EVERY ENTRY, and that is a runtime decision rather than a
 * shape preference: each media flip costs a settle, and eleven marks measured
 * one at a time would pay twenty-two of them per route/width. Two flips serve
 * the whole spec.
 *
 * THE MEASURED VALUE IS NOT A PASS. Every row reports how many elements were
 * swept, how many animate, how many are still moving under reduce, how many
 * carry a residual transform, how many are unpainted, and the LOWEST resting
 * opacity in the set -- which is the number "full opacity" is really about and
 * the one a future reader can audit. It is REPORTED rather than gated, because
 * these glyphs legitimately author depth with opacity (`.node { opacity: 0.35 }`
 * in GauntletMark is its resting value, not a dimmed frame); what is GATED is
 * "painted at all", on the harness's own existing 0.01 floor.
 */
export async function motionSweep(page, entries, { settleMs = 160 } = {}) {
	if (!entries || entries.length === 0) return [];
	await ensureHelpers(page);

	/* `page.evaluate(string)` treats its argument as an EXPRESSION and IGNORES
	   any second argument -- the same trap `clickUntil` and `waitUntil` already
	   work around in browser.mjs. Handed the probe source and a selector, it
	   evaluated to a FUNCTION OBJECT, returned undefined, and every row below
	   read `length` off nothing. The selector is interpolated into the call
	   instead, JSON-encoded so a quote in it cannot break out. */
	const readAll = async () => {
		const out = [];
		for (const e of entries) {
			out.push(await page.evaluate(`(${MOTION_PROBE})(${JSON.stringify(e.selector)})`));
		}
		return out;
	};

	/* RUNNING first: the set of animated elements can only be discovered in the
	   state that runs them, and it is what makes the reduced-phase zero mean
	   something. */
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.waitForTimeout(settleMs);
	const running = await readAll();

	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.waitForTimeout(settleMs);
	const reduced = await readAll();

	/* Leave the page in the state the rest of the run expects. Every other
	   check in this file measures the no-preference surface, and a page left in
	   `reduce` would silently move whatever ran after it. */
	await page.emulateMedia({ reducedMotion: 'no-preference' });

	return entries.map((entry, i) => {
		const { selector, label = selector, expect = 'gated' } = entry;
		const run = running[i];
		const red = reduced[i];

		/* A flip must not change the DOM. If it did, the two phases are not
		   describing the same elements and every count below is meaningless --
		   so that is its own failure rather than a silently mismatched zip. */
		const shapeOk = run.length === red.length;
		const animatedIdx = run.map((r, j) => (r.animations > 0 ? j : -1)).filter((j) => j >= 0);
		const offenders = [];
		if (shapeOk) {
			for (const j of animatedIdx) {
				const r = red[j];
				const why = [];
				if (r.animations > 0) why.push(`still animating (${r.animationName}, ${r.playStates.join('/')})`);
				else if (r.animationName !== 'none') why.push(`animation-name ${r.animationName}`);
				if (r.transform !== 'none') why.push(`transform ${r.transform}`);
				if (!r.painted) why.push(`not painted (${r.reasons.join(', ')})`);
				if (why.length) offenders.push({ path: r.path, opacity: r.opacity, why });
			}
		}
		const restingOpacities = shapeOk ? animatedIdx.map((j) => red[j].opacity) : [];
		const minResting = restingOpacities.length ? Math.min(...restingOpacities) : null;

		const swept = run.length;
		const animated = animatedIdx.length;
		const measured =
			`${swept} element(s) swept, ${animated} animated under no-preference, ` +
			`${offenders.length} not settled under reduce` +
			(minResting === null ? '' : `, lowest resting opacity ${minResting}`);

		let withinThreshold;
		let threshold;
		if (expect === 'never') {
			threshold = '0 animated elements, in either media state';
			withinThreshold = shapeOk && swept > 0 && animated === 0 && red.every((r) => r.animations === 0);
		} else {
			threshold = '>= 1 animated; 0 still moving, transformed or unpainted under reduce';
			withinThreshold = shapeOk && animated > 0 && offenders.length === 0;
		}

		return {
			check: 'motion',
			selector,
			label,
			measured: shapeOk ? measured : `DOM changed across the media flip (${run.length} then ${red.length} elements)`,
			threshold,
			withinThreshold,
			data: {
				expect,
				shapeOk,
				swept,
				animated,
				minResting,
				offenders: offenders.slice(0, 12),
				/* The animated elements themselves, both phases, so the report
				   can print what each one rests at rather than only naming the
				   ones that failed. */
				elements: shapeOk
					? animatedIdx.slice(0, 16).map((j) => ({
							path: run[j].path,
							running: run[j].animationNames.join(','),
							restOpacity: red[j].opacity,
							restTransform: red[j].transform,
							restAnimations: red[j].animations
						}))
					: [],
				/* For `expect: 'never'`, what DID animate is the finding. */
				unexpected: expect === 'never' ? animatedIdx.slice(0, 8).map((j) => run[j].path) : []
			}
		};
	});
}

/* ------------------------------------------------------------------ *
 * 9. Console errors during the run
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


/* ------------------------------------------------------------------ *
 * 10. PREPARE STEPS, judged rather than narrated
 *
 * These live here rather than in `run.mjs` for the reason every other check
 * does: they return MEASURED VALUES with a threshold beside them, they are
 * counted in the run's summary, and `--selftest` puts them to a fixture. They
 * used to be strings pushed onto a `prepared` array and printed above the
 * results, which meant a step that failed outright -- or, worse, one that
 * silently did nothing -- was invisible to the summary count and to `--strict`.
 * MEASURED: a spec handed three broken steps at once reported "0 outside
 * threshold" and `--strict` exited 0.
 * ------------------------------------------------------------------ */

/**
 * A `prepare` CLICK step, judged rather than narrated.
 *
 * THE PRE-CLICK SHORT-CIRCUIT IS THE FINDING THIS EXISTS FOR. `clickUntil`
 * evaluates the step's own `until` BEFORE clicking and returns "already
 * satisfied" if it holds (browser.mjs explains why, and offers `force` to skip
 * it). That is correct behaviour and a silent trap: a predicate satisfiable by
 * the page's RESTING state means the click never physically fires, the state
 * the spec exists to measure is never reached, and the report says "clicked".
 * MEASURED on /dev/song-queue: with the component's `notice` seeded non-null,
 * the step printed `1 matched, 0 attempt(s), already satisfied`, the
 * aria-disabled click-through contract went entirely unproven, and the run
 * reported 0 measurements outside threshold. It has bitten twice for real --
 * `/dev/classroom-split/s-1?manage=1` when the bulk bar started rendering at
 * rest, and `/dev/notebook` when `.pick.free` started `aria-pressed` true.
 *
 * So a click step passes only when the click ACTUALLY FIRED (attempts >= 1)
 * and a predicate then confirmed its effect. The two ways out are both
 * deliberate and both visible in the report: fix the predicate so it names
 * something only the click can produce, or pass `force: true` -- which
 * guarantees the click fires and is annotated below, because a forced step is
 * one whose predicate is NOT required to discriminate and the next reader
 * should know that from the line rather than from the spec file.
 */
export function prepareClickResult(step, r) {
	const forced = step.force === true;
	const hasPredicate = !!step.until;
	const skipped = r.ok && r.attempts === 0;
	const ok = r.ok && r.attempts > 0 && hasPredicate;
	const why = !r.ok
		? r.reason
		: skipped
			? 'the predicate ALREADY HELD, so the click never fired -- this step reached no state'
			: !hasPredicate
				? 'clicked, but with no `until` the effect was never verified'
				: r.reason;
	return {
		check: 'prepare-click',
		label: step.click,
		measured: `${r.matched} matched, ${r.attempts} attempt(s), ${why}${forced ? '  [force: predicate not required to discriminate]' : ''}`,
		threshold: 'the click fires at least once and its `until` then holds',
		withinThreshold: ok,
		data: { ...r, forced, hasPredicate }
	};
}

/** A `prepare` WAIT step. */
export function prepareWaitResult(step, r) {
	/* `already satisfied` at 0ms is NOT a finding here, and that is the whole
	   difference from a click: waiting is not supposed to CAUSE anything, so a
	   payload that had already landed is the step working. A click that never
	   fired is a step that did not happen. */
	return {
		check: 'prepare-wait',
		label: String(step.waitFor).replace(/\s+/g, ' ').slice(0, 60),
		measured: `${r.waitedMs}ms, ${r.reason}`,
		threshold: 'the predicate holds within the timeout',
		withinThreshold: r.ok,
		data: r
	};
}

/** A `prepare` EVALUATE step. `out` is `{ ok, v }` or `{ ok: false, err }`. */
export function prepareEvalResult(step, out) {
	const said = typeof out.v === 'string' || typeof out.v === 'number' ? ` -- ${out.v}` : '';
	/* Collapse the source before slicing: a multi-line step otherwise prints
	   "() => {" and takes its own return value off the end of the line. */
	const src = String(step.evaluate).replace(/\s+/g, ' ').slice(0, 70);
	return {
		check: 'prepare-eval',
		label: src,
		measured: out.ok ? `returned${said || ' (nothing printable)'}` : `THREW: ${out.err}`,
		threshold: 'the step runs without throwing',
		withinThreshold: out.ok,
		data: out
	};
}

export { ensureHelpers, rgbStr };
