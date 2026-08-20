<script lang="ts">
	/**
	 * Full-screen photo viewer, mounted by NotebookPhotos so it appears wherever
	 * that component does -- the student feed, the instructor review panel, the
	 * per-student staff page, and the view-as preview alike. There is exactly one
	 * of these per NotebookPhotos instance; NotebookPhotos owns which page (if
	 * any) is open and hands it down as `index`.
	 *
	 * Pan and zoom are the extracted engine ($lib/panzoom): this component reads
	 * and writes the shared view through the SAME PanZoomHost contract
	 * DrawingViewer.svelte uses, so the arithmetic is not reimplemented here.
	 *
	 * A NATIVE <dialog> with showModal is deliberate, not a styled overlay div.
	 * The review console's detail pane is a scroll container with a max-height,
	 * so anything not promoted to the top layer gets clipped by it; showModal
	 * also brings the focus trap, the Escape handler, and an inert background
	 * for free. Authored inside the notebook tree (never hoisted to <body>), so
	 * the --nb-* palette reaches it by ordinary inheritance even though the
	 * dialog itself renders in the top layer.
	 *
	 * The stage background is a fixed near-black regardless of palette -- the
	 * PhotoCorrector's "deliberate dark island" convention (notebook-theme.css),
	 * applied here for the same reason: the chrome around it should read as the
	 * notebook, but the surface a photograph sits on should not fight it for
	 * legibility. ::backdrop is given its own explicit value for the same reason
	 * the header comment on it explains -- it does not reliably inherit from the
	 * dialog's parent.
	 */
	import { attachPanZoom, zoomCentre, type PanZoomHost } from '$lib/panzoom/controller';
	import { fitView as fitViewOf, type Size, type View } from '$lib/panzoom/transform';
	import { driveOpenUrl, pageKey, pagePhoto, photoSrc, type PhotoPage } from '$lib/notebook';

	let {
		pages,
		index,
		label,
		onIndex,
		onClose
	}: {
		pages: PhotoPage[];
		/** null = closed. A valid index into `pages` opens the dialog on that page. */
		index: number | null;
		/** The entry's display title, used for the alt text and the caption. */
		label: string;
		onIndex: (i: number) => void;
		onClose: () => void;
	} = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let stageEl = $state<HTMLDivElement | null>(null);
	/** Mirrors `dialogEl.open`, but as reactive $state -- see the panzoom-wiring
	 *  effect below for why a plain DOM property read is not enough here. */
	let dialogOpen = $state(false);

	// --- the current page -------------------------------------------------
	const currentPage = $derived<PhotoPage | null>(index !== null ? (pages[index] ?? null) : null);
	let showOriginal = $state<Record<string, boolean>>({});
	const currentKey = $derived(currentPage ? pageKey(currentPage) : null);
	const viewingOriginal = $derived(currentKey ? showOriginal[currentKey] === true : false);
	const photo = $derived(currentPage ? pagePhoto(currentPage, viewingOriginal) : null);
	const paired = $derived(
		currentPage ? currentPage.original !== null && currentPage.enhanced !== null : false
	);

	function setVariant(original: boolean) {
		if (!currentKey) return;
		showOriginal = { ...showOriginal, [currentKey]: original };
	}

	let broken = $state<Record<string, true>>({});
	let retryTick = $state<Record<string, number>>({});

	function retry(photoId: string) {
		retryTick = { ...retryTick, [photoId]: (retryTick[photoId] ?? 0) + 1 };
		const { [photoId]: _dropped, ...rest } = broken;
		broken = rest;
	}

	// --- the shared view transform -----------------------------------------
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

	// A new displayed photo (page change, or a Corrected/Original toggle) means
	// unknown dimensions and an un-fitted view -- there is nothing to preserve
	// across a swap, unlike a resize.
	let lastPhotoId: string | null = null;
	$effect(() => {
		const id = photo?.id ?? null;
		if (id === lastPhotoId) return;
		lastPhotoId = id;
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
		if (photo) broken = { ...broken, [photo.id]: true };
	}

	// First fit, strictly once both the stage and the intrinsic dimensions are
	// known -- the DrawingViewer "fit-after-measure" gate, minus the reveal.
	$effect(() => {
		if (naturalW > 0 && naturalH > 0 && W > 0 && H > 0 && !fitted) {
			const f = fitViewOf(stageBox, contentBox);
			s = f.s;
			tx = f.tx;
			ty = f.ty;
			fitted = true;
		}
	});

	// Wiring panzoom is gated on `dialogOpen`, not merely on `stageEl` existing.
	// A <dialog> without [open] is `display: none` by the UA stylesheet, so a
	// `.pv-stage` created BEFORE showModal() runs has a collapsed 0x0 box --
	// attachPanZoom's own synchronous first measurement would capture that
	// zero, and DrawingViewer's stage (never gated behind a dialog) never hits
	// this. `dialogOpen` is stamped true in the SAME effect that calls
	// showModal(), so Svelte's cascading re-run guarantees this effect cannot
	// fire until the dialog is actually laid out -- an ordering GUARANTEE,
	// not a hope that the ResizeObserver's later correction arrives in time.
	$effect(() => {
		if (!stageEl || !dialogOpen) return;
		const detach = attachPanZoom(stageEl, panZoomHost);
		return () => detach();
	});

	// --- animated "Fit" (direct pan/zoom from the engine is never animated) --
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

	function fitClick() {
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
		panZoomHost.setView(zoomCentre(panZoomHost, 1.4));
	}
	function zoomOut() {
		cancelAnim();
		panZoomHost.setView(zoomCentre(panZoomHost, 1 / 1.4));
	}

	// --- paging + open/close -------------------------------------------------
	function goPrev() {
		if (index !== null && index > 0) onIndex(index - 1);
	}
	function goNext() {
		if (index !== null && index < pages.length - 1) onIndex(index + 1);
	}

	// Every DELIBERATE close (the Close button, Prev/Next never triggers this)
	// tells the parent DIRECTLY -- it does not wait for the dialog's own `close`
	// event to come back around. The parent setting `index` to null is what the
	// effect below reads to actually call `dialogEl.close()`, so a single call
	// to `onClose()` is authoritative for anything WE initiate.
	function requestClose() {
		onClose();
	}

	function onShellKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			goPrev();
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			goNext();
		}
	}

	// Escape is the ONE close path we do not drive ourselves -- the browser's
	// own default action closes the dialog with no call of ours in between --
	// so it is the one case that genuinely needs the dialog's own `close` event
	// to tell the parent. `onClose()` being called twice (once from here, once
	// from a WE-initiated close that already told the parent directly) is
	// harmless: setting `index` to null when it is already null is a no-op.
	//
	// WIRED WITH addEventListener, NOT a Svelte `onclose={...}` attribute --
	// `close` (and `cancel`) on <dialog> DELIBERATELY DO NOT BUBBLE (HTML spec),
	// and Svelte 5 delegates most DOM events through a listener on the app
	// root. A non-bubbling event never reaches that root listener, so the
	// attribute form silently never fires. The wheel listener in the panzoom
	// controller is attached the same explicit way for the same class of
	// reason (there it is passive:false; here it is bubbling).
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

<dialog bind:this={dialogEl} class="pv-dialog" aria-label={label} onkeydown={onShellKeydown}>
	{#if currentPage && photo}
		<div class="pv-shell">
			<div class="pv-top">
				<span class="pv-caption">
					{label}
					{#if pages.length > 1}<span class="pv-count">Page {currentPage.page} of {pages.length}</span
						>{/if}
				</span>
				<button type="button" class="pv-btn pv-close" onclick={requestClose} aria-label="Close photo viewer">
					&#10005;
				</button>
			</div>

			<div class="pv-stage" bind:this={stageEl}>
				{#if broken[photo.id]}
					<div class="pv-broken">
						<p>This photo could not be loaded.</p>
						<div class="pv-broken-actions">
							<button type="button" class="pv-btn" onclick={() => retry(photo.id)}>Try again</button>
							<a
								class="pv-drive-link"
								href={driveOpenUrl(photo.drive_file_id)}
								target="_blank"
								rel="noopener noreferrer">Open in Drive</a
							>
						</div>
					</div>
				{:else}
					{#if !naturalW || !naturalH}
						<p class="pv-loading">Loading photo&hellip;</p>
					{/if}
					<div
						class="pv-world"
						style:width="{naturalW}px"
						style:height="{naturalH}px"
						style:transform="translate({tx}px, {ty}px) scale({s})"
					>
						<img
							src={`${photoSrc(photo.id)}${retryTick[photo.id] ? `?r=${retryTick[photo.id]}` : ''}`}
							alt={pages.length > 1 ? `${label}, page ${currentPage.page}` : label}
							onload={onImgLoad}
							onerror={onImgError}
							draggable="false"
						/>
					</div>
				{/if}
			</div>

			<div class="pv-bottom">
				<button
					type="button"
					class="pv-btn"
					onclick={goPrev}
					disabled={index === null || index <= 0}
					aria-label="Previous photo"
				>
					&#8249;
				</button>
				{#if pages.length > 1}
					<span class="pv-page-indicator">{(index ?? 0) + 1} / {pages.length}</span>
				{/if}
				<button
					type="button"
					class="pv-btn"
					onclick={goNext}
					disabled={index === null || index >= pages.length - 1}
					aria-label="Next photo"
				>
					&#8250;
				</button>

				<span class="pv-divider" aria-hidden="true"></span>

				<button type="button" class="pv-btn" onclick={zoomOut} aria-label="Zoom out">&minus;</button>
				<button type="button" class="pv-btn pv-fit" onclick={fitClick} aria-label="Reset to fit">
					Fit
				</button>
				<button type="button" class="pv-btn" onclick={zoomIn} aria-label="Zoom in">+</button>

				{#if paired}
					<span class="pv-divider" aria-hidden="true"></span>
					<span class="pv-variant-toggle" role="group" aria-label="Photo version">
						<button
							type="button"
							class:on={!viewingOriginal}
							aria-pressed={!viewingOriginal}
							onclick={() => setVariant(false)}>Corrected</button
						>
						<button
							type="button"
							class:on={viewingOriginal}
							aria-pressed={viewingOriginal}
							onclick={() => setVariant(true)}>Original</button
						>
					</span>
				{/if}
			</div>
		</div>
	{/if}
</dialog>

<style>
	.pv-dialog {
		width: 100vw;
		height: 100vh;
		max-width: 100vw;
		max-height: 100vh;
		margin: 0;
		padding: 0;
		border: none;
		background: var(--surface-0);
		color: var(--text-1);
	}
	.pv-dialog::backdrop {
		background: rgba(6, 5, 3, 0.78);
	}

	.pv-shell {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
	}

	.pv-top,
	.pv-bottom {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-4);
		background: var(--surface-1);
		border-bottom: 1px solid var(--hairline);
	}
	.pv-bottom {
		border-bottom: none;
		border-top: 1px solid var(--hairline);
		justify-content: center;
	}

	.pv-caption {
		flex: 1 1 auto;
		min-width: 0;
		font-weight: 600;
		font-size: 0.92rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pv-count {
		margin-left: var(--space-2);
		font-weight: 400;
		font-size: 0.78rem;
		color: var(--text-3);
	}

	/* The stage is a deliberate dark island regardless of palette (the
	   PhotoCorrector convention): a photograph reads best on near-black, and
	   this is the one part of the viewer that is not "the notebook itself". */
	.pv-stage {
		flex: 1 1 auto;
		min-height: 0;
		position: relative;
		overflow: hidden;
		background: #0b0a08;
		touch-action: none;
	}

	.pv-world {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
	}
	.pv-world img {
		display: block;
		width: 100%;
		height: 100%;
		user-select: none;
		-webkit-user-drag: none;
	}

	.pv-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0;
		color: #cfcac0;
		font-size: 0.85rem;
	}

	.pv-broken {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		gap: var(--space-3);
		padding: var(--space-4);
		text-align: center;
		color: #e8e3d8;
	}
	.pv-broken p {
		margin: 0;
	}
	.pv-broken-actions {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		flex-wrap: wrap;
		justify-content: center;
	}
	.pv-drive-link {
		font-size: 0.78rem;
		color: #cfcac0;
	}
	.pv-drive-link:hover {
		color: var(--nb-accent-ink);
	}

	.pv-btn {
		min-width: 2.75rem;
		min-height: 2.75rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 var(--space-3);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		background: var(--surface-2);
		color: var(--text-1);
		font: inherit;
		font-size: 1rem;
		cursor: pointer;
	}
	.pv-btn:hover:not(:disabled) {
		border-color: var(--nb-accent-ink);
	}
	.pv-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.pv-fit {
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.pv-close {
		flex: 0 0 auto;
	}

	.pv-page-indicator {
		min-width: 3.4rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		font-size: 0.82rem;
		color: var(--text-3);
	}

	.pv-divider {
		width: 1px;
		align-self: stretch;
		background: var(--nb-hairline-strong);
	}

	.pv-variant-toggle {
		display: inline-flex;
		align-items: stretch;
		min-height: 2.75rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		overflow: hidden;
		background: var(--surface-2);
	}
	.pv-variant-toggle button {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		background: none;
		border: none;
		padding: 0 var(--space-4);
		font: inherit;
		font-size: 0.8rem;
		color: var(--text-3);
		cursor: pointer;
	}
	.pv-variant-toggle button.on {
		color: var(--nb-accent-ink);
		background: var(--nb-accent-wash);
		font-weight: 600;
	}
</style>
