<script lang="ts">
	import { onDestroy } from 'svelte';
	import { docToTiptap, type NoteDoc, type TiptapNode } from '$lib/notebook-notes';
	import { NOTE_SCHEMA_OPTIONS } from '$lib/rich-text-schema';
	import type { Editor } from '@tiptap/core';

	/**
	 * The rich-text control a student writes a note in.
	 *
	 * EDITOR: Tiptap 3 (@tiptap/core + @tiptap/pm + @tiptap/starter-kit).
	 * Picked over the alternatives because it is the one option that is both
	 * genuinely maintained and genuinely constrained: it is not a contenteditable
	 * wrapper handing back whatever the browser produced, it is a ProseMirror
	 * SCHEMA, so the document can only ever contain the node and mark types
	 * it was switched on with. StarterKit is configured ($lib/rich-text-schema)
	 * with everything out of scope turned OFF -- headings, blockquotes, code,
	 * code blocks, horizontal rules, strike, underline and hard breaks --
	 * leaving exactly bold, italic, bulleted and numbered lists, and links. It
	 * is framework-agnostic, so Svelte 5 needs no wrapper package (svelte-tiptap
	 * exists and works, but everything it adds is bubble/floating menus this
	 * fixed toolbar does not want).
	 *
	 * It is DYNAMICALLY IMPORTED, browser-only, on mount: ProseMirror is the
	 * heaviest thing on this page and no other notebook surface should pay for
	 * it, and it must never run during SSR.
	 *
	 * WHAT IT HANDS BACK is ProseMirror JSON, not HTML -- `onchange` fires with
	 * `editor.getJSON()` and the caller posts that. The server normalizes it into
	 * the stored shape (src/lib/server/notebook-notes.ts). Nothing here is
	 * trusted: the schema below is a good editing experience, not a security
	 * boundary.
	 */
	let {
		value,
		onchange,
		onready,
		disabled = false,
		placeholder = 'Write your note...',
		autofocus = false,
		label = 'Note'
	}: {
		/** Seeds the editor once, on mount: an existing note being revised. */
		value?: NoteDoc | null;
		/** Every keystroke, as the editor's own document. */
		onchange: (doc: TiptapNode) => void;
		/**
		 * Fired once, with the document as the editor itself serialized it at
		 * mount. A caller comparing later output against THIS -- rather than
		 * against what it passed in as `value` -- is comparing two documents the
		 * same serializer produced, so an editor that normalizes its input in
		 * some harmless way cannot read as an unsaved change.
		 */
		onready?: (doc: TiptapNode) => void;
		disabled?: boolean;
		placeholder?: string;
		autofocus?: boolean;
		label?: string;
	} = $props();

	let host = $state<HTMLDivElement | null>(null);
	let editor = $state<Editor | null>(null);
	let failed = $state(false);

	/**
	 * What the toolbar shows, PUSHED from the editor's own transactions rather
	 * than derived from it.
	 *
	 * The obvious version -- a `$derived` reading a counter bumped on every
	 * transaction -- was written first and did not work: the buttons never lit
	 * up, because the thing the toolbar actually depends on (the editor's
	 * selection) is not reactive state, and a sentinel dependency next to a
	 * non-reactive read is exactly the kind of indirection that looks correct
	 * and is not. Tiptap already tells us when to re-read; this just re-reads.
	 */
	let active = $state({
		bold: false,
		italic: false,
		bulletList: false,
		orderedList: false,
		link: false,
		empty: true
	});

	function syncActive(e: Editor) {
		active = {
			bold: e.isActive('bold'),
			italic: e.isActive('italic'),
			bulletList: e.isActive('bulletList'),
			orderedList: e.isActive('orderedList'),
			link: e.isActive('link'),
			empty: e.isEmpty
		};
	}

	$effect(() => {
		const element = host;
		if (!element || editor) return;
		let cancelled = false;

		void (async () => {
			try {
				const [{ Editor }, { StarterKit }] = await Promise.all([
					import('@tiptap/core'),
					import('@tiptap/starter-kit')
				]);
				if (cancelled) return;

				const instance = new Editor({
					element,
					// The schema lives in $lib/rich-text-schema so the tests that fix the
					// normalizer's behaviour build their fixtures from the SAME declaration
					// this editor is configured with.
					extensions: [StarterKit.configure(NOTE_SCHEMA_OPTIONS)],
					content: value ? docToTiptap(value) : undefined,
					autofocus,
					editable: !disabled,
					editorProps: {
						attributes: {
							class: 'note-input',
							'aria-label': label,
							'data-testid': 'note-editor-input'
						}
					},
					onUpdate: ({ editor: e }) => {
						syncActive(e);
						onchange(e.getJSON() as TiptapNode);
					},
					// Moving the caret changes what "bold" means without changing
					// the document, so selection needs its own hook.
					onSelectionUpdate: ({ editor: e }) => syncActive(e),
					// Covers the rest: toggling a mark with no text selected sets a
					// stored mark, which is a transaction and neither of the above.
					onTransaction: ({ editor: e }) => syncActive(e)
				});
				editor = instance;
				syncActive(instance);
				onready?.(instance.getJSON() as TiptapNode);
			} catch {
				// A note is still writable without formatting; say so rather than
				// leaving an inert box.
				failed = true;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		editor?.setEditable(!disabled);
	});

	onDestroy(() => {
		editor?.destroy();
		editor = null;
	});

	function run(fn: 'toggleBold' | 'toggleItalic' | 'toggleBulletList' | 'toggleOrderedList') {
		const chain = editor?.chain().focus();
		if (!chain) return;
		chain[fn]().run();
	}

	/**
	 * Links use a prompt rather than a popover on purpose: this is a phone-first
	 * flow, and a floating panel to type a URL into is a lot of surface for
	 * something used once in a while. `mailto:` is offered as-is; a bare domain
	 * gets https:// so the common case does not silently produce a dead link.
	 */
	function toggleLink() {
		const e = editor;
		if (!e) return;
		if (e.isActive('link')) {
			e.chain().focus().unsetLink().run();
			return;
		}
		const raw = window.prompt('Link address', 'https://');
		if (raw === null) return;
		const trimmed = raw.trim();
		if (!trimmed || trimmed === 'https://') return;
		const href = /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
		e.chain().focus().extendMarkRange('link').setLink({ href }).run();
	}
</script>

<div class="note-editor" class:disabled>
	<div class="note-toolbar" role="toolbar" aria-label="{label} formatting">
		<button
			type="button"
			class:on={active.bold}
			aria-pressed={active.bold}
			title="Bold"
			disabled={disabled || !editor}
			onclick={() => run('toggleBold')}><strong>B</strong></button
		>
		<button
			type="button"
			class:on={active.italic}
			aria-pressed={active.italic}
			title="Italic"
			disabled={disabled || !editor}
			onclick={() => run('toggleItalic')}><em>I</em></button
		>
		<span class="sep" aria-hidden="true"></span>
		<button
			type="button"
			class:on={active.bulletList}
			aria-pressed={active.bulletList}
			title="Bulleted list"
			disabled={disabled || !editor}
			onclick={() => run('toggleBulletList')}>&bull; List</button
		>
		<button
			type="button"
			class:on={active.orderedList}
			aria-pressed={active.orderedList}
			title="Numbered list"
			disabled={disabled || !editor}
			onclick={() => run('toggleOrderedList')}>1. List</button
		>
		<span class="sep" aria-hidden="true"></span>
		<button
			type="button"
			class:on={active.link}
			aria-pressed={active.link}
			title={active.link ? 'Remove link' : 'Add a link'}
			disabled={disabled || !editor}
			onclick={toggleLink}>Link</button
		>
	</div>

	<div class="note-surface" class:empty={active.empty} data-placeholder={placeholder}>
		<div bind:this={host}></div>
	</div>

	{#if failed}
		<p class="editor-note" role="status">
			The formatting tools could not load, so this note will save as plain text.
		</p>
	{/if}
</div>

<style>
	.note-editor {
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		background: var(--surface-1);
		overflow: hidden;
	}
	.note-editor.disabled {
		opacity: 0.6;
	}
	.note-toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-wrap: wrap;
		padding: var(--space-1) var(--space-2);
		border-bottom: 1px solid var(--hairline);
		background: var(--surface-2);
	}
	.note-toolbar button {
		/* 44px, the touch target this codebase already standardised on for the
		   photo corrector's handles. A note is written on a phone as often as
		   on a laptop, and a formatting button that needs aiming at is one
		   nobody uses. */
		min-width: 2.75rem;
		min-height: 2.75rem;
		padding: var(--space-1) var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius-card);
		background: none;
		color: var(--text-2);
		font: inherit;
		font-size: 0.82rem;
		cursor: pointer;
	}
	.note-toolbar button:hover:not(:disabled) {
		border-color: var(--nb-hairline-strong);
		color: var(--text-1);
	}
	/* Gold marks the active state, the notebook's one accent thread. */
	.note-toolbar button.on {
		border-color: var(--nb-accent);
		background: var(--nb-accent-wash);
		color: var(--nb-accent-ink);
	}
	.note-toolbar button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.sep {
		width: 1px;
		height: 1.1rem;
		background: var(--nb-hairline-strong);
		margin: 0 var(--space-1);
	}
	.note-surface {
		position: relative;
		padding: var(--space-3);
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--text-1);
	}
	/* ProseMirror owns the inner element, so its styles have to be global. */
	.note-surface :global(.note-input) {
		min-height: 6.5rem;
		outline: none;
	}
	.note-surface :global(.note-input p) {
		margin: 0 0 var(--space-3);
	}
	.note-surface :global(.note-input p:last-child),
	.note-surface :global(.note-input ul:last-child),
	.note-surface :global(.note-input ol:last-child) {
		margin-bottom: 0;
	}
	.note-surface :global(.note-input ul),
	.note-surface :global(.note-input ol) {
		margin: 0 0 var(--space-3);
		padding-left: var(--space-5);
	}
	.note-surface :global(.note-input a) {
		color: var(--nb-accent-ink);
		text-decoration: underline;
	}
	.note-surface.empty::before {
		content: attr(data-placeholder);
		position: absolute;
		top: 0.7rem;
		left: 0.8rem;
		color: var(--text-3);
		pointer-events: none;
	}
	.editor-note {
		margin: 0;
		padding: var(--space-2) var(--space-3) var(--space-2);
		color: var(--text-3);
		font-size: 0.8rem;
	}
</style>
