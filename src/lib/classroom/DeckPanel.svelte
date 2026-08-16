<script lang="ts">
	import {
		DECK_UPLOAD_MAX_ZIP_BYTES,
		deckProgressLabel,
		deckProgressPercent,
		deckSizeLine,
		deckThumbnailSrc,
		deckUploadSizeIssue,
		deckViewerHref,
		type ClassroomDeck,
		type DeckTransports,
		type DeckUploadProgress
	} from '$lib/classroom/deck';

	/**
	 * The deck on one classroom item: how a student opens it, and how a teacher
	 * puts one there, replaces it, or takes it away.
	 *
	 * WHY THIS LIVES ON THE ITEM PAGE. A deck upload is not a field on a form --
	 * it unpacks a whole tree and comes back with things the uploader has to read
	 * (a missing `.image-slots.state.json` means every hand-framed image will
	 * render uncropped; a zip with several plausible entry pages needs a choice;
	 * duplicate renderings get skipped). Those want somewhere to be said. They
	 * also want an item that already EXISTS, since a deck is stored against the
	 * canonical item id.
	 *
	 * IT IS THE ONLY DOOR AGAIN, on purpose. The composer briefly staged a zip of
	 * its own and uploaded it once the save returned an id -- which put a second
	 * deck panel on screen, with its own copy of the explanation, every time the
	 * editor was open on an item page that was already showing this one. That
	 * staging is gone. A deck is not a field on a form: it has its own long
	 * transfer, its own progress, its own refusals and its own questions, none of
	 * which the composer's save waits for, so putting it behind an edit mode only
	 * ever added a step. Managing a deck from here needs no editor at all.
	 *
	 * FOLLOWS THE CANONICAL ITEM: one deck per item, so every class the item is
	 * posted to sees the same deck, and replacing it replaces it everywhere at once.
	 */
	let {
		deck = null,
		itemId,
		sectionId,
		basePath = '/classroom',
		canManage = false,
		transports = null,
		onchanged = null
	}: {
		deck?: ClassroomDeck | null;
		itemId: string;
		sectionId: string;
		basePath?: string;
		canManage?: boolean;
		transports?: DeckTransports | null;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	let busy = $state(false);
	let error = $state<string | null>(null);
	/**
	 * WHICH failure this was. Shown because a deck upload's failure modes are
	 * indistinguishable from the outside otherwise -- a chunk Drive rejected, a
	 * response the browser was not allowed to read, an ingest call that never
	 * answered, one that ran out of time -- and someone reporting a broken
	 * upload from a real classroom has no server log to send along with it.
	 */
	let errorCode = $state<string | null>(null);
	let warnings = $state<string[]>([]);
	let notice = $state<string | null>(null);
	let armRemove = $state(false);
	/** Kept so an entry-page choice can resubmit the SAME zip, not a re-pick. */
	let pending = $state<File | null>(null);
	let candidates = $state<string[]>([]);
	let chosenEntry = $state<string>('');
	let input = $state<HTMLInputElement | null>(null);
	/**
	 * A deck is tens of megabytes on school wifi, so the wait is long enough
	 * that "Uploading..." alone reads as a hang. Cancelling aborts the transfer
	 * AND tells Drive to discard what it has, so nothing is left behind.
	 */
	let progress = $state<DeckUploadProgress | null>(null);
	let aborter: AbortController | null = null;

	const editable = $derived(canManage && !!transports);
	const href = $derived(deckViewerHref(basePath, sectionId, itemId));
	const thumb = $derived(deck ? deckThumbnailSrc(deck) : null);
	const percent = $derived(progress ? deckProgressPercent(progress) : null);

	async function send(file: File, entryPath: string | null) {
		if (!transports) return;
		error = null;
		errorCode = null;
		notice = null;
		warnings = [];

		// Refused before anything is sent, not just before it succeeds: a zip
		// over the limit is never going to reach the server, so there is
		// nothing to show "Uploading..." for.
		const sizeIssue = deckUploadSizeIssue(file.size);
		if (sizeIssue) {
			error = sizeIssue;
			errorCode = 'too_large';
			pending = null;
			candidates = [];
			if (input) input.value = '';
			return;
		}

		busy = true;
		progress = { phase: 'preparing', loaded: 0, total: file.size };
		aborter = new AbortController();
		const res = await transports.uploadDeck(itemId, file, {
			entryPath,
			signal: aborter.signal,
			onProgress: (p) => (progress = p)
		});
		busy = false;
		progress = null;
		aborter = null;
		if (!res.ok) {
			// A cancel is the uploader's own decision, not a failure to explain.
			error = res.cancelled ? null : res.message;
			errorCode = res.cancelled ? null : (res.code ?? null);
			notice = res.cancelled ? 'Upload cancelled.' : null;
			candidates = res.cancelled ? [] : (res.candidates ?? []);
			chosenEntry = candidates[0] ?? '';
			// Hold the file only while there is a question to answer with it.
			pending = candidates.length ? file : null;
			if (res.cancelled && input) input.value = '';
			return;
		}
		pending = null;
		candidates = [];
		warnings = res.warnings ?? [];
		notice = res.replaced
			? `Deck replaced (${res.fileCount ?? 0} files).`
			: `Deck uploaded (${res.fileCount ?? 0} files).`;
		if (input) input.value = '';
		await onchanged?.();
	}

	function cancelUpload() {
		aborter?.abort();
	}

	function onpick(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (file) void send(file, null);
	}

	function confirmEntry() {
		if (pending && chosenEntry) void send(pending, chosenEntry);
	}

	async function remove() {
		if (!transports) return;
		if (!armRemove) {
			armRemove = true;
			return;
		}
		armRemove = false;
		busy = true;
		error = null;
		errorCode = null;
		notice = null;
		const res = await transports.deleteDeck(itemId);
		busy = false;
		if (!res.ok) {
			error = res.message;
			return;
		}
		warnings = [];
		notice = 'Deck removed.';
		await onchanged?.();
	}
</script>

{#if deck || editable}
	<section class="card deck-card">
		<h2>Presentation</h2>

		{#if deck}
			<a class="deck-open" {href}>
				{#if thumb}
					<img class="deck-thumb" src={thumb} alt="" loading="lazy" />
				{:else}
					<span class="deck-thumb placeholder" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<rect x="2.5" y="4" width="19" height="13" rx="1.5" />
							<path d="M12 17v3M8.5 20h7" />
						</svg>
					</span>
				{/if}
				<span class="deck-open-text">
					<span class="deck-name">{deck.title}</span>
					<span class="deck-meta">
						{#if deck.slides.length}{deck.slides.length} slides · {/if}Open presentation
					</span>
				</span>
			</a>

			{#if canManage}
				<p class="deck-sub">{deckSizeLine(deck)}</p>
				{#if !deck.has_state_file}
					<p class="deck-warn">
						This deck was uploaded without its <code>.image-slots.state.json</code> file, so any
						image cropped or panned by hand shows uncropped. Re-export the project with hidden
						files included and upload it again to restore the framing.
					</p>
				{/if}
			{/if}
		{/if}

		{#if editable}
			<div class="deck-actions">
				<label class="deck-upload">
					<input
						bind:this={input}
						type="file"
						accept=".zip,application/zip,application/x-zip-compressed"
						disabled={busy}
						onchange={onpick}
					/>
					<span class="btn secondary">{busy ? 'Uploading...' : deck ? 'Replace deck' : 'Upload a deck'}</span>
				</label>
				{#if deck}
					<button type="button" class="deck-remove" disabled={busy} onclick={remove}>
						{armRemove ? 'Tap again to remove' : 'Remove'}
					</button>
				{/if}
			</div>
			{#if progress}
				<div class="deck-progress">
					<div
						class="deck-bar"
						role="progressbar"
						aria-label="Deck upload"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={percent ?? undefined}
					>
						<span
							class="deck-bar-fill"
							class:indeterminate={percent === null}
							style={percent === null ? '' : `width: ${percent}%`}
						></span>
					</div>
					<div class="deck-progress-line">
						<span>{deckProgressLabel(progress)}{percent === null ? '' : ` · ${percent}%`}</span>
						{#if progress.phase === 'preparing' || progress.phase === 'uploading'}
							<button type="button" class="deck-cancel" onclick={cancelUpload}>Cancel</button>
						{/if}
					</div>
				</div>
			{/if}
			{#if !deck}
				<p class="deck-hint">
					Export from Claude Design as a project HTML zip with hidden files included -- the image
					framing lives in one of them. Uploads are capped at
					{Math.floor(DECK_UPLOAD_MAX_ZIP_BYTES / 1024 / 1024)} MB, so attach gifs and video to the
					item separately instead of embedding them.
				</p>
			{/if}
		{/if}

		{#if error}
			<p class="deck-error">
				{error}
				{#if errorCode}<span class="deck-code">({errorCode})</span>{/if}
			</p>
		{/if}

		{#if candidates.length}
			<div class="deck-choose">
				<p>Which page opens this deck?</p>
				{#each candidates as candidate (candidate)}
					<label class="deck-choice">
						<input type="radio" name="deck-entry" value={candidate} bind:group={chosenEntry} />
						<span>{candidate}</span>
					</label>
				{/each}
				<button type="button" class="btn secondary" disabled={busy || !chosenEntry} onclick={confirmEntry}>
					Use this page
				</button>
			</div>
		{/if}

		{#if notice}<p class="deck-notice">{notice}</p>{/if}
		{#each warnings as warning (warning)}
			<p class="deck-warn">{warning}</p>
		{/each}
	</section>
{/if}

<style>
	.deck-card {
		margin-top: var(--space-4);
	}
	.deck-open {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		text-decoration: none;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: 0.6rem;
		background: var(--surface-2);
		min-width: 0;
	}
	.deck-open:hover {
		border-color: var(--gold);
	}
	.deck-thumb {
		flex: none;
		width: 7.5rem;
		height: 4.3rem;
		object-fit: cover;
		border-radius: var(--radius-card);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
	}
	.deck-thumb.placeholder {
		display: grid;
		place-items: center;
		color: var(--gold);
	}
	.deck-thumb.placeholder svg {
		width: 1.7rem;
		height: 1.7rem;
	}
	.deck-open-text {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.deck-name {
		color: var(--text-1);
		font-size: 0.98rem;
		overflow-wrap: anywhere;
	}
	.deck-meta,
	.deck-sub {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.deck-sub {
		margin: 0.4rem 0 0;
	}
	.deck-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		margin-top: 0.7rem;
	}
	.deck-upload input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.deck-upload {
		display: inline-flex;
		cursor: pointer;
	}
	.deck-remove {
		appearance: none;
		background: none;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		color: var(--crimson);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		padding: 0 0.9rem;
		cursor: pointer;
		/* Stated as a box: padding plus a 0.66rem line box lands at 33px. */
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.deck-remove:disabled {
		color: var(--text-3);
		cursor: default;
	}
	.deck-progress {
		margin-top: 0.7rem;
	}
	.deck-bar {
		height: 6px;
		border-radius: 999px;
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		overflow: hidden;
	}
	.deck-bar-fill {
		display: block;
		height: 100%;
		background: var(--gold);
		transition: width 0.2s linear;
	}
	/* The server's unpacking phase reports nothing; a sweep says "working". */
	.deck-bar-fill.indeterminate {
		width: 35%;
		animation: deck-sweep 1.2s ease-in-out infinite;
	}
	@keyframes deck-sweep {
		0% {
			margin-left: -35%;
		}
		100% {
			margin-left: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.deck-bar-fill.indeterminate {
			width: 100%;
			animation: none;
			opacity: 0.4;
		}
	}
	.deck-progress-line {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		margin-top: 0.35rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.deck-cancel {
		appearance: none;
		background: none;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		color: var(--text-2);
		font: inherit;
		padding: 0 0.9rem;
		cursor: pointer;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.deck-cancel:hover {
		color: var(--text-1);
		border-color: var(--gold);
	}
	.deck-hint,
	.deck-warn,
	.deck-error,
	.deck-notice {
		margin: 0.6rem 0 0;
		font-size: 0.8rem;
		line-height: 1.45;
	}
	.deck-hint {
		color: var(--text-2);
	}
	.deck-warn {
		color: var(--amber);
	}
	.deck-error {
		color: var(--crimson);
	}
	.deck-code {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.deck-notice {
		color: var(--green);
	}
	.deck-warn code {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.74rem;
	}
	.deck-choose {
		margin-top: 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		align-items: flex-start;
	}
	.deck-choose p {
		margin: 0;
		font-size: 0.82rem;
		color: var(--text-1);
	}
	.deck-choice {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		font-size: 0.82rem;
		color: var(--text-1);
		overflow-wrap: anywhere;
		/* Comfortable on a phone without a second rule for touch. */
		padding: 0.35rem 0;
	}
	@media (max-width: 520px) {
		.deck-thumb {
			width: 5.4rem;
			height: 3.1rem;
		}
	}
</style>
