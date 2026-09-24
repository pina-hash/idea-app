<script lang="ts">
	/**
	 * THE ONE LARGE VIEW FOR EVERY PICTURE IN THE CLASSROOM (ledger 0297,
	 * package ITEM; reports 35 and 23).
	 *
	 * A body figure, an image attachment, an imageZone photo, a hand-in and the
	 * grading console's view of those all open here, and so does a notebook
	 * page: `PhotoViewer.svelte` was the first lightbox in this app and is now a
	 * thin wrapper that hands its pages to this one. Two viewers would be two
	 * sets of zoom arithmetic, two keyboard maps and two answers to "how do I get
	 * the file", which is the defect class this repo keeps writing down.
	 *
	 * PAN AND ZOOM ARE `$lib/panzoom`'S, THROUGH THE SAME `PanZoomHost` CONTRACT
	 * DrawingViewer and PhotoViewer used, so nothing about a transform is
	 * reimplemented here. What this owns is the chrome and the rule for WHEN the
	 * engine may measure (see `dialogOpen` below).
	 *
	 * A NATIVE <dialog> WITH showModal, NEVER A STYLED OVERLAY DIV. It is
	 * mounted inside scroll containers with a max-height (the class split's
	 * detail pane, the grading console's work column), and anything not
	 * promoted to the top layer is clipped by them; showModal also brings the
	 * focus trap, Escape and an inert page behind it for free. Authored where
	 * its caller is, never hoisted to <body>, so a room's tokens reach it by
	 * ordinary inheritance even though it paints in the top layer.
	 *
	 * DOWNLOAD IS AN `<a href>` TO THE SAME URL THE PICTURE CAME FROM. For a
	 * classroom file that is the proxy, which already answers
	 * `Content-Disposition: attachment` on the storage origin; no serve route
	 * gains an inline branch for this, which CLAUDE.md forbids.
	 *
	 * EVERY DRAG HAS A SINGLE-POINTER ALTERNATIVE (WCAG 2.2, 2.5.7): the zoom
	 * buttons stand in for a pinch and the wheel, and once a picture is zoomed
	 * past its frame four Move controls stand in for the drag. They render only
	 * while panning means something, so a fitted picture is not offered four
	 * buttons that do nothing.
	 *
	 * THE STAGE IS A DELIBERATE DARK ISLAND in every theme, Space White
	 * included: a photograph reads best on near-black, and the viewfinder
	 * convention (`.nb-island`) already says so for the notebook's camera.
	 */
	import type { Snippet } from 'svelte';
	import { attachPanZoom, zoomCentre, type PanZoomHost } from '$lib/panzoom/controller';
	import { fitView as fitViewOf, type Size, type View } from '$lib/panzoom/transform';
	import Pending from '$lib/Pending.svelte';
	import {
		LIGHTBOX_ZOOM_STEP,
		lightboxCountLabel,
		lightboxKeyAction,
		lightboxPan,
		lightboxPanAxes,
		lightboxRetrySrc,
		type LightboxImage
	} from '$lib/media/lightbox';

	let {
		images,
		index,
		label,
		onIndex,
		onClose,
		controls,
		testId = 'lightbox'
	}: {
		images: LightboxImage[];
		/** null = closed. A valid index into `images` opens the dialog on it. */
		index: number | null;
		/** What the whole viewer is about, for the dialog's accessible name. */
		label: string;
		onIndex: (i: number) => void;
		onClose: () => void;
		/**
		 * Extra controls for the bottom bar. The notebook passes its
		 * Corrected / Original switch; nothing in the classroom passes one.
		 */
		controls?: Snippet;
		testId?: string;
	} = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let stageEl = $state<HTMLDivElement | null>(null);
	/** Mirrors `dialogEl.open` as reactive state -- see the wiring effect. */
	let dialogOpen = $state(false);

	const current = $derived<LightboxImage | null>(index !== null ? (images[index] ?? null) : null);
	const countLabel = $derived(index !== null ? lightboxCountLabel(index, images.length) : null);

	let broken = $state<Record<string, true>>({});
	let retryTick = $state<Record<string, number>>({});
	/** The identity the error state is keyed on: a key AND its src, so the
	 *  notebook's Corrected/Original swap is its own picture to fail. */
	const shownId = $derived(current ? `${current.key}\n${current.src}` : null);
	const shownSrc = $derived(
		current ? lightboxRetrySrc(current.src, retryTick[shownId ?? ''] ?? 0) : ''
	);

	function retry() {
		if (!shownId) return;
		retryTick = { ...retryTick, [shownId]: (retryTick[shownId] ?? 0) + 1 };
		const { [shownId]: _dropped, ...rest } = broken;
		broken = rest;
	}

	// --- the shared view transform ------------------------------------------
	let W = $state(0);
	let H = $state(0);
	let s = $state(1);
	let tx = $state(0);
	let ty = $state(0);
	let fitted = $state(false);
	let naturalW = $state(0);
	let naturalH = $state(0);

	const stageBox = $derived<Size>({ w: W, h: H });
	const contentBox = $derived<Size>({ w: naturalW, h: naturalH });
	const panAxes = $derived(lightboxPanAxes({ s, tx, ty }, stageBox, contentBox));
	const canPan = $derived(panAxes.x || panAxes.y);

	const panZoomHost: PanZoomHost = {
		getView: () => ({ s, tx, ty }),
		setView: (v: View) => {
			s = v.s;
			tx = v.tx;
			ty = v.ty;
		},
		getStage: () => ({ w: W, h: H }),
		setStage: (sz: Size) => {
			W = sz.w;
			H = sz.h;
		},
		getContent: () => ({ w: naturalW, h: naturalH }),
		isFitted: () => fitted,
		onInteract: () => cancelAnim()
	};

	// A new picture (a page change, or the notebook's variant swap) means
	// unknown dimensions and an un-fitted view: nothing to preserve across a
	// swap, unlike a resize.
	let lastShown: string | null = null;
	$effect(() => {
		const id = shownId;
		if (id === lastShown) return;
		lastShown = id;
		naturalW = 0;
		naturalH = 0;
		fitted = false;
		s = 1;
		tx = 0;
		ty = 0;
		cancelAnim();
	});

	function onImgLoad(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		if (img.naturalWidth && img.naturalHeight) {
			naturalW = img.naturalWidth;
			naturalH = img.naturalHeight;
		}
	}

	function onImgError() {
		if (shownId) broken = { ...broken, [shownId]: true };
	}

	// First fit, once both the stage and the intrinsic size are known.
	$effect(() => {
		if (naturalW > 0 && naturalH > 0 && W > 0 && H > 0 && !fitted) {
			const f = fitViewOf(stageBox, contentBox);
			s = f.s;
			tx = f.tx;
			ty = f.ty;
			fitted = true;
		}
	});

	// WIRED ON `dialogOpen`, NOT ON `stageEl` ALONE. A <dialog> without [open]
	// is `display: none`, so a stage made before showModal() has a 0x0 box and
	// attachPanZoom's own first measurement would capture that zero.
	// `dialogOpen` is set in the same effect that calls showModal(), so this
	// cannot run until the dialog is laid out. (PhotoViewer's rule, kept.)
	$effect(() => {
		if (!stageEl || !dialogOpen) return;
		const detach = attachPanZoom(stageEl, panZoomHost);
		return () => detach();
	});

	// --- the animated Fit (a direct pan or zoom is never animated) ----------
	const reducedMotion = () =>
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	let animToken = 0;
	function cancelAnim() {
		animToken++;
	}
	function animateTo(ns: number, ntx: number, nty: number) {
		cancelAnim();
		const token = animToken;
		const s0 = s;
		const x0 = tx;
		const y0 = ty;
		const T = 220;
		const start = performance.now();
		// rAF OR a timeout, never rAF alone: a throttled window never ticks rAF.
		const tick = (cb: () => void) => {
			let fired = false;
			const once = () => {
				if (fired || token !== animToken) return;
				fired = true;
				cb();
			};
			requestAnimationFrame(once);
			setTimeout(once, 40);
		};
		const step = () => {
			if (token !== animToken) return;
			const t = Math.min(1, (performance.now() - start) / T);
			const e = 1 - Math.pow(1 - t, 3);
			s = s0 + (ns - s0) * e;
			tx = x0 + (ntx - x0) * e;
			ty = y0 + (nty - y0) * e;
			if (t < 1) tick(step);
		};
		tick(step);
	}

	function fit() {
		if (!naturalW || !naturalH) return;
		const f = fitViewOf(stageBox, contentBox);
		if (reducedMotion()) {
			cancelAnim();
			s = f.s;
			tx = f.tx;
			ty = f.ty;
		} else {
			animateTo(f.s, f.tx, f.ty);
		}
	}

	function zoomIn() {
		cancelAnim();
		panZoomHost.setView(zoomCentre(panZoomHost, LIGHTBOX_ZOOM_STEP));
	}
	function zoomOut() {
		cancelAnim();
		panZoomHost.setView(zoomCentre(panZoomHost, 1 / LIGHTBOX_ZOOM_STEP));
	}
	function pan(direction: 'left' | 'right' | 'up' | 'down') {
		cancelAnim();
		panZoomHost.setView(lightboxPan({ s, tx, ty }, direction, stageBox, contentBox));
	}

	// --- paging, keys, open and close ---------------------------------------
	function go(i: number) {
		if (i >= 0 && i < images.length && i !== index) onIndex(i);
	}
	const goPrev = () => index !== null && go(index - 1);
	const goNext = () => index !== null && go(index + 1);

	function onShellKeydown(e: KeyboardEvent) {
		// A key typed into a control inside the bar (a notebook toggle is a
		// button, but a caller's snippet could hold anything) is that control's.
		const target = e.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
		const action = lightboxKeyAction(e.key, e.shiftKey);
		if (!action) return;
		e.preventDefault();
		if (action === 'prev') goPrev();
		else if (action === 'next') goNext();
		else if (action === 'first') go(0);
		else if (action === 'last') go(images.length - 1);
		else if (action === 'zoom-in') zoomIn();
		else if (action === 'zoom-out') zoomOut();
		else if (action === 'fit') fit();
		else if (action === 'pan-left') pan('left');
		else if (action === 'pan-right') pan('right');
		else if (action === 'pan-up') pan('up');
		else if (action === 'pan-down') pan('down');
	}

	// EVERY DELIBERATE CLOSE TELLS THE PARENT DIRECTLY and does not wait for
	// the dialog's own `close` event to come back round: the parent setting
	// `index` to null is what the effect below reads to call close().
	function requestClose() {
		onClose();
	}

	// ESCAPE IS THE ONE CLOSE WE DO NOT DRIVE, so it is the one that needs the
	// dialog's own `close` event -- wired with addEventListener, because
	// `close` does not bubble and Svelte's delegated attribute form never
	// fires for it (CLAUDE.md, the Browser pane traps).
	function handleNativeClose() {
		dialogOpen = false;
		onClose();
	}

	$effect(() => {
		const el = dialogEl;
		if (!el) return;
		el.addEventListener('close', handleNativeClose);
		return () => el.removeEventListener('close', handleNativeClose);
	});

	$effect(() => {
		const el = dialogEl;
		if (!el) return;
		if (index !== null && !el.open) {
			el.showModal();
			dialogOpen = true;
		} else if (index === null && el.open) {
			el.close();
			dialogOpen = false;
		}
	});
</script>

<dialog
	bind:this={dialogEl}
	class="lb-dialog"
	aria-label={label}
	onkeydown={onShellKeydown}
	data-testid={testId}
>
	{#if current}
		<div class="lb-shell">
			<div class="lb-top">
				<span class="lb-caption" data-testid="{testId}-caption">
					<span class="lb-name">{current.caption || current.alt}</span>
					{#if countLabel}<span class="lb-count" data-testid="{testId}-count">{countLabel}</span>{/if}
				</span>
				{#if current.downloadHref}
					<a
						class="lb-btn"
						href={current.downloadHref}
						download={current.downloadName ?? ''}
						data-testid="{testId}-download"
					>
						<span class="lb-glyph" aria-hidden="true">&#8595;</span> Download
					</a>
				{/if}
				<button type="button" class="lb-btn lb-close" onclick={requestClose} data-testid="{testId}-close">
					<span class="lb-glyph" aria-hidden="true">&#10005;</span> Close
				</button>
			</div>

			<div class="lb-stage" bind:this={stageEl} data-testid="{testId}-stage">
				{#if shownId && broken[shownId]}
					<div class="lb-broken" data-testid="{testId}-broken">
						<p>This picture could not be loaded.</p>
						<div class="lb-broken-actions">
							<button type="button" class="lb-btn" onclick={retry}>Try again</button>
							{#if current.openHref}
								<a class="lb-link" href={current.openHref} target="_blank" rel="noopener noreferrer"
									>{current.openLabel ?? 'Open the file'}</a
								>
							{/if}
						</div>
					</div>
				{:else}
					{#if !naturalW || !naturalH}
						<div class="lb-loading"><Pending label="Loading the picture" /></div>
					{/if}
					<div
						class="lb-world"
						style:width="{naturalW}px"
						style:height="{naturalH}px"
						style:transform="translate({tx}px, {ty}px) scale({s})"
					>
						<img
							src={shownSrc}
							alt={current.alt}
							onload={onImgLoad}
							onerror={onImgError}
							draggable="false"
							data-testid="{testId}-img"
						/>
					</div>
				{/if}
			</div>

			<div class="lb-bottom">
				{#if images.length > 1}
					<span class="lb-group" role="group" aria-label="Pictures">
						<button
							type="button"
							class="lb-btn"
							onclick={goPrev}
							aria-disabled={index === null || index <= 0}
							data-testid="{testId}-prev"
						>
							<span class="lb-glyph" aria-hidden="true">&#8249;</span> Previous
						</button>
						<button
							type="button"
							class="lb-btn"
							onclick={goNext}
							aria-disabled={index === null || index >= images.length - 1}
							data-testid="{testId}-next"
						>
							Next <span class="lb-glyph" aria-hidden="true">&#8250;</span>
						</button>
					</span>
				{/if}

				<!-- No zoom over a picture that did not load: three controls whose
				     only outcome is nothing, beside the sentence saying why. -->
				{#if !(shownId && broken[shownId])}
					<span class="lb-group" role="group" aria-label="Zoom">
						<button type="button" class="lb-btn" onclick={zoomOut} data-testid="{testId}-zoom-out">
							<span class="lb-glyph" aria-hidden="true">&minus;</span> Zoom out
						</button>
						<button type="button" class="lb-btn" onclick={fit} data-testid="{testId}-fit">Fit</button>
						<button type="button" class="lb-btn" onclick={zoomIn} data-testid="{testId}-zoom-in">
							<span class="lb-glyph" aria-hidden="true">+</span> Zoom in
						</button>
					</span>
				{/if}

				{#if canPan}
					<!-- THE SINGLE-POINTER ALTERNATIVE TO DRAGGING (WCAG 2.5.7). The
					     word "Move" is the group's visible label; each arrow names
					     its direction for a reader, and only a direction the
					     picture overflows in is offered. -->
					<span class="lb-group lb-pan" role="group" aria-label="Move the picture" data-testid="{testId}-pan">
						<span class="lb-group-word" aria-hidden="true">Move</span>
						{#if panAxes.x}
							<button type="button" class="lb-btn lb-square" onclick={() => pan('left')} aria-label="Move left">&#8592;</button>
						{/if}
						{#if panAxes.y}
							<button type="button" class="lb-btn lb-square" onclick={() => pan('up')} aria-label="Move up">&#8593;</button>
							<button type="button" class="lb-btn lb-square" onclick={() => pan('down')} aria-label="Move down">&#8595;</button>
						{/if}
						{#if panAxes.x}
							<button type="button" class="lb-btn lb-square" onclick={() => pan('right')} aria-label="Move right">&#8594;</button>
						{/if}
					</span>
				{/if}

				{#if controls}
					<span class="lb-group">{@render controls()}</span>
				{/if}
			</div>
		</div>
	{/if}
</dialog>

<style>
	.lb-dialog {
		width: 100vw;
		height: 100vh;
		height: 100dvh;
		max-width: 100vw;
		max-height: 100vh;
		max-height: 100dvh;
		margin: 0;
		padding: 0;
		border: none;
		background: var(--surface-0, var(--bg0));
		color: var(--text-1, var(--white));
	}
	/* Given its own value: a ::backdrop does not reliably inherit from the
	   dialog's parent. */
	.lb-dialog::backdrop {
		background: rgba(6, 5, 3, 0.78);
	}

	.lb-shell {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
	}

	.lb-top,
	.lb-bottom {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.5rem max(0.75rem, env(safe-area-inset-left));
		background: var(--surface-1, var(--bg1));
		border-bottom: 1px solid var(--hairline);
	}
	.lb-bottom {
		border-bottom: none;
		border-top: 1px solid var(--hairline);
		justify-content: center;
		padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
	}

	/* ONE ROW AT 375: the name gives way (an ellipsis) and the count and the
	   two controls do not. A 12rem basis here put Close on a second row at
	   375, 44px of chrome taken from the picture. */
	.lb-top {
		flex-wrap: nowrap;
	}
	.lb-caption {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		align-items: baseline;
		font-weight: 600;
		font-size: 0.92rem;
	}
	.lb-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lb-count {
		margin-left: 0.5rem;
		font-family: var(--font-mono);
		font-weight: 400;
		font-size: 0.76rem;
		color: var(--text-2);
		flex: none;
		white-space: nowrap;
	}

	.lb-group {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.lb-group-word {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
		margin-right: 0.15rem;
	}

	/* THE STAGE IS A DARK ISLAND IN EVERY THEME: a photograph reads best on
	   near-black, and this is the one part of the viewer that is not chrome.
	   Its pending line gets a light ink through Pending's own room hook, or it
	   would paint a light theme's dark `--text-2` onto near-black. */
	.lb-stage {
		flex: 1 1 auto;
		min-height: 0;
		position: relative;
		overflow: hidden;
		background: #0b0a08;
		touch-action: none;
		cursor: grab;
		--pending-ink: #cfcac0;
	}
	.lb-stage:active {
		cursor: grabbing;
	}

	.lb-world {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
	}
	.lb-world img {
		display: block;
		width: 100%;
		height: 100%;
		user-select: none;
		-webkit-user-drag: none;
	}

	.lb-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.lb-broken {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		gap: 0.75rem;
		padding: 1rem;
		text-align: center;
		color: #e8e3d8;
	}
	.lb-broken p {
		margin: 0;
	}
	.lb-broken-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		justify-content: center;
	}
	.lb-link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: #e8e3d8;
		font-size: 0.85rem;
	}

	/* 44px, stated as a box: this viewer is used on a phone as often as on a
	   projector, and it is student-facing. The edge is a control's outer edge,
	   so it takes the load-bearing `--boundary`. */
	.lb-btn {
		min-width: 44px;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		padding: 0 0.8rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 8px);
		background: var(--surface-2, var(--bg2));
		color: var(--text-1, var(--white));
		font: inherit;
		font-size: 0.85rem;
		line-height: 1.1;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
	}
	.lb-btn:hover:not([aria-disabled='true']) {
		border-color: var(--lb-accent, var(--green));
	}
	.lb-btn:focus-visible {
		outline: 2px solid var(--lb-accent, var(--green));
		outline-offset: 2px;
	}
	.lb-btn[aria-disabled='true'] {
		opacity: 0.45;
		cursor: default;
	}
	.lb-square {
		padding: 0;
		font-size: 1rem;
	}
	.lb-glyph {
		font-size: 1rem;
		line-height: 1;
	}
</style>
