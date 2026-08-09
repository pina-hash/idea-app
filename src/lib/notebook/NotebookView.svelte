<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import {
		driveOpenUrl,
		drivePhotoUrl,
		entryTitle,
		flagReasonLabel,
		isUntitled,
		nearestOutstanding,
		newestFirst,
		orderedPhotos,
		outstandingSessions,
		photoCountLabel,
		sessionMeta,
		showsStatus,
		statusLabel,
		todayIso,
		type AddPhotoResult,
		type CreateEntryResult,
		type NotebookEntry,
		type NotebookSession
	} from '$lib/notebook';

	/**
	 * The whole student-facing notebook screen, factored out of /notebook so a
	 * dev harness mounts the SAME component against sample data (the
	 * CoinBalanceView / CoinDeskTool convention).
	 *
	 * It owns the UPLOAD SEQUENCING -- first photo creates the entry, every
	 * later photo is added to it -- but not the transport: `createEntry` and
	 * `addPhoto` are injected, so the real page points them at the existing
	 * /api/notebook/upload and /api/notebook/add-photo routes (untouched by
	 * this session) while the harness answers in memory. That split is what
	 * lets the multi-photo orchestration itself be exercised with no network.
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
		/** The Drive integration is configured server-side; false disables submit. */
		uploadReady?: boolean;
		createEntry: (form: FormData) => Promise<CreateEntryResult>;
		addPhoto: (form: FormData) => Promise<AddPhotoResult>;
		/** Called after a successful upload so the page can refresh its data. */
		onUploaded?: () => void;
	} = $props();

	// ---- upload form state -------------------------------------------------

	/** `null` is the deliberate free-form path: no session, label optional. */
	let selectedSession = $state<string | null>(null);
	let sessionTouched = $state(false);
	let label = $state('');
	let files = $state<File[]>([]);
	let busy = $state(false);
	let progress = $state('');
	let errorMsg = $state<string | null>(null);
	let successMsg = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let broken = $state<Record<string, true>>({});

	const open = $derived(outstandingSessions(sessions, entries));
	const feed = $derived(newestFirst(entries));

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

	function onFilesChosen(e: Event) {
		const picked = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
		if (picked.length) files = [...files, ...picked];
		// Clear the input so re-picking the same file still fires a change.
		if (fileInput) fileInput.value = '';
	}

	function removeFile(i: number) {
		files = files.filter((_, j) => j !== i);
	}

	function resetForm() {
		files = [];
		label = '';
		if (fileInput) fileInput.value = '';
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy || files.length === 0) return;
		busy = true;
		errorMsg = null;
		successMsg = null;
		progress = files.length > 1 ? `Uploading photo 1 of ${files.length}...` : 'Uploading...';

		try {
			// Photo 1 creates the entry. A blank label is sent as nothing at all:
			// 0071 made the label optional and the upload route falls back to the
			// file's own name, so the UI must not re-impose a required-label rule.
			const first = new FormData();
			first.set('photo', files[0]);
			if (selectedSession) first.set('session_id', selectedSession);
			const trimmed = label.trim();
			if (!selectedSession && trimmed) first.set('custom_label', trimmed);

			const created = await createEntry(first);
			if (!created.ok) {
				errorMsg = created.error;
				return;
			}

			// Every later photo joins that entry. A failure here is reported
			// honestly rather than rolled back: the entry and its first photo
			// really do exist, and the student can add the rest from the entry.
			const failed: number[] = [];
			for (let i = 1; i < files.length; i++) {
				progress = `Uploading photo ${i + 1} of ${files.length}...`;
				const form = new FormData();
				form.set('photo', files[i]);
				form.set('entry_id', created.entryId);
				form.set('variant', 'original');
				const added = await addPhoto(form);
				if (!added.ok) failed.push(i + 1);
			}

			if (failed.length) {
				errorMsg = `Saved your entry, but ${failed.length === 1 ? 'photo' : 'photos'} ${failed.join(
					', '
				)} did not upload. Add ${failed.length === 1 ? 'it' : 'them'} again from this page.`;
			} else {
				successMsg =
					files.length === 1
						? 'Entry saved.'
						: `Entry saved with ${photoCountLabel(files.length)}.`;
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
					Photo storage is not configured on the server yet, so uploads are turned off.
				</p>
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
					<label class="field label-field">
						<span>Label <span class="optional">(optional)</span></span>
						<input
							type="text"
							bind:value={label}
							maxlength="200"
							placeholder="e.g. Gearbox sketches"
							disabled={busy}
						/>
						<span class="hint">
							Leave this blank and we will use the photo's own filename.
						</span>
					</label>
				{/if}

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
					<span class="hint">JPEG, PNG, WebP, or HEIC, up to 4&nbsp;MB each.</span>
				</div>

				{#if files.length}
					<ul class="staged">
						{#each files as f, i (f.name + i)}
							<li>
								<span class="staged-n">{i + 1}</span>
								<span class="staged-name">{f.name}</span>
								<button type="button" class="remove" onclick={() => removeFile(i)} disabled={busy}>
									Remove
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				<div class="actions">
					<button class="btn" type="submit" disabled={busy || files.length === 0 || !uploadReady}>
						{busy ? 'Saving...' : 'Save entry'}
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
									<span>{photoCountLabel(photos.length)}</span>
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

							{#if photos.length}
								<div class="photos">
									{#each photos as photo (photo.id)}
										<figure class="photo">
											{#if broken[photo.id]}
												<div class="photo-missing">
													<p>This photo is stored in the class Drive.</p>
													<a
														class="btn secondary"
														href={driveOpenUrl(photo.drive_file_id)}
														target="_blank"
														rel="noopener noreferrer">Open in Drive</a
													>
												</div>
											{:else}
												<a
													href={driveOpenUrl(photo.drive_file_id)}
													target="_blank"
													rel="noopener noreferrer"
												>
													<img
														src={drivePhotoUrl(photo.drive_file_id)}
														alt={photos.length > 1
															? `${entryTitle(entry)}, page ${photo.sequence_order}`
															: entryTitle(entry)}
														loading="lazy"
														referrerpolicy="no-referrer"
														onerror={() => (broken = { ...broken, [photo.id]: true })}
													/>
												</a>
											{/if}
											<figcaption>
												{#if photos.length > 1}Page {photo.sequence_order}{/if}
												{#if photo.variant === 'enhanced'}<span class="variant">enhanced</span>{/if}
												{#if photo.original_filename}
													<span class="filename">{photo.original_filename}</span>
												{/if}
											</figcaption>
										</figure>
									{/each}
								</div>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}

	<VersionBadge app="portal" />
</main>

<style>
	.notebook-page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.notebook-page > .card {
		margin-bottom: 1.1rem;
	}
	.notebook-page h2 {
		margin-top: 0;
	}
	.lead strong {
		color: var(--white);
	}
	.hero-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.7rem;
	}
	.chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--dim);
	}
	.chip-link {
		color: var(--gold);
		border-color: color-mix(in srgb, var(--gold) 40%, transparent);
		text-decoration: none;
	}
	.chip-link:hover {
		border-color: var(--gold);
		background: color-mix(in srgb, var(--gold) 10%, transparent);
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.empty-state {
		padding: 0.6rem 0;
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.45rem 0.7rem;
		border-radius: 5px;
		margin-bottom: 0.8rem;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.ok {
		color: var(--green);
		border: 1px solid color-mix(in srgb, var(--green) 50%, transparent);
	}

	/* ---- add an entry ---- */
	.picker {
		border: none;
		padding: 0;
		margin: 0 0 0.9rem;
	}
	.picker legend {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--dim);
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
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg1);
		color: var(--white);
		cursor: pointer;
		font: inherit;
	}
	.pick:hover {
		border-color: color-mix(in srgb, var(--green) 45%, transparent);
	}
	.pick.selected {
		border-color: var(--green);
		background: color-mix(in srgb, var(--green) 10%, transparent);
	}
	.pick-label {
		font-weight: 600;
	}
	.pick-meta {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.pick.free .pick-label {
		color: var(--gold);
	}
	.no-sessions {
		margin: 0;
	}
	.label-field .optional {
		color: var(--dim);
		font-weight: 400;
	}
	.hint {
		display: block;
		color: var(--dim);
		font-size: 0.78rem;
		margin-top: 0.25rem;
	}
	.photo-field {
		margin-top: 0.9rem;
	}
	.photo-label {
		display: block;
		margin-bottom: 0.3rem;
	}
	.photo-field input[type='file'] {
		width: 100%;
		color: var(--white);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
	}
	.staged {
		list-style: none;
		padding: 0;
		margin: 0.8rem 0 0;
		display: grid;
		gap: 0.35rem;
	}
	.staged li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--bg1);
	}
	.staged-n {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--green);
		min-width: 1.1rem;
	}
	.staged-name {
		flex: 1;
		font-size: 0.85rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.remove {
		background: none;
		border: none;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.remove:hover {
		color: var(--amber);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-top: 1rem;
		flex-wrap: wrap;
	}
	.progress {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		color: var(--cyan);
	}

	/* ---- my entries ---- */
	.entries {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 1.4rem;
	}
	.entry {
		border-top: 1px solid var(--line);
		padding-top: 1rem;
	}
	.entry:first-child {
		border-top: none;
		padding-top: 0;
	}
	.entry-head {
		margin-bottom: 0.6rem;
	}
	.entry-title {
		margin: 0 0 0.2rem;
		font-size: 1.1rem;
	}
	.entry-title.untitled {
		color: var(--dim);
		font-style: italic;
	}
	.entry-meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.74rem;
		color: var(--cyan);
	}
	.dot {
		color: var(--dim);
	}
	.status {
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		border: 1px solid currentColor;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.68rem;
	}
	.status.warn {
		color: var(--amber);
	}
	.status.pending {
		color: var(--teal);
	}
	.entry-session {
		margin: 0.3rem 0 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.74rem;
		color: var(--dim);
	}
	.callout {
		border-left: 2px solid var(--amber);
		padding: 0.45rem 0.7rem;
		margin: 0 0 0.7rem;
		background: color-mix(in srgb, var(--amber) 7%, transparent);
		font-size: 0.87rem;
		display: grid;
		gap: 0.2rem;
	}
	.callout strong {
		color: var(--amber);
	}
	.callout-hint {
		color: var(--dim);
		font-size: 0.8rem;
	}

	/* Photos are the point of this screen: one per row, full column width,
	   never a thumbnail grid. */
	.photos {
		display: grid;
		gap: 0.9rem;
	}
	.photo {
		margin: 0;
	}
	.photo a {
		display: block;
	}
	.photo img {
		display: block;
		width: 100%;
		height: auto;
		/* Reserved height: Drive can be slow, and an image still in flight has
		   no intrinsic size, so without this the frame collapses to a hairline
		   and the feed jumps as each photo lands. */
		min-height: 12rem;
		max-height: 40rem;
		object-fit: contain;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 6px;
	}
	.photo-missing {
		display: grid;
		gap: 0.6rem;
		justify-items: start;
		padding: 1.2rem;
		border: 1px dashed var(--line);
		border-radius: 6px;
		background: var(--bg1);
		color: var(--dim);
		font-size: 0.87rem;
	}
	.photo-missing p {
		margin: 0;
	}
	figcaption {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.variant {
		color: var(--cyan);
	}
	.filename {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 22rem;
	}

	@media (max-width: 540px) {
		.quick-picks {
			grid-template-columns: 1fr;
		}
	}
</style>
