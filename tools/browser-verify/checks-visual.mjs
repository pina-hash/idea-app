/**
 * THE THREE CHECKS THAT ASK WHETHER ANYTHING WAS ACTUALLY DRAWN.
 *
 * `checks.mjs` asks present, visible, 44px, 4.5:1, and what an element SAYS.
 * Every one of those came back green over a completely black 3D viewport --
 * measured on `/dev/ideacad` at 1440 on 2026-09-14 at commit `799d203`, where
 * the canvas was 912.0x0.0, its drawing buffer was 1368 x 1, and 99.56% of that
 * buffer was the page ground. Three lanes shipped visual work into that surface
 * and none of them could see it.
 *
 * THAT PARTICULAR PANE WAS REPAIRED ON `main` WHILE THIS FILE WAS BEING
 * WRITTEN, and the pair of readings is the best evidence the check discriminates
 * that anyone is ever likely to get -- the same check, the same route, two real
 * trees: 0.00% off the dominant colour over 1 distinct colour at `799d203`, and
 * 21.50% over 8,325 at `fe62631`. It is not a reason to think the check is
 * finished with. The defect it names is a class, not an incident.
 *
 * The gap is not that those checks are wrong. It is that "present, visible,
 * large enough, readable" is a claim about a BOX, and a box can be perfect over
 * nothing at all. These three ask the other question:
 *
 *   1. `canvasContent`   -- did the renderer put anything in the canvas, or is
 *                           it one flat colour?
 *   2. `layoutSanity`    -- is every interactive element a real box, in a real
 *                           place, off the reserved chrome, with its text
 *                           inside its container?
 *   3. `distinguishable` -- do two things that must read differently actually
 *                           differ in size, weight or colour, rather than
 *                           merely both being present?
 *
 * EVERY ONE RETURNS MEASURED VALUES, per `checks.mjs`'s own contract: a number
 * beside its threshold, never a bare verdict.
 *
 * THEY LIVE IN THEIR OWN FILE RATHER THAN AT THE BOTTOM OF `checks.mjs` for the
 * reason `routes.mjs` gives about `routes/`: a file every lane appends to at the
 * same closing brace is a shared write point, and this repository has already
 * paid for that three times. `checks.mjs` is untouched by this bundle.
 */
import { ensureHelpers } from './checks.mjs';

/* ------------------------------------------------------------------ *
 * The one in-page helper this file adds: a colour histogram.
 *
 * It is injected here rather than into `checks.mjs`'s `HELPERS` block for the
 * reason given in the file header -- that block is a shared write point and
 * this bundle does not touch it. `ensureVisualHelpers` calls `ensureHelpers`
 * first, so a caller gets both and no check has to remember the order.
 * ------------------------------------------------------------------ */
const VISUAL_HELPERS = `
(() => {
  if (window.__bvHistogram) return true;

  /* A histogram over an RGBA byte array, and the two fractions a canvas
     verdict rests on.

     THE SAMPLE STRIDE IS FORCED ODD. A stride that divides the row width
     samples the same columns on every row, so a vertical-striped canvas would
     be read as uniform -- the one aliasing pattern a regular sample can hit on
     a raster. An odd stride walks across the rows instead. The sample COUNT is
     returned, so a reader can see the denominator rather than assume it. */
  window.__bvHistogram = function (bytes, pixels, tolerance, maxSamples) {
    let stride = Math.max(1, Math.ceil(pixels / maxSamples));
    if (stride % 2 === 0) stride += 1;
    const counts = new Map();
    let sampled = 0;
    for (let p = 0; p < pixels; p += stride) {
      const i = p * 4;
      const k = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      counts.set(k, (counts.get(k) || 0) + 1);
      sampled++;
    }
    let topK = 0;
    let topN = 0;
    for (const [k, n] of counts) if (n > topN) { topN = n; topK = k; }
    const dr = (topK >> 16) & 255;
    const dg = (topK >> 8) & 255;
    const db = topK & 255;
    let beyond = 0;
    for (let p = 0; p < pixels; p += stride) {
      const i = p * 4;
      const d = Math.max(Math.abs(bytes[i] - dr), Math.abs(bytes[i + 1] - dg), Math.abs(bytes[i + 2] - db));
      if (d > tolerance) beyond++;
    }
    return {
      sampled,
      stride,
      dominant: 'rgb(' + dr + ', ' + dg + ', ' + db + ')',
      dominantShare: topN / sampled,
      distinctColours: counts.size,
      differExact: 1 - topN / sampled,
      differFraction: beyond / sampled
    };
  };
  return true;
})()
`;

async function ensureVisualHelpers(page) {
	await ensureHelpers(page);
	await page.evaluate(VISUAL_HELPERS);
}

/* ------------------------------------------------------------------ *
 * 1. Canvas content -- is there a picture in there
 * ------------------------------------------------------------------ */

/**
 * THE READBACK HOOK, AND WHY THE CHECK CANNOT WORK WITHOUT IT.
 *
 * `src/lib/ideacad/viewport/Viewport.svelte` builds its renderer as
 * `new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })`, which
 * asks for the WebGL default of `preserveDrawingBuffer: false` -- and with that
 * attribute off, the drawing buffer is thrown away the instant the frame is
 * composited, so `gl.readPixels` afterwards reads a buffer that has been
 * cleared. MEASURED on a fixture whose triangle is known to be drawn: 120000
 * pixels, 1 distinct colour, `rgb(0, 0, 0)`, over a canvas that was visibly
 * painting. An instrument that cannot tell that from a genuinely blank canvas
 * is worse than no instrument, because its "blank" reading looks like a finding.
 *
 * So the harness forces the attribute ON before any page script runs, by
 * patching `HTMLCanvasElement.prototype.getContext`. It changes whether the
 * buffer is KEPT, never what is drawn into it.
 *
 * WHERE IT HAS TO BE INSTALLED IS MEASURED, NOT ASSUMED, AND THE OBVIOUS
 * SPELLING DOES NOT WORK. In this playwright-core, an init script does NOT run
 * for `page.setContent`, and `context.addInitScript` does not fix it:
 *
 *   context.addInitScript + setContent                    marker NOT RUN, pdb false
 *   page.addInitScript + goto('data:text/html,...')       marker ran,     pdb TRUE
 *   page.addInitScript + goto('about:blank') + setContent marker ran,     pdb TRUE
 *
 * `installCanvasReadback` therefore navigates to `about:blank` itself, so the
 * one call works for the real run (which then `goto`s the route) and for a
 * `setContent` fixture alike. A second spelling of that dance at each call site
 * is what would stop matching.
 */
export const FORCE_PRESERVE_DRAWING_BUFFER = () => {
	const orig = HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.getContext = function (type, attrs) {
		if (/webgl/i.test(String(type))) {
			return orig.call(this, type, { ...(attrs || {}), preserveDrawingBuffer: true });
		}
		return orig.call(this, type, attrs);
	};
	window.__bvCanvasReadback = true;
};

/** Install the hook. Call it BEFORE navigating to the page under test. */
export async function installCanvasReadback(page) {
	await page.addInitScript(FORCE_PRESERVE_DRAWING_BUFFER);
	await page.goto('about:blank');
}

/**
 * How the picture is judged, and why these two numbers rather than one.
 *
 * `differFraction` is the share of sampled pixels further than `tolerance` from
 * the canvas's own DOMINANT colour -- the single most common exact RGB value,
 * DERIVED rather than declared. Deriving it is what makes the check work on a
 * viewport whose clear colour nobody told us: a canvas that was only cleared has
 * one colour at 100% and a differ fraction of 0, whatever that colour is, so the
 * check is really asking "is this uniform", which is exactly the defect.
 *
 * THE FLOOR IS 2%, AND THE ARITHMETIC IS THE JUSTIFICATION. The IdeaCAD pane at
 * 1440 backs a 1368-wide store at the clamped 1.5x ratio, so a healthy pane is
 * order 1.25M pixels and 2% of it is ~25,000. A single stray pixel is 8e-7 of
 * that -- four orders of magnitude below the floor, which is the prompt's "a
 * single stray pixel must not pass" with room to spare. At the other end the
 * route's own verdict already requires the projected model to span at least 55%
 * of the pane's smaller dimension, so a correctly fitted solid silhouette
 * covers tens of percent: the floor sits an order of magnitude BELOW a sound
 * render and four orders ABOVE a broken one, which is the widest gap available
 * and is why no number between them needs defending.
 *
 * `minDistinctColours` is the second term and it catches what the first cannot:
 * a canvas painted one flat wrong colour over another flat colour clears 2%
 * easily and is still not a rendered model. A cleared canvas has 1 distinct
 * colour; a two-tone rectangle has 2. 16 is far above the degenerate cases and
 * far below any real render.
 *
 * AND BOTH FLOORS ARE CHECKED AGAINST TWO SOUND RENDERS RATHER THAN AGAINST
 * ARITHMETIC ALONE -- the `--selftest` fixture, and the REAL three.js viewport
 * driven to a correct fit at 1440:
 *
 *                                     differ > 8/ch   distinct colours
 *   the shaded `--selftest` triangle       23.77%             9,617
 *   the real Blade viewport, 30 readings   16.87-42.83%   6,833-9,706
 *   the same canvas, --break blank-canvas   0.00%                 1
 *   the same canvas at `799d203`, propped    0.00%                 6
 *   a canvas that was only ever cleared     0.00%                 1
 *
 * So a sound render clears the 2% floor by an order of magnitude and the
 * 16-colour floor by nearly three, while both broken readings sit at the floor
 * of both terms. There is no number between them that needs defending.
 *
 * `tolerance` is a per-channel distance, not an exact inequality: a lone
 * antialiased edge pixel one unit off the ground is not content, and counting
 * it would let dithering noise stand in for a picture. Both the tolerant and
 * the exact figures are reported, so a reader can see which one carried it.
 */
export async function canvasContent(
	page,
	{ selector, label = selector, minDifferFraction = 0.02, minDistinctColours = 16, tolerance = 8, maxSamples = 400_000 } = {}
) {
	await ensureVisualHelpers(page);
	const data = await page.evaluate(
		({ selector, tolerance, maxSamples }) => {
			const h = window.__bvHelpers;
			const el = document.querySelector(selector);
			if (!el) return { found: false };
			const v = h.isVisible(el);
			const box = { w: v.rect.w, h: v.rect.h };
			const out = {
				found: true,
				path: h.cssPath(el),
				box: `${box.w.toFixed(1)}x${box.h.toFixed(1)}`,
				cssBoxOk: box.w > 0 && box.h > 0,
				visible: v.visible,
				reasons: v.reasons,
				hookInstalled: !!window.__bvCanvasReadback
			};
			if (!(el instanceof HTMLCanvasElement)) {
				return { ...out, kind: 'not-a-canvas' };
			}
			/* A ZERO CSS BOX IS THE ANSWER, AND THE READBACK IS NOT ATTEMPTED.
			   A canvas nobody can see cannot be judged on its pixels: the
			   drawing buffer of a 912x0 pane is 1368 x 1, and a readback of it
			   is a true measurement of something that is not the question. */
			if (!out.cssBoxOk) return { ...out, kind: 'zero-css-box' };

			/* THE LIVE CONTEXT, ASKED FOR BY ITS OWN TYPE. `getContext` returns
			   the EXISTING context when the type matches and null when it does
			   not, so trying webgl2, then webgl, then 2d finds whichever one the
			   page actually made without creating a second of a different type.
			   On a canvas that has NO context it creates the FIRST one, whose
			   buffer is a single cleared colour -- which fails, correctly, for a
			   canvas nothing ever drew into. */
			const gl = el.getContext('webgl2') || el.getContext('webgl');
			if (gl) {
				const attrs = gl.getContextAttributes() || {};
				const w = gl.drawingBufferWidth;
				const hgt = gl.drawingBufferHeight;
				/* The page may have left a render target bound. Read the default
				   framebuffer, then put back exactly what was there. */
				const bound = gl.getParameter(gl.FRAMEBUFFER_BINDING);
				if (bound) gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				const px = new Uint8Array(w * hgt * 4);
				gl.readPixels(0, 0, w, hgt, gl.RGBA, gl.UNSIGNED_BYTE, px);
				if (bound) gl.bindFramebuffer(gl.FRAMEBUFFER, bound);
				return {
					...out,
					kind: 'webgl',
					preserveDrawingBuffer: attrs.preserveDrawingBuffer === true,
					buffer: `${w}x${hgt}`,
					...window.__bvHistogram(px, w * hgt, tolerance, maxSamples)
				};
			}
			const ctx = el.getContext('2d');
			if (!ctx) return { ...out, kind: 'no-context' };
			const w = el.width;
			const hgt = el.height;
			const d = ctx.getImageData(0, 0, w, hgt).data;
			return {
				...out,
				kind: '2d',
				preserveDrawingBuffer: true,
				buffer: `${w}x${hgt}`,
				...window.__bvHistogram(d, w * hgt, tolerance, maxSamples)
			};
		},
		{ selector, tolerance, maxSamples }
	);

	const fault = !data.found
		? 'selector matched NOTHING'
		: data.kind === 'not-a-canvas'
			? 'the element is not a <canvas>'
			: data.kind === 'zero-css-box'
				? `zero CSS box ${data.box} -- nothing can be drawn in it`
				: data.kind === 'no-context'
					? 'the canvas has no drawing context'
					: /* THE HOOK'S ABSENCE IS A FINDING ABOUT THE INSTRUMENT, NOT A
					     READING OF THE SURFACE, and it says so rather than
					     reporting the blank buffer it would otherwise get. A false
					     red is investigated; a plausible blank is not. */
						data.kind === 'webgl' && !data.preserveDrawingBuffer
						? 'the readback hook was NOT installed -- a WebGL buffer read after compositing is blank whatever was drawn (call installCanvasReadback before navigating)'
						: null;

	const withinThreshold =
		!fault && data.differFraction >= minDifferFraction && data.distinctColours >= minDistinctColours;

	const measured = fault
		? fault
		: `CSS box ${data.box}, buffer ${data.buffer}; dominant ${data.dominant} at ${(data.dominantShare * 100).toFixed(1)}%; ` +
			`${(data.differFraction * 100).toFixed(2)}% of ${data.sampled} sampled px differ by more than ${tolerance}/channel ` +
			`(${(data.differExact * 100).toFixed(2)}% differ at all), ${data.distinctColours} distinct colour(s)`;

	return {
		check: 'canvas-content',
		selector,
		label,
		measured,
		threshold: `>= ${(minDifferFraction * 100).toFixed(1)}% of pixels off the dominant colour AND >= ${minDistinctColours} distinct colours`,
		withinThreshold,
		data: { ...data, minDifferFraction, minDistinctColours, tolerance, fault }
	};
}

/* ------------------------------------------------------------------ *
 * 2. Layout sanity -- a real box, in a real place, off the chrome
 * ------------------------------------------------------------------ */

/** The default population: everything a person can operate. */
export const INTERACTIVE =
	'button, a[href], input, select, textarea, summary, [role="button"], [role="treeitem"], [role="tab"], [role="option"], [tabindex]:not([tabindex="-1"])';

/**
 * Four claims about where things are, in one sweep, each with its own count.
 *
 *   zero-box    a rendered interactive element measuring 0 in either axis
 *   offscreen   an element whose box falls outside the DOCUMENT's own extent
 *   overlap     an element intersecting the reserved region (the status bar)
 *   clipped     text overflowing a container that hides the overflow
 *
 * A SKIPPED ELEMENT IS COUNTED AND REPORTED (`IDEA_VERIFICATION_ADDENDA` 13: a
 * sweep reports the population it traversed, or its zero is not a finding). An
 * empty offender list beside an unstated population is indistinguishable from a
 * sweep that looked at nothing.
 *
 * WHAT IS DELIBERATELY NOT COUNTED, AND WHY EACH WOULD HAVE BEEN WRONG:
 *
 *  - `display: none` is not a zero box, it is an element that is not rendered.
 *    The collapsed FeatureManager stations are exactly this and are correct.
 *  - "OUTSIDE THE VIEWPORT" IS ASKED OF THE DOCUMENT, NOT OF THE VIEWPORT, and
 *    that is the difference between a check and a page-length detector: a
 *    `getBoundingClientRect().top >= innerHeight` reading is what EVERY element
 *    below the fold of a scrolling page returns. The finding is an element
 *    parked outside the area the document itself can reach -- at negative
 *    coordinates, or past its own scrollable extent.
 *  - An element inside a SCROLLABLE ancestor that could bring it in is not
 *    offscreen; it is scrolled away. The concept strip is a real horizontal
 *    scroller and every card past its edge would otherwise be a finding. They
 *    are counted separately and reported, never folded into the verdict.
 *  - A ZERO-SIZE BOX IS NEVER ALSO COUNTED AS OFFSCREEN. Measured: the three
 *    0x0 pane tabs sit at (0,0), where `right <= 0 && bottom <= 0` is true of
 *    the point they collapsed to -- so the naive viewport test reported three
 *    offscreen elements that are nothing of the kind, and a reader chasing them
 *    would be chasing an artefact of the first finding.
 *  - `text-overflow: ellipsis` is a deliberate truncation with a visible mark,
 *    not a clip. Counted and reported, never a finding.
 *  - The VISUALLY-HIDDEN IDIOM (a 1x1 box with `clip`/`clip-path`, the
 *    screen-reader pattern) is counted and REPORTED BY NAME WITH ITS TEXT,
 *    never a finding: it is how `.header-status-compat` is meant to work. It is
 *    named rather than silently skipped because the same idiom is also how a
 *    piece of visible chrome disappears -- `.view` on this very surface is 1x1
 *    and clipped while a contrast row happily measures it at 16.19:1 -- and a
 *    bucket nobody can read is a bucket nobody checks.
 */
export async function layoutSanity(
	page,
	{
		label = 'layout sanity',
		root = null,
		interactive = INTERACTIVE,
		reserved = null,
		reservedLabel = reserved,
		tolerancePx = 0.5,
		checkClippedText = true
	} = {}
) {
	await ensureHelpers(page);
	const data = await page.evaluate(
		({ root, interactive, reserved, tolerancePx, checkClippedText }) => {
			const h = window.__bvHelpers;
			const scope = root ? document.querySelector(root) : document.body;
			if (!scope) return { scopeFound: false, root };

			const de = document.documentElement;
			const docW = Math.max(de.scrollWidth, document.body.scrollWidth, de.clientWidth);
			const docH = Math.max(de.scrollHeight, document.body.scrollHeight, de.clientHeight);
			const name = (el) => {
				const t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
				return `${h.cssPath(el)}${t ? ` "${t}"` : ''}`;
			};
			/* Rendered means LAID OUT: the cascade put a box somewhere. An
			   element the page deliberately does not render has no box to judge. */
			const notRendered = (cs, el) =>
				cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || el.hasAttribute('hidden');
			const scrollableAncestor = (el) => {
				for (let n = el.parentElement, hops = 0; n && hops < 60; n = n.parentElement, hops++) {
					const cs = getComputedStyle(n);
					const sx = /auto|scroll/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1;
					const sy = /auto|scroll/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1;
					if (sx || sy) return h.cssPath(n);
				}
				return null;
			};

			const nodes = Array.from(scope.querySelectorAll(interactive));
			const zeroBox = [];
			const offscreen = [];
			const inScroller = [];
			let skipped = 0;
			for (const el of nodes) {
				const cs = getComputedStyle(el);
				if (notRendered(cs, el)) {
					skipped++;
					continue;
				}
				const r = el.getBoundingClientRect();
				if (r.width <= tolerancePx || r.height <= tolerancePx) {
					zeroBox.push(`${r.width.toFixed(1)}x${r.height.toFixed(1)} at ${r.x.toFixed(0)},${r.y.toFixed(0)}  ${name(el)}`);
					/* AND NOTHING ELSE IS ASKED OF IT. A collapsed box's
					   coordinates describe the point it collapsed to, not a
					   place anything is. */
					continue;
				}
				const dx = r.left + window.scrollX;
				const dy = r.top + window.scrollY;
				const out =
					dx + r.width < -tolerancePx || dy + r.height < -tolerancePx || dx > docW + tolerancePx || dy > docH + tolerancePx;
				if (!out) continue;
				const scroller = scrollableAncestor(el);
				const line = `${r.width.toFixed(1)}x${r.height.toFixed(1)} at doc ${dx.toFixed(0)},${dy.toFixed(0)} (document ${docW}x${docH})  ${name(el)}`;
				if (scroller) inScroller.push(`${line}  [inside a scroller: ${scroller}]`);
				else offscreen.push(line);
			}

			const overlap = [];
			const reservedEl = reserved ? document.querySelector(reserved) : null;
			const rr = reservedEl ? reservedEl.getBoundingClientRect() : null;
			if (rr && rr.width > 0 && rr.height > 0) {
				for (const el of nodes) {
					if (reservedEl.contains(el) || el.contains(reservedEl)) continue;
					const cs = getComputedStyle(el);
					if (notRendered(cs, el)) continue;
					const r = el.getBoundingClientRect();
					if (r.width <= tolerancePx || r.height <= tolerancePx) continue;
					const iw = Math.min(r.right, rr.right) - Math.max(r.left, rr.left);
					const ih = Math.min(r.bottom, rr.bottom) - Math.max(r.top, rr.top);
					if (iw > tolerancePx && ih > tolerancePx) {
						overlap.push(`${(iw * ih).toFixed(0)}px² of overlap (${iw.toFixed(1)}x${ih.toFixed(1)})  ${name(el)}`);
					}
				}
			}

			const clipped = [];
			const ellipsised = [];
			const visuallyHidden = [];
			let textConsidered = 0;
			if (checkClippedText) {
				for (const el of scope.querySelectorAll('*')) {
					let hasText = false;
					for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) hasText = true;
					if (!hasText) continue;
					const cs = getComputedStyle(el);
					if (notRendered(cs, el)) continue;
					textConsidered++;
					const hidesX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
					const hidesY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
					const overX = hidesX && el.scrollWidth > el.clientWidth + 1;
					const overY = hidesY && el.scrollHeight > el.clientHeight + 1;
					if (!overX && !overY) continue;
					const r = el.getBoundingClientRect();
					const tiny = r.width <= 1.5 && r.height <= 1.5;
					const clipStyle = (cs.clip && cs.clip !== 'auto') || (cs.clipPath && cs.clipPath !== 'none');
					const detail = `${el.scrollWidth}x${el.scrollHeight} of text in a ${el.clientWidth}x${el.clientHeight} box  ${name(el)}`;
					if (tiny && clipStyle) visuallyHidden.push(detail);
					else if (cs.textOverflow === 'ellipsis' && overX && !overY) ellipsised.push(detail);
					else clipped.push(detail);
				}
			}

			return {
				scopeFound: true,
				root: root || 'body',
				population: nodes.length,
				skipped,
				textConsidered,
				reservedBox: rr ? `${rr.width.toFixed(1)}x${rr.height.toFixed(1)} at ${rr.x.toFixed(0)},${rr.y.toFixed(0)}` : null,
				zeroBox,
				offscreen,
				inScroller,
				overlap,
				clipped,
				ellipsised,
				visuallyHidden
			};
		},
		{ root, interactive, reserved, tolerancePx, checkClippedText }
	);

	if (!data.scopeFound) {
		return {
			check: 'layout-sanity',
			label,
			measured: `root selector ${root} matched NOTHING -- this sweep looked at no elements`,
			threshold: 'the root exists, then 0 zero-box, 0 offscreen, 0 overlapping, 0 clipped',
			withinThreshold: false,
			data
		};
	}

	/* A RESERVED REGION NAMED AND NOT FOUND IS A FAILURE, NEVER A SILENT ZERO.
	   "nothing overlaps the status bar" is perfectly true of a page with no
	   status bar, and that is the reading this refuses to print. */
	const reservedMissing = reserved && !data.reservedBox;
	const faults =
		data.zeroBox.length + data.offscreen.length + data.overlap.length + data.clipped.length + (reservedMissing ? 1 : 0);

	const measured =
		`${data.population} interactive element(s) in ${data.root} (${data.skipped} not rendered, skipped); ` +
		`${data.zeroBox.length} zero-box, ${data.offscreen.length} outside the document, ${data.overlap.length} overlapping ` +
		(reservedMissing ? `${reservedLabel} -- WHICH MATCHED NOTHING` : `${reservedLabel ?? 'the reserved region'} (${data.reservedBox ?? 'not asked'})`) +
		`; ${data.clipped.length} clipped of ${data.textConsidered} text element(s) ` +
		`(${data.ellipsised.length} ellipsised, ${data.visuallyHidden.length} visually hidden, ${data.inScroller.length} scrolled out of a scroller -- reported, not counted)`;

	return {
		check: 'layout-sanity',
		label,
		measured,
		threshold: '0 zero-box, 0 outside the document, 0 overlapping the reserved region, 0 clipped',
		withinThreshold: faults === 0,
		data: { ...data, reservedLabel, reservedMissing }
	};
}

/* ------------------------------------------------------------------ *
 * 2b. Control fit -- a label off its border, and no control on another
 * ------------------------------------------------------------------ *
 *
 * LEDGER 0297, package F2, Mr. Pina's standing rules applied to the whole
 * site: "button text never touches its border, on any page, at any width" and
 * "nothing overlaps at half-screen width". Neither is a question any other
 * check here asks. `tapTargets` measures a box and `layoutSanity` a box's
 * place; a button whose words run into its own edge has a perfectly good box,
 * and two controls painted on top of each other each have one too.
 *
 *   inset    for every rendered interactive element that DRAWS an edge (a
 *            visible border, or a ground that differs from what is behind
 *            it), the distance from its text to that edge on each side,
 *            measured from the text's own rects through a Range -- the words
 *            the reader sees, not the content box. Under `minInset` (4px) on
 *            any side is a finding.
 *   overlap  every pair of rendered interactive elements whose boxes
 *            intersect by more than `overlapPx` square pixels, where neither
 *            contains the other (a checkbox in its label is one control) and
 *            the pair is not a label and the input it names.
 *
 * Both are COUNTED over a stated population and every finding names its
 * element, so a zero says how many were looked at.
 */
export async function controlFit(
	page,
	{ label = 'control fit', root = null, interactive = INTERACTIVE, minInset = 4, overlapPx = 4 } = {}
) {
	await ensureHelpers(page);
	const data = await page.evaluate(
		({ root, interactive, minInset, overlapPx }) => {
			const h = window.__bvHelpers;
			const scope = root ? document.querySelector(root) : document.body;
			if (!scope) return { scopeFound: false, root };
			const name = (el) => {
				const t = (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 32);
				return `${h.cssPath(el)}${t ? ` "${t}"` : ''}`;
			};
			const rendered = (el) => {
				const cs = getComputedStyle(el);
				if (cs.display === 'none' || cs.visibility !== 'visible' || el.hasAttribute('hidden')) return false;
				/* The body of a CLOSED <details> still reports a box and a visible
				   computed style in Chromium (it is hidden through the details
				   content slot, not the cascade), so it is asked for directly. */
				const shut = el.closest('details:not([open])');
				if (shut && !(el.closest('summary') && el.closest('summary').parentElement === shut)) return false;
				const r = el.getBoundingClientRect();
				return r.width > 0.5 && r.height > 0.5;
			};
			const alpha = (c) => {
				const m = /rgba?\(([^)]+)\)/.exec(c || '');
				if (!m) return c && c !== 'transparent' ? 1 : 0;
				const parts = m[1].split(/[ ,/]+/).filter(Boolean);
				return parts.length > 3 ? Number(parts[3]) : 1;
			};
			const drawsEdge = (el, cs) => {
				const bw = ['Top', 'Right', 'Bottom', 'Left'].some(
					(s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' && alpha(cs[`border${s}Color`]) > 0.05
				);
				if (bw) return true;
				if (alpha(cs.backgroundColor) <= 0.05) return false;
				const parentBg = el.parentElement ? getComputedStyle(el.parentElement).backgroundColor : '';
				return cs.backgroundColor !== parentBg;
			};
			const nodes = Array.from(scope.querySelectorAll(interactive)).filter(rendered);
			const tight = [];
			let edged = 0;
			for (const el of nodes) {
				const cs = getComputedStyle(el);
				if (!drawsEdge(el, cs)) continue;
				if (el.matches('input:not([type=button]):not([type=submit]), select, textarea')) continue;
				const range = document.createRange();
				range.selectNodeContents(el);
				const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5);
				if (!rects.length) continue;
				const b = el.getBoundingClientRect();
				// A label cut off by its own control's overflow is a different
				// defect (clipped text) and would read as a negative inset here.
				const t = {
					left: Math.max(b.left, Math.min(...rects.map((r) => r.left))),
					right: Math.min(b.right, Math.max(...rects.map((r) => r.right))),
					top: Math.max(b.top, Math.min(...rects.map((r) => r.top))),
					bottom: Math.min(b.bottom, Math.max(...rects.map((r) => r.bottom)))
				};
				edged++;
				const bl = parseFloat(cs.borderLeftWidth) || 0;
				const br = parseFloat(cs.borderRightWidth) || 0;
				const bt = parseFloat(cs.borderTopWidth) || 0;
				const bb = parseFloat(cs.borderBottomWidth) || 0;
				const inset = {
					left: t.left - (b.left + bl),
					right: b.right - br - t.right,
					top: t.top - (b.top + bt),
					bottom: b.bottom - bb - t.bottom
				};
				const worst = Object.entries(inset).sort((a, c) => a[1] - c[1])[0];
				if (worst[1] < minInset - 0.25) tight.push(`${worst[0]} ${worst[1].toFixed(1)}px  ${name(el)}`);
			}
			const overlap = [];
			/* A STICKY DOCK OVERLAYS WHAT SCROLLS UNDER IT BY DESIGN (an opaque
			   ground and a z-index, the grading console's Return row), so a pair
			   with one side inside a sticky box is not an overlap. A FIXED one is
			   exactly what this is for -- a pill floating over a row -- and stays. */
			const inSticky = (el) => {
				for (let n = el, hops = 0; n && hops < 60; n = n.parentElement, hops++) {
					if (getComputedStyle(n).position === 'sticky') return true;
				}
				return false;
			};
			const boxes = nodes.filter((el) => !inSticky(el)).map((el) => ({ el, r: el.getBoundingClientRect() }));
			for (let i = 0; i < boxes.length; i++) {
				for (let j = i + 1; j < boxes.length; j++) {
					const a = boxes[i];
					const c = boxes[j];
					if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
					const la = a.el.closest('label');
					const lc = c.el.closest('label');
					if (la && (la === lc || la.contains(c.el) || (lc && lc.contains(a.el)))) continue;
					if (a.el.tagName === 'LABEL' && a.el.control === c.el) continue;
					if (c.el.tagName === 'LABEL' && c.el.control === a.el) continue;
					const iw = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left);
					const ih = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top);
					if (iw > 0 && ih > 0 && iw * ih > overlapPx) {
						overlap.push(`${(iw * ih).toFixed(0)}px2: ${name(a.el)}  x  ${name(c.el)}`);
					}
				}
			}
			return { scopeFound: true, root: root ?? 'body', population: nodes.length, edged, tight, overlap };
		},
		{ root, interactive, minInset, overlapPx }
	);
	if (!data.scopeFound) {
		return {
			check: 'control-fit',
			label,
			measured: `root selector ${root} matched NOTHING -- this sweep looked at no elements`,
			threshold: `the root exists, then 0 labels within ${minInset}px of their edge and 0 overlapping controls`,
			withinThreshold: false,
			data
		};
	}
	return {
		check: 'control-fit',
		label,
		measured:
			`${data.population} rendered control(s) in ${data.root}, ${data.edged} drawing an edge around a label; ` +
			`${data.tight.length} label(s) under ${minInset}px from their edge, ${data.overlap.length} overlapping pair(s)`,
		threshold: `0 labels within ${minInset}px of their edge, 0 overlapping controls (over ${overlapPx}px2)`,
		withinThreshold: data.tight.length === 0 && data.overlap.length === 0 && data.population > 0,
		data
	};
}

/* ------------------------------------------------------------------ *
 * 3. Distinguishable -- two things that must read differently
 * ------------------------------------------------------------------ */

/**
 * A label and its value, a heading and its body: both present, both visible,
 * both clearing 4.5:1, and indistinguishable from one another. Every other
 * check in this harness comes back green on that.
 *
 * THE DECIDING AXES ARE EXACTLY SIZE, WEIGHT AND COLOUR, and the pair passes on
 * ANY ONE of them -- a design distinguishes on one axis at a time and demanding
 * all three would redden correct work.
 *
 * WHY THOSE THREE AND NOT ALSO FAMILY OR TRACKING, WHICH IS A MEASUREMENT
 * RATHER THAN A PREFERENCE. Every real pair on this surface was sampled at 1440
 * before the list was closed:
 *
 *   .readouts .metric span  vs  strong   12px/400 vs 16.8px/700   size AND weight
 *   .status-bar span        vs  strong   both 12px, 400 vs 600    weight alone
 *   .eyebrow                vs  .save    both 12px/400, teal vs ink   colour alone
 *
 * All three axes are exercised by real pairs and NOT ONE pair needs a fourth --
 * so family and letter-spacing are REPORTED in the data and decide nothing.
 * Adding them as passing axes would have widened the check to admit a
 * distinction weaker than any this design actually makes, on no evidence.
 *
 * THE COLOUR FLOOR IS THE CONTRAST RATIO BETWEEN THE TWO INKS, AND 1.25:1 IS
 * MEASURED FROM THE ONE COLOUR-ONLY PAIR THERE IS. Identical inks are exactly
 * 1.00:1; `.eyebrow` against `.save` -- the only pair here distinguished by
 * colour alone -- measures 1.85:1. The floor sits a third of the way up from
 * "the same colour" to the real case, which is far enough above 1.00 that
 * rounding cannot reach it and far enough below 1.85 that a legitimate restyle
 * has room.
 *
 * BOTH ELEMENTS MUST BE PRESENT AND VISIBLE, or the check fails. A pair where
 * one side matched nothing has no difference to measure, and reporting that as
 * "they differ" is the vacuous pass this whole file exists to stop.
 */
export async function distinguishable(
	page,
	{ a, b, label, aLabel = a, bLabel = b, minSizeDeltaPx = 1, minWeightDelta = 100, minInkRatio = 1.25 } = {}
) {
	await ensureHelpers(page);
	const data = await page.evaluate(
		({ a, b }) => {
			const h = window.__bvHelpers;
			const read = (sel) => {
				const el = document.querySelector(sel);
				if (!el) return null;
				const cs = getComputedStyle(el);
				const v = h.isVisible(el);
				return {
					path: h.cssPath(el),
					visible: v.visible,
					reasons: v.reasons,
					fontSize: parseFloat(cs.fontSize),
					fontWeight: parseInt(cs.fontWeight, 10) || 400,
					colour: h.toRGBA(cs.color),
					/* Reported, never deciding -- see the header. */
					fontFamily: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
					letterSpacing: cs.letterSpacing,
					textTransform: cs.textTransform
				};
			};
			const A = read(a);
			const B = read(b);
			if (!A || !B) return { found: { a: !!A, b: !!B }, A, B };
			/* Composited against their OWN grounds first, so an ink read on a
			   dark card and one on a light card are compared as painted rather
			   than as authored. `over` is `checks.mjs`'s own compositor. */
			const inkA = h.over(A.colour, h.groundOf(document.querySelector(a)).ground);
			const inkB = h.over(B.colour, h.groundOf(document.querySelector(b)).ground);
			return {
				found: { a: true, b: true },
				A,
				B,
				sizeDelta: Math.abs(A.fontSize - B.fontSize),
				weightDelta: Math.abs(A.fontWeight - B.fontWeight),
				inkRatio: h.ratio(inkA, inkB),
				inkA: `rgb(${Math.round(inkA.r)}, ${Math.round(inkA.g)}, ${Math.round(inkA.b)})`,
				inkB: `rgb(${Math.round(inkB.r)}, ${Math.round(inkB.g)}, ${Math.round(inkB.b)})`
			};
		},
		{ a, b }
	);

	if (!data.found.a || !data.found.b) {
		return {
			check: 'distinguishable',
			label,
			measured: `${aLabel} present=${data.found.a}, ${bLabel} present=${data.found.b} -- nothing to compare`,
			threshold: `both present and visible, then differ by >= ${minSizeDeltaPx}px, >= ${minWeightDelta} weight, or >= ${minInkRatio}:1`,
			withinThreshold: false,
			data
		};
	}

	const bothVisible = data.A.visible && data.B.visible;
	const bySize = data.sizeDelta >= minSizeDeltaPx;
	const byWeight = data.weightDelta >= minWeightDelta;
	const byInk = data.inkRatio >= minInkRatio;
	const axes = [bySize ? 'size' : null, byWeight ? 'weight' : null, byInk ? 'colour' : null].filter(Boolean);

	const measured =
		`size ${data.A.fontSize}px vs ${data.B.fontSize}px (Δ${data.sizeDelta.toFixed(1)}px), ` +
		`weight ${data.A.fontWeight} vs ${data.B.fontWeight} (Δ${data.weightDelta}), ` +
		`ink ${data.inkA} vs ${data.inkB} (${data.inkRatio.toFixed(2)}:1)` +
		(bothVisible ? '' : `; NOT BOTH VISIBLE (${aLabel} ${data.A.visible}, ${bLabel} ${data.B.visible})`) +
		` -- ${axes.length ? `distinguished by ${axes.join(' and ')}` : 'INDISTINGUISHABLE on all three axes'}` +
		` [family ${data.A.fontFamily} vs ${data.B.fontFamily}, tracking ${data.A.letterSpacing} vs ${data.B.letterSpacing}: reported, not deciding]`;

	return {
		check: 'distinguishable',
		label,
		measured,
		threshold: `both visible, then >= ${minSizeDeltaPx}px size OR >= ${minWeightDelta} weight OR >= ${minInkRatio}:1 between the inks`,
		withinThreshold: bothVisible && axes.length > 0,
		data: { ...data, axes, minSizeDeltaPx, minWeightDelta, minInkRatio }
	};
}

/* ------------------------------------------------------------------ *
 * 4. Readout near the pointer -- does a live value follow a drag
 * ------------------------------------------------------------------ */

/**
 * WHAT IT ASKS. During a real pointer drag, is there a readout on screen and
 * does it sit beside the pointer? A modeler that floats the number a drag is
 * worth ("Extrude 1.500 in") beside the cursor is answering the one question
 * a student has while dragging; a readout that appears in a corner, or not at
 * all, is the defect this exists for, and nothing in a static DOM read can see
 * it because the element does not exist until the drag is under way.
 *
 * HOW IT MEASURES. `fromEvaluate` is a page-side function SOURCE returning the
 * client position to press at (a route spec computes it from the model, so a
 * projected face centre rather than a guessed pixel). The check presses there,
 * moves in `steps` increments to `delta` away, and at each step after the
 * first reads the readout's box and the distance from the pointer to its
 * NEAREST edge. It reports the worst (largest) distance and the number of
 * steps the readout was missing, then releases the pointer.
 *
 * THE THRESHOLD IS A DISTANCE, `maxPx`, AND A COUNT. The readout must be
 * present on every sampled step after the first (a drag needs one move to
 * begin), and its nearest edge must never be further than `maxPx` from the
 * pointer. Both halves are printed; a readout that flickers fails on the
 * count, one that sits in a corner fails on the distance.
 *
 * NEGATIVE CONTROLS. `--selftest` puts it to a readout that follows the
 * pointer and to one pinned in a corner; `--break readout-away` translates the
 * real surface's readout 300px away so the check reddens on the page it is
 * for. Neither can pass by the readout merely existing.
 */
export async function readoutNearPointer(
	page,
	{ label = 'readout follows the pointer', readoutSelector, fromEvaluate, delta = { dx: 80, dy: 0 }, steps = 6, maxPx = 40, settleMs = 60 } = {}
) {
	const start = await page.evaluate(`(${fromEvaluate})()`);
	const problems = [];
	const samples = [];
	if (!start || typeof start.x !== 'number' || typeof start.y !== 'number') {
		return {
			check: 'readout-near-pointer',
			selector: readoutSelector,
			label,
			measured: `fromEvaluate returned ${JSON.stringify(start)}, not a client position`,
			threshold: `readout present on every step after the first, nearest edge within ${maxPx}px of the pointer`,
			withinThreshold: false,
			data: { start, samples, fault: 'no-start' }
		};
	}
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	try {
		for (let i = 1; i <= steps; i++) {
			const x = start.x + (delta.dx * i) / steps, y = start.y + (delta.dy * i) / steps;
			await page.mouse.move(x, y);
			await page.waitForTimeout(settleMs);
			if (i === 1) continue;
			const read = await page.evaluate(
				({ selector, x, y }) => {
					const el = document.querySelector(selector);
					if (!el) return { present: false };
					const r = el.getBoundingClientRect();
					const visible = r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
					const nx = Math.max(r.left, Math.min(x, r.right)), ny = Math.max(r.top, Math.min(y, r.bottom));
					return { present: true, visible, text: (el.textContent || '').trim(), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], distance: Math.hypot(nx - x, ny - y) };
				},
				{ selector: readoutSelector, x, y }
			);
			samples.push({ step: i, pointer: [Math.round(x), Math.round(y)], ...read });
			if (!read.present || !read.visible) problems.push(`step ${i}: readout ${read.present ? 'not visible' : 'absent'}`);
			else if (read.distance > maxPx) problems.push(`step ${i}: ${read.distance.toFixed(1)}px from the pointer`);
		}
	} finally {
		await page.mouse.up();
		await page.waitForTimeout(settleMs);
	}
	const present = samples.filter((s) => s.present && s.visible);
	const worst = present.length ? Math.max(...present.map((s) => s.distance)) : null;
	const texts = [...new Set(present.map((s) => s.text))];
	const measured =
		`${present.length} of ${samples.length} sampled steps had a visible readout` +
		(worst === null ? '' : `; nearest edge at most ${worst.toFixed(1)}px from the pointer`) +
		(texts.length ? `; it read ${texts.map((t) => JSON.stringify(t)).slice(0, 3).join(', ')}` : '') +
		(problems.length ? `; ${problems.join('; ')}` : '');
	return {
		check: 'readout-near-pointer',
		selector: readoutSelector,
		label,
		measured,
		threshold: `readout present on every step after the first, nearest edge within ${maxPx}px of the pointer`,
		withinThreshold: problems.length === 0 && samples.length > 0,
		data: { start, delta, steps, maxPx, samples, problems }
	};
}
