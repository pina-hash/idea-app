/**
 * AN HTML ASSIGNMENT'S OWN THUMBNAIL (ledger 0396, report a6a037f3): what the
 * manifest's `thumbnail` key means, where its template sits in the document,
 * the small document the thumbnail is served as, and the bridge between that
 * document and the class page.
 *
 *   thumbnail: { "kind": "html", "template": "idea-thumbnail", "interactive": true? }
 *   thumbnail: { "kind": "image", "src": "attachment:<filename>" | "data:image/png;base64,..." }
 *
 * A TEMPLATE, NOT A SECOND DOCUMENT. The thumbnail is a `<template
 * id="idea-thumbnail">` inside the assignment's own file, so the one file an
 * author delivers carries it and nothing else has to be uploaded. A template's
 * contents are inert in the worksheet (nothing renders, no script runs), so the
 * worksheet is unaffected; `/hx/<document id>/thumbnail` serves exactly those
 * bytes, verbatim, inside `thumbnailDocument`'s shell, under the IDENTICAL
 * sandbox and CSP the worksheet gets (`hxDocumentHeaders`), never with
 * `allow-same-origin`. The author's bytes are never rewritten: the shell is a
 * fixed wrapper of ours, and what executes inside it is what the author wrote
 * between the template's tags, which a reviewer reads in the same file.
 *
 * ONE READER DECIDES WHAT THE KEY MEANS. `manifestThumbnail` is the mirror of
 * 0268's `_classroom_manifest_thumbnail` (the database's copy decides what a
 * stored post shows; this one drives the composer's preview and the validator's
 * warnings), and `tests/db/classroom-item-thumbnails.test.ts` puts both to one
 * corpus. Anything either does not understand is NO thumbnail, so a malformed
 * key is a post with the generated look, never a refused upload: the manifest
 * gate (0195) does not read the key at all, and the validator only WARNS, the
 * rule section 4.8 of the SPEC states for every display key.
 */

import { HX_SANDBOX_FLAGS, hxExpectedOrigin, hxThemeOf, type HxTheme } from './bridge';

export { HX_SANDBOX_FLAGS };

// ---------------------------------------------------------------------------
// The manifest key.
// ---------------------------------------------------------------------------

/** The template id the documentation and the template file use. */
export const HTML_THUMBNAIL_TEMPLATE_DEFAULT = 'idea-thumbnail';

/** A plain element id: what `<template id="...">` may be called. */
export const HTML_THUMBNAIL_TEMPLATE_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/**
 * THE LONGEST `data:` PICTURE A MANIFEST MAY NAME, in characters. A data URI
 * lives in the manifest JSON, which several pages read whole, so a thumbnail
 * that is most of the 2 MB document would be paid for on every one of them.
 * An `attachment:` alias costs nothing and is the better answer for a big one.
 */
export const HTML_THUMBNAIL_DATA_MAX = 400_000;

/** `attachment:` and a filename of 1 to 300 characters (0268 checks the same length). */
const ALIAS_RE = /^attachment:[\s\S]+$/;
const ALIAS_MAX = 311;
const SVG_NAME_RE = /\.svgz?$/i;
const DATA_RE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export type ManifestThumbnail =
	| { source: 'html'; template: string; interactive: boolean }
	| { source: 'image'; src: string };

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * WHAT A MANIFEST'S `thumbnail` MEANS, or null. 0268's SQL reader answers the
 * same question about the same JSON; keep the two in step (the db test reddens
 * when they disagree). `src` rides along here because the composer previews it;
 * the database keeps no copy of it and reads it from the manifest when asked.
 */
export function manifestThumbnail(manifest: unknown): ManifestThumbnail | null {
	if (!isRecord(manifest)) return null;
	const t = manifest.thumbnail;
	if (!isRecord(t)) return null;
	if (t.kind === 'html') {
		if (typeof t.template !== 'string' || !HTML_THUMBNAIL_TEMPLATE_RE.test(t.template)) return null;
		return { source: 'html', template: t.template, interactive: t.interactive === true };
	}
	if (t.kind === 'image') {
		if (typeof t.src !== 'string') return null;
		const src = t.src;
		if (ALIAS_RE.test(src) && src.length <= ALIAS_MAX && !SVG_NAME_RE.test(src)) return { source: 'image', src };
		if (src.length <= HTML_THUMBNAIL_DATA_MAX && DATA_RE.test(src)) return { source: 'image', src };
		return null;
	}
	return null;
}

/**
 * THE VALIDATOR'S SENTENCES ABOUT THE KEY, every one a WARNING naming what the
 * class page will do instead (show the generated look). Called by
 * `validateHtmlManifest`; `html` is the whole document, so a template the
 * manifest names and the document does not carry is said before upload rather
 * than discovered as a blank tile on the class page.
 */
export function manifestThumbnailWarnings(manifest: unknown, html: string | null | undefined): string[] {
	if (!isRecord(manifest) || manifest.thumbnail === undefined) return [];
	const out: string[] = [];
	const t = manifest.thumbnail;
	const fallback = 'so posts show the generated look instead';
	if (!isRecord(t)) {
		return [`The manifest's thumbnail is not an object, ${fallback}.`];
	}
	if (t.kind !== 'html' && t.kind !== 'image') {
		return [`The manifest's thumbnail kind is ${JSON.stringify(t.kind) ?? 'missing'}; it must be "html" or "image", ${fallback}.`];
	}
	if (t.kind === 'html') {
		if (typeof t.template !== 'string' || !HTML_THUMBNAIL_TEMPLATE_RE.test(t.template)) {
			out.push(
				`The manifest's thumbnail template must name a <template> by its id (letters, digits, - and _, starting with a letter), ${fallback}.`
			);
			return out;
		}
		if (t.interactive !== undefined && typeof t.interactive !== 'boolean') {
			out.push(`The manifest's thumbnail sets interactive to ${JSON.stringify(t.interactive)}; it must be true or false, so it is read as false.`);
		}
		if (typeof html === 'string' && html.length > 0) {
			const found = extractThumbnailTemplate(html, t.template);
			if (found === null) {
				out.push(
					`The manifest names a thumbnail template "${t.template}" the document does not carry. Add <template id="${t.template}"> with the thumbnail inside it, or posts show the generated look.`
				);
			} else if (!found.trim()) {
				out.push(`The thumbnail template "${t.template}" is empty, ${fallback}.`);
			}
		}
		return out;
	}
	if (typeof t.src !== 'string') {
		return [`The manifest's thumbnail image needs a src, ${fallback}.`];
	}
	if (SVG_NAME_RE.test(t.src) || /^data:image\/svg/i.test(t.src)) {
		return [`The manifest's thumbnail image is an SVG, which is a document rather than a picture and is never shown, ${fallback}. Use a PNG, JPEG, GIF or WebP.`];
	}
	if (/^data:/i.test(t.src) && t.src.length > HTML_THUMBNAIL_DATA_MAX) {
		return [
			`The manifest's thumbnail image is ${t.src.length} characters as a data URI and the limit is ${HTML_THUMBNAIL_DATA_MAX}, ${fallback}. Attach the picture to the post and name it as "attachment:<filename>".`
		];
	}
	if (manifestThumbnail(manifest) === null) {
		return [
			`The manifest's thumbnail image must be "attachment:<filename>" (a picture attached to the post) or a data: PNG, JPEG, GIF or WebP, ${fallback}.`
		];
	}
	return out;
}

// ---------------------------------------------------------------------------
// Finding the template in the document.
// ---------------------------------------------------------------------------

/** Elements whose contents the HTML tokenizer reads as text, so a tag written inside them is not a tag. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noembed', 'noframes', 'iframe', 'plaintext']);

const TAG_RE =
	/<!--[\s\S]*?-->|<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;

function idOf(attrs: string): string | null {
	const m = /(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(attrs);
	if (!m) return null;
	return (m[1] ?? m[2] ?? m[3] ?? '').trim();
}

/**
 * THE CONTENTS OF `<template id="<id>">`, byte for byte, or null.
 *
 * A SCAN OVER THE SOURCE, NOT A DOM PARSE, for the reason `documentFields`
 * gives: this runs in the composer, in a node test and in the serving route,
 * and all three have to agree exactly; a DOM exists in one of them. It walks
 * tags in order, skips comments and every raw-text element's contents (so a
 * `<template` written inside the manifest's JSON or a script string is not a
 * tag), finds the FIRST template carrying the id, and counts nested templates
 * so the matching end tag is the one that closes it. What comes back is the
 * exact slice of the author's bytes between the two tags.
 */
export function extractThumbnailTemplate(html: string, id: string): string | null {
	if (typeof html !== 'string' || !HTML_THUMBNAIL_TEMPLATE_RE.test(id)) return null;
	const re = new RegExp(TAG_RE.source, 'g');
	let start = -1;
	let depth = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html)) !== null) {
		if (m[0].startsWith('<!--')) continue;
		const closing = m[1] === '/';
		const name = (m[2] ?? '').toLowerCase();
		if (!closing && RAW_TEXT.has(name)) {
			const end = new RegExp(`</${name}\\s*>`, 'ig');
			end.lastIndex = re.lastIndex;
			const found = end.exec(html);
			if (!found) return null;
			re.lastIndex = end.lastIndex;
			continue;
		}
		if (name !== 'template') continue;
		if (start === -1) {
			if (!closing && idOf(m[3] ?? '') === id) {
				start = re.lastIndex;
				depth = 1;
			}
			continue;
		}
		if (closing) {
			depth -= 1;
			if (depth === 0) return html.slice(start, m.index);
		} else {
			depth += 1;
		}
	}
	return null;
}

/**
 * THE TEMPLATE A DOCUMENT SERVES AS ITS LIVE THUMBNAIL, or null: the contents
 * of `<template id="<id>">` when the document carries one with something in
 * it. The one test of "this document can show the live thumbnail it names",
 * asked by the serving route (which answers a 404 for null), the thumbnail
 * editor (which then says the post shows the generated look rather than
 * promising a live one) and the harness's stand-in for 0268's sync.
 *
 * 0268's `_classroom_html_may_carry_template` asks a WIDER question in SQL
 * (is there any `<template` followed by an id attribute naming it), so that a
 * document this serves is never refused a row there;
 * tests/db/classroom-item-thumbnails.test.ts holds that direction.
 */
export function servedThumbnailTemplate(html: string, id: string): string | null {
	const found = extractThumbnailTemplate(html, id);
	return found !== null && found.trim() ? found : null;
}

// ---------------------------------------------------------------------------
// The served document.
// ---------------------------------------------------------------------------

/**
 * WHICH SHELL A CACHED THUMBNAIL WAS BUILT WITH. Folded into the route's ETag,
 * so a change to the shell or the shim below revalidates every browser's copy
 * once instead of leaving old copies running an old protocol.
 */
export const HX_THUMB_SHELL_VERSION = '2';

/** Messages the class page sends a thumbnail, and the two it accepts back. */
export const HX_THUMB_STATE_TYPE = 'idea:thumb';
export const HX_THUMB_POINTER_TYPE = 'idea:pointer';
export const HX_THUMB_READY_TYPE = 'idea:thumb-ready';

/**
 * HOW MANY DISPLAY FRAMES A REDUCED-MOTION THUMBNAIL MAY DRAW IN, after it
 * loads and after each change a still frame has to show (the shim's
 * `still()`). Two, so a loop that measures in one frame and draws in the next
 * still lands a picture; then its callbacks are held again.
 */
export const HX_THUMB_STILL_FRAMES = 2;
export const HX_THUMB_OPEN_TYPE = 'idea:thumb-open';

/**
 * A shape's name, as the slot's `--thumb-shape` says it: `tile`, `wide`,
 * `banner`, or one a later stylesheet adds. Lowercase letters, digits and
 * hyphens, which the shim checks before it believes one.
 */
export type HxThumbShape = string;
export const HX_THUMB_SHAPE_RE = /^[a-z][a-z0-9-]{0,23}$/;

/** Everything a thumbnail is told about where it is drawn. */
export interface HxThumbState {
	width: number;
	height: number;
	shape: HxThumbShape;
	/** The site theme's name: `idea`, `matrix`, `space-white`, or whatever a later build adds. */
	theme: string;
	/** Light or dark, the worksheet's own two words (`hxThemeOf`). */
	scheme: HxTheme;
	reducedMotion: boolean;
	paused: boolean;
}

export function hxThumbStateMessage(state: HxThumbState): Record<string, unknown> {
	return {
		type: HX_THUMB_STATE_TYPE,
		width: Math.max(0, Math.round(state.width)),
		height: Math.max(0, Math.round(state.height)),
		shape: state.shape,
		theme: state.theme,
		scheme: state.scheme,
		reducedMotion: state.reducedMotion,
		paused: state.paused
	};
}

/** A pointer over a non-interactive thumbnail's overlay, as fractions of the slot. */
export function hxThumbPointerMessage(x: number, y: number, inside: boolean): Record<string, unknown> {
	const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5);
	return { type: HX_THUMB_POINTER_TYPE, x: clamp(x), y: clamp(y), inside };
}

/** The theme name the portal is wearing, from `<html data-theme>`; no attribute is IDEA. */
export function hxThemeNameOf(attr: string | null | undefined): string {
	const t = (attr ?? '').trim();
	return t === '' ? 'idea' : t;
}

export { hxThemeOf };

/**
 * WHAT A FRAME MAY SAY, decided with the DOM left at the door: the origin a
 * sandboxed frame really has (`"null"`, measured, see `hxExpectedOrigin`), the
 * frame's own window, then one of two types and nothing else. A thumbnail
 * cannot write anything and cannot navigate the page anywhere but to its own
 * post; this is the whole of its vocabulary.
 */
export type HxThumbVerdict = { ok: true; type: 'ready' | 'open' } | { ok: false; reason: 'origin' | 'source' | 'shape' };

export function hxThumbReceive(
	incoming: { origin: string; source: unknown; data: unknown },
	frameWindow: unknown,
	documentOrigin = ''
): HxThumbVerdict {
	if (incoming.origin !== hxExpectedOrigin(documentOrigin, HX_SANDBOX_FLAGS)) return { ok: false, reason: 'origin' };
	if (frameWindow === null || frameWindow === undefined || incoming.source !== frameWindow) {
		return { ok: false, reason: 'source' };
	}
	const data = incoming.data;
	if (!isRecord(data)) return { ok: false, reason: 'shape' };
	if (data.type === HX_THUMB_READY_TYPE) return { ok: true, type: 'ready' };
	if (data.type === HX_THUMB_OPEN_TYPE) return { ok: true, type: 'open' };
	return { ok: false, reason: 'shape' };
}

/**
 * THE SHIM, the one script of ours inside a thumbnail. It runs before the
 * author's markup is parsed, and gives the thumbnail four things:
 *
 *   STATE. `<html>` carries `data-idea-shape`, `data-idea-theme`,
 *     `data-idea-scheme` and `data-idea-motion`, `:root` carries
 *     `--idea-thumb-w` and `--idea-thumb-h` in px, `window.ideaThumbnail` is
 *     the current state, and an `idea:thumbnail` event fires on `window` with
 *     it as `detail` whenever the class page sends a change.
 *   POINTER. `data-idea-pointer` on `<html>` while a pointer is over the
 *     thumbnail, `--idea-pointer-x` and `--idea-pointer-y` (0 to 1) where it
 *     is, and an `idea:pointer` event. It is the same whether the pointer
 *     reaches the thumbnail directly (interactive) or is forwarded by the class
 *     page over an overlay (not interactive), so one hover works in both.
 *   PAUSE. `data-idea-paused` on `<html>` while the thumbnail is off screen,
 *     the tab is hidden, the page scrolls (the page decides those three and
 *     says so in `paused`), or motion is reduced; CSS animations and script-made
 *     animations stop under it (under reduced motion, on their first frame),
 *     and `requestAnimationFrame` callbacks are held until it lifts. A
 *     callback also runs at most once per display frame, whatever the browser
 *     does with many sandboxed frames on one page.
 *   A STILL FRAME UNDER REDUCED MOTION, AND A NEW ONE WHENEVER IT GOES
 *     STALE. Held for good after its first frames, a canvas that sized itself
 *     to the slot after drawing (setting `canvas.width` clears it) was left
 *     blank, and a theme or shape change could never repaint one. So under
 *     reduced motion `requestAnimationFrame` callbacks run in the next
 *     `HX_THUMB_STILL_FRAMES` display frames after the thumbnail loads AND
 *     after every change a still frame has to show (a new width, height,
 *     shape, theme or scheme, a window resize, reduced motion switching on),
 *     then are held again. Frames are counted only while not paused, so a
 *     change made off screen is drawn when the thumbnail comes back.
 *   CLICKS (interactive only). A click on a control (a link, a button, a form
 *     field, a label, a summary, anything with a button role or a tabindex) or
 *     one the thumbnail called `preventDefault()` or `stopPropagation()` on is
 *     the thumbnail's own; any other click asks the class page to open the
 *     post.
 *
 * ES5 on purpose: it is the one script every thumbnail runs, in whatever
 * browser a student has.
 */
export const HX_THUMB_SHIM = `(function () {
	var root = document.documentElement;
	var parentWin = window.parent;
	var interactive = root.getAttribute('data-idea-interactive') === 'true';
	var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
	var state = {
		width: window.innerWidth, height: window.innerHeight, shape: root.getAttribute('data-idea-shape') || 'tile',
		theme: 'idea', scheme: 'dark', reducedMotion: !!(reduceQuery && reduceQuery.matches), paused: false,
		pointer: { x: 0.5, y: 0.5, inside: false }, interactive: interactive
	};
	/* Display frames counted while not paused, and the count through which a
	   reduced-motion thumbnail may still run its callbacks (see still()). */
	var framesSeen = 0;
	var stillThrough = ${HX_THUMB_STILL_FRAMES};
	var nativeRaf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function (cb) { return setTimeout(function () { cb(Date.now()); }, 16); };
	var nativeCaf = window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : clearTimeout;
	var held = [];
	var live = {};
	var nextId = 1;
	/* The display frame being served. A callback asked for during frame T
	   runs at a LATER frame: measured in Chromium, a page holding N sandboxed
	   frames services each one's animation frame N times per display frame
	   with the same timestamp, so an unguarded loop draws N times a frame. */
	var frameT = -1;
	function gated() { return state.paused || (state.reducedMotion && framesSeen >= stillThrough); }
	/* Something a still frame shows has changed: under reduced motion the next
	   few display frames run the held callbacks, so a canvas redraws itself at
	   the new size, shape or theme, then holds again. */
	function still() { stillThrough = framesSeen + ${HX_THUMB_STILL_FRAMES}; }
	function flush() {
		if (gated()) return;
		var queue = held; held = [];
		for (var i = 0; i < queue.length; i++) schedule(queue[i][0], queue[i][1], frameT);
	}
	function schedule(id, cb, askedAt) {
		live[id] = nativeRaf(function (t) {
			delete live[id];
			if (t <= askedAt) { schedule(id, cb, askedAt); return; }
			if (gated()) { held.push([id, cb]); return; }
			/* A new display frame, counted only when a callback may run in it,
			   so frames owed to a change made off screen are not spent before
			   anybody can see them. */
			if (t > frameT) { frameT = t; framesSeen++; }
			cb(t);
		});
	}
	window.requestAnimationFrame = function (cb) {
		var id = nextId++;
		if (gated()) held.push([id, cb]); else schedule(id, cb, frameT);
		return id;
	};
	window.cancelAnimationFrame = function (id) {
		if (live[id] !== undefined) { nativeCaf(live[id]); delete live[id]; }
		for (var i = held.length - 1; i >= 0; i--) if (held[i][0] === id) held.splice(i, 1);
	};
	var scripted = [];
	function pauseScripted(pause) {
		if (!document.getAnimations) return;
		if (pause) {
			var all = document.getAnimations();
			for (var i = 0; i < all.length; i++) {
				var a = all[i];
				if (typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation) continue;
				if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) continue;
				if (a.playState === 'running') { a.pause(); scripted.push(a); }
			}
		} else {
			for (var j = 0; j < scripted.length; j++) { try { scripted[j].play(); } catch (e) {} }
			scripted = [];
		}
	}
	var wasStill = null;
	/* WRITTEN ONLY WHEN IT CHANGES. Setting an attribute on <html> to the value
	   it already has still invalidates the style of the whole document in
	   Chromium (measured in a trace: one subtree recalculation per state
	   message, in every thumbnail on the page), and a scrolling page sends a
	   pause and a resume to every thumbnail on screen. */
	var written = {};
	function attr(name, value) {
		if (written[name] === value) return;
		written[name] = value;
		if (value === null) root.removeAttribute(name); else root.setAttribute(name, value);
	}
	function prop(name, value) {
		if (written[name] === value) return;
		written[name] = value;
		root.style.setProperty(name, value);
	}
	function apply(announce) {
		attr('data-idea-shape', state.shape);
		attr('data-idea-theme', state.theme);
		attr('data-idea-scheme', state.scheme);
		attr('data-idea-motion', state.reducedMotion ? 'reduce' : 'full');
		prop('--idea-thumb-w', state.width + 'px');
		prop('--idea-thumb-h', state.height + 'px');
		/* CSS and script-made animations stop at once under reduced motion, so
		   they rest on their first frame; a requestAnimationFrame loop gets the
		   display frames still() grants to draw one, then waits (gated). */
		var holding = state.paused || state.reducedMotion;
		attr('data-idea-paused', holding ? '' : null);
		if (holding !== wasStill) { pauseScripted(holding); wasStill = holding; }
		if (!gated()) flush();
		window.ideaThumbnail = state;
		if (announce) {
			try { window.dispatchEvent(new CustomEvent('idea:thumbnail', { detail: state })); } catch (e) {}
		}
	}
	function setPointer(x, y, inside) {
		state.pointer = { x: x, y: y, inside: inside };
		prop('--idea-pointer-x', String(x));
		prop('--idea-pointer-y', String(y));
		attr('data-idea-pointer', inside ? '' : null);
		try { window.dispatchEvent(new CustomEvent('idea:pointer', { detail: state.pointer })); } catch (e) {}
	}
	window.addEventListener('message', function (e) {
		if (e.source !== parentWin) return;
		var d = e.data;
		if (!d || typeof d !== 'object') return;
		if (d.type === '${HX_THUMB_STATE_TYPE}') {
			var before = [state.width, state.height, state.shape, state.theme, state.scheme, state.reducedMotion].join(' ');
			if (typeof d.width === 'number' && isFinite(d.width)) state.width = Math.max(0, Math.round(d.width));
			if (typeof d.height === 'number' && isFinite(d.height)) state.height = Math.max(0, Math.round(d.height));
			if (typeof d.shape === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(d.shape)) state.shape = d.shape;
			if (typeof d.theme === 'string' && /^[a-z0-9-]{1,40}$/.test(d.theme)) state.theme = d.theme;
			if (d.scheme === 'light' || d.scheme === 'dark') state.scheme = d.scheme;
			if (typeof d.reducedMotion === 'boolean') state.reducedMotion = d.reducedMotion;
			if (typeof d.paused === 'boolean') state.paused = d.paused;
			if ([state.width, state.height, state.shape, state.theme, state.scheme, state.reducedMotion].join(' ') !== before) still();
			apply(true);
		} else if (d.type === '${HX_THUMB_POINTER_TYPE}') {
			var x = typeof d.x === 'number' && isFinite(d.x) ? Math.min(1, Math.max(0, d.x)) : 0.5;
			var y = typeof d.y === 'number' && isFinite(d.y) ? Math.min(1, Math.max(0, d.y)) : 0.5;
			setPointer(x, y, d.inside === true);
		}
	});
	function local(e, inside) {
		var w = window.innerWidth || 1, h = window.innerHeight || 1;
		setPointer(Math.min(1, Math.max(0, e.clientX / w)), Math.min(1, Math.max(0, e.clientY / h)), inside);
	}
	document.addEventListener('pointermove', function (e) { local(e, true); });
	document.addEventListener('pointerout', function (e) { if (!e.relatedTarget) local(e, false); });
	if (interactive) {
		var CONTROL = 'a[href],button,input,select,textarea,label,summary,[role="button"],[role="link"],[tabindex],[contenteditable="true"]';
		window.addEventListener('click', function (e) {
			var t = e.target;
			var own = t && t.closest ? t.closest(CONTROL) : null;
			setTimeout(function () {
				if (own || e.defaultPrevented) return;
				try { parentWin.postMessage({ type: '${HX_THUMB_OPEN_TYPE}' }, '*'); } catch (err) {}
			}, 0);
		});
	}
	addEventListener('resize', function () {
		state.width = window.innerWidth; state.height = window.innerHeight; still(); apply(true);
	});
	apply(false);
	function ready() {
		apply(true);
		try { parentWin.postMessage({ type: '${HX_THUMB_READY_TYPE}' }, '*'); } catch (e) {}
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();`;

/**
 * THE WHOLE THUMBNAIL DOCUMENT: our fixed shell, the shim, and the author's
 * template contents verbatim in the body. `interactive` is decided by the
 * stored manifest and written into the shell, never by anything the template
 * says about itself. The body is transparent, so a thumbnail that draws no
 * background sits on the class page's own tile.
 */
export function thumbnailDocument(templateHtml: string, opts: { interactive: boolean; shape?: HxThumbShape }): string {
	const shape = opts.shape && HX_THUMB_SHAPE_RE.test(opts.shape) ? opts.shape : 'tile';
	return [
		'<!doctype html>',
		`<html lang="en" data-idea-thumbnail data-idea-shape="${shape}" data-idea-interactive="${opts.interactive ? 'true' : 'false'}">`,
		'<head>',
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		'<title>Thumbnail</title>',
		'<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}' +
			':root[data-idea-paused] *,:root[data-idea-paused] *::before,:root[data-idea-paused] *::after{animation-play-state:paused!important}</style>',
		`<script>${HX_THUMB_SHIM}</script>`,
		'</head>',
		'<body>',
		templateHtml,
		'</body>',
		'</html>',
		''
	].join('\n');
}

/** The thumbnail's address: the document's own, with `/thumbnail`, and a version so a re-upload is fetched fresh. */
export function htmlThumbnailSrc(documentSrc: string, version?: string | null): string {
	const base = `${documentSrc.replace(/\/+$/, '')}/thumbnail`;
	return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}
