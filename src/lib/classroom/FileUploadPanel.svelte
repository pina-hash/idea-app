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
	 * AND SINCE 0193, THE STAGED LIST IS AN ORDERED, EDITABLE LIST rather than
	 * a queue: a row can be RENAMED before it is uploaded (the name is the
	 * alias every `attachment:` figure reference resolves against, so getting
	 * it right BEFORE the upload is cheaper than a rename RPC after), and it
	 * can be REORDERED by drag, by arrow keys on the grip, or by the worded
	 * Move up / Move down buttons. `files()` answers the current order, and
	 * `runAll` uploads IN THAT ORDER -- see its own note for why that is
	 * sequential now.
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
	import {
		RENAME_REFUSALS,
		recordedAttachmentFilename,
		renameCollides
	} from '$lib/classroom/attachments';
	import { movedList, sortDrag } from '$lib/classroom/sort-drag';
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
		/**
		 * A STABLE KEY FOR THE `{#each}`, minted once at staging. The list used
		 * to be keyed on `name + index + size`, which was fine while a row could
		 * never move: with reordering, an index-keyed row is REMOUNTED every time
		 * it changes place, which throws away the grip that has focus (so the
		 * next arrow press goes nowhere) and re-runs the easing from zero. With
		 * renaming, a name-keyed row is remounted on the rename for the same
		 * cost. The key is the identity of the staged thing, whatever it is
		 * called and wherever it sits.
		 */
		key: number;
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
	let nextKey = 1;

	/** Which staged row is being renamed (by key), and the name typed so far. */
	let renaming = $state<number | null>(null);
	let renameDraft = $state('');

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

	/** The File handles still held, IN THEIR CURRENT ORDER, for a parent that
	 *  needs them (a draft signature, a discard warning, the picture picker's
	 *  staged half). The order is the order `runAll` will upload in. */
	export function files(): File[] {
		return entries.map((e) => e.file);
	}

	export function clear(): void {
		entries = [];
		renaming = null;
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
				(file): Entry => ({
					key: nextKey++,
					file,
					status: 'staged',
					progress: 0,
					error: null,
					retryable: true
				})
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
		const gone = entries[index];
		if (gone && renaming === gone.key) renaming = null;
		entries = entries.filter((_, i) => i !== index);
		oncountchange?.(entries.length);
	}

	/**
	 * MOVE ONE ROW, from wherever it is to wherever it is going. `sortDrag`'s
	 * `ondrop`, the arrow keys on a grip (the action turns those into the same
	 * call) and the Move up / Move down buttons all land here, so there is ONE
	 * reorder and it is `movedList`'s. The `{#each}` is keyed on `entry.key`,
	 * so the moved row's element survives and a focused grip keeps its focus.
	 *
	 * A count change is NOT reported: the parent's dirty signal reads the count,
	 * and a reorder of staged files is not a change the server can see until
	 * the save lands them in this order.
	 */
	function moveEntry(from: number, to: number) {
		if (running || from === to || to < 0 || to >= entries.length) return;
		entries = movedList(entries, from, to);
	}

	/** Focus the rename input the moment it exists. An action rather than the
	 *  `autofocus` attribute: the input is rendered on a press, not on page
	 *  load, so this is the ordinary "put the caret where the person just
	 *  asked for it" and not the page-load focus steal the attribute is
	 *  warned about. Keyed on the ELEMENT (CLAUDE.md), so it cannot miss. */
	function focusOnMount(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function startRename(entry: Entry) {
		if (running) return;
		renaming = entry.key;
		renameDraft = entry.file.name;
	}

	function cancelRename() {
		renaming = null;
		renameDraft = '';
	}

	/**
	 * RENAME A STAGED FILE. A `File`'s name is read-only, so the entry's handle
	 * is REPLACED by `new File([f], name, { type, lastModified })` -- the same
	 * bytes under a new name, with the type the browser reported (or did not:
	 * an empty type stays empty, exactly as it would have uploaded) and the
	 * original modification time, so nothing about the file changes but what
	 * it is called. The preview effect sees a new handle, revokes the old
	 * object URL and mints one for the new one, so a thumbnail survives the
	 * rename by being redrawn rather than by being kept.
	 *
	 * NOTHING IS SANITIZED HERE. What the row will be CALLED once it lands is
	 * the record route's decision (`recordedAttachmentFilename`), and a name
	 * that will change on the way is SAID beside the input rather than
	 * silently rewritten under the person typing it; a second copy of that
	 * rule here would be the one that stops matching. An empty name cancels:
	 * there is nothing to rename it to.
	 *
	 * A NAME ANOTHER STAGED ROW ALREADY HAS IS REFUSED, not accepted. The
	 * database refuses the same collision for a landed rename (`taken`), and
	 * two staged rows under one name would make the `attachment:` alias
	 * ambiguous the moment both landed. `renameCollides` is the ONE
	 * implementation of that check and is asked over the names the rows WILL
	 * carry, so `a (1).png` and `a-1-.png` collide here exactly as they would
	 * in the table. Returns false only for that refusal, which leaves the
	 * input open with the sentence under it; every other outcome closes.
	 */
	function commitRename(): boolean {
		if (renaming === null) return true;
		const name = renameDraft.trim();
		const index = entries.findIndex((e) => e.key === renaming);
		if (index < 0 || !name) {
			cancelRename();
			return true;
		}
		const old = entries[index];
		if (name !== old.file.name) {
			if (renameCollision) return false;
			const renamed = new File([old.file], name, {
				type: old.file.type,
				lastModified: old.file.lastModified
			});
			entries = entries.map((e, i) => (i === index ? { ...e, file: renamed } : e));
		}
		cancelRename();
		return true;
	}

	function onRenameKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitRename();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelRename();
		}
	}

	/** The name the record route will store for this draft, when it differs
	 *  from what was typed -- so the person sees the change before it happens
	 *  rather than after. */
	const renamePreview = $derived.by(() => {
		const typed = renameDraft.trim();
		if (!typed) return null;
		const stored = recordedAttachmentFilename(typed);
		return stored === typed ? null : stored;
	});

	/** Whether the draft, as it will be stored, is a name another staged row
	 *  will also be stored under. Compared on the RECORDED names on both
	 *  sides, never the raw ones: that is the collision the table refuses.
	 *  An unchanged name is not a collision with itself. */
	const renameCollision = $derived.by(() => {
		if (renaming === null) return false;
		const typed = renameDraft.trim();
		const self = entries.find((e) => e.key === renaming);
		if (!typed || !self || typed === self.file.name) return false;
		const siblings = entries
			.filter((e) => e.key !== renaming)
			.map((e) => recordedAttachmentFilename(e.file.name));
		return renameCollides(recordedAttachmentFilename(typed), siblings);
	});

	/**
	 * Upload everything still here, ONE AT A TIME, IN LIST ORDER, against
	 * `target`.
	 *
	 * SEQUENTIAL, WHERE IT USED TO BE `Promise.all`. The record RPC assigns
	 * each new row `sort_order = max + 1`, so the order the records ARRIVE in
	 * is the order the item stores -- and concurrent uploads arrive in whatever
	 * order the network finished them in, which made the order a person had
	 * just arranged on screen land scrambled. Uploading in list order is what
	 * makes the staged order the stored order. The cost is the overlap: three
	 * 60 MB hand-ins take three transfers' worth of time rather than one, on a
	 * path whose per-file progress bar already says so.
	 *
	 * Returns one line per file that did not land, already worded -- the caller
	 * folds them into whatever report it already prints. Anything that failed
	 * is still in `entries` when this resolves, which is the whole contract:
	 * EVERY FILE IS STILL ATTEMPTED, a failure never stops the ones after it,
	 * and only what LANDED is cleared.
	 *
	 * Every upload is individually caught, so one that THROWS cannot end the
	 * loop and abandon the others.
	 */
	export async function runAll(target: string): Promise<string[]> {
		if (running || !entries.length) return [];
		running = true;
		const failures: string[] = [];
		// A RENAME LEFT OPEN IS COMMITTED, NEVER DROPPED. Saving with the box
		// still open used to reset it and upload the file under its old name,
		// with nothing anywhere saying the typed name was lost -- a partial
		// loss with no report, which is the shape CLAUDE.md forbids. `commitRename`
		// applies it exactly as Enter would; the ONE case it refuses (the new
		// name collides with another staged row) keeps the old name and is
		// NAMED in the batch's own report, so the person reads it beside every
		// other thing that did not land.
		if (renaming !== null) {
			const pending = entries.find((e) => e.key === renaming);
			const typed = renameDraft.trim();
			if (!commitRename() && pending) {
				failures.push(
					`${pending.file.name}: the new name "${typed}" was not applied, another file here already has it`
				);
				cancelRename();
			}
		}
		try {
			/**
			 * THE BATCH IS WHAT IS HERE NOW; THE LIST IS WHAT IS HERE LATER, and
			 * they are kept apart on purpose. A file `add()`ed while this loop is
			 * in flight -- a screenshot pasted into the composer mid-save, a drop
			 * the composer's own zone routed here -- is NOT in the batch and must
			 * not be lost by it. The first version rebuilt `entries` from the
			 * batch's results at the end, so such a file was silently discarded:
			 * never uploaded, not staged, no message, count 0 (measured). Every
			 * change to the list below is made on the CURRENT `entries`, by key,
			 * so a row that arrived mid-batch simply stays staged for the next
			 * save, and a row Remove took off mid-batch is skipped rather than
			 * uploaded behind the person's back.
			 */
			const batch = [...entries];
			for (const entry of batch) {
				if (!entries.some((e) => e.key === entry.key)) continue;
				// ITS TURN, and only then: a queued row stays `staged` (Remove still
				// offered, no progress bar claiming a transfer that has not begun)
				// until the row before it has landed or failed.
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
					// LANDED: off the list the moment it lands, so the parent's list
					// and this one never show the same file at once for the rest of
					// the batch, and the count moves as each row is written.
					entries = entries.filter((e) => e.key !== entry.key);
					oncountchange?.(entries.length);
					onuploaded?.(res.row);
				} else {
					// FAILED: keeps its handle, its message and its place in the list.
					entry.status = 'failed';
					entry.progress = 0;
					entry.error = res.message;
					entry.retryable = res.retryable;
					entries = [...entries];
					failures.push(`${entry.file.name}: ${res.message}`);
				}
			}
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
			entries = entries.filter((e) => e.key !== entry.key);
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
	</div>

	<!-- THE ZONE IS VISIBLE AT REST. It used to be a one-line hint under the
	     label in --text-2, which is the line nobody reads, over a panel whose
	     whole area was already a drop target nobody could see. A dashed box
	     holding the glyph, the sentence and the picker buttons is the shape
	     every drop zone a person has ever used takes, so it needs no
	     explaining; a drag over it FILLS it (a tint and a solid outline, both
	     painted outside the layout so nothing moves). The picker buttons sit
	     INSIDE the zone rather than beside it: the zone is not an alternative
	     to the buttons, it is the place where all three ways in live. -->
	<div class="fup-zone" data-testid="fup-zone">
		<svg class="fup-zone-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			<path d="M12 16V5" />
			<path d="M7.5 9.5 12 5l4.5 4.5" />
			<path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
		</svg>
		<!-- ONE sentence, said here rather than by every caller, so the wording
		     can never drift between an attachment, an instructor-only file and a
		     hand-in: they are the same control. The keystroke is named because
		     a paste is the one way in that has no button. -->
		<p class="fup-drop-hint fup-zone-text">Drag files here, or paste an image (Ctrl+V)</p>
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
	</div>

	{#if entries.length}
		<!-- THE LIST IS SORTABLE. `sortDrag` paints the drag and hands back
		     `(from, to)`; `moveEntry` is the one reorder. Disabled while a batch
		     runs, because the order is being written at that moment and a row
		     that moved mid-batch would land where it was, not where it went. -->
		<ul
			class="fup-list"
			use:sortDrag={{ items: '.fup-row', ondrop: moveEntry, disabled: running }}
		>
			{#each entries as entry, i (entry.key)}
				{@const preview = showPreviews ? previewOf(entry.file) : null}
				<li
					class="fup-row"
					class:failed={entry.status === 'failed'}
					data-sort-item
					data-testid="fup-row"
				>
					{#if preview}
						<!-- object-fit: contain, never cover: cropping to fill would hide
						     the cut-off edge this preview exists to catch. -->
						<img class="fup-thumb" src={preview} alt={entry.file.name} />
					{/if}
					{#if renaming === entry.key}
						<!-- THE INLINE RENAME. Enter saves, Escape cancels, and the
						     visible Save / Cancel pair says so for anyone who did not
						     know: a control with a keyboard-only spelling is a control
						     a phone cannot reach. -->
						<div class="fup-rename" data-testid="fup-rename">
							<label class="fup-rename-label">
								<span class="fup-rename-word">New name</span>
								<input
									class="fup-rename-input"
									type="text"
									bind:value={renameDraft}
									onkeydown={onRenameKey}
									use:focusOnMount
									data-testid="fup-rename-input"
								/>
							</label>
							{#if renamePreview}
								<p class="fup-hint fup-rename-preview">Will be saved as {renamePreview}</p>
							{/if}
							<div class="fup-row-actions">
								<button type="button" class="fup-btn tap-44" onclick={commitRename}>Save name</button>
								<button type="button" class="fup-btn quiet tap-44" onclick={cancelRename}>Cancel</button>
							</div>
						</div>
					{:else}
						<div class="fup-row-head">
							<span class="fup-name" title={entry.file.name}>{entry.file.name}</span>
							<span class="fup-size">{formatBytesShort(entry.file.size)}</span>
						</div>
					{/if}

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
					{:else if renaming !== entry.key}
						<div class="fup-row-actions">
							<!-- THE GRIP. A glyph with an aria-label, which is the one
							     control here without a visible word -- allowed because
							     the Move up / Move down buttons beside it ARE the worded
							     spelling of the same move, and the grip only adds the
							     pointer path. `data-sort-handle` is what `sortDrag`
							     listens on; the action sets `touch-action: none` on it
							     so a finger drags the row instead of scrolling the pane.
							     Offered only where there is something to move past. -->
							{#if entries.length > 1}
								<button
									type="button"
									class="fup-grip tap-44"
									data-sort-handle
									data-testid="fup-grip"
									aria-label={`Reorder ${entry.file.name}: drag, or use the arrow keys`}
								>
									<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
										<circle cx="5.5" cy="4" r="1.4" />
										<circle cx="10.5" cy="4" r="1.4" />
										<circle cx="5.5" cy="8" r="1.4" />
										<circle cx="10.5" cy="8" r="1.4" />
										<circle cx="5.5" cy="12" r="1.4" />
										<circle cx="10.5" cy="12" r="1.4" />
									</svg>
								</button>
								<!-- aria-disabled, never disabled: the first row's Move up
								     still explains itself (and still takes focus), where a
								     disabled control swallows the pointer and vanishes from
								     the tab order. -->
								<button
									type="button"
									class="fup-btn quiet tap-44"
									data-testid="fup-move-up"
									aria-disabled={i === 0}
									onclick={() => moveEntry(i, i - 1)}
								>
									Move up
								</button>
								<button
									type="button"
									class="fup-btn quiet tap-44"
									data-testid="fup-move-down"
									aria-disabled={i === entries.length - 1}
									onclick={() => moveEntry(i, i + 1)}
								>
									Move down
								</button>
							{/if}
							<button
								type="button"
								class="fup-btn quiet tap-44"
								data-testid="fup-rename-start"
								onclick={() => startRename(entry)}
							>
								Rename
							</button>
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
	/* THE ZONE. A dashed rule at rest (the shape every drop zone wears), a
	   green outline and a green tint while a file drag is over the panel. The
	   fill is painted with `outline` + `background`, so the box is the same
	   size in both states and nothing around it moves. `outline-offset: -1px`
	   puts the active outline exactly over the resting border. */
	.fup-zone {
		display: grid;
		justify-items: center;
		gap: var(--space-2, 0.5rem);
		padding: var(--space-3, 0.75rem) var(--space-3, 0.75rem);
		border: 1px dashed var(--boundary);
		border-radius: var(--radius-2, 6px);
		background: color-mix(in srgb, var(--surface-2, var(--bg2)) 60%, transparent);
		text-align: center;
	}
	.fup.is-drop-active .fup-zone {
		outline: 2px solid var(--green);
		outline-offset: -1px;
		background: color-mix(in srgb, var(--green) 14%, transparent);
	}
	.fup-zone-glyph {
		width: 28px;
		height: 28px;
		fill: none;
		stroke: var(--text-2, var(--dim));
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	/* The sentence is BODY copy now, not a hint: --text-1 at 0.9rem, because
	   it is the one line that tells a person the zone takes a paste, and a
	   line nobody can read is a zone nobody pastes into. Measured on the
	   classroom plate by verify:browser (classroom-upload.mjs). */
	.fup-zone-text {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-1, var(--white));
	}
	.fup-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
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
		background: var(--surface-1, var(--bg1));
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
	.fup-rename {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}
	.fup-rename-label {
		display: grid;
		gap: 0.2rem;
		min-width: 0;
	}
	.fup-rename-word {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	.fup-rename-input {
		min-height: 44px;
		width: 100%;
		min-width: 0;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 6px);
		background: var(--surface-2, var(--bg2));
		color: var(--text-1, var(--white));
		font-family: var(--font-display, inherit);
		font-size: 0.95rem;
	}
	.fup-rename-input:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}
	.fup-rename-preview {
		font-family: var(--font-mono);
		font-size: 0.75rem;
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
		align-items: center;
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
		/* The 44px floor is the SMALLER side; `.tap-44` on each of these gives
		   the height, and this gives a short word the width. */
		min-width: 44px;
		cursor: pointer;
	}
	/* `--boundary`, NOT `--hairline`: the outer edge of an interactive control
	   is load-bearing (CLAUDE.md), and the grip beside these carries it. A row
	   of controls on two edge weights read as one broken control. The quiet
	   ground and ink are what make it the secondary action, not the edge. */
	.fup-btn.quiet {
		border-color: var(--boundary);
		background: transparent;
		color: var(--text-2, var(--dim));
	}
	.fup-btn[aria-disabled='true'] {
		opacity: 0.45;
		cursor: default;
	}
	/* 44px square: the grip is a finger's control before it is a mouse's, and
	   the dots are drawn at 16px inside it so the box, not the glyph, is what
	   gets hit. `cursor: grab` says what it is on a desktop. */
	.fup-grip {
		width: 44px;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 6px);
		background: transparent;
		color: var(--text-2, var(--dim));
		cursor: grab;
		touch-action: none;
	}
	.fup-grip svg {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}
	.fup-grip:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}
	.fup-error {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--nb-error, var(--crimson));
	}
</style>
