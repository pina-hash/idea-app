<script lang="ts">
	import { untrack } from 'svelte';
	import RichTextEditor from '$lib/classroom/RichTextEditor.svelte';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import { figureReference } from '$lib/classroom/classroom';
	import { dropTarget } from '$lib/file-drop';
	import {
		appendFigure,
		figureLineRenders,
		markdownEditable,
		markdownFromEditor,
		markdownToItemDoc,
		markdownUneditableReasons
	} from '$lib/classroom/spec-markdown';
	import type { TiptapNode } from '$lib/rich-text';

	/**
	 * ONE PROSE FIELD OF A SPEC, edited where it sits.
	 *
	 * TWO MODES, AND WHICH ONE IS NOT A PREFERENCE. `markdownEditable`
	 * (spec-markdown.ts) decides: a field the rich-text editor can hold and
	 * write back out to the same rendered document opens as formatted text;
	 * anything else -- a table, a code block, an image, a quotation -- opens as
	 * markdown SOURCE, with one sentence naming what made it so. Flattening a
	 * table because somebody opened the field to fix a typo is the failure this
	 * exists to prevent, and it would be a silent one.
	 *
	 * A FIELD ONLY MOVES TO SOURCE, NEVER BACK, WITHIN ONE SESSION. The mode is
	 * decided once from the value the field OPENED on and then only ever
	 * downgraded, by an image landing in it. Re-deciding it on every keystroke
	 * would mean the editor vanishing mid-sentence the first time somebody typed
	 * a pair of backticks.
	 *
	 * THE DOWNGRADE IS THE PARENT'S TO MAKE, and that is not tidiness -- it is a
	 * measured bug. Unmounting the rich editor by flipping an `{#if}` INSIDE this
	 * component throws `state_unsafe_mutation`: Tiptap dispatches one last
	 * transaction from `editor.destroy()`, which lands in RichTextEditor's own
	 * `syncActive` while Svelte is still evaluating the block that removed it.
	 * Measured in a real browser -- typing into the editor and then dropping an
	 * image reproduced it every time, unmounting the WHOLE component after the
	 * same typing never did, and the composer's own cancel path (which unmounts
	 * the component rather than a branch) is clean. So `onimage` asks the parent
	 * to re-key this component, the instance is replaced rather than reshaped,
	 * and the destroy happens outside anybody's render.
	 *
	 * AN IMAGE GOES IN WHERE IT IS USED. A drop or an image paste uploads the
	 * file as an attachment and appends `![name](attachment:<filename>)` in the
	 * SAME action, so the reference and the file cannot diverge -- there is no
	 * step where one exists without the other. The reference string comes from
	 * `figureReference`, the one spelling, shared with the copy control in
	 * AttachmentList. A figure is a whole line by definition (`FIGURE_RE`), so
	 * it is appended as its own block rather than inserted at a cursor, and the
	 * field moves to source mode because that is the only mode that can hold it.
	 */
	let {
		value,
		label,
		source = false,
		disabled = false,
		placeholder = 'Write the instructions...',
		upload = null,
		onchange,
		onimage = null
	}: {
		value: string;
		label: string;
		/** Force the source textarea. The parent sets it once an image has
		 *  landed in this field; see the note above on why it is not local. */
		source?: boolean;
		disabled?: boolean;
		placeholder?: string;
		/**
		 * Uploads one file and answers the FILENAME the attachment was stored
		 * under. Null removes drop-and-paste entirely: absence is the mechanism,
		 * so a surface with no upload transport has no image affordance to
		 * explain away.
		 */
		upload?: ((file: File) => Promise<{ ok: true; filename: string } | { ok: false; message: string }>) | null;
		onchange: (markdown: string) => void;
		/** An image landed, so this field can no longer be held by the editor.
		 *  The parent re-keys the component; nothing here reshapes itself. */
		onimage?: (() => void) | null;
	} = $props();

	/** Decided from the value the field OPENED on. See the note above --
	 *  `untrack` is what makes "the value it opened on" a deliberate reading of
	 *  the initial value rather than a missed dependency. */
	const openedRich = untrack(() => markdownEditable(value));
	const rich = $derived(!source && openedRich);
	const reasons = $derived(rich ? [] : markdownUneditableReasons(value));

	/** A stable, unique id for the source textarea's label. The field's own
	 *  label is not unique on the page -- two blocks both say "Instructions". */
	const srcId = $props.id();

	let unfaithful = $state(false);
	let dragging = $state(false);
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);

	const seed = $derived(markdownToItemDoc(value) ?? []);

	/**
	 * WHAT THE EDITOR ITSELF SERIALIZED AT MOUNT, which is what a change is
	 * measured against.
	 *
	 * `markDirty` FIRES ON A REAL CHANGE, NEVER ON A CHANGE EVENT. ProseMirror
	 * emits a transaction just for being SEEDED, so reporting every `onchange`
	 * upward makes the surface report an edit nobody made -- and, measured in a
	 * browser here, worse than that: the parent cleared its edit set after a
	 * save, this component was handed the stored value again, the reseed emitted
	 * another transaction, and the save machine coalesced a second write out of
	 * it. Three extra writes per save, and the acknowledgement wiped off the
	 * screen by its own follow-up.
	 *
	 * Compared against the EDITOR'S OWN `onready` output rather than against the
	 * markdown handed in, so a harmless normalization on the way in cannot read
	 * as an unsaved change.
	 */
	const baseline = new EditBaseline();

	function fromEditor(doc: TiptapNode) {
		const out = markdownFromEditor(doc);
		if (!baseline.changed(out.markdown)) return;
		baseline.advance(out.markdown);
		unfaithful = !out.faithful;
		onchange(out.markdown);
	}

	async function take(files: File[]) {
		if (!upload || !files.length || disabled) return;
		uploading = true;
		uploadError = null;
		let next = value;
		for (const file of files) {
			const res = await upload(file);
			if (!res.ok) {
				// A refusal is reported verbatim and the rest are still attempted:
				// one file being refused must not discard the others' results.
				uploadError = res.message;
				continue;
			}
			const figure = figureReference(res.filename);
			if (!figureLineRenders(figure)) {
				// NEW uploads are sanitized at record time (sanitizeAttachmentFilename
				// in the classroom attachment route), so this should not fire for a
				// file this drop just created -- it is a backstop for whatever
				// reaches here without going through that route, and for anything
				// stored before that sanitization existed. The file uploaded and is
				// on the item either way; only the inline reference is impossible.
				// Say exactly that, and say what to do about it.
				uploadError =
					`"${res.filename}" is attached to this item, but its name has a space in it, ` +
					`so it cannot be referenced inline. Rename the file without spaces and drop it again ` +
					`to place it in the text.`;
				continue;
			}
			next = appendFigure(next, figure);
		}
		uploading = false;
		if (next === value) return;
		onchange(next);
		// The field can now hold something the editor cannot. The parent is what
		// moves it to source, by replacing this instance -- see the note at the
		// top on why this component must not do it to itself.
		onimage?.();
	}
</script>

<div
	class="spx-prose"
	class:spx-drag={dragging}
	role="group"
	aria-label={label}
	use:dropTarget={{
		onfiles: (files) => void take(files),
		onactive: (active) => (dragging = active),
		disabled: !upload || disabled
	}}
>
	{#if rich}
		<RichTextEditor
			value={seed}
			{disabled}
			{placeholder}
			{label}
			compact
			onready={(doc) => baseline.seed(markdownFromEditor(doc).markdown)}
			onchange={fromEditor}
		/>
	{:else}
		<label class="spx-src-label" for={srcId}>{label} (source)</label>
		<textarea
			id={srcId}
			class="spx-src"
			rows="10"
			{disabled}
			{placeholder}
			value={value}
			oninput={(e) => onchange((e.currentTarget as HTMLTextAreaElement).value)}
		></textarea>
	{/if}

	{#if !rich && reasons.length}
		<p class="spx-note" data-testid="prose-source-reason">
			Edited as source because this block contains {reasons.join(' and ')}. The formatted editor
			cannot hold that, and opening it here would quietly flatten it.
		</p>
	{/if}

	{#if unfaithful}
		<p class="spx-warn" data-testid="prose-unfaithful">
			Some of this text uses characters that mean something in the document format (an asterisk,
			a square bracket, a backtick). Check the block on the page after saving.
		</p>
	{/if}

	{#if upload}
		<p class="spx-note spx-drop-hint">
			{#if uploading}
				Uploading...
			{:else}
				Drop or paste an image here to attach it and place it in this block.
			{/if}
		</p>
	{/if}

	{#if uploadError}
		<p class="spx-error" data-testid="prose-upload-error">{uploadError}</p>
	{/if}
</div>

<style>
	.spx-prose {
		display: grid;
		gap: var(--space-2, 0.5rem);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2, 6px);
		padding: var(--space-2, 0.5rem);
		background: var(--surface-1);
	}

	.spx-drag {
		border-color: var(--boundary);
		background: var(--surface-2);
	}

	.spx-src-label {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.spx-src {
		width: 100%;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text-1);
		background: var(--surface-0, var(--bg0));
		border: 1px solid var(--boundary);
		border-radius: var(--radius-1, 4px);
		padding: var(--space-2, 0.5rem);
		resize: vertical;
	}

	.spx-note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-2);
	}

	.spx-drop-hint {
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	.spx-warn {
		margin: 0;
		font-size: 0.8rem;
		color: var(--amber);
	}

	.spx-error {
		margin: 0;
		font-size: 0.8rem;
		color: var(--crimson);
	}
</style>
