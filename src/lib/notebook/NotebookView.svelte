<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import NotebookPhotos from '$lib/notebook/NotebookPhotos.svelte';
	import PhotoCorrector from '$lib/notebook/PhotoCorrector.svelte';
	import CameraCapture from '$lib/notebook/CameraCapture.svelte';
	import {
		cameraCaptureSupported,
		clearPendingCapture,
		fitForUpload,
		preferredCapturePath,
		rememberPendingCapture,
		takePendingCapture,
		unusableReason,
		type CapturePath
	} from '$lib/notebook/camera';
	import { onDestroy } from 'svelte';
	import '$lib/notebook/notebook-theme.css';
	import {
		entryTitle,
		flagReasonLabel,
		isUntitled,
		nearestOutstanding,
		newestFirst,
		orderedPhotos,
		outstandingSessions,
		photoCountLabel,
		photoPages,
		sessionMeta,
		showsStatus,
		statusLabel,
		todayIso,
		type AddPhotoResult,
		type CreateEntryResult,
		type NotebookEntry,
		type NotebookSession,
		type NotePayload
	} from '$lib/notebook';

	/**
	 * The whole student-facing notebook screen, factored out of /notebook so a
	 * dev harness mounts the SAME component against sample data (the
	 * CoinBalanceView / CoinDeskTool convention).
	 *
	 * It owns the UPLOAD SEQUENCING -- first photo creates the entry, every
	 * later photo is added to it -- but not the transport: `createEntry`,
	 * `addPhoto` and `createNote` are injected, so the real page points them at
	 * /api/notebook/upload, /api/notebook/add-photo and /api/notebook/note
	 * while the harness answers in memory. That split is what lets the
	 * multi-photo orchestration itself be exercised with no network.
	 *
	 * Every picked photo first passes through the CORRECTION step
	 * (PhotoCorrector, one photo at a time, never a whole batch at once):
	 * confirm produces a flattened + auto-leveled JPEG that uploads
	 * immediately after its own original as the 'enhanced' variant -- adjacent
	 * rows, which is the pairing photoPages() renders as one page -- while
	 * skip stages the original alone, exactly the pre-correction flow.
	 */

	let {
		entries,
		sessions,
		sectionLabel = null,
		canReview = false,
		configured = true,
		uploadReady = true,
		createEntry,
		addPhoto,
		createNote,
		onUploaded
	}: {
		entries: NotebookEntry[];
		sessions: NotebookSession[];
		/** The student's own class, when they have pinned one. */
		sectionLabel?: string | null;
		/** Instructor of at least one section, or a site admin (0067 chair tier). */
		canReview?: boolean;
		/** 0069 applied; false renders the fail-soft card instead of a broken page. */
		configured?: boolean;
		/**
		 * The Drive integration is configured server-side; false disables PHOTO
		 * submits only. A note needs no Drive, so the note path stays usable.
		 */
		uploadReady?: boolean;
		createEntry: (form: FormData) => Promise<CreateEntryResult>;
		addPhoto: (form: FormData) => Promise<AddPhotoResult>;
		createNote: (payload: NotePayload) => Promise<CreateEntryResult>;
		/** Called after a successful upload so the page can refresh its data. */
		onUploaded?: () => void;
	} = $props();

	// ---- upload form state -------------------------------------------------

	/** `null` is the deliberate free-form path: no session, label optional. */
	let selectedSession = $state<string | null>(null);
	let sessionTouched = $state(false);
	/**
	 * Free-form only: photos (the original path, unchanged and the default) or
	 * a written note with no photo at all (0075). Held as a plain preference
	 * and read through `noteOnly` below, so picking a session can never leave
	 * the form in a note mode that the session-linked path does not offer.
	 */
	let freeMode = $state<'photos' | 'note'>('photos');
	let label = $state('');
	/**
	 * A staged photo: the picked file plus, when the correction step produced
	 * one, the corrected JPEG that uploads right after it as the 'enhanced'
	 * variant. `enhanced: null` means the student skipped correction (or the
	 * image could not be decoded) and only the original uploads -- exactly
	 * the pre-correction behavior.
	 */
	interface StagedPhoto {
		file: File;
		enhanced: File | null;
	}
	let staged = $state<StagedPhoto[]>([]);
	/** Picked but not yet through the correction step; corrected one at a time. */
	let correctionQueue = $state<File[]>([]);
	let correctionNote = $state<string | null>(null);
	let busy = $state(false);
	let progress = $state('');
	let errorMsg = $state<string | null>(null);
	let successMsg = $state<string | null>(null);
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
	/** Set when a previous load's capture never came back (see camera.ts). */
	let recoveryNote = $state<string | null>(null);
	/** Staging a photo decodes it to check it is usable, which is not instant. */
	let checking = $state(false);

	const open = $derived(outstandingSessions(sessions, entries));
	const feed = $derived(newestFirst(entries));
	/** The note tier exists on the free-form path ONLY. */
	const noteOnly = $derived(selectedSession === null && freeMode === 'note');
	const correcting = $derived(correctionQueue[0] ?? null);
	const canSubmit = $derived(
		noteOnly
			? label.trim() !== ''
			: staged.length > 0 && correctionQueue.length === 0 && !checking && uploadReady
	);

	// Default to the outstanding session nearest today, and otherwise leave
	// the student's own pick alone as `entries` refreshes underneath -- with
	// one exception. A pick that is no longer OUTSTANDING is stale: it just
	// received this upload (the feed reloads after every save) or the roster
	// moved, and silently keeping it would file the next entry against an
	// already-covered check-in. A stale pick therefore drops back to the
	// default rather than persisting.
	$effect(() => {
		const stale = selectedSession !== null && !open.some((s) => s.id === selectedSession);
		if (sessionTouched && !stale) return;
		sessionTouched = false;
		selectedSession = nearestOutstanding(sessions, entries, todayIso())?.id ?? null;
	});

	function chooseSession(id: string | null) {
		sessionTouched = true;
		selectedSession = id;
	}

	function chooseMode(mode: 'photos' | 'note') {
		freeMode = mode;
		// Staged photos are meaningless in note mode and would be silently
		// dropped on submit; clearing them makes that visible instead.
		if (mode === 'note') {
			staged = [];
			correctionQueue = [];
		}
	}

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
		recoveryNote = null;
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
	 * Snapshot the form before the OS camera app takes over, so a browser
	 * killed for memory while it is in front does not also cost the student
	 * everything they had typed. Fires on the CLICK, which is the last moment
	 * this code is guaranteed to run.
	 */
	function onCaptureClick() {
		rememberPendingCapture({ session: selectedSession, mode: freeMode, label });
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

	$effect(() => {
		cameraSupported = cameraCaptureSupported();
		capturePath = preferredCapturePath(navigator.userAgent, cameraSupported);
		// A marker still here on a FRESH load means the previous load opened
		// the camera and never got to clear it -- i.e. it was killed. Put the
		// student back where they were and say what happened, because the
		// alternative is a blank form and no explanation at all.
		const pending = takePendingCapture() as
			| { session?: string | null; mode?: 'photos' | 'note'; label?: string }
			| null;
		if (pending) {
			if (pending.session !== undefined) {
				sessionTouched = true;
				selectedSession = pending.session;
			}
			if (pending.mode) freeMode = pending.mode;
			if (typeof pending.label === 'string') label = pending.label;
			recoveryNote =
				'Your photo did not make it back from the camera app, which can happen when the phone is low on memory. Everything you typed is still here. Please take the photo again.';
		}
	});

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

	function resetForm() {
		staged = [];
		correctionQueue = [];
		correctionNote = null;
		cameraMsg = null;
		recoveryNote = null;
		label = '';
		if (captureInput) captureInput.value = '';
		if (pickInput) pickInput.value = '';
	}

	/**
	 * Shrink an original to something the upload route will accept, and say so
	 * if it could not be. A real 12 MP phone capture is 4-7 MB against a 4 MB
	 * server cap, so without this the camera path fails at the route with a
	 * size error the student can do nothing about -- while the smaller images
	 * a gallery pick tends to produce go straight through, which is exactly
	 * the "gallery works, camera does not" shape of the bug.
	 */
	async function prepared(file: File): Promise<File> {
		try {
			return await fitForUpload(file);
		} catch {
			return file;
		}
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy || !canSubmit) return;
		busy = true;
		errorMsg = null;
		successMsg = null;
		progress = noteOnly
			? 'Saving...'
			: staged.length > 1
				? `Uploading photo 1 of ${staged.length}...`
				: 'Uploading...';

		try {
			// A note has no photo and so no sequencing at all: one call, done.
			// It never carries a session -- the mode is only reachable on the
			// free-form path, and a check-in still requires a page.
			if (noteOnly) {
				const saved = await createNote({ custom_label: label.trim() });
				if (!saved.ok) {
					errorMsg = saved.error;
					return;
				}
				successMsg = 'Note saved.';
				resetForm();
				onUploaded?.();
				return;
			}

			// Photo 1 creates the entry. A blank label is sent as nothing at all:
			// 0071 made the label optional and the upload route falls back to the
			// file's own name, so the UI must not re-impose a required-label rule.
			const first = new FormData();
			first.set('photo', await prepared(staged[0].file));
			if (selectedSession) first.set('session_id', selectedSession);
			const trimmed = label.trim();
			if (!selectedSession && trimmed) first.set('custom_label', trimmed);

			const created = await createEntry(first);
			if (!created.ok) {
				errorMsg = created.error;
				return;
			}

			// A corrected version rides IMMEDIATELY after its own original, so
			// the pair lands on adjacent sequence numbers -- the adjacency
			// photoPages() groups back into one page. Failures are reported
			// honestly rather than rolled back: the entry and its first photo
			// really do exist, and the student can add the rest from the page.
			const failed: number[] = [];
			const failedEnhanced: number[] = [];
			const sendEnhanced = async (i: number) => {
				const enhanced = staged[i].enhanced;
				if (!enhanced) return;
				progress = `Uploading corrected photo ${i + 1}...`;
				const form = new FormData();
				form.set('photo', await prepared(enhanced));
				form.set('entry_id', created.entryId);
				form.set('variant', 'enhanced');
				const added = await addPhoto(form);
				if (!added.ok) failedEnhanced.push(i + 1);
			};
			await sendEnhanced(0);
			for (let i = 1; i < staged.length; i++) {
				progress = `Uploading photo ${i + 1} of ${staged.length}...`;
				const form = new FormData();
				form.set('photo', await prepared(staged[i].file));
				form.set('entry_id', created.entryId);
				form.set('variant', 'original');
				const added = await addPhoto(form);
				if (!added.ok) {
					failed.push(i + 1);
					// No original landed for this page, so its corrected version
					// would pair against the WRONG preceding original; skip it.
					continue;
				}
				await sendEnhanced(i);
			}

			if (failed.length) {
				errorMsg = `Saved your entry, but ${failed.length === 1 ? 'photo' : 'photos'} ${failed.join(
					', '
				)} did not upload. Add ${failed.length === 1 ? 'it' : 'them'} again from this page.`;
			} else {
				successMsg =
					staged.length === 1
						? 'Entry saved.'
						: `Entry saved with ${photoCountLabel(staged.length)}.`;
				if (failedEnhanced.length) {
					successMsg += ` The corrected version of ${
						failedEnhanced.length === 1 ? 'photo' : 'photos'
					} ${failedEnhanced.join(', ')} did not upload; the original is saved.`;
				}
			}
			resetForm();
			onUploaded?.();
		} catch (err) {
			errorMsg = (err as Error).message || 'The upload failed to send.';
		} finally {
			busy = false;
			progress = '';
		}
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}
</script>

<svelte:head>
	<title>My Notebook // IDEA</title>
</svelte:head>

<!-- Coming back to a page that is still alive proves nothing was lost to the
     camera app, so the marker for the next load is dropped here. -->
<svelte:document
	onvisibilitychange={() => {
		if (document.visibilityState === 'visible') clearPendingCapture();
	}}
/>

<!-- .nb-root scopes the notebook's editorial light theme (notebook-theme.css)
     and keeps it out of every other surface. -->
<div class="nb-root">
<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>

<main class="notebook-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Notebook</div>
		<h1>My Notebook</h1>
		<p class="lead">
			Photograph your engineering notebook pages and keep them here. Everything on this page is
			<strong>yours</strong>: only you, your section instructor, and the department chair can see it.
		</p>
		<div class="hero-meta">
			{#if sectionLabel}
				<span class="chip">{sectionLabel}</span>
			{/if}
			{#if canReview}
				<a class="chip chip-link" href="/notebook/review">Section review &rsaquo;</a>
			{/if}
		</div>
	</section>

	{#if !configured}
		<section class="card">
			<h2>Notebook is not available yet</h2>
			<p class="note">
				The notebook tables are not in place on this project yet. Apply migration
				<code>0069_notebook.sql</code> (and <code>0071_notebook_optional_label.sql</code>) in the
				Supabase SQL editor, then reload.
			</p>
		</section>
	{:else}
		<!-- ---------------------------------------------------------------- -->
		<!-- Add an entry                                                      -->
		<!-- ---------------------------------------------------------------- -->
		<section class="card">
			<h2>Add an entry</h2>

			{#if errorMsg}
				<p class="feedback error" role="alert">{errorMsg}</p>
			{/if}
			{#if successMsg}
				<p class="feedback ok" role="status">{successMsg}</p>
			{/if}
			{#if !uploadReady}
				<p class="feedback error">
					Photo storage is not configured on the server yet, so photo uploads are turned
					off. You can still save a note.
				</p>
			{/if}
			{#if recoveryNote}
				<p class="feedback error" role="status" data-testid="nb-recovery">{recoveryNote}</p>
			{/if}
			{#if rejectedNote}
				<p class="feedback error" role="alert" data-testid="nb-rejected">{rejectedNote}</p>
			{/if}
			{#if correctionNote}
				<p class="feedback error" role="status">{correctionNote}</p>
			{/if}

			<form onsubmit={submit}>
				<fieldset class="picker">
					<legend>What is this for?</legend>
					{#if open.length}
						<div class="quick-picks">
							{#each open as s (s.id)}
								<button
									type="button"
									class="pick"
									class:selected={selectedSession === s.id}
									aria-pressed={selectedSession === s.id}
									onclick={() => chooseSession(s.id)}
								>
									<span class="pick-label">{s.session_label}</span>
									<span class="pick-meta">{sessionMeta(s)}</span>
								</button>
							{/each}
							<button
								type="button"
								class="pick free"
								class:selected={selectedSession === null}
								aria-pressed={selectedSession === null}
								onclick={() => chooseSession(null)}
							>
								<span class="pick-label">Something else</span>
								<span class="pick-meta">No session needed</span>
							</button>
						</div>
					{:else}
						<p class="note no-sessions">
							{sessions.length
								? 'You are up to date on every check-in for your class. This entry will be saved on its own.'
								: 'You have no scheduled check-ins, so this entry will be saved on its own.'}
						</p>
					{/if}
				</fieldset>

				{#if selectedSession === null}
					<!-- Free-form only. A scheduled check-in exists because an
					     instructor asked for a page, so it never offers this. -->
					<fieldset class="picker mode-picker">
						<legend>How do you want to save it?</legend>
						<div class="quick-picks">
							<button
								type="button"
								class="pick"
								class:selected={!noteOnly}
								aria-pressed={!noteOnly}
								onclick={() => chooseMode('photos')}
							>
								<span class="pick-label">Photos</span>
								<span class="pick-meta">Shoot a page</span>
							</button>
							<button
								type="button"
								class="pick"
								class:selected={noteOnly}
								aria-pressed={noteOnly}
								onclick={() => chooseMode('note')}
							>
								<span class="pick-label">Just write a note</span>
								<span class="pick-meta">No photo needed</span>
							</button>
						</div>
					</fieldset>

					<label class="field label-field">
						<span>
							{#if noteOnly}
								Note
							{:else}
								Label <span class="optional">(optional)</span>
							{/if}
						</span>
						<input
							type="text"
							bind:value={label}
							maxlength="200"
							placeholder={noteOnly ? 'e.g. Talked through the gearbox ratio' : 'e.g. Gearbox sketches'}
							disabled={busy}
						/>
						<span class="hint">
							{#if noteOnly}
								Up to 200 characters. You can add photos to this entry later.
							{:else}
								Leave this blank and we will use the photo's own filename.
							{/if}
						</span>
					</label>
				{/if}

				{#if !noteOnly}
					<div class="field photo-field">
						<span class="photo-label">Photos</span>
						<!--
							Take vs choose are separate controls on purpose. `capture`
							turns an input camera-only on Android, so one combined input
							carrying it leaves no way to attach an existing photo there.
							The shoot input drops `multiple` (a capture returns one file);
							the pick input keeps it, since multi-select is a picker
							ability.
						-->
						<div class="photo-buttons">
							{#if capturePath === 'in-app'}
								<!-- Android leads with the in-app camera: the native input
								     is confirmed broken on a real device there. -->
								<button
									type="button"
									class="photo-btn"
									data-testid="nb-capture-primary"
									onclick={openCamera}
									disabled={busy || !uploadReady}
								>
									<span>Take a photo</span>
								</button>
							{:else}
								<label class="photo-btn" data-testid="nb-capture-primary">
									<span>Take a photo</span>
									<input
										bind:this={captureInput}
										type="file"
										accept="image/*"
										capture="environment"
										onclick={onCaptureClick}
										onchange={onFilesChosen}
										disabled={busy || !uploadReady}
									/>
								</label>
							{/if}
							<!-- Gallery is a DIFFERENT capability, not a different way of
							     capturing, so it is equally prominent on every platform. -->
							<label class="photo-btn secondary" data-testid="nb-pick">
								<span>Choose a photo</span>
								<input
									bind:this={pickInput}
									type="file"
									accept="image/*"
									multiple
									onchange={onFilesChosen}
									disabled={busy || !uploadReady}
								/>
							</label>
						</div>

						{#if capturePath === 'in-app'}
							<!--
								The native path, demoted rather than removed. It is confirmed
								broken on at least one real Android device (opens the front
								camera; the photo never lands), and Android browsers are
								documented to ignore the `capture` value regardless -- so it
								must not look like the normal thing to tap. It stays because
								the OS camera takes a better photo when it does work, and
								another device may not share the fault. The label says what
								is known rather than hiding it.
							-->
							<label class="native-fallback" data-testid="nb-native-fallback">
								<span>Use your phone’s camera app instead (known to open the wrong camera on some Android phones)</span>
								<input
									bind:this={captureInput}
									type="file"
									accept="image/*"
									capture="environment"
									onclick={onCaptureClick}
									onchange={onFilesChosen}
									disabled={busy || !uploadReady}
								/>
							</label>
						{:else if cameraSupported}
							<!--
								The escape hatch on platforms that lead with the native
								input: iOS honours the facing hint, but if a device does open
								the wrong lens this constrains it for real and offers a
								switch. Not the default there, because iOS Safari serves
								getUserMedia at roughly 720p and a page has to stay legible.
							-->
							<button
								type="button"
								class="in-app-camera"
								data-testid="nb-in-app-camera"
								onclick={openCamera}
								disabled={busy || !uploadReady}
							>
								Camera opened the wrong way round? Use the in-app camera
							</button>
						{/if}
						{#if cameraMsg}
							<p class="feedback error" role="status" data-testid="nb-camera-msg">{cameraMsg}</p>
						{/if}
						<span class="hint">
							{#if checking}
								Checking the photo...
							{:else}
								JPEG, PNG, WebP, or HEIC. Large photos are shrunk to fit before they upload,
								and you can straighten and clean up each one first.
							{/if}
						</span>
					</div>
				{/if}

				{#if staged.length && !noteOnly}
					<!-- The whole staged set at once, as PICTURES: three photos queued
					     means three thumbnails, so the page in frame (or not) is
					     visible before anything is committed. -->
					<div class="staged-head">
						<span class="photo-label">Ready to save</span>
						<span class="staged-count">{photoCountLabel(staged.length)}</span>
					</div>
					<ul class="staged" data-testid="nb-staged">
						{#each staged as s, i (shownFile(s).name + i)}
							<li class="staged-item">
								<div class="thumb">
									{#if previews[i] && !unrenderable.has(previews[i])}
										<img
											src={previews[i]}
											alt={`Photo ${i + 1}: ${shownFile(s).name}`}
											data-testid="nb-thumb"
											onerror={() => thumbFailed(previews[i])}
										/>
									{:else}
										<!-- Undecodable here (a HEIC off an iPhone is the
										     ordinary case). It still uploads fine; name it
										     rather than showing a broken-image glyph. -->
										<span class="thumb-fallback" data-testid="nb-thumb-fallback">
											{shownFile(s).name}
										</span>
									{/if}
									<span class="staged-n">{i + 1}</span>
									{#if s.enhanced}
										<span class="staged-tag" data-testid="nb-thumb-corrected">corrected</span>
									{/if}
								</div>
								<button type="button" class="remove" onclick={() => removeStaged(i)} disabled={busy}>
									Remove
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				<div class="actions">
					<button class="btn" type="submit" disabled={busy || !canSubmit}>
						{busy ? 'Saving...' : noteOnly ? 'Save note' : 'Save entry'}
					</button>
					{#if progress}<span class="progress">{progress}</span>{/if}
				</div>
			</form>
		</section>

		<!-- ---------------------------------------------------------------- -->
		<!-- My entries                                                        -->
		<!-- ---------------------------------------------------------------- -->
		<section class="card">
			<h2>My entries</h2>

			{#if entries.length === 0}
				<p class="note empty-state">
					No entries yet. Photograph a page above and it will show up here.
				</p>
			{:else}
				<ol class="entries">
					{#each feed as entry (entry.id)}
						{@const photos = orderedPhotos(entry)}
						<li class="entry" class:flagged={entry.status === 'flagged'}>
							<header class="entry-head">
								<h3 class="entry-title" class:untitled={isUntitled(entry)}>{entryTitle(entry)}</h3>
								<div class="entry-meta">
									<span class="stamp">{when(entry.upload_timestamp)}</span>
									<span class="dot" aria-hidden="true">·</span>
									<!-- Logical pages, so an original + its corrected variant count
									     once; identical to the row count for all-original entries. -->
									<span>{photoCountLabel(photoPages(photos).length)}</span>
									{#if showsStatus(entry.status)}
										<span
											class="status"
											class:warn={entry.status === 'flagged'}
											class:pending={entry.status === 'pending_review'}
										>
											{statusLabel(entry.status)}
										</span>
									{/if}
								</div>
								{#if entry.session}
									<p class="entry-session">
										{sessionMeta(entry.session)}
									</p>
								{/if}
							</header>

							{#if entry.status === 'flagged' && (entry.flag_reason || entry.instructor_comment)}
								<div class="callout">
									{#if entry.flag_reason}
										<strong>{flagReasonLabel(entry.flag_reason)}.</strong>
									{/if}
									{#if entry.instructor_comment}
										<span>{entry.instructor_comment}</span>
									{/if}
									<span class="callout-hint">Add another photo above to send it back for review.</span>
								</div>
							{/if}

							<NotebookPhotos {photos} label={entryTitle(entry)} />
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}

	<VersionBadge app="portal" />
</main>

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
</div>

<style>
	/* Editorial column: a touch narrower than the old technical page, with
	   more air between cards. The photo stays the widest thing on screen. */
	.notebook-page {
		max-width: 47rem;
		margin: 0 auto;
		padding: 0 1.4rem 4.5rem;
	}
	.notebook-page > .card {
		margin-bottom: 1.6rem;
	}
	.notebook-page h2 {
		margin-top: 0;
	}
	.lead strong {
		color: var(--nb-ink);
		font-weight: 600;
	}
	.hero-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}
	.chip {
		font-size: 0.74rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		padding: 0.25rem 0.7rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		color: var(--nb-ink-soft);
	}
	.chip-link {
		color: var(--nb-accent-ink);
		border-color: color-mix(in srgb, var(--nb-accent) 45%, transparent);
		text-decoration: none;
	}
	.chip-link:hover {
		border-color: var(--nb-accent-ink);
		background: var(--nb-accent-wash);
		text-decoration: none;
	}
	.note {
		color: var(--nb-ink-soft);
		font-size: 0.9rem;
	}
	.empty-state {
		padding: 0.6rem 0;
	}
	.feedback {
		font-size: 0.84rem;
		padding: 0.55rem 0.8rem;
		border-radius: var(--nb-radius-control);
		margin-bottom: 0.9rem;
	}
	.feedback.error {
		color: var(--nb-error);
		border: 1px solid color-mix(in srgb, var(--nb-error) 40%, transparent);
		background: color-mix(in srgb, var(--nb-error) 5%, transparent);
	}
	.feedback.ok {
		color: var(--nb-ok);
		border: 1px solid color-mix(in srgb, var(--nb-ok) 35%, transparent);
		background: color-mix(in srgb, var(--nb-ok) 5%, transparent);
	}

	/* ---- add an entry ---- */
	.picker {
		border: none;
		padding: 0;
		margin: 0 0 0.9rem;
	}
	.picker legend {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--nb-ink-faint);
		padding: 0;
		margin-bottom: 0.5rem;
	}
	.quick-picks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: 0.5rem;
	}
	.pick {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		text-align: left;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--nb-hairline);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface-dim);
		color: var(--nb-ink);
		cursor: pointer;
		font: inherit;
	}
	.pick:hover {
		border-color: var(--nb-hairline-strong);
	}
	/* Gold is the active state -- the one thread back to the platform. */
	.pick.selected {
		border-color: var(--nb-accent);
		background: var(--nb-accent-wash);
	}
	.pick-label {
		font-weight: 600;
	}
	.pick-meta {
		font-size: 0.73rem;
		color: var(--nb-ink-faint);
	}
	.pick.free .pick-label {
		color: var(--nb-accent-ink);
	}
	.no-sessions {
		margin: 0;
	}
	.mode-picker .quick-picks {
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
	}
	.label-field .optional {
		color: var(--nb-ink-faint);
		font-weight: 400;
	}
	.hint {
		display: block;
		color: var(--nb-ink-faint);
		font-size: 0.8rem;
		margin-top: 0.3rem;
	}
	.photo-field {
		margin-top: 1rem;
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
		margin-bottom: 0.3rem;
		font-weight: 600;
	}
	/* Two real, thumb-sized targets rather than a bare file input: this is a
	   phone-first flow, and the native control renders as a small button with
	   a filename beside it that is easy to miss and hard to hit. */
	.photo-buttons {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.5rem;
	}
	.photo-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 3rem;
		padding: 0.7rem 1rem;
		border: 1px solid var(--nb-accent);
		border-radius: var(--nb-radius-control);
		background: var(--nb-accent-wash);
		color: var(--nb-accent-ink);
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		text-align: center;
	}
	.photo-btn.secondary {
		border-color: var(--nb-hairline-strong);
		background: var(--nb-surface-dim);
		color: var(--nb-ink);
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
		margin-top: 0.55rem;
		padding: 0;
		background: none;
		border: none;
		color: var(--nb-ink-faint);
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
		margin-top: 0.6rem;
		color: var(--nb-ink-faint);
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
		gap: 0.6rem;
		margin: 1.2rem 0 0.4rem;
	}
	.staged-head .photo-label {
		margin-bottom: 0;
	}
	.staged-count {
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
		color: var(--nb-ink-faint);
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
		gap: 0.7rem;
	}
	.staged-item {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.thumb {
		position: relative;
		aspect-ratio: 3 / 4;
		border: 1px solid var(--nb-hairline);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface-dim);
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
		padding: 0.5rem;
		font-size: 0.74rem;
		line-height: 1.3;
		color: var(--nb-ink-soft);
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
		color: #f5f2e9;
		background: rgba(22, 20, 16, 0.72);
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
		background: rgba(22, 20, 16, 0.72);
		border-radius: 999px;
		padding: 0.1rem 0.3rem;
	}
	.remove {
		background: none;
		border: none;
		padding: 0;
		color: var(--nb-ink-faint);
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
	.actions {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-top: 1.1rem;
		flex-wrap: wrap;
	}
	.progress {
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
		color: var(--nb-ink-faint);
	}

	/* ---- my entries: the editorial feed. Generous air between entries, the
	   photo as the dominant element, restrained chrome around it. ---- */
	.entries {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 2.6rem;
	}
	.entry {
		border-top: 1px solid var(--nb-hairline);
		padding-top: 1.8rem;
	}
	.entry:first-child {
		border-top: none;
		padding-top: 0;
	}
	.entry-head {
		margin-bottom: 0.8rem;
	}
	.entry-title {
		margin: 0 0 0.3rem;
		font-size: 1.28rem;
		letter-spacing: -0.01em;
	}
	.entry-title.untitled {
		color: var(--nb-ink-faint);
		font-style: italic;
		font-weight: 500;
	}
	.entry-meta {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		font-size: 0.78rem;
		font-variant-numeric: tabular-nums;
		color: var(--nb-ink-faint);
	}
	.dot {
		color: var(--nb-hairline-strong);
	}
	.status {
		padding: 0.1rem 0.55rem;
		border-radius: 999px;
		border: 1px solid currentColor;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		font-size: 0.64rem;
		font-weight: 600;
	}
	/* The flag status carries the gold thread; awaiting-review stays a quiet gray. */
	.status.warn {
		color: var(--nb-accent-ink);
	}
	.status.pending {
		color: var(--nb-ink-soft);
	}
	.entry-session {
		margin: 0.3rem 0 0;
		font-size: 0.78rem;
		color: var(--nb-ink-faint);
	}
	.callout {
		border-left: 2px solid var(--nb-accent);
		padding: 0.55rem 0.8rem;
		margin: 0 0 0.8rem;
		background: var(--nb-accent-wash);
		border-radius: 0 var(--nb-radius-control) var(--nb-radius-control) 0;
		font-size: 0.88rem;
		display: grid;
		gap: 0.2rem;
	}
	.callout strong {
		color: var(--nb-accent-ink);
	}
	.callout-hint {
		color: var(--nb-ink-soft);
		font-size: 0.8rem;
	}

	@media (max-width: 540px) {
		.quick-picks {
			grid-template-columns: 1fr;
		}
	}
</style>
