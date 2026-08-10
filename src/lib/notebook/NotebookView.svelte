<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import NotebookPhotos from '$lib/notebook/NotebookPhotos.svelte';
	import PhotoCorrector from '$lib/notebook/PhotoCorrector.svelte';
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
	let fileInput = $state<HTMLInputElement | null>(null);

	const open = $derived(outstandingSessions(sessions, entries));
	const feed = $derived(newestFirst(entries));
	/** The note tier exists on the free-form path ONLY. */
	const noteOnly = $derived(selectedSession === null && freeMode === 'note');
	const correcting = $derived(correctionQueue[0] ?? null);
	const canSubmit = $derived(
		noteOnly ? label.trim() !== '' : staged.length > 0 && correctionQueue.length === 0 && uploadReady
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
		const picked = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
		// Every picked photo queues for its OWN correction step (one at a
		// time, in order); it lands in `staged` only once corrected or skipped.
		if (picked.length) {
			correctionNote = null;
			correctionQueue = [...correctionQueue, ...picked];
		}
		// Clear the input so re-picking the same file still fires a change.
		if (fileInput) fileInput.value = '';
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

	function resetForm() {
		staged = [];
		correctionQueue = [];
		correctionNote = null;
		label = '';
		if (fileInput) fileInput.value = '';
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
			first.set('photo', staged[0].file);
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
				form.set('photo', enhanced);
				form.set('entry_id', created.entryId);
				form.set('variant', 'enhanced');
				const added = await addPhoto(form);
				if (!added.ok) failedEnhanced.push(i + 1);
			};
			await sendEnhanced(0);
			for (let i = 1; i < staged.length; i++) {
				progress = `Uploading photo ${i + 1} of ${staged.length}...`;
				const form = new FormData();
				form.set('photo', staged[i].file);
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
						<!-- capture="environment" opens the rear camera directly on a
						     phone; `multiple` still allows several pages per entry. -->
						<input
							bind:this={fileInput}
							type="file"
							accept="image/*"
							capture="environment"
							multiple
							onchange={onFilesChosen}
							disabled={busy || !uploadReady}
						/>
						<span class="hint">
							JPEG, PNG, WebP, or HEIC, up to 4&nbsp;MB each. You can straighten and clean up
							each photo before it uploads.
						</span>
					</div>
				{/if}

				{#if staged.length && !noteOnly}
					<ul class="staged">
						{#each staged as s, i (s.file.name + i)}
							<li>
								<span class="staged-n">{i + 1}</span>
								<span class="staged-name">{s.file.name}</span>
								{#if s.enhanced}<span class="staged-tag">corrected</span>{/if}
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
	}
	.photo-label {
		display: block;
		margin-bottom: 0.3rem;
		font-weight: 600;
	}
	.photo-field input[type='file'] {
		width: 100%;
		color: var(--nb-ink-soft);
		font-size: 0.85rem;
	}
	.staged {
		list-style: none;
		padding: 0;
		margin: 0.9rem 0 0;
		display: grid;
		gap: 0.4rem;
	}
	.staged li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.65rem;
		border: 1px solid var(--nb-hairline);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface-dim);
	}
	.staged-n {
		font-size: 0.74rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--nb-accent-ink);
		min-width: 1.1rem;
	}
	.staged-name {
		flex: 1;
		font-size: 0.86rem;
		color: var(--nb-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.staged-tag {
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--nb-accent-ink);
		background: var(--nb-accent-wash);
		border: 1px solid color-mix(in srgb, var(--nb-accent) 45%, transparent);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
	}
	.remove {
		background: none;
		border: none;
		color: var(--nb-ink-faint);
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.remove:hover {
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
