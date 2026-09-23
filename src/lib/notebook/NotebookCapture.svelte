<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import NoteEditor from '$lib/notebook/NoteEditor.svelte';
	import PhotoCorrector from '$lib/notebook/PhotoCorrector.svelte';
	import CameraCapture from '$lib/notebook/CameraCapture.svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import {
		cameraCaptureSupported,
		fitForUpload,
		preferredCapturePath,
		unusableReason,
		type CapturePath
	} from '$lib/notebook/camera';
	import {
		entryTitle,
		livePhotos,
		photoSrc,
		statusLabel,
		type NotebookEntry,
		type NotebookPhoto
	} from '$lib/notebook';
	import { photoThumbSrc } from '$lib/notebook-folders';
	import { noteThreads, tiptapHasText, type NoteDoc, type TiptapNode } from '$lib/notebook-notes';
	import {
		CAPTURE_STATES,
		capturePending,
		continuedDraft,
		entriesInFiling,
		filedWhen,
		looksLikePhoto,
		straightenTarget,
		type CaptureFiling
	} from '$lib/notebook/capture';
	import {
		CaptureQueue,
		CAPTURE_WAITING_NOTE,
		type CaptureItem,
		type NotebookCaptureTransports
	} from '$lib/notebook/capture-queue';
	import type { CaptureStore } from '$lib/notebook/capture-store';

	/**
	 * CAPTURE WHERE THE WORK IS (ledger 0297, package F4b): a page or a note
	 * added to the notebook from the item it belongs to, in one step, filed
	 * automatically, and never held only in memory.
	 *
	 * WHAT IT IS AND IS NOT. It is the notebook's own write path -- the same
	 * routes and RPCs the notebook tab uses, reached through the same
	 * transports -- with the filing decided by the item (`captureFiling`)
	 * rather than picked by the student. It is not a second composer: folders,
	 * pins, titles and history stay in the notebook, and "Open in notebook"
	 * is one press away.
	 *
	 * A PHOTO IS UPLOADED WHEN IT IS TAKEN, AS A DRAFT. `CaptureQueue` owns the
	 * sequence and its rules (device first, one at a time, a failure holds the
	 * line, a retry re-reads before it re-sends); this component renders its
	 * items and owns the note and Turn in. Straightening is a CHOICE AFTER THE
	 * FACT, offered on the latest page only (`straightenTarget`), because that
	 * is the one page a corrected copy is guaranteed to pair with.
	 *
	 * ABSENCE REMOVES CONTROLS. No transports: the filed list is all there is.
	 * `uploadReady` false: no photo controls (Drive is not configured), the
	 * note still works. `draftsReady` false: nothing here can hold a draft,
	 * so the capture offers nothing and says why in one line.
	 */
	let {
		viewerId,
		filing,
		entries = [],
		uploadReady = true,
		draftsReady = true,
		coalescingReady = false,
		transports = null,
		store = null,
		notebookHref,
		onChanged,
		testPrefix = 'capture'
	}: {
		viewerId: string;
		filing: CaptureFiling;
		/** The student's own entries in this class; filtered to the filing here. */
		entries?: NotebookEntry[];
		uploadReady?: boolean;
		draftsReady?: boolean;
		coalescingReady?: boolean;
		transports?: NotebookCaptureTransports | null;
		/** Where photos wait for the server; null keeps them in the tab only. */
		store?: CaptureStore | null;
		notebookHref: string;
		/** After a turn-in, so the route can reload what was filed. */
		onChanged?: () => void;
		testPrefix?: string;
	} = $props();

	// The draft and the filing are READ ONCE, at mount: this surface is keyed on
	// the filing by its caller, and a reload after Turn in re-seeds it.
	// svelte-ignore state_referenced_locally
	const startDraft = continuedDraft(entries, filing);

	const writable = $derived(!!transports && draftsReady);
	/** Everything already filed here except the draft this surface is writing. */
	const filed = $derived(entriesInFiling(entries, filing).filter((e) => e.id !== queueEntryId));

	// ---- the queue ---------------------------------------------------------

	let items = $state<CaptureItem[]>([]);
	// svelte-ignore state_referenced_locally
	let queueEntryId = $state<string | null>(startDraft?.id ?? null);
	let storeNotice = $state<string | null>(null);
	let previews = $state<Record<string, string>>({});

	// svelte-ignore state_referenced_locally
	const queue = transports
		? new CaptureQueue({
				viewer: viewerId,
				filing,
				entryId: startDraft?.id ?? null,
				transports,
				store,
				prepare: async (file) => {
					try {
						return await fitForUpload(file);
					} catch {
						return file;
					}
				},
				onChange: () => sync()
			})
		: null;

	function sync() {
		if (!queue) return;
		// Copied out as plain objects: the queue mutates its own, and Svelte
		// state must be replaced to be seen.
		items = queue.items.map((i) => ({ ...i }));
		queueEntryId = queue.entryId;
		storeNotice = queue.notice;
		for (const i of queue.items) {
			if (i.blob && !previews[i.token]) previews = { ...previews, [i.token]: URL.createObjectURL(i.blob) };
		}
	}

	onMount(() => {
		if (!queue) return;
		sync();
		void queue.resume();
	});

	onDestroy(() => {
		queue?.close();
		for (const url of Object.values(previews)) URL.revokeObjectURL(url);
		// An unsaved note is sent on the way out of an in-app navigation; the
		// document is still alive, so the request finishes after this unmounts.
		if (save.dirty) void save.saveNow();
		save.destroy();
	});

	/** The pages of the draft: what the server already has, then what this tab took. */
	const serverPhotos = $derived(
		startDraft && startDraft.id === queueEntryId ? livePhotos(startDraft.photos) : []
	);
	const localPages = $derived(
		items.filter((i) => !serverPhotos.some((p) => p.original_filename === i.uploadName))
	);
	type Page = { key: string; src: string; state: CaptureItem['state'] | 'stored'; item: CaptureItem | null; photo: NotebookPhoto | null; variant: 'original' | 'enhanced' };
	const pages = $derived<Page[]>([
		...serverPhotos
			.slice()
			.sort((a, b) => a.sequence_order - b.sequence_order)
			.map((p) => ({ key: p.id, src: photoThumbSrc(p.id), state: 'stored' as const, item: null, photo: p, variant: p.variant })),
		...localPages.map((i) => ({
			key: i.token,
			src: previews[i.token] ?? '',
			state: i.state,
			item: i,
			photo: null,
			variant: i.variant
		}))
	]);
	/** One sequence over both, so the pairing rule is asked of the order they will land in. */
	const sequence = $derived<NotebookPhoto[]>(
		pages.map((p, n) => ({
			id: p.key,
			drive_file_id: '',
			variant: p.variant,
			sequence_order: n + 1,
			original_filename: null,
			removed_at: null
		}))
	);
	const straightenKey = $derived(uploadReady && writable ? (straightenTarget(sequence)?.id ?? null) : null);
	const pending = $derived(items.filter((i) => capturePending(i.state)).length);
	const failed = $derived(items.some((i) => i.state === 'failed'));
	/** Behind a failed photo, in order: they wait for it (a failure holds the line). */
	const waiting = $derived.by(() => {
		const out = new Set<string>();
		const first = items.findIndex((i) => i.state === 'failed');
		if (first < 0) return out;
		for (const i of items.slice(first + 1)) if (i.state !== 'uploaded') out.add(i.token);
		return out;
	});
	/** Numbered as they will read in the notebook: a corrected copy shares its page's number. */
	const pageNumbers = $derived.by(() => {
		const out: Record<string, number> = {};
		let n = 0;
		for (const p of pages) {
			if (p.variant === 'original') n++;
			out[p.key] = Math.max(n, 1);
		}
		return out;
	});

	// ---- taking a photo ----------------------------------------------------

	let captureInput = $state<HTMLInputElement | null>(null);
	let cameraOpen = $state(false);
	let capturePath = $state<CapturePath>('native');
	let refusal = $state<string | null>(null);
	let dragging = $state(false);

	onMount(() => {
		capturePath = preferredCapturePath(navigator.userAgent, cameraCaptureSupported());
	});

	async function take(files: File[]) {
		if (!queue || !uploadReady) return;
		refusal = null;
		for (const file of files) {
			if (!looksLikePhoto(file)) {
				refusal = `${file.name || 'That file'} is not a photo, so it was not added.`;
				continue;
			}
			const unusable = await unusableReason(file);
			if (unusable) {
				refusal = `${file.name || 'That photo'} ${unusable}`;
				continue;
			}
			await queue.add(file);
		}
	}

	function onPicked(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const picked = Array.from(input.files ?? []);
		input.value = '';
		void take(picked);
	}

	function openCamera() {
		if (capturePath === 'in-app') cameraOpen = true;
		else captureInput?.click();
	}

	function onDrop(e: DragEvent) {
		if (!writable || !uploadReady) return;
		e.preventDefault();
		dragging = false;
		void take(Array.from(e.dataTransfer?.files ?? []));
	}

	function onPaste(e: ClipboardEvent) {
		if (!writable || !uploadReady) return;
		const files = Array.from(e.clipboardData?.files ?? []).filter(looksLikePhoto);
		if (!files.length) return;
		e.preventDefault();
		void take(files);
	}

	// ---- straightening, after the fact -------------------------------------

	let correcting = $state<{ file: File; key: string } | null>(null);
	let straightenError = $state<string | null>(null);

	async function straighten(page: Page) {
		straightenError = null;
		try {
			let blob: Blob | null = page.item?.blob ?? null;
			if (!blob) {
				const src = page.item ? previews[page.item.token] : page.photo ? photoSrc(page.photo.id) : null;
				if (!src) throw new Error('missing');
				const res = await fetch(src);
				if (!res.ok) throw new Error(String(res.status));
				blob = await res.blob();
			}
			correcting = { file: new File([blob], 'page.jpg', { type: blob.type || 'image/jpeg' }), key: page.key };
		} catch {
			straightenError = 'That page could not be opened to straighten.';
		}
	}

	async function corrected(enhanced: File | null) {
		const target = correcting;
		correcting = null;
		if (!enhanced || !target || !queue) return;
		// RE-ASKED, not remembered: a page taken while the corrector was open
		// makes this one no longer the latest, and a copy appended now would
		// pair with that newer page.
		if (straightenKey !== target.key) {
			straightenError = 'A newer page was added, so this one can no longer be straightened.';
			return;
		}
		await queue.add(enhanced, { variant: 'enhanced', pairOf: target.key });
	}

	// ---- the note ----------------------------------------------------------

	// svelte-ignore state_referenced_locally
	const startThread = startDraft ? (noteThreads(startDraft.notes ?? [])[0] ?? null) : null;
	let noteId = $state<string | null>(startThread?.noteId ?? null);
	let noteDraft = $state<TiptapNode | null>(null);
	let editorKey = $state(0);
	let editorSeed = $state<NoteDoc | null>((startThread?.current.content as NoteDoc | undefined) ?? null);
	const baseline = new EditBaseline();
	const noteChanged = $derived(noteDraft !== null && baseline.changed(noteDraft));

	const save = new SaveState({
		fallbackMessage: 'Your note was not saved.',
		onHide: () => {
			const entryId = queue?.entryId;
			if (!transports?.flushNote || !noteDraft || !entryId || !noteChanged) return;
			transports.flushNote({ entryId, noteId, content: noteDraft, autosave: coalescingReady });
		},
		async save() {
			const doc = noteDraft;
			if (!queue || !transports || !doc || !noteChanged) return { ok: true } as const;
			if (!tiptapHasText(doc)) return { ok: true } as const;
			if (!queue.entryId) {
				const created = await queue.createExclusively(async () => {
					if (queue.entryId) return null;
					return transports.createNote({
						content: doc,
						custom_label: filing.customLabel,
						folder_id: null,
						session_id: filing.sessionId,
						section_id: filing.sectionId,
						submitted: false,
						autosave: coalescingReady || undefined
					});
				});
				if (created) {
					if (!created.ok) {
						return { ok: false, retryable: created.retryable !== false, message: created.error } as const;
					}
					queue.entryId = created.entryId;
					noteId = created.noteId ?? null;
					queueEntryId = created.entryId;
					baseline.advance(doc);
					return { ok: true } as const;
				}
			}
			const entryId = queue.entryId as string;
			const res = noteId
				? await transports.editNote(noteId, doc, coalescingReady || undefined)
				: await transports.addNote(entryId, doc, coalescingReady || undefined);
			if (!res.ok) return { ok: false, retryable: res.retryable !== false, message: res.error } as const;
			if (!noteId && res.noteId) noteId = res.noteId;
			baseline.advance(doc);
			return { ok: true } as const;
		}
	});

	$effect(() => save.attach());

	$effect(() => {
		const isChanged = noteChanged;
		untrack(() => {
			if (isChanged) save.markDirty();
			else if (save.phase === 'dirty') save.reset();
		});
	});

	// ---- turning in --------------------------------------------------------

	let turning = $state(false);
	let turnMessage = $state<string | null>(null);
	let turnError = $state<string | null>(null);

	const hasWork = $derived(pages.length > 0 || tiptapHasText(noteDraft) || !!noteId);
	/** THE ONE PREDICATE the button and the handler both read. */
	const turnInReason = $derived.by((): string | null => {
		if (!hasWork) return 'Add a photo or write a note first.';
		if (failed) return 'A photo did not upload. Retry or discard it first.';
		if (pending > 0) return 'Wait for the photos to finish uploading.';
		return null;
	});

	async function turnIn() {
		if (!queue || !transports || turning) return;
		turnError = null;
		turnMessage = null;
		if (turnInReason) {
			turnError = turnInReason;
			return;
		}
		turning = true;
		try {
			await save.saveNow();
			if (save.failed) {
				turnError = 'Your note did not save yet, so nothing was turned in.';
				return;
			}
			await queue.drain();
			if (queue.pending > 0 || !queue.entryId) {
				turnError = queue.pending > 0 ? 'Wait for the photos to finish uploading.' : 'Add a photo or write a note first.';
				return;
			}
			const res = await transports.submitEntry(queue.entryId);
			if (!res.ok) {
				turnError = res.error;
				return;
			}
			turnMessage = 'Turned in.';
			queue.startNewDraft();
			for (const url of Object.values(previews)) URL.revokeObjectURL(url);
			previews = {};
			noteId = null;
			noteDraft = null;
			editorSeed = null;
			baseline.clear();
			save.reset();
			editorKey++;
			sync();
			onChanged?.();
		} finally {
			turning = false;
		}
	}

	function stateWords(state: Page['state'], item: CaptureItem | null): { word: string; glyph: string } {
		if (state === 'stored') return CAPTURE_STATES.uploaded;
		const base = CAPTURE_STATES[state];
		if (state === 'failed' && item?.kept) return { ...base, word: `${base.word}, kept on this device` };
		return base;
	}

	function filedLabel(e: NotebookEntry): string {
		if (e.submitted_at === null) return 'Draft';
		return e.status === 'compliant' ? 'Turned in' : statusLabel(e.status);
	}
</script>

<section
	class="nbc"
	class:dragging
	data-testid={testPrefix}
	aria-label="Add to your notebook"
	ondragover={(e) => {
		if (!writable || !uploadReady) return;
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
	onpaste={onPaste}
>
	{#if !draftsReady}
		<p class="nbc-muted">Adding from here is not available yet. Use your notebook.</p>
	{:else if writable}
		{#if uploadReady}
			<div class="nbc-actions">
				<button type="button" class="btn nbc-take tap-44" data-testid="{testPrefix}-take" onclick={openCamera}>
					<span aria-hidden="true">◉</span> Take a photo
				</button>
				<label class="btn secondary nbc-pick tap-44" data-testid="{testPrefix}-pick">
					Add photos
					<input
						class="nbc-file"
						type="file"
						accept="image/*"
						multiple
						onchange={onPicked}
						data-testid="{testPrefix}-pick-input"
					/>
				</label>
				<input
					bind:this={captureInput}
					class="nbc-file"
					type="file"
					accept="image/*"
					capture="environment"
					onchange={onPicked}
					data-testid="{testPrefix}-camera-input"
					tabindex="-1"
					aria-hidden="true"
				/>
			</div>
		{/if}

		{#if refusal}<p class="nbc-msg error" role="alert">{refusal}</p>{/if}
		{#if storeNotice}<p class="nbc-msg warn" role="status" data-testid="{testPrefix}-store-notice">{storeNotice}</p>{/if}

		{#if pages.length}
			<ol class="nbc-pages" data-testid="{testPrefix}-pages">
				{#each pages as page (page.key)}
					{@const words = stateWords(page.state, page.item)}
					<li class="nbc-page" data-state={page.state} data-testid="{testPrefix}-page">
						{#if page.src}
							<img src={page.src} alt="Page {pageNumbers[page.key]}{page.variant === 'enhanced' ? ', straightened' : ''}" />
						{:else}
							<span class="nbc-noimg" aria-hidden="true">▢</span>
						{/if}
						<span class="nbc-page-meta">
							<span class="nbc-page-num">
								Page {pageNumbers[page.key]}{page.variant === 'enhanced' ? ', straightened' : ''}
							</span>
							<span class="nbc-state" data-testid="{testPrefix}-state">
								<span aria-hidden="true">{words.glyph}</span>
								{words.word}
							</span>
							{#if page.item?.error}
								<span class="nbc-err">{page.item.error}</span>
							{:else if waiting.has(page.key)}
								<span class="nbc-err">{CAPTURE_WAITING_NOTE}</span>
							{/if}
						</span>
						<span class="nbc-page-tools">
							{#if page.item && page.state === 'failed'}
								<button type="button" class="btn secondary tight tap-44" onclick={() => queue?.retry(page.key)}>Retry</button>
								<button type="button" class="btn secondary tight tap-44" onclick={() => queue?.discard(page.key)}>Discard</button>
							{/if}
							{#if straightenKey === page.key}
								<button
									type="button"
									class="btn secondary tight tap-44"
									data-testid="{testPrefix}-straighten"
									onclick={() => straighten(page)}>Straighten</button
								>
							{/if}
						</span>
					</li>
				{/each}
			</ol>
		{/if}
		{#if straightenError}<p class="nbc-msg error" role="alert">{straightenError}</p>{/if}

		<div class="nbc-note">
			{#key editorKey}
				<NoteEditor
					value={editorSeed}
					onchange={(doc) => (noteDraft = doc)}
					onready={(doc) => baseline.seed(doc)}
					placeholder="Write about this..."
					label="Note for your notebook"
					{viewerId}
				/>
			{/key}
			<SaveIndicator state={save} />
		</div>

		<div class="nbc-foot">
			<button
				type="button"
				class="btn tap-44"
				data-testid="{testPrefix}-turn-in"
				aria-disabled={turnInReason !== null || turning}
				onclick={turnIn}
			>
				{turning ? 'Turning in...' : 'Turn in'}
			</button>
			<a class="nbc-open tap-44" href={notebookHref} data-testid="{testPrefix}-open">Open in notebook</a>
		</div>
		{#if turnError}<p class="nbc-msg error" role="alert" data-testid="{testPrefix}-turn-error">{turnError}</p>{/if}
		{#if turnMessage}<p class="nbc-msg ok" role="status" data-testid="{testPrefix}-turned-in">{turnMessage}</p>{/if}
	{/if}

	{#if filed.length}
		<div class="nbc-filed" data-testid="{testPrefix}-filed">
			<h3 class="nbc-filed-head">Already in your notebook</h3>
			<ul>
				{#each filed as e (e.id)}
					<li>
						<a href={notebookHref} class="nbc-filed-link tap-44">
							<span class="nbc-filed-title">{entryTitle(e)}</span>
							<span class="nbc-filed-meta">
								{filedWhen(e.upload_timestamp)} · {livePhotos(e.photos).length}
								{livePhotos(e.photos).length === 1 ? 'photo' : 'photos'} · {filedLabel(e)}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>

{#if cameraOpen}
	<CameraCapture
		onCapture={(file) => {
			cameraOpen = false;
			void take([file]);
		}}
		onCancel={() => (cameraOpen = false)}
		onError={(message) => {
			cameraOpen = false;
			refusal = message;
			captureInput?.click();
		}}
	/>
{/if}

{#if correcting}
	<PhotoCorrector file={correcting.file} onDone={(enhanced) => corrected(enhanced)} />
{/if}

<style>
	.nbc {
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
		border-radius: var(--radius-md, 8px);
		outline: 2px dashed transparent;
		outline-offset: 4px;
	}
	.nbc.dragging {
		outline-color: var(--boundary);
	}
	.nbc-actions,
	.nbc-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
	}
	.nbc-take,
	.nbc-pick {
		min-height: 44px;
	}
	.nbc-pick {
		position: relative;
		overflow: hidden;
		cursor: pointer;
	}
	.nbc-file {
		position: absolute;
		inset: 0;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}
	/* The capture input is opened by the button, never pressed itself. */
	.nbc-actions > .nbc-file {
		width: 1px;
		height: 1px;
		inset: auto;
		pointer-events: none;
	}
	.nbc-pages {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2, 0.5rem);
	}
	.nbc-page {
		display: grid;
		grid-template-columns: 4rem minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2, 0.5rem);
		padding: var(--space-2, 0.5rem);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 6px);
		background: var(--surface-1);
		min-width: 0;
	}
	.nbc-page img,
	.nbc-noimg {
		width: 4rem;
		height: 4rem;
		object-fit: contain;
		background: var(--surface-2);
		border-radius: var(--radius-sm, 6px);
		display: grid;
		place-items: center;
		color: var(--text-2);
	}
	.nbc-page-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.nbc-page-num {
		color: var(--text-1);
		font-weight: 600;
	}
	.nbc-state {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
		display: inline-flex;
		gap: 0.35em;
		align-items: baseline;
	}
	.nbc-page[data-state='failed'] .nbc-state,
	.nbc-err {
		color: var(--status-danger, var(--crimson));
	}
	.nbc-page[data-state='uploaded'] .nbc-state,
	.nbc-page[data-state='stored'] .nbc-state {
		color: var(--status-ok, var(--green));
	}
	.nbc-err {
		font-size: 0.85rem;
	}
	.nbc-page-tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1, 0.25rem);
		justify-content: flex-end;
	}
	.nbc-note {
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
		min-width: 0;
	}
	.nbc-open {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--body-link, var(--cyan));
	}
	.nbc-msg {
		margin: 0;
		font-size: 0.9rem;
	}
	.nbc-msg.error {
		color: var(--status-danger, var(--crimson));
	}
	.nbc-msg.warn {
		color: var(--status-warn, var(--amber));
	}
	.nbc-msg.ok {
		color: var(--status-ok, var(--green));
	}
	.nbc-muted {
		margin: 0;
		color: var(--text-2);
	}
	.nbc-filed {
		border-top: 1px solid var(--hairline);
		padding-top: var(--space-2, 0.5rem);
	}
	.nbc-filed-head {
		margin: 0 0 var(--space-1, 0.25rem);
		font-size: 0.85rem;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.nbc-filed-head::before {
		content: none;
	}
	.nbc-filed ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.nbc-filed-link {
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-height: 44px;
		padding: var(--space-1, 0.25rem) 0;
		text-decoration: none;
		color: var(--text-1);
	}
	.nbc-filed-title {
		color: var(--body-link, var(--cyan));
	}
	.nbc-filed-meta {
		font-size: 0.85rem;
		color: var(--text-2);
	}
</style>
