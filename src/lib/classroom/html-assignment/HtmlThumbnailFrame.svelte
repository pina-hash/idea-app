<script module lang="ts">
	/*
	 * THE PAGE-WIDE WATCHERS, one of each however many thumbnails a class has:
	 * an IntersectionObserver for "near" (a frame is created only when its row
	 * comes within half a screen of the viewport), one for "kept" (a frame
	 * whose row has gone further than a screen and a half away is taken down
	 * once the page is still), one for "on screen" (a frame off screen is told
	 * to pause), one ResizeObserver (the slot's size and shape), and the
	 * environment: the site theme on `<html data-theme>`, reduced motion,
	 * whether the tab is hidden, and whether the reader is scrolling. Thirty
	 * thumbnails cost four observers and a handful of listeners, not a hundred
	 * and twenty.
	 *
	 * BOTH MARGINS ARE ALSO SCROLL MARGINS. Above 1024px the class list scrolls
	 * in its own pane, and a root margin alone stops at that pane's edge (an
	 * IntersectionObserver clips a target by every scrolling ancestor), so a
	 * row one line below the pane's fold was not "near" until it was on screen.
	 * A browser without `scrollMargin` ignores the option and gets that old
	 * behavior, which is still correct, only later.
	 */
	const NEAR_MARGIN = '50% 0px';
	const KEEP_MARGIN = '150% 0px';
	/** How long a frame must have been far away, with the page still, before it is taken down. */
	const RELEASE_AFTER_MS = 3000;

	type Watch = {
		near: (yes: boolean) => void;
		kept: (yes: boolean) => void;
		visible: (yes: boolean) => void;
		/** The slot's border box, from the observer's own entry, so nothing re-reads layout. */
		resize: (width: number, height: number) => void;
	};
	const watched = new Map<Element, Watch>();
	let nearIo: IntersectionObserver | null = null;
	let keepIo: IntersectionObserver | null = null;
	let seenIo: IntersectionObserver | null = null;
	let sizeRo: ResizeObserver | null = null;

	function watch(el: Element, w: Watch): () => void {
		if (typeof IntersectionObserver === 'undefined') {
			// No observer (an old browser): create it now and never pause it.
			w.near(true);
			w.kept(true);
			w.visible(true);
			return () => {};
		}
		nearIo ??= new IntersectionObserver(
			(entries) => entries.forEach((e) => watched.get(e.target)?.near(e.isIntersecting)),
			{ rootMargin: NEAR_MARGIN, scrollMargin: NEAR_MARGIN } as IntersectionObserverInit
		);
		keepIo ??= new IntersectionObserver(
			(entries) => entries.forEach((e) => watched.get(e.target)?.kept(e.isIntersecting)),
			{ rootMargin: KEEP_MARGIN, scrollMargin: KEEP_MARGIN } as IntersectionObserverInit
		);
		seenIo ??= new IntersectionObserver((entries) =>
			entries.forEach((e) => watched.get(e.target)?.visible(e.isIntersecting))
		);
		if (typeof ResizeObserver !== 'undefined') {
			sizeRo ??= new ResizeObserver((entries) =>
				entries.forEach((e) => {
					const box = e.borderBoxSize?.[0];
					watched.get(e.target)?.resize(box ? box.inlineSize : e.contentRect.width, box ? box.blockSize : e.contentRect.height);
				})
			);
		}
		watched.set(el, w);
		nearIo.observe(el);
		keepIo.observe(el);
		seenIo.observe(el);
		sizeRo?.observe(el);
		return () => {
			watched.delete(el);
			nearIo?.unobserve(el);
			keepIo?.unobserve(el);
			seenIo?.unobserve(el);
			sizeRo?.unobserve(el);
		};
	}

	/*
	 * ONE MESSAGE LISTENER FOR THE PAGE, routing by the frame that sent it. A
	 * listener per thumbnail ran every thumbnail's handler for every message any
	 * of them sent, thirty handlers a message on a class of thirty; this looks
	 * the sender up once.
	 *
	 * KEYED ON THE FRAME ELEMENT, WITH ITS WINDOW AS A CACHE (report 7dfde5e5,
	 * ledger 0416). A frame's `contentWindow` is the same object across its
	 * navigations, but NOT when the element is taken out of the page and put
	 * back: dragging a post to a new place moves its row, the frame loads again
	 * under a NEW window, and a route keyed on the old one sent the reloaded
	 * thumbnail's "ready" nowhere, so the dragged post's banner never got its
	 * state and showed as a bare glyph while every post it passed kept its
	 * banner. The new document says "ready" before its frame's load event, so
	 * the route cannot wait for that either: a message from a window the cache
	 * does not know is matched against each routed frame's window as it is now.
	 */
	const byFrame = new Map<HTMLIFrameElement, (e: MessageEvent) => void>();
	const frameOf = new Map<MessageEventSource, HTMLIFrameElement>();
	let routing = false;

	function senderFrame(source: MessageEventSource): HTMLIFrameElement | null {
		const cached = frameOf.get(source);
		if (cached && cached.contentWindow === source && byFrame.has(cached)) return cached;
		frameOf.delete(source);
		for (const el of byFrame.keys()) {
			if (el.contentWindow === source) {
				frameOf.set(source, el);
				return el;
			}
		}
		return null;
	}

	function route(el: HTMLIFrameElement, handler: (e: MessageEvent) => void): () => void {
		if (!routing) {
			routing = true;
			window.addEventListener('message', (e) => {
				if (!e.source) return;
				const el = senderFrame(e.source);
				if (el) byFrame.get(el)?.(e);
			});
		}
		byFrame.set(el, handler);
		return () => {
			if (byFrame.get(el) !== handler) return;
			byFrame.delete(el);
			for (const [w, f] of frameOf) if (f === el) frameOf.delete(w);
		};
	}

	/*
	 * FRAMES ARE CREATED ONE AT A TIME, IN IDLE TIME, AND NEVER WHILE THE
	 * READER SCROLLS. Creating a frame is a document: a window, a parse and a
	 * script, and on the page's own thread a style pass over the whole page.
	 * Rows come near the viewport several at once while a page scrolls, so
	 * creating each the moment it came near put that work in the middle of the
	 * scroll's frames. A slot that comes near joins a queue and LEAVES it if it
	 * goes away again before its turn (passing a row on the way down the list
	 * is not a reason to build its thumbnail), and the queue makes one frame
	 * per idle period (at most a second late, so a busy page still gets them),
	 * in the order they came near, and none while the reader is scrolling:
	 * they wait for the page to settle.
	 */
	const createQueue: (() => void)[] = [];
	let pumpScheduled = false;

	function pumpCreate(): void {
		pumpScheduled = false;
		// Not while the page scrolls: the settle below starts the queue again.
		if (env.scrolling) return;
		createQueue.shift()?.();
		if (createQueue.length) schedulePump();
	}

	function schedulePump(): void {
		if (pumpScheduled) return;
		pumpScheduled = true;
		const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o: { timeout: number }) => number })
			.requestIdleCallback;
		if (idle) idle(pumpCreate, { timeout: 1000 });
		else setTimeout(pumpCreate, 40);
	}

	function createWhenIdle(make: () => void): () => void {
		createQueue.push(make);
		schedulePump();
		return () => {
			const i = createQueue.indexOf(make);
			if (i >= 0) createQueue.splice(i, 1);
		};
	}

	const envListeners = new Set<() => void>();
	let envStarted = false;
	const env = { theme: null as string | null, reduce: false, hidden: false, scrolling: false };

	/*
	 * HOLD STILL WHILE THE PAGE SCROLLS. Every live thumbnail on screen draws
	 * every frame, and while a list scrolls each of those drawings is moving
	 * as well as changing; in the browser pass (thirty live thumbnails, wheel
	 * scrolling, Wide and Banner at 1440) that work was what stood between the
	 * scroll and its frames. So scrolling anywhere on the page pauses them, and
	 * they go on SCROLL_SETTLE_MS after the reader last scrolled. A wheel turn
	 * or a finger moving counts as scrolling even when the list has reached its
	 * end and nothing moves (no scroll event fires there, and a page that took
	 * that for "settled" built new frames under a wheel still turning). A
	 * thumbnail moving past under a finger is not something anybody watches.
	 */
	const SCROLL_SETTLE_MS = 250;
	let scrollTimer: ReturnType<typeof setTimeout> | null = null;
	const settleListeners = new Set<() => void>();

	function scrolled(): void {
		if (scrollTimer) clearTimeout(scrollTimer);
		scrollTimer = setTimeout(() => {
			scrollTimer = null;
			env.scrolling = false;
			envListeners.forEach((f) => f());
			settleListeners.forEach((f) => f());
			if (createQueue.length) schedulePump();
		}, SCROLL_SETTLE_MS);
		if (!env.scrolling) {
			env.scrolling = true;
			envListeners.forEach((f) => f());
		}
	}

	function startEnv(): void {
		if (envStarted || typeof document === 'undefined') return;
		envStarted = true;
		const root = document.documentElement;
		env.theme = root.getAttribute('data-theme');
		const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
		env.reduce = !!query?.matches;
		env.hidden = document.visibilityState === 'hidden';
		const tell = () => envListeners.forEach((f) => f());
		new MutationObserver(() => {
			env.theme = root.getAttribute('data-theme');
			tell();
		}).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
		query?.addEventListener?.('change', () => {
			env.reduce = query.matches;
			tell();
		});
		document.addEventListener('visibilitychange', () => {
			env.hidden = document.visibilityState === 'hidden';
			tell();
		});
		// Capture, so a scroll inside any pane (the class list scrolls in its
		// own pane above 1024px) is heard as well as the document's own; it
		// tells the thumbnails only when scrolling starts and when it settles.
		for (const type of ['scroll', 'wheel', 'touchmove']) {
			document.addEventListener(type, scrolled, { capture: true, passive: true });
		}
	}

	/** Run `f` once the page next settles (at once if it is still now). */
	function whenSettled(f: () => void): () => void {
		if (!env.scrolling) {
			const t = setTimeout(f, 0);
			return () => clearTimeout(t);
		}
		const once = () => {
			settleListeners.delete(once);
			f();
		};
		settleListeners.add(once);
		return () => settleListeners.delete(once);
	}

	function onEnv(f: () => void): () => void {
		startEnv();
		envListeners.add(f);
		return () => envListeners.delete(f);
	}
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		HX_SANDBOX_FLAGS,
		HX_THUMB_SHAPE_RE,
		hxThemeNameOf,
		hxThemeOf,
		hxThumbPointerMessage,
		hxThumbReceive,
		hxThumbStateMessage
	} from './thumbnail';

	/**
	 * ONE LIVE HTML THUMBNAIL (ledger 0396): the document's `<template>`, served
	 * by `/hx/<document id>/thumbnail` under the worksheet's own sandbox and CSP,
	 * in a frame this component creates lazily and keeps told.
	 *
	 * WHAT IT TELLS THE THUMBNAIL, live, through the bridge's thumbnail half
	 * (`idea:thumb`): the slot's width and height, its shape (read from the
	 * slot's own `--thumb-shape`, so a shape added in a stylesheet reaches the
	 * thumbnail with no change here), the site theme's name and whether it is
	 * light or dark, reduced motion, and whether to pause. It is paused while
	 * the slot is off screen, while the tab is hidden and while the page
	 * scrolls; it is created only when the row comes within half a screen of
	 * the viewport, one frame per idle period and never mid-scroll, and taken
	 * down again once the row has been more than a screen and a half away for
	 * a few seconds with the page still.
	 *
	 * IT IS INVISIBLE UNTIL IT SAYS IT IS READY, so the generated identity under
	 * it is what shows while it loads, for a draft (whose thumbnail the route
	 * refuses until it is published), and for a thumbnail that never answers;
	 * one that has not said `idea:thumb-ready` two and a half seconds after it
	 * loaded is taken away rather than left running unseen.
	 *
	 * NOT INTERACTIVE (the default): the frame is `inert` (no pointer events, no
	 * focus, nothing in the accessibility tree); it sits inside a link to the
	 * post (the class row's own link for a Tile, the slot's own link over it
	 * for Wide and Banner), so a click opens the post as the row does (a real
	 * link: a middle click opens a tab), and the slot forwards
	 * the pointer's position through `pointer()` so the thumbnail can still
	 * react to hover. A thumbnail that is busy or broken cannot stop that click,
	 * because the click never reaches it.
	 *
	 * INTERACTIVE (`"interactive": true` in the manifest): no overlay; the frame
	 * takes the pointer and the keyboard itself, and asks the page to open the
	 * post (`idea:thumb-open`) for a click on nothing it handles. The page opens
	 * it only while the pointer or the focus is on this slot, so a thumbnail
	 * cannot send a reader anywhere by itself, and only ever to its own post.
	 */
	let {
		src,
		interactive = false,
		title,
		shape = 'tile',
		onready = null,
		onfail = null,
		onopen = null
	}: {
		src: string;
		interactive?: boolean;
		title: string;
		/** The shape the slot was asked for; the slot's computed `--thumb-shape` wins. */
		shape?: string;
		onready?: ((ready: boolean) => void) | null;
		/** The frame loaded and never said it was ready, so it was taken away (a 404 is the usual reason). */
		onfail?: (() => void) | null;
		onopen?: (() => void) | null;
	} = $props();

	let box = $state<HTMLDivElement | null>(null);
	let frame = $state<HTMLIFrameElement | null>(null);
	let near = $state(false);
	/* Whether the row is within the near margin right now; a frame held while
	   its row is further away than that is not drawn (see the style below). */
	let inNear = $state(false);
	let visible = $state(false);
	/* Keyed on the address, so a new version (a re-upload moves `?v=`) starts
	   invisible again until IT says it is ready. */
	let readyFor = $state<string | null>(null);
	let failedFor = $state<string | null>(null);
	const ready = $derived(readyFor === src);
	const failed = $derived(failedFor === src);
	let lastSent = '';
	let readyTimer: ReturnType<typeof setTimeout> | null = null;

	/*
	 * WHAT THE SLOT IS, KEPT RATHER THAN RE-READ. A visibility change fires for
	 * every slot crossing the viewport edge while a page scrolls, and reading a
	 * rect and a computed style there forced a style and layout pass per slot
	 * per crossing (measured in a trace of a wheel scroll over thirty live
	 * slots at 1440). So the size comes from the ResizeObserver's own entry and
	 * the shape is read once per resize and once per shape change, and a
	 * visibility or theme change sends what is already known.
	 */
	let size: { width: number; height: number } | null = null;
	let shapeNow = '';

	function readShape(): string {
		if (!box) return shape;
		const computed = getComputedStyle(box).getPropertyValue('--thumb-shape').trim();
		return HX_THUMB_SHAPE_RE.test(computed) ? computed : shape;
	}

	function send(force = false): void {
		const win = frame?.contentWindow;
		if (!win || !ready || !box) return;
		if (!size) {
			const rect = box.getBoundingClientRect();
			size = { width: rect.width, height: rect.height };
		}
		if (!shapeNow) shapeNow = readShape();
		const message = hxThumbStateMessage({
			width: size.width,
			height: size.height,
			shape: shapeNow,
			theme: hxThemeNameOf(env.theme),
			scheme: hxThemeOf(env.theme),
			reducedMotion: env.reduce,
			paused: !visible || env.hidden || env.scrolling
		});
		const key = JSON.stringify(message);
		if (!force && key === lastSent) return;
		lastSent = key;
		win.postMessage(message, '*');
	}

	/**
	 * The pointer over the slot's overlay, forwarded as fractions of the slot.
	 * NOT WHILE THE PAGE SCROLLS: a list moving under a still pointer makes the
	 * browser fire a pointer move per frame on whichever slot is under it, and
	 * forwarding those was most of the messages a scrolling class page sent its
	 * thumbnails (measured in a trace, wheel scrolling over thirty live
	 * thumbnails at 1440). Nobody is hovering a thumbnail on purpose while the
	 * list slides past; the leave is still sent, so none is left "hovered".
	 */
	export function pointer(x: number, y: number, inside: boolean): void {
		const win = frame?.contentWindow;
		if (!win || !ready || interactive) return;
		if (inside && env.scrolling) return;
		win.postMessage(hxThumbPointerMessage(x, y, inside), '*');
	}

	function onMessage(e: MessageEvent): void {
		const verdict = hxThumbReceive({ origin: e.origin, source: e.source, data: e.data }, frame?.contentWindow ?? null);
		if (!verdict.ok) return;
		if (verdict.type === 'ready') {
			if (readyTimer) clearTimeout(readyTimer);
			readyTimer = null;
			const first = !ready;
			readyFor = src;
			lastSent = '';
			send(true);
			if (first) onready?.(true);
			return;
		}
		// `open`: only an interactive thumbnail asks, and only while it is the
		// thing being pointed at or focused.
		if (!interactive || !box) return;
		const pointed = box.matches(':hover') || box.contains(document.activeElement);
		if (pointed) onopen?.();
	}

	function frameLoaded(): void {
		if (ready) return;
		const loaded = src;
		if (readyTimer) clearTimeout(readyTimer);
		readyTimer = setTimeout(() => {
			if (readyFor !== loaded) {
				failedFor = loaded;
				onready?.(false);
				onfail?.();
			}
		}, 2500);
	}

	/* The frame's messages, through the page's one listener, by the frame itself. */
	$effect(() => {
		const el = frame;
		if (!el) return;
		return route(el, onMessage);
	});

	/* A shape change the slot's size did not move (a later stylesheet's shape
	   of the same box) still reaches the thumbnail. */
	$effect(() => {
		void shape;
		untrack(() => {
			if (!box) return;
			shapeNow = readShape();
			send();
		});
	});

	/*
	 * TAKING A FRAME DOWN. Its row has been far from the screen for a while and
	 * the page is still: the frame goes (a live document costs the page on
	 * every frame it scrolls, painted or not), and the generated identity under
	 * it is what the row shows until the row comes near again and a new frame
	 * says it is ready. The browser's cache answers the thumbnail's address, so
	 * coming back costs a parse, not a download.
	 */
	function release(): void {
		if (!near) return;
		near = false;
		if (readyTimer) clearTimeout(readyTimer);
		readyTimer = null;
		const wasReady = ready;
		readyFor = null;
		lastSent = '';
		if (wasReady) onready?.(false);
	}

	onMount(() => {
		if (!box) return;
		let cancelCreate: (() => void) | null = null;
		let releaseTimer: ReturnType<typeof setTimeout> | null = null;
		let cancelRelease: (() => void) | null = null;
		const keep = () => {
			if (releaseTimer) clearTimeout(releaseTimer);
			releaseTimer = null;
			cancelRelease?.();
			cancelRelease = null;
		};
		const stopWatch = watch(box, {
			near: (yes) => {
				inNear = yes;
				if (yes) {
					keep();
					if (near || cancelCreate) return;
					cancelCreate = createWhenIdle(() => {
						cancelCreate = null;
						near = true;
					});
				} else if (cancelCreate) {
					// Gone by before its turn: no frame for it after all.
					cancelCreate();
					cancelCreate = null;
				}
			},
			kept: (yes) => {
				if (yes) {
					keep();
					return;
				}
				if (!near || releaseTimer || cancelRelease) return;
				releaseTimer = setTimeout(() => {
					releaseTimer = null;
					cancelRelease = whenSettled(() => {
						cancelRelease = null;
						release();
					});
				}, RELEASE_AFTER_MS);
			},
			visible: (yes) => {
				visible = yes;
				send();
			},
			resize: (width, height) => {
				size = { width, height };
				shapeNow = readShape();
				send();
			}
		});
		const stopEnv = onEnv(() => send());
		return () => {
			stopWatch();
			stopEnv();
			cancelCreate?.();
			keep();
			if (readyTimer) clearTimeout(readyTimer);
		};
	});
</script>

<div class="htf" class:away={near && !inNear} bind:this={box} data-testid="html-thumbnail" data-ready={ready ? 'true' : 'false'} data-interactive={interactive ? 'true' : 'false'}>
	{#if near && !failed}
		{#key src}
			<iframe
				bind:this={frame}
				{src}
				title={interactive ? `${title} (interactive thumbnail)` : `${title} thumbnail`}
				class="htf-frame"
				class:ready
				class:interactive
				sandbox={HX_SANDBOX_FLAGS}
				referrerpolicy="no-referrer"
				inert={!interactive}
				onload={frameLoaded}
			></iframe>
		{/key}
	{/if}
</div>

<style>
	/*
	 * A FRAME HELD WHILE ITS ROW IS FAR AWAY IS NOT DRAWN (`away`: further
	 * than the near margin, kept until it is released). `visibility: hidden`,
	 * because it skips the frame's painting and compositing without touching
	 * layout. Both other ways were measured worse, with the CPU slowed four
	 * times, thirty live slots under wheel scrolling: `content-visibility:
	 * auto` on every slot restyled and laid out each box that crossed the
	 * browser's relevance margin (a hundred passes in five seconds), and on
	 * the held slots alone it still cost the scrolling document a layout per
	 * crossing (Wide at 960, 42.8 frames a second, against 59.8 here); with
	 * nothing at all, the frames past the class list's fold were repainted on
	 * every scrolled frame of its pane (Wide at 1440, 45). The figures with
	 * this are in the SPEC's section on cost.
	 */
	.htf {
		position: absolute;
		inset: 0;
	}
	.htf.away .htf-frame {
		visibility: hidden;
	}
	.htf-frame {
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
		/* Invisible until the thumbnail says it is ready, so a slow, refused or
		   silent one leaves the generated identity under it showing. */
		opacity: 0;
		pointer-events: none;
	}
	.htf-frame.ready {
		opacity: 1;
	}
	.htf-frame.ready.interactive {
		pointer-events: auto;
	}
	@media (prefers-reduced-motion: no-preference) {
		.htf-frame {
			transition: opacity 180ms ease-out;
		}
	}
</style>
