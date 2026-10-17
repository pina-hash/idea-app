/**
 * THE LIVE TAB ICON (ledger 0396): the browser tab's icon says where you are
 * and what is happening, and the document title carries the unread count.
 *
 * TWO HALVES, AND ONLY THE SECOND TOUCHES THE DOM.
 *
 *   `raise(kind, opts) -> handle` and `clear(handle)` are the status API any
 *   page, component or module calls. They are safe to call anywhere: on the
 *   server, or with nothing mounted, they do nothing and hand back an inert
 *   handle, so a shared module (the one save state) can raise without knowing
 *   where it runs. See `./status.ts` for the priority order and the timers.
 *
 *   `mountTabIcon()` is the painter, mounted ONCE by `TabIcon.svelte` in the
 *   root layout. It rewrites the `href` of the SVG `<link rel="icon">` that
 *   `src/app.html` declares to a data URL drawn by `icon()`. It never adds or
 *   removes a link and never touches the ICO link (which stays the static file
 *   for a browser that does not take the SVG). On Home at rest the drawing IS
 *   the static `favicon.svg` (`tools/tab-icon/build.mjs` writes that file from
 *   the same call), so the painter puts the original `href` back rather than a
 *   data URL, and a resting tab costs nothing.
 *
 * A PRODUCT THAT SETS ITS OWN ICON KEEPS IT. The ledger 0396 audit found none
 * under the root layout today (the Coin Ledger, VANGUARD, the legacy
 * assignments, HTML assignment documents and Foundry bundles all serve their
 * own documents, where this module is never loaded). Should a page inside the
 * layout ever add an icon link of its own, the painter sees a third icon link
 * in `<head>`, puts its own link back to the static file, drops the title
 * prefix and stands down until that link is gone.
 *
 * MOTION. Live (the lamp and hairline pulse crimson) and saving (the lamp
 * blinks) animate on a timer; progress follows `p` as callers update it.
 * Every write is throttled to `TAB_ICON_FRAME_MS` (at most four a second),
 * a frame identical to the last one is never written, and the timer exists
 * only while an animated state is the one showing. Each animated state's
 * cycle OPENS LIT (`framePhase`), so a save shorter than one frame still
 * shows its mint lamp rather than a dark one. Under
 * `prefers-reduced-motion: reduce` the still frame is that same opening frame
 * (`stillPhase`), held, so a reduced-motion reader sees the lit lamp too, and
 * nothing repaints on a timer. The phases are chosen here; the drawing in
 * `./geometry.ts` is the design module's and is not changed for them.
 */

import { icon, url, type TabIconStatus, type TabSection } from './geometry';
import { sectionForPath } from './sections';
import {
	createTabStatusRegistry,
	INERT_HANDLE,
	type TabStatusHandle,
	type TabStatusKind,
	type TabStatusOptions
} from './status';

export type { TabStatusHandle, TabStatusKind, TabStatusOptions } from './status';

/** At most four repaints a second. */
export const TAB_ICON_FRAME_MS = 250;

/** Frames in one animation cycle (one second at `TAB_ICON_FRAME_MS`). */
const FRAMES = 4;

/** The resting icon: Home, no status. Byte for byte `static/IDEA/favicon.svg`. */
export const TAB_ICON_RESTING = icon('gearkey', 'home', null);

const registry = createTabStatusRegistry();

/** Raise a status on the tab. On the server, an inert handle. */
export function raise(kind: TabStatusKind, opts?: TabStatusOptions): TabStatusHandle {
	if (typeof window === 'undefined') return INERT_HANDLE;
	return registry.raise(kind, opts);
}

/** End a status. Safe on a null, an inert or an already-cleared handle. */
export function clear(handle: TabStatusHandle | null | undefined): void {
	handle?.clear();
}

/** The status the tab is showing now (the harness reads it). */
export function currentTabStatus(): TabIconStatus {
	return registry.current();
}

/** Called after every status change. Returns the unsubscribe. */
export function subscribeTabStatus(fn: () => void): () => void {
	return registry.subscribe(fn);
}

/** Clears every raised status. The dev harness's "Clear all", and tests. */
export function clearAllTabStatuses(): void {
	registry.reset();
}

/** The two kinds that move: live pulses and saving blinks. */
export type AnimatedTabKind = 'live' | 'saving';

const isAnimatedKind = (kind: TabIconStatus['kind']): kind is AnimatedTabKind =>
	kind === 'live' || kind === 'saving';

/** Whether a kind animates on its own timer. */
export function animates(kind: TabIconStatus['kind'], reducedMotion: boolean): boolean {
	return !reducedMotion && isAnimatedKind(kind);
}

/**
 * Where each kind's cycle starts, in frames. The drawing lights the live lamp
 * while `cos(2 pi phase) > 0` and the saving lamp while `sin(4 pi phase) > 0`,
 * so live opens half a frame early (on the lit half of its pulse: lit, lit,
 * low, low) and saving half a frame late (on the lamp's on beat: on, off, on,
 * off). A single shared start cannot do both: the start that opens live on its
 * lit half opens saving dark, which is what every short save used to show.
 */
const PHASE_START: Record<AnimatedTabKind, number> = { live: -0.5, saving: 0.5 };

/**
 * Where an animated state is in its one-second cycle at `frame`. Sampled at
 * the middle of each quarter so no frame lands on a zero crossing of the
 * drawing's own cosine and sine (where float noise would decide the lamp),
 * and started so frame 0 is lit for both kinds.
 */
export function framePhase(kind: AnimatedTabKind, frame: number): number {
	const q = ((Math.floor(frame) % FRAMES) + FRAMES) % FRAMES;
	return ((((q + PHASE_START[kind]) % FRAMES) + FRAMES) % FRAMES) / FRAMES;
}

/**
 * The frame reduced motion holds: the cycle's opening frame, which is lit for
 * both kinds. Not the drawing's own default `phase` 0, which sits exactly on
 * the saving lamp's zero crossing and draws it dark.
 */
export function stillPhase(kind: AnimatedTabKind): number {
	return framePhase(kind, 0);
}

/** The SVG for a section, a status and a frame. Pure. */
export function frameFor(
	section: TabSection,
	status: TabIconStatus,
	frame: number,
	reducedMotion: boolean
): string {
	const k = status.kind;
	const s: TabIconStatus = isAnimatedKind(k)
		? { ...status, phase: reducedMotion ? stillPhase(k) : framePhase(k, frame) }
		: status;
	return icon('gearkey', section, s);
}

/** The document title with the unread prefix, or the plain title at 0. */
export function titleWithUnread(base: string, n: number): string {
	return n > 0 ? `(${n}) ${base}` : base;
}

let currentPath = '/';
let painter: { update: () => void } | null = null;
let unmount: (() => void) | null = null;

/** The page's pathname. `TabIcon.svelte` calls this on every navigation. */
export function setTabPath(pathname: string): void {
	if (pathname === currentPath) return;
	currentPath = pathname;
	painter?.update();
}

/** The badge methods are absent in most browsers, and iOS adds `standalone`. */
type BadgeNavigator = Partial<Pick<Navigator, 'setAppBadge' | 'clearAppBadge'>> & { standalone?: boolean };

/**
 * Mount the painter on this document. Returns the teardown, which puts the
 * original icon and the plain title back. A second mount replaces the first.
 */
export function mountTabIcon(doc: Document = document, win: Window = window): () => void {
	unmount?.();

	const link = doc.head.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
	const ico = doc.head.querySelector<HTMLLinkElement>('link[rel="icon"]:not([type="image/svg+xml"])');
	/* THE RESOLVED URL, NOT THE ATTRIBUTE. SvelteKit's router rewrites every
	   icon link's href to its absolute form when it starts (so a relative icon
	   URL survives a pushState), which can land before or after this mount.
	   Holding and comparing the resolved `href` property means the painter
	   agrees with that rewrite and never writes a change that is not one. */
	const originalHref = link ? link.href : null;
	const now = () => Date.now();

	const motionQuery = typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
	let reduced = !!motionQuery?.matches;
	let frame = 0;
	let animTimer: ReturnType<typeof setInterval> | null = null;
	let animKind: AnimatedTabKind | null = null;
	let paintTimer: ReturnType<typeof setTimeout> | null = null;
	let lastPaintAt = -Infinity;
	let lastSvg: string | null = null;
	let standingDown = false;

	let titleBase: string | null = null;
	let lastWritten: string | null = null;
	let prefixN = 0;
	let badgeN = -1;
	let offlineHandle: TabStatusHandle | null = null;

	/** Another icon link in <head> means a product set its own icon. */
	function foreignIcon(): boolean {
		for (const el of doc.head.querySelectorAll('link[rel~="icon"]')) {
			if (el !== link && el !== ico) return true;
		}
		return false;
	}

	function writeHref(svg: string): void {
		if (!link || originalHref === null) return;
		const href = svg === TAB_ICON_RESTING ? originalHref : url(svg);
		lastSvg = svg;
		if (link.href === href) return;
		link.setAttribute('href', href);
		lastPaintAt = now();
	}

	function paintNow(): void {
		if (!link || standingDown) return;
		const svg = frameFor(sectionForPath(currentPath), registry.current(), frame, reduced);
		if (svg === lastSvg) return;
		writeHref(svg);
	}

	function requestPaint(): void {
		if (!link || standingDown) return;
		const wait = lastPaintAt + TAB_ICON_FRAME_MS - now();
		if (wait <= 0) {
			paintNow();
			return;
		}
		if (paintTimer === null) {
			paintTimer = setTimeout(() => {
				paintTimer = null;
				paintNow();
			}, wait);
		}
	}

	/**
	 * The cycle runs while an animated state is the one showing, and starts
	 * again at its lit frame 0 whenever the animated KIND changes (live handing
	 * the tab to a saving under it), so every animated state opens lit, not
	 * only the first one.
	 */
	function syncAnimation(): void {
		const kind = registry.current().kind;
		const run = !standingDown && !!link && animates(kind, reduced);
		if (run && animKind !== kind) {
			if (animTimer !== null) clearInterval(animTimer);
			frame = 0;
			animKind = kind as AnimatedTabKind;
			animTimer = setInterval(() => {
				frame = (frame + 1) % FRAMES;
				requestPaint();
			}, TAB_ICON_FRAME_MS);
		} else if (!run && animTimer !== null) {
			clearInterval(animTimer);
			animTimer = null;
			animKind = null;
			frame = 0;
		}
	}

	/**
	 * THE TITLE, KEPT IDEMPOTENT WITHOUT OWNING IT. Every page sets its own
	 * title through `<svelte:head>`; there is no single place titles are
	 * written, so the painter watches `<head>` and re-applies the prefix to
	 * whatever the page last set. A title that is not the one this function
	 * last wrote is the page's new title; one that is, is left alone.
	 */
	function applyTitle(): void {
		const n = standingDown ? 0 : registry.unread();
		const cur = doc.title;
		if (cur !== lastWritten || titleBase === null) {
			const own = prefixN > 0 ? `(${prefixN}) ` : null;
			titleBase = own && cur.startsWith(own) ? cur.slice(own.length) : cur;
		}
		const want = titleWithUnread(titleBase, n);
		prefixN = n;
		lastWritten = want;
		if (want !== cur) doc.title = want;
	}

	/** The installed app's badge, behind a feature check. */
	function applyBadge(): void {
		const nav = win.navigator as BadgeNavigator;
		if (typeof nav.setAppBadge !== 'function') return;
		const standalone =
			(typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches) ||
			nav.standalone === true;
		if (!standalone) return;
		const n = registry.unread();
		if (n === badgeN) return;
		badgeN = n;
		try {
			const pending = n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge?.();
			pending?.catch(() => {});
		} catch {
			/* A badge is a courtesy; a refusal changes nothing else. */
		}
	}

	function standDown(): void {
		standingDown = true;
		if (paintTimer !== null) clearTimeout(paintTimer);
		paintTimer = null;
		if (link && originalHref !== null && link.href !== originalHref) link.setAttribute('href', originalHref);
		lastSvg = null;
	}

	function update(): void {
		const foreign = foreignIcon();
		if (foreign && !standingDown) standDown();
		else if (!foreign && standingDown) standingDown = false;
		syncAnimation();
		requestPaint();
		applyTitle();
		applyBadge();
	}

	const unsubscribe = registry.subscribe(update);
	const observer =
		typeof MutationObserver === 'function'
			? new MutationObserver(() => {
					if (foreignIcon() !== standingDown) update();
					else applyTitle();
				})
			: null;
	observer?.observe(doc.head, { childList: true, subtree: true, characterData: true });

	const onOffline = () => {
		if (!offlineHandle) offlineHandle = registry.raise('offline');
	};
	const onOnline = () => {
		offlineHandle?.clear();
		offlineHandle = null;
	};
	const onMotion = (e: MediaQueryListEvent) => {
		reduced = e.matches;
		update();
	};
	win.addEventListener('offline', onOffline);
	win.addEventListener('online', onOnline);
	motionQuery?.addEventListener?.('change', onMotion);

	painter = { update };
	if (win.navigator && win.navigator.onLine === false) onOffline();
	update();

	function teardown(): void {
		unsubscribe();
		observer?.disconnect();
		win.removeEventListener('offline', onOffline);
		win.removeEventListener('online', onOnline);
		motionQuery?.removeEventListener?.('change', onMotion);
		if (animTimer !== null) clearInterval(animTimer);
		if (paintTimer !== null) clearTimeout(paintTimer);
		animTimer = paintTimer = null;
		animKind = null;
		offlineHandle?.clear();
		offlineHandle = null;
		if (link && originalHref !== null && link.href !== originalHref) link.setAttribute('href', originalHref);
		if (titleBase !== null && doc.title === lastWritten && lastWritten !== titleBase) doc.title = titleBase;
		painter = null;
		unmount = null;
	}
	unmount = teardown;
	return teardown;
}
