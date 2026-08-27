<script lang="ts">
	/**
	 * THE ONE FILE PICKER IN THE CLASSROOM, FOR BOTH SIDES OF IT.
	 *
	 * An instructor attaching a handout and a student handing in a CAD assembly
	 * mount THIS component, with the same failure semantics, the same progress
	 * bar, the same retry, and the same words -- gated by a prop, not copied.
	 * They were two implementations before: the composer collected every
	 * failure and left the failed files staged, and the assignment engine ran a
	 * `for` loop that `return`ed on the first failure and silently abandoned
	 * every file after it, with nothing left staged to retry because the input
	 * had already been cleared.
	 *
	 * WHAT IT GUARANTEES, and each of these is a thing the student side did not
	 * have:
	 *
	 *   - EVERY FILE IS ATTEMPTED. One failing does not cancel the rest.
	 *   - A FAILED FILE STAYS STAGED, holding its own `File` handle, with its
	 *     own message and its own Retry. The browser gave us a handle and not a
	 *     path, so a file we drop is a file somebody has to go and find again.
	 *   - THE MESSAGE IS THE SERVER'S OWN and names its gate: the size and the
	 *     limit, an expired upload link, or a refusal. Never "Upload failed".
	 *   - PROGRESS IS PER FILE, because the whole point of the bundle is that
	 *     files are now big enough for progress to matter.
	 *
	 * THE TRANSPORT IS INJECTED. The route points `upload` at
	 * `uploadClassroomFile`; the dev harness answers in memory. Absence is not a
	 * mode here -- a surface that must not upload does not mount this.
	 *
	 * NO `accept` ON THE PICKER, ANYWHERE. There is no extension list and no
	 * MIME list on either side; a `.SLDPRT`, a `.zip`, a file with no extension
	 * and a file the browser could not type are all ordinary. The one exception
	 * is the optional CAMERA button, which carries `accept="image/*"` because
	 * `capture` is what makes a phone open its camera and an unfiltered capture
	 * input opens a file browser instead -- it is an affordance beside the plain
	 * picker, never instead of it, so it gates nothing.
	 */
	import type { UploadOutcome, UploadedFileRow } from '$lib/classroom/file-upload';
	import { formatBytesShort } from '$lib/classroom/upload-errors';
	import { isImageFilename } from '$lib/classroom/classroom';
	import { dropTarget } from '$lib/file-drop';

	export interface PanelUpload {
		(args: {
			itemId: string;
			file: File;
			blockId: string | null;
			caption: string | null;
			onProgress: (fraction: number) => void;
		}): Promise<UploadOutcome>;
	}

	interface Entry {
		file: File;
		status: 'staged' | 'uploading' | 'failed';
		progress: number;
		error: string | null;
		/** Whether saving again with the SAME file is worth trying. */
		retryable: boolean;
	}

	interface Props {
		/** Wording only. The transport decides what actually happens, and the
		 *  database decides whether it may. */
		role: 'attachment' | 'submission' | 'instructor';
		/** Known up front on the student side; null in a composer creating an
		 *  item, where it does not exist until the save call returns. */
		itemId?: string | null;
		blockId?: string | null;
		upload: PanelUpload;
		label?: string;
		hint?: string;
		/** Start uploading the moment files are picked. False in a composer,
		 *  where there is no item id to upload against yet. */
		autoStart?: boolean;
		/** Offer the phone-camera button beside the plain picker. */
		offerCamera?: boolean;
		/** One landed. The parent adds it to whatever list it renders. */
		onuploaded?: (row: UploadedFileRow | undefined) => void;
		/** How many files are held here, after every change. A composer's
		 *  dirty signal reads this. */
		oncountchange?: (count: number) => void;
		/** Show a thumbnail for a picked or pasted picture. */
		showPreviews?: boolean;
	}

	let {
		role,
		itemId = null,
		blockId = null,
		upload,
		label = 'Files',
		hint = '',
		autoStart = false,
		offerCamera = false,
		onuploaded,
		oncountchange,
		showPreviews = false
	}: Props = $props();

	let entries = $state<Entry[]>([]);
	let running = $state(false);
	/** Dragover feedback for the SHARED drop target below -- an outline plus a
	 *  label, never a border or a size change, so a drag never shifts this
	 *  panel's own layout or its neighbours'. */
	let dragActive = $state(false);

	/**
	 * A staged picture shows as a PICTURE before anything is uploaded -- a
	 * filename says nothing about whether the right page is in frame (the
	 * notebook's staged-thumbnail lesson).
	 *
	 * KEYED ON THE FILENAME EXTENSION, NEVER ON `File.type`. There is no type
	 * gate anywhere on this path any more, and a `File.type` read here would be
	 * the last one left -- worse, it is the read that is legitimately EMPTY for
	 * a HEIC off an iPhone. An extension that turns out not to be a picture
	 * simply fails to decode and the `onerror` drops the thumbnail; nothing is
	 * refused either way.
	 *
	 * THE RULE ITSELF IS `isImageFilename`, IMPORTED. It used to be a private
	 * regex here, byte-identical to the one in classroom.ts -- which is exactly
	 * the arrangement where one of them gains a format and the other does not.
	 */

	/** Non-reactive on purpose: the effect that fills it reads `entries` and
	 *  writing the URLs into reactive state as well would re-trigger it on its
	 *  own writes. `previewRev` is the one signal it publishes. */
	const previewUrls = new Map<File, string>();
	let previewRev = $state(0);

	$effect(() => {
		if (!showPreviews) return;
		const held = entries.map((e) => e.file);
		let made = false;
		for (const file of held) {
			if (!previewUrls.has(file) && isImageFilename(file.name)) {
				previewUrls.set(file, URL.createObjectURL(file));
				made = true;
			}
		}
		for (const [file, url] of previewUrls) {
			if (!held.includes(file)) {
				URL.revokeObjectURL(url);
				previewUrls.delete(file);
				made = true;
			}
		}
		if (made) previewRev += 1;
	});

	function previewOf(file: File): string | null {
		void previewRev;
		return previewUrls.get(file) ?? null;
	}

	/** How many files are still here (staged or failed). */
	export function count(): number {
		return entries.length;
	}

	/** The File handles still held, for a parent that needs them (a draft
	 *  signature, a discard warning). */
	export function files(): File[] {
		return entries.map((e) => e.file);
	}

	export function clear(): void {
		entries = [];
		oncountchange?.(0);
	}

	/**
	 * Push files in from somewhere other than the picker -- a Ctrl+V of a
	 * screenshot, a drop. Exported so the parent owning the paste handler does
	 * not need a second copy of the staging list.
	 */
	export function add(list: FileList | File[] | null): void {
		stage(list);
	}

	function stage(list: FileList | File[] | null) {
		if (!list) return;
		// The ONLY thing filtered at pick time is a zero-byte file, which is not
		// a type judgement -- there is nothing in it to upload and the server
		// would say so a round trip later.
		const next = Array.from(list)
			.filter((f) => f.size > 0)
			.map(
				(file): Entry => ({ file, status: 'staged', progress: 0, error: null, retryable: true })
			);
		if (!next.length) return;
		entries = [...entries, ...next];
		oncountchange?.(entries.length);
		if (autoStart && itemId) void runAll(itemId);
	}

	function pick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		stage(input.files);
		// Clear so picking the SAME file twice in a row still fires change.
		input.value = '';
	}

	function removeAt(index: number) {
		entries = entries.filter((_, i) => i !== index);
		oncountchange?.(entries.length);
	}

	/**
	 * Upload everything still here, CONCURRENTLY, against `target`.
	 *
	 * Returns one line per file that did not land, already worded -- the caller
	 * folds them into whatever report it already prints. Anything that failed
	 * is still in `entries` when this resolves, which is the whole contract.
	 *
	 * Every upload is individually caught, so one that THROWS cannot reject the
	 * batch and discard the others' results.
	 */
	export async function runAll(target: string): Promise<string[]> {
		if (running || !entries.length) return [];
		running = true;
		try {
			const snapshot = entries;
			for (const e of snapshot) {
				e.status = 'uploading';
				e.progress = 0;
				e.error = null;
			}
			entries = [...snapshot];

			const results = await Promise.all(
				snapshot.map(async (entry) => {
					try {
						const res = await upload({
							itemId: target,
							file: entry.file,
							blockId,
							caption: null,
							onProgress: (fraction) => {
								entry.progress = fraction;
								entries = [...entries];
							}
						});
						return { entry, res };
					} catch (e) {
						return {
							entry,
							res: {
								ok: false as const,
								gate: 'network' as const,
								message: (e as Error).message || 'The connection dropped while uploading.',
								retryable: true
							}
						};
					}
				})
			);

			const failures: string[] = [];
			for (const { entry, res } of results) {
				if (res.ok) {
					onuploaded?.(res.row);
				} else {
					entry.status = 'failed';
					entry.progress = 0;
					entry.error = res.message;
					entry.retryable = res.retryable;
					failures.push(`${entry.file.name}: ${res.message}`);
				}
			}
			// Only what LANDED is cleared. What failed keeps its handle, its
			// message and its place in the list.
			entries = results.filter((r) => !r.res.ok).map((r) => r.entry);
			oncountchange?.(entries.length);
			return failures;
		} finally {
			running = false;
		}
	}

	async function retryOne(index: number) {
		const target = itemId;
		if (!target) return;
		const entry = entries[index];
		if (!entry) return;
		entry.status = 'uploading';
		entry.progress = 0;
		entry.error = null;
		entries = [...entries];
		let res: UploadOutcome;
		try {
			res = await upload({
				itemId: target,
				file: entry.file,
				blockId,
				caption: null,
				onProgress: (fraction) => {
					entry.progress = fraction;
					entries = [...entries];
				}
			});
		} catch (e) {
			res = {
				ok: false,
				gate: 'network',
				message: (e as Error).message || 'The connection dropped while uploading.',
				retryable: true
			};
		}
		if (res.ok) {
			onuploaded?.(res.row);
			entries = entries.filter((_, i) => i !== index);
		} else {
			entry.status = 'failed';
			entry.error = res.message;
			entry.retryable = res.retryable;
			entries = [...entries];
		}
		oncountchange?.(entries.length);
	}

	const noun = $derived(role === 'submission' ? 'file' : 'attachment');
</script>

<!-- THE SHARED DROP TARGET, on THIS panel's own root -- no wrapper, so a drag
     or a paste over this component costs no layout of its own. `stage` is the
     SAME function the picker's `onchange` calls: a drop and a paste are a
     second way to reach it, never a second upload path. Disabled exactly
     when the picker is (a batch already running). -->
<div
	class="fup"
	class:is-drop-active={dragActive}
	data-role={role}
	use:dropTarget={{ onfiles: stage, onactive: (a) => (dragActive = a), disabled: running }}
>
	<div class="fup-head">
		<span class="fup-label">{label}</span>
		{#if hint}<p class="fup-hint">{hint}</p>{/if}
		<!-- ONE sentence, said here rather than by every caller, so the wording
		     can never drift between an attachment, an instructor-only file and a
		     hand-in: they are the same control. -->
		<p class="fup-hint fup-drop-hint">Drag files here, or paste an image, to add them.</p>
	</div>

	<div class="fup-actions">
		<label class="fup-pick tap-44">
			<span>Choose files</span>
			<!-- NO accept. Any file type, either side. -->
			<input type="file" multiple onchange={pick} disabled={running} />
		</label>
		{#if offerCamera}
			<label class="fup-pick tap-44">
				<span>Take a photo</span>
				<!-- accept + capture is what opens a CAMERA rather than a file
				     browser. It sits beside the unfiltered picker above, so it
				     narrows an affordance and gates nothing. -->
				<input type="file" accept="image/*" capture="environment" onchange={pick} disabled={running} />
			</label>
		{/if}
	</div>

	{#if entries.length}
		<ul class="fup-list">
			{#each entries as entry, i (entry.file.name + i + entry.file.size)}
				{@const preview = showPreviews ? previewOf(entry.file) : null}
				<li class="fup-row" class:failed={entry.status === 'failed'}>
					{#if preview}
						<!-- object-fit: contain, never cover: cropping to fill would hide
						     the cut-off edge this preview exists to catch. -->
						<img class="fup-thumb" src={preview} alt={entry.file.name} />
					{/if}
					<div class="fup-row-head">
						<span class="fup-name" title={entry.file.name}>{entry.file.name}</span>
						<span class="fup-size">{formatBytesShort(entry.file.size)}</span>
					</div>

					{#if entry.status === 'uploading'}
						<p class="fup-progress">
							<span
								class="fup-bar"
								role="progressbar"
								aria-label={`Uploading ${entry.file.name}`}
								aria-valuenow={Math.round(entry.progress * 100)}
								aria-valuemin="0"
								aria-valuemax="100"
							>
								<span class="fup-bar-fill" style={`width: ${Math.round(entry.progress * 100)}%`}
								></span>
							</span>
							<span class="fup-pct">{Math.round(entry.progress * 100)}%</span>
						</p>
					{:else}
						<div class="fup-row-actions">
							{#if entry.status === 'failed' && entry.retryable && itemId}
								<button type="button" class="fup-btn tap-44" onclick={() => retryOne(i)}>
									Retry this {noun}
								</button>
							{/if}
							<button type="button" class="fup-btn quiet tap-44" onclick={() => removeAt(i)}>
								Remove
							</button>
						</div>
					{/if}

					{#if entry.error}
						<!-- VERBATIM. The message already names its gate and already
						     carries the numbers; nothing here shortens or re-tones it. -->
						<p class="fup-error" role="alert">{entry.error}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if dragActive}
		<!-- Absolutely positioned, so it occupies no layout space -- this is what
		     "unmistakable feedback, no layout shift" is built out of. `aria-hidden`
		     because it is a visual echo of a drag the pointer is already doing;
		     nothing here is reachable only this way. -->
		<div class="fup-drop-overlay" aria-hidden="true">Drop files here</div>
	{/if}
</div>

<style>
	.fup {
		display: grid;
		gap: var(--space-2, 0.5rem);
		position: relative;
	}
	.fup.is-drop-active {
		/* outline, never border: it draws OUTSIDE the box and never changes the
		   element's size, so nothing this panel sits beside moves. */
		outline: 2px dashed var(--green);
		outline-offset: -2px;
		border-radius: var(--radius-2, 6px);
	}
	.fup-drop-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--green) 12%, transparent);
		border-radius: var(--radius-2, 6px);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.04em;
		color: var(--text-1, var(--white));
		pointer-events: none;
		z-index: 1;
	}
	.fup-label {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	.fup-hint {
		margin: 0.15rem 0 0;
		font-size: 0.85rem;
		color: var(--text-2, var(--dim));
	}
	.fup-drop-hint {
		font-size: 0.72rem;
		opacity: 0.85;
	}
	.fup-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
	}
	.fup-pick {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 6px);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		cursor: pointer;
		background: var(--surface-2, var(--bg2));
		color: var(--text-1, var(--white));
	}
	.fup-pick input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.fup-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2, 0.5rem);
	}
	.fup-row {
		display: grid;
		gap: 0.35rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2, 6px);
		min-width: 0;
	}
	.fup-thumb {
		display: block;
		width: 100%;
		max-width: 220px;
		max-height: 140px;
		object-fit: contain;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2, 6px);
		background: var(--surface-2, var(--bg2));
	}
	.fup-row.failed {
		border-color: var(--nb-error, var(--crimson));
	}
	.fup-row-head {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		justify-content: space-between;
		min-width: 0;
	}
	.fup-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.fup-size {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, var(--dim));
		white-space: nowrap;
	}
	.fup-progress {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.fup-bar {
		flex: 1;
		height: 0.4rem;
		border-radius: 999px;
		background: var(--surface-2, var(--bg2));
		overflow: hidden;
		min-width: 0;
	}
	.fup-bar-fill {
		display: block;
		height: 100%;
		background: var(--green);
	}
	.fup-pct {
		min-width: 3ch;
		text-align: right;
	}
	.fup-row-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.fup-btn {
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 6px);
		background: var(--surface-2, var(--bg2));
		color: var(--text-1, var(--white));
		font-family: var(--font-mono);
		font-size: 0.75rem;
		cursor: pointer;
	}
	.fup-btn.quiet {
		border-color: var(--hairline);
		background: transparent;
		color: var(--text-2, var(--dim));
	}
	.fup-error {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--nb-error, var(--crimson));
	}
</style>
