<script lang="ts">
	import { onDestroy } from 'svelte';
	import PhotoCorrector from '$lib/notebook/PhotoCorrector.svelte';
	import CameraCapture from '$lib/notebook/CameraCapture.svelte';
	import {
		cameraCaptureSupported,
		clearPendingCapture,
		preferredCapturePath,
		rememberPendingCapture,
		unusableReason,
		type CapturePath
	} from '$lib/notebook/camera';
	import { photoCountLabel, type StagedPhoto } from '$lib/notebook';

	/**
	 * Picking, screening, correcting and previewing photos before they are
	 * saved -- the whole capture half of the notebook, in one place.
	 *
	 * WHY IT IS ITS OWN COMPONENT NOW. It began as part of the add-an-entry
	 * form, but an entry you can keep ADDING to needs the identical flow from a
	 * second place: the entry's own panel in the feed. Copying it there would
	 * have meant two copies of the Android capture-path decision, the
	 * empty/truncated-file screen, the one-at-a-time correction queue and the
	 * blob-URL bookkeeping -- exactly the kind of duplicate that quietly stops
	 * matching. So it moved here verbatim and BOTH callers mount this.
	 *
	 * It owns everything up to and including a staged list; it does not know
	 * what a staged photo is FOR. Uploading, sequencing and which entry the
	 * photos belong to all stay with the caller.
	 *
	 * The one thing it deliberately does not do is READ the pending-capture
	 * marker it writes. A page can hold several stagers, and only one reader
	 * can consume a marker that clears itself -- so it records context on the
	 * capture click and NotebookView, the single reader, decides where the
	 * student should land.
	 */
	let {
		staged = $bindable(),
		settling = $bindable(false),
		disabled = false,
		uploadReady = true,
		captureContext = undefined,
		testPrefix = 'nb'
	}: {
		staged: StagedPhoto[];
		/**
		 * True while a picked photo is being screened or corrected. Pushed out
		 * rather than read back in, so the caller can disable its own submit
		 * with plain reactive state instead of reaching into this component.
		 */
		settling?: boolean;
		disabled?: boolean;
		/** False disables every capture control: photo storage is not configured. */
		uploadReady?: boolean;
		/** Snapshotted before the OS camera takes over; see NotebookView. */
		captureContext?: unknown;
		/** Distinguishes this stager's hooks when a page mounts more than one. */
		testPrefix?: string;
	} = $props();

	/** Picked but not yet through the correction step; corrected one at a time. */
	let correctionQueue = $state<File[]>([]);
	let correctionNote = $state<string | null>(null);
	/**
	 * Two inputs, not one, and the split matters on Android.
	 *
	 * `capture` makes an input camera-ONLY there: the browser fires a capture
	 * intent and the gallery is simply not offered, so a single input carrying
	 * it leaves an Android student with no way to attach a photo they already
	 * took. Splitting gives each control one job -- and lets the shoot input
	 * drop `multiple`, which is meaningless next to `capture` (a capture
	 * returns exactly one file) and whose behaviour alongside it is
	 * unspecified.
	 */
	let captureInput = $state<HTMLInputElement | null>(null);
	let pickInput = $state<HTMLInputElement | null>(null);
	/** The in-app camera overlay. */
	let cameraOpen = $state(false);
	let cameraSupported = $state(false);
	/**
	 * Which capture control LEADS on this device. Android leads with the
	 * in-app camera because the native one is confirmed broken there; every
	 * other platform leads with the native one. Both stay reachable either
	 * way, and "Choose a photo" is unaffected on all of them -- picking an
	 * existing photo is a different capability, not a different way of doing
	 * the same thing.
	 */
	let capturePath = $state<CapturePath>('native');
	/** Why the in-app camera could not be used, shown next to the buttons. */
	let cameraMsg = $state<string | null>(null);
	/** A capture that arrived empty or damaged, named so it can be retaken. */
	let rejectedNote = $state<string | null>(null);
	/** Staging a photo decodes it to check it is usable, which is not instant. */
	let checking = $state(false);

	const correcting = $derived(correctionQueue[0] ?? null);

	$effect(() => {
		settling = correctionQueue.length > 0 || checking;
	});

	$effect(() => {
		cameraSupported = cameraCaptureSupported();
		capturePath = preferredCapturePath(navigator.userAgent, cameraSupported);
	});

	function onFilesChosen(e: Event) {
		// Captured synchronously: `currentTarget` is null once dispatch ends,
		// and everything below this awaits.
		const input = e.currentTarget as HTMLInputElement;
		const picked = Array.from(input.files ?? []);
		// Clear the input so re-picking the same file still fires a change.
		input.value = '';
		// The capture came back, so there is nothing for the next page load to
		// recover. (A cancelled capture is cleared by the visibility handler
		// instead: the page surviving is itself the proof nothing was lost.)
		clearPendingCapture();
		void queueForCorrection(picked);
	}

	/**
	 * The one way a photo reaches the correction queue, from any source.
	 *
	 * Files are screened first, because a camera intent can return
	 * "successfully" with an empty or truncated file. Staging one of those
	 * looks completely normal right up until Save, where it fails at the
	 * upload route complaining about a missing form field -- so the student
	 * ends up staring at a photo they can see, being told there isn't one.
	 * Rejecting it here names the file and says to retake it.
	 */
	async function queueForCorrection(files: File[]) {
		if (!files.length) return;
		correctionNote = null;
		cameraMsg = null;
		rejectedNote = null;
		checking = true;
		try {
			const usable: File[] = [];
			const rejected: string[] = [];
			for (const f of files) {
				const reason = await unusableReason(f);
				if (reason) rejected.push(`${f.name || 'That photo'} ${reason}`);
				else usable.push(f);
			}
			if (rejected.length) rejectedNote = rejected.join(' ');
			// Every usable photo queues for its OWN correction step (one at a
			// time, in order); it lands in `staged` only once corrected or skipped.
			if (usable.length) correctionQueue = [...correctionQueue, ...usable];
		} finally {
			checking = false;
		}
	}

	/**
	 * Snapshot the caller's context before the OS camera app takes over, so a
	 * browser killed for memory while it is in front does not also cost the
	 * student what they had typed. Fires on the CLICK, the last moment this
	 * code is guaranteed to run.
	 */
	function onCaptureClick() {
		if (captureContext !== undefined) rememberPendingCapture(captureContext);
	}

	function openCamera() {
		cameraMsg = null;
		cameraOpen = true;
	}

	function cameraCaptured(file: File) {
		cameraOpen = false;
		// Same screening as a picked file: one route in, one set of rules.
		void queueForCorrection([file]);
	}

	function cameraFailed(message: string) {
		cameraOpen = false;
		cameraMsg = message;
		// On Android the in-app camera is what this device leads with, so
		// losing it is worth saying plainly rather than leaving the student to
		// find the smaller fallback link on their own.
		if (capturePath === 'in-app') {
			cameraMsg += ' You can also use your phone’s own camera app below.';
		}
	}

	function correctionDone(enhanced: File | null, failed = false) {
		const file = correctionQueue[0];
		if (!file) return;
		staged = [...staged, { file, enhanced }];
		correctionQueue = correctionQueue.slice(1);
		if (failed) {
			correctionNote = `${file.name} could not be opened for correction; it will upload as-is.`;
		}
	}

	function removeStaged(i: number) {
		staged = staged.filter((_, j) => j !== i);
	}

	/** Clears everything: the caller calls this after a successful save. */
	export function reset() {
		staged = [];
		correctionQueue = [];
		correctionNote = null;
		cameraMsg = null;
		rejectedNote = null;
		if (captureInput) captureInput.value = '';
		if (pickInput) pickInput.value = '';
	}

	// ---- staged thumbnails -------------------------------------------------

	/**
	 * Blob URLs for the staged photos, so the student sees the PHOTOS they are
	 * about to commit rather than a list of filenames -- which say nothing
	 * about whether the page is in frame, in focus, or even the right page.
	 *
	 * The thumbnail is the CORRECTED version whenever one exists, matching how
	 * a saved entry renders everywhere else in the app (NotebookPhotos shows
	 * the enhanced variant by default). Correction needs no toggle here: that
	 * choice already exists at display time, and this step is "is this the
	 * photo I want", not "which version".
	 *
	 * The cache is a plain Map, deliberately NOT reactive: the effect below
	 * reads `staged` and writes `previews`, and routing the URLs through
	 * reactive state as well would have it re-trigger on its own writes.
	 */
	const urlCache = new Map<File, string>();
	let previews = $state<string[]>([]);

	/** Which file a tile actually shows: corrected wins over the original. */
	function shownFile(s: StagedPhoto): File {
		return s.enhanced ?? s.file;
	}

	$effect(() => {
		const wanted = staged.map(shownFile);
		const live = new Set(wanted);
		for (const [file, url] of urlCache) {
			if (!live.has(file)) {
				URL.revokeObjectURL(url);
				urlCache.delete(file);
			}
		}
		previews = wanted.map((file) => {
			let url = urlCache.get(file);
			if (!url) {
				url = URL.createObjectURL(file);
				urlCache.set(file, url);
			}
			return url;
		});
	});

	// Leaving the page mid-entry must not leak the blobs still held open.
	onDestroy(() => {
		for (const url of urlCache.values()) URL.revokeObjectURL(url);
		urlCache.clear();
	});

	/**
	 * A thumbnail that cannot render (a HEIC this browser will not decode is
	 * the ordinary case) falls back to naming the file, so the tile still
	 * says which photo it is instead of showing a broken-image glyph.
	 */
	let unrenderable = $state<Set<string>>(new Set());
	function thumbFailed(url: string) {
		if (unrenderable.has(url)) return;
		unrenderable = new Set(unrenderable).add(url);
	}
</script>

{#if rejectedNote}
	<p class="feedback error" role="alert" data-testid="{testPrefix}-rejected">{rejectedNote}</p>
{/if}
{#if correctionNote}
	<p class="feedback error" role="status">{correctionNote}</p>
{/if}

<div class="field photo-field">
	<span class="photo-label">Photos</span>
	<!--
		Take vs choose are separate controls on purpose. `capture` turns an
		input camera-only on Android, so one combined input carrying it leaves
		no way to attach an existing photo there. The shoot input drops
		`multiple` (a capture returns one file); the pick input keeps it, since
		multi-select is a picker ability.
	-->
	<div class="photo-buttons">
		{#if capturePath === 'in-app'}
			<!-- Android leads with the in-app camera: the native input is
			     confirmed broken on a real device there. -->
			<button
				type="button"
				class="photo-btn"
				data-testid="{testPrefix}-capture-primary"
				onclick={openCamera}
				disabled={disabled || !uploadReady}
			>
				<span>Take a photo</span>
			</button>
		{:else}
			<label class="photo-btn" data-testid="{testPrefix}-capture-primary">
				<span>Take a photo</span>
				<input
					bind:this={captureInput}
					type="file"
					accept="image/*"
					capture="environment"
					onclick={onCaptureClick}
					onchange={onFilesChosen}
					disabled={disabled || !uploadReady}
				/>
			</label>
		{/if}
		<!-- Gallery is a DIFFERENT capability, not a different way of
		     capturing, so it is equally prominent on every platform. -->
		<label class="photo-btn secondary" data-testid="{testPrefix}-pick">
			<span>Choose a photo</span>
			<input
				bind:this={pickInput}
				type="file"
				accept="image/*"
				multiple
				onchange={onFilesChosen}
				disabled={disabled || !uploadReady}
			/>
		</label>
	</div>
	<span class="hint gallery-hint">
		Someone else took the photo? Get it onto this device (text, AirDrop, email) and pick it from
		here.
	</span>

	{#if capturePath === 'in-app'}
		<!--
			The native path, demoted rather than removed. It is confirmed broken
			on at least one real Android device (opens the front camera; the
			photo never lands), and Android browsers are documented to ignore
			the `capture` value regardless -- so it must not look like the normal
			thing to tap. It stays because the OS camera takes a better photo
			when it does work, and another device may not share the fault. The
			label says what is known rather than hiding it.
		-->
		<label class="native-fallback" data-testid="{testPrefix}-native-fallback">
			<span
				>Use your phone’s camera app instead (known to open the wrong camera on some Android
				phones)</span
			>
			<input
				bind:this={captureInput}
				type="file"
				accept="image/*"
				capture="environment"
				onclick={onCaptureClick}
				onchange={onFilesChosen}
				disabled={disabled || !uploadReady}
			/>
		</label>
	{:else if cameraSupported}
		<!--
			The escape hatch on platforms that lead with the native input: iOS
			honours the facing hint, but if a device does open the wrong lens
			this constrains it for real and offers a switch. Not the default
			there, because iOS Safari serves getUserMedia at roughly 720p and a
			page has to stay legible.
		-->
		<button
			type="button"
			class="in-app-camera"
			data-testid="{testPrefix}-in-app-camera"
			onclick={openCamera}
			disabled={disabled || !uploadReady}
		>
			Camera opened the wrong way round? Use the in-app camera
		</button>
	{/if}
	{#if cameraMsg}
		<p class="feedback error" role="status" data-testid="{testPrefix}-camera-msg">{cameraMsg}</p>
	{/if}
	<span class="hint">
		{#if checking}
			Checking the photo...
		{:else}
			JPEG, PNG, WebP, or HEIC. Large photos are shrunk to fit before they upload, and you can
			straighten and clean up each one first.
		{/if}
	</span>
</div>

{#if staged.length}
	<!-- The whole staged set at once, as PICTURES: three photos queued means
	     three thumbnails, so the page in frame (or not) is visible before
	     anything is committed. -->
	<div class="staged-head">
		<span class="photo-label">Ready to save</span>
		<span class="staged-count">{photoCountLabel(staged.length)}</span>
	</div>
	<ul class="staged" data-testid="{testPrefix}-staged">
		{#each staged as s, i (shownFile(s).name + i)}
			<li class="staged-item">
				<div class="thumb">
					{#if previews[i] && !unrenderable.has(previews[i])}
						<img
							src={previews[i]}
							alt={`Photo ${i + 1}: ${shownFile(s).name}`}
							data-testid="{testPrefix}-thumb"
							onerror={() => thumbFailed(previews[i])}
						/>
					{:else}
						<!-- Undecodable here (a HEIC off an iPhone is the ordinary
						     case). It still uploads fine; name it rather than
						     showing a broken-image glyph. -->
						<span class="thumb-fallback" data-testid="{testPrefix}-thumb-fallback">
							{shownFile(s).name}
						</span>
					{/if}
					<span class="staged-n">{i + 1}</span>
					{#if s.enhanced}
						<span class="staged-tag" data-testid="{testPrefix}-thumb-corrected">corrected</span>
					{/if}
				</div>
				<button type="button" class="remove" onclick={() => removeStaged(i)} disabled={disabled}>
					Remove
				</button>
			</li>
		{/each}
	</ul>
{/if}

{#if cameraOpen}
	<CameraCapture onCapture={cameraCaptured} onCancel={() => (cameraOpen = false)} onError={cameraFailed} />
{/if}

{#if correcting}
	<!-- One photo at a time, in pick order; keyed so a new file remounts the
	     corrector fresh (its own detection, its own corners). -->
	{#key correcting}
		<PhotoCorrector
			file={correcting}
			index={staged.length + 1}
			total={staged.length + correctionQueue.length}
			onDone={correctionDone}
		/>
	{/key}
{/if}

<style>
	.feedback {
		font-size: 0.84rem;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-control);
		margin-bottom: var(--space-4);
	}
	.feedback.error {
		color: var(--nb-error);
		border: 1px solid color-mix(in srgb, var(--nb-error) 40%, transparent);
		background: color-mix(in srgb, var(--nb-error) 5%, transparent);
	}
	.hint {
		display: block;
		color: var(--text-3);
		font-size: 0.8rem;
		margin-top: var(--space-1);
	}
	.photo-field {
		margin-top: var(--space-4);
		/* The shared .field class is a ROW flex. Everything in here is written
		   to stack (the label and the hint both carry vertical margins), and a
		   row silently spreads them across the viewport instead -- which is
		   what pushed the hint off the right edge at phone width once this
		   block grew past three children. Say the direction out loud. */
		display: flex;
		flex-direction: column;
		align-items: stretch;
	}
	.photo-label {
		display: block;
		margin-bottom: var(--space-1);
		font-weight: 600;
	}
	/* Two real, thumb-sized targets rather than a bare file input: this is a
	   phone-first flow, and the native control renders as a small button with
	   a filename beside it that is easy to miss and hard to hit. */
	.photo-buttons {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: var(--space-2);
	}
	.photo-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 3rem;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--nb-accent);
		border-radius: var(--radius-control);
		background: var(--nb-accent-wash);
		color: var(--nb-accent-ink);
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		text-align: center;
	}
	.photo-btn.secondary {
		border-color: var(--nb-hairline-strong);
		background: var(--surface-2);
		color: var(--text-1);
	}
	.photo-btn:hover {
		border-color: var(--nb-accent-ink);
	}
	/* The input still does the work; it is only visually replaced by its
	   label, so the native picker and keyboard activation are untouched. */
	.photo-btn input[type='file'] {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.photo-btn:has(input:disabled) {
		opacity: 0.5;
		cursor: default;
	}
	.in-app-camera {
		display: block;
		margin-top: var(--space-2);
		padding: 0;
		background: none;
		border: none;
		color: var(--text-3);
		font: inherit;
		font-size: 0.8rem;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.in-app-camera:hover:not(:disabled) {
		color: var(--nb-accent-ink);
	}
	.in-app-camera:disabled {
		opacity: 0.5;
		cursor: default;
	}
	/* The native capture path where it has been demoted (Android): still a
	   real control, deliberately not a peer of the two buttons above it. */
	.native-fallback {
		display: block;
		margin-top: var(--space-2);
		color: var(--text-3);
		font-size: 0.8rem;
		line-height: 1.35;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.native-fallback:hover {
		color: var(--nb-accent-ink);
	}
	.native-fallback input[type='file'] {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.native-fallback:has(input:disabled) {
		opacity: 0.5;
		cursor: default;
	}

	/* ---- staged photos: pictures, not filenames ---- */
	.staged-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
		margin: var(--space-4) 0 var(--space-2);
	}
	.staged-head .photo-label {
		margin-bottom: 0;
	}
	.staged-count {
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-3);
	}
	.staged {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		/* 7rem is what puts TWO across a 375px phone (one per row made three
		   staged photos a ~1100px scroll, which defeats seeing the set at a
		   glance) while still giving three across the desktop column. */
		grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
		gap: var(--space-3);
	}
	.staged-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.thumb {
		position: relative;
		aspect-ratio: 3 / 4;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-2);
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		/* CONTAIN, not cover. The whole point of this preview is judging
		   whether the page is fully in frame, and cropping to fill the tile
		   would hide a cut-off edge -- the exact mistake it exists to catch. */
		object-fit: contain;
		display: block;
	}
	.thumb-fallback {
		padding: var(--space-2);
		font-size: 0.74rem;
		line-height: 1.3;
		color: var(--text-2);
		text-align: center;
		overflow-wrap: anywhere;
	}
	.staged-n {
		position: absolute;
		top: 0.3rem;
		left: 0.3rem;
		min-width: 1.25rem;
		height: 1.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		/* Reads over an arbitrary photo, so it carries its own ground. */
		color: var(--nb-shot-ink);
		background: var(--nb-shot-scrim);
	}
	.staged-tag {
		position: absolute;
		bottom: 0.3rem;
		left: 0.3rem;
		right: 0.3rem;
		text-align: center;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--nb-accent);
		background: var(--nb-shot-scrim);
		border-radius: 999px;
		padding: var(--space-1);
	}
	.remove {
		background: none;
		border: none;
		padding: 0;
		color: var(--text-3);
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		text-align: center;
	}
	.remove:hover:not(:disabled) {
		color: var(--nb-error);
	}
</style>
