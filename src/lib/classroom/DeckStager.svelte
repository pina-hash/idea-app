<script lang="ts">
	import {
		DECK_UPLOAD_MAX_ZIP_BYTES,
		deckProgressLabel,
		deckProgressPercent,
		deckUploadSizeIssue,
		type ClassroomDeck,
		type DeckUploadProgress
	} from '$lib/classroom/deck';
	import { formatBytes } from '$lib/classroom/classroom';

	/**
	 * Picking a presentation deck FROM THE COMPOSER, on create as well as edit.
	 *
	 * WHY THIS EXISTS BESIDE DeckPanel. A deck is stored against the canonical
	 * item id, so it cannot be uploaded until the item exists -- which is why it
	 * used to live only on the item page, reachable exclusively by saving an
	 * assignment and then going and finding it again. Nothing in the composer
	 * said a deck was even possible. So the file is STAGED here and uploaded by
	 * the composer immediately after the create or update call hands back an id,
	 * exactly the way attachments have always worked.
	 *
	 * DeckPanel stays as it is: it is the item page's surface, with the viewer
	 * link, the thumbnail and the standalone replace flow, and it needs an item
	 * that already exists and one section to link into. This is the pre-save
	 * half -- a picker, a staged row, and the progress and refusals of the
	 * upload the composer runs on its behalf.
	 *
	 * PRESENTATION AND STAGING ONLY. It never uploads anything itself; the
	 * composer owns the sequencing, because only the composer knows whether the
	 * item save succeeded.
	 */
	let {
		file = $bindable(null),
		deck = null,
		entryPath = $bindable(null),
		candidates = [],
		progress = null,
		error = null,
		errorCode = null,
		warnings = [],
		notice = null,
		busy = false,
		onremove = null,
		removing = false
	}: {
		/** The zip waiting to be uploaded when the composer saves. */
		file?: File | null;
		/** The deck already on this item, when editing one that has one. */
		deck?: ClassroomDeck | null;
		/** Chosen answer to "which page opens this deck?", if it was asked. */
		entryPath?: string | null;
		candidates?: string[];
		progress?: DeckUploadProgress | null;
		error?: string | null;
		errorCode?: string | null;
		warnings?: string[];
		notice?: string | null;
		busy?: boolean;
		/** Removing an EXISTING deck needs an item, so only edit mode passes it. */
		onremove?: (() => void | Promise<void>) | null;
		removing?: boolean;
	} = $props();

	let input = $state<HTMLInputElement | null>(null);
	let armRemove = $state(false);
	/**
	 * Refused before anything is staged, let alone sent -- the same up-front
	 * check DeckPanel makes, from the same one place the message is written, so
	 * an oversize zip never sits in the form looking like it will upload.
	 */
	let sizeIssue = $state<string | null>(null);

	const percent = $derived(progress ? deckProgressPercent(progress) : null);

	function pick(event: Event) {
		const el = event.currentTarget as HTMLInputElement;
		const picked = el.files?.[0] ?? null;
		el.value = '';
		if (!picked) return;
		const issue = deckUploadSizeIssue(picked.size);
		if (issue) {
			sizeIssue = issue;
			file = null;
			return;
		}
		sizeIssue = null;
		entryPath = null;
		file = picked;
	}

	function clear() {
		file = null;
		entryPath = null;
		sizeIssue = null;
	}

	function remove() {
		if (!armRemove) {
			armRemove = true;
			return;
		}
		armRemove = false;
		void onremove?.();
	}
</script>

<div class="deck-stager">
	<span class="mini-label">Presentation deck</span>

	{#if deck}
		<p class="line">
			<span class="ok-dot"></span>
			<strong>{deck.title}</strong>
			<span class="meta">
				{deck.file_count} files{#if deck.slides.length} · {deck.slides.length} slides{/if}
			</span>
		</p>
		{#if !deck.has_state_file}
			<p class="warn">
				Uploaded without its <code>.image-slots.state.json</code> file, so any image cropped or
				panned by hand shows uncropped. Re-export with hidden files included and upload it again.
			</p>
		{/if}
	{:else if !file}
		<p class="hint none">No deck on this item.</p>
	{/if}

	{#if file}
		<p class="line staged-line">
			<strong>{file.name}</strong>
			<span class="meta">{formatBytes(file.size)}</span>
			<button type="button" class="btn secondary tiny" disabled={busy} onclick={clear}>&times;</button>
		</p>
		<p class="hint">Uploads when you save.</p>
	{/if}

	<div class="actions">
		<label class="pick">
			<input
				bind:this={input}
				type="file"
				accept=".zip,application/zip,application/x-zip-compressed"
				disabled={busy}
				onchange={pick}
			/>
			<span class="btn secondary tiny">
				{file ? 'Choose a different zip' : deck ? 'Replace deck' : 'Attach a deck'}
			</span>
		</label>
		{#if deck && onremove}
			<button type="button" class="btn secondary tiny danger" disabled={busy || removing} onclick={remove}>
				{armRemove ? 'Really remove?' : 'Remove deck'}
			</button>
		{/if}
	</div>

	{#if !deck && !file}
		<p class="hint">
			Export from Claude Design as a project HTML zip. Keep hidden files in the zip: the image
			framing lives in one. Capped at {Math.floor(DECK_UPLOAD_MAX_ZIP_BYTES / 1024 / 1024)} MB --
			if the deck has gifs or video, take them out and attach them to the item separately.
		</p>
	{/if}

	{#if sizeIssue}<p class="err">{sizeIssue}</p>{/if}

	{#if progress}
		<div class="bar" role="progressbar" aria-label="Deck upload" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent ?? undefined}>
			<span class="fill" class:indeterminate={percent === null} style={percent === null ? '' : `width: ${percent}%`}></span>
		</div>
		<p class="hint">{deckProgressLabel(progress)}{percent === null ? '' : ` · ${percent}%`}</p>
	{/if}

	{#if error}
		<p class="err">{error}{#if errorCode}<span class="code">({errorCode})</span>{/if}</p>
	{/if}

	<!-- A zip with several plausible entry pages: the server asks rather than
	     guessing, and the answer rides the next save with the SAME staged file. -->
	{#if candidates.length}
		<div class="choose">
			<p class="hint">Which page opens this deck? Pick one, then save again.</p>
			{#each candidates as candidate (candidate)}
				<label class="choice">
					<input type="radio" name="composer-deck-entry" value={candidate} bind:group={entryPath} />
					<span>{candidate}</span>
				</label>
			{/each}
		</div>
	{/if}

	{#if notice}<p class="ok">{notice}</p>{/if}
	{#each warnings as warning (warning)}
		<p class="warn">{warning}</p>
	{/each}
</div>

<style>
	.deck-stager {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 0.6rem 0;
	}
	.line {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-1);
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		overflow-wrap: anywhere;
	}
	.meta {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.64rem;
		color: var(--text-2);
	}
	.hint {
		margin: 0;
		color: var(--text-2);
		font-size: 0.78rem;
		line-height: 1.45;
	}
	.hint.none {
		font-style: italic;
	}
	.actions {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.pick input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.pick {
		display: inline-flex;
		cursor: pointer;
	}
	.err {
		margin: 0;
		color: var(--crimson);
		font-size: 0.78rem;
		line-height: 1.45;
	}
	.warn {
		margin: 0;
		color: var(--amber);
		font-size: 0.78rem;
		line-height: 1.45;
	}
	.ok {
		margin: 0;
		color: var(--green);
		font-size: 0.78rem;
	}
	.code {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--text-2);
		margin-left: 0.3rem;
	}
	.warn code {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.74rem;
	}
	.bar {
		height: 6px;
		border-radius: 999px;
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		background: var(--gold);
		transition: width 0.2s linear;
	}
	.fill.indeterminate {
		width: 35%;
		animation: stager-sweep 1.2s ease-in-out infinite;
	}
	@keyframes stager-sweep {
		0% {
			margin-left: -35%;
		}
		100% {
			margin-left: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fill.indeterminate {
			width: 100%;
			animation: none;
			opacity: 0.4;
		}
	}
	.choose {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.choice {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		font-size: 0.82rem;
		color: var(--text-1);
		overflow-wrap: anywhere;
		padding: 0.3rem 0;
		cursor: pointer;
	}
	.choice input {
		width: auto;
		accent-color: var(--green);
	}
</style>
