<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { docToTiptap, type NoteDoc, type TiptapNode } from '$lib/notebook-notes';
	import { NOTE_SCHEMA_OPTIONS } from '$lib/rich-text-schema';
	import { CorrectionLedger } from '$lib/notebook/autocorrect';
	import ToleranceCallout from '$lib/notebook/ToleranceCallout.svelte';
	import {
		WRITING_AID_LABEL,
		WRITING_AID_OFF_NOTE,
		WRITING_AID_ON_NOTE,
		setWritingAidEnabled,
		writingAidEnabled
	} from '$lib/notebook/writing-aid.svelte';
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
		initialDoc = null,
		onchange,
		onready,
		disabled = false,
		placeholder = 'Write your note...',
		autofocus = false,
		label = 'Note',
		viewerId
	}: {
		/** Seeds the editor once, on mount: an existing note being revised. */
		value?: NoteDoc | null;
		/**
		 * Seeds the editor once, on mount, from the EDITOR'S OWN shape rather
		 * than the stored one -- what `onchange` last handed back.
		 *
		 * It exists for the local draft mirror ($lib/notebook/draft-mirror): what
		 * a browser kept while somebody typed is ProseMirror JSON, and there is
		 * no way to turn that back into a `NoteDoc` on this side, because the
		 * normalizer that produces one is `$lib/server`. Handed straight to
		 * Tiptap as `content`, which is the shape it emits and the shape it
		 * takes, so nothing converts and nothing can convert it wrongly.
		 *
		 * It WINS over `value` when both are given: a caller passing both is
		 * saying "this note, as it was being edited", and the half that was
		 * being edited is the half nobody else has a copy of.
		 */
		initialDoc?: TiptapNode | null;
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
		/**
		 * WHOSE writing aid preference this is. A shop workstation is shared, so
		 * the switch is keyed per viewer exactly as the draft mirror is
		 * ($lib/notebook/writing-aid.svelte) -- a student turning corrections off
		 * does not turn them off for whoever sits down next, and does not read
		 * the last person's setting as their own.
		 *
		 * Absent takes the `anon` slot, which is the right answer for a harness
		 * and for a signed-out surface: the preference still works, it is simply
		 * not attributed to anybody.
		 */
		viewerId?: string;
	} = $props();

	let host = $state<HTMLDivElement | null>(null);
	let editor = $state<Editor | null>(null);
	let failed = $state(false);

	/**
	 * THE WRITING AID: autocorrect and the tolerance callout, one switch.
	 *
	 * Read through the store's own accessor rather than copied into local state,
	 * so the value is reactive and the plugin's `enabled()` closure below and
	 * this component's own rendering can never disagree about it -- two
	 * spellings of "is this on" is what produces a switch that dims the callout
	 * and keeps correcting.
	 */
	const aidOn = $derived(writingAidEnabled(viewerId));

	/**
	 * The document as it stands, for the callout. Seeded at `onready` so a note
	 * opened for editing gets a band before anything is typed, and it is the
	 * EDITOR'S serialization in both cases (the `onready` rule) rather than the
	 * `value` prop, which is a different shape.
	 */
	let liveDoc = $state<TiptapNode | null>(null);

	/**
	 * The one-keystroke undo's memory, per editor instance. The DECLINED words
	 * behind it are module-level and shared across instances on purpose -- see
	 * `sessionDeclined` in $lib/notebook/autocorrect.
	 */
	const ledger = new CorrectionLedger();

	/** Clears the correction marks after CORRECTION_MARK_MS. */
	let markTimer: ReturnType<typeof setTimeout> | null = null;

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
				const [{ Editor, Extension }, { StarterKit }, plugin] = await Promise.all([
					import('@tiptap/core'),
					import('@tiptap/starter-kit'),
					// Same ProseMirror bundle the two above pull in, so this costs no
					// extra request and still never runs during SSR.
					import('$lib/notebook/autocorrect-plugin')
				]);
				if (cancelled) return;

				/**
				 * A bare ProseMirror plugin, carried in by the thinnest Tiptap
				 * extension there is. It needs `appendTransaction`, `handleKeyDown`
				 * and a decoration set and nothing else the extension API offers, so
				 * the extension exists only because `addProseMirrorPlugins` is how a
				 * plugin reaches the editor.
				 *
				 * `enabled` is a GETTER, read on every keystroke. Capturing the
				 * boolean here would mean the switch could not take effect without
				 * rebuilding the editor, and rebuilding the editor drops whatever
				 * the student has typed into it.
				 */
				const autocorrect = plugin.autocorrectPlugin({
					enabled: () => aidOn,
					ledger
				});

				const instance = new Editor({
					element,
					// The schema lives in $lib/rich-text-schema so the tests that fix the
					// normalizer's behaviour build their fixtures from the SAME declaration
					// this editor is configured with.
					extensions: [
						StarterKit.configure(NOTE_SCHEMA_OPTIONS),
						Extension.create({
							name: 'notebookAutocorrect',
							addProseMirrorPlugins: () => [autocorrect]
						})
					],
					content: initialDoc ?? (value ? docToTiptap(value) : undefined),
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
						const doc = e.getJSON() as TiptapNode;
						liveDoc = doc;
						onchange(doc);
						// The mark is BRIEF. Scheduled on a timeout and never on an
						// animation frame: a backgrounded or throttled tab never ticks
						// rAF, and a mark that never cleared would become a permanent
						// annotation on the note.
						if (markTimer) clearTimeout(markTimer);
						markTimer = setTimeout(() => {
							const view = editor?.view;
							if (view) view.dispatch(plugin.clearCorrectionMarks(view.state));
						}, plugin.CORRECTION_MARK_MS);
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
				const ready = instance.getJSON() as TiptapNode;
				liveDoc = ready;
				onready?.(ready);
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
		if (markTimer) clearTimeout(markTimer);
		markTimer = null;
		editor?.destroy();
		editor = null;
	});

	/**
	 * THE SWITCH. It lives in the toolbar and not in a settings page, because
	 * the moment somebody wants it off is the moment it has just changed a word
	 * they meant -- and a preference three navigations away is one they will
	 * instead work around.
	 *
	 * TURNING IT OFF REMOVES BOTH FEATURES AND SAYS NOTHING FURTHER. The band
	 * stops rendering, corrections stop firing, and the control keeps sitting
	 * where controls sit. There is no reminder, no badge and no periodic offer
	 * to turn it back on: a switch in its off state is a control, and a surface
	 * that asks again is a surface arguing with a decision the student made.
	 */
	function toggleAid() {
		setWritingAidEnabled(viewerId, !aidOn);
	}

	/**
	 * Going OFF takes the marks with it. Coming back on leaves whatever is on
	 * screen alone -- the timer already owns clearing those -- but a correction
	 * left highlighted in a note nothing is correcting any more is a mark with
	 * no meaning behind it.
	 *
	 * `untrack` around the editor read, the EntryNotes rule: this effect's one
	 * real dependency is the switch, and taking one on the editor instance would
	 * re-run it on every remount for no reason.
	 */
	$effect(() => {
		if (aidOn) return;
		const view = untrack(() => editor)?.view;
		if (!view) return;
		void import('$lib/notebook/autocorrect-plugin').then((plugin) => {
			view.dispatch(plugin.clearCorrectionMarks(view.state));
		});
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
		<span class="sep" aria-hidden="true"></span>
		<!--
			THE WRITING AID SWITCH. A visible WORD, never a bare glyph: a tooltip
			is not discoverable and a phone cannot hover. It sits with the
			formatting controls because it is the same kind of thing -- something
			you reach for while writing -- and because the moment a student wants
			it off is the moment it has just changed a word they meant.

			It is NOT disabled while the editor loads, unlike its neighbours: the
			preference is this component's own state and does not need ProseMirror
			to be settled before it can be set.
		-->
		<button
			type="button"
			class:on={aidOn}
			aria-pressed={aidOn}
			data-testid="nb-writing-aid-toggle"
			title={aidOn ? WRITING_AID_ON_NOTE : WRITING_AID_OFF_NOTE}
			{disabled}
			onclick={toggleAid}>{WRITING_AID_LABEL}</button
		>
	</div>

	<div class="note-surface" class:empty={active.empty} data-placeholder={placeholder}>
		<div bind:this={host}></div>
	</div>

	<!--
		THE BAND, and only when there is one. `ToleranceCallout` renders no
		element at all below the minimum word count, so an empty editor and a
		two-word note show nothing rather than an empty row waiting to fill.
		`enabled` is the same switch autocorrect reads, so the two can never
		disagree about whether the feature is running.
	-->
	<ToleranceCallout doc={liveDoc} enabled={aidOn} />

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
	/*
	   A CORRECTION IS NEVER INVISIBLE. The decoration is applied by the plugin
	   (autocorrect-plugin.ts) and cleared on a timer, so a corrected word is
	   marked for long enough to be noticed and does not become a permanent
	   annotation on the note.

	   TWO SIGNALS, not one: a wash AND an underline. Colour is never the only
	   signal, and the underline is what carries the mark on a plate where the
	   wash is faint. ProseMirror owns the inner element, so this is global.
	*/
	.note-surface :global(.nb-corrected) {
		background: var(--nb-accent-wash);
		border-radius: 2px;
		box-shadow: inset 0 -1px 0 0 var(--nb-accent);
	}
	/* The fade is the polish, never the signal: with motion off the mark is
	   simply there at full strength until the timer clears it. */
	@media (prefers-reduced-motion: no-preference) {
		.note-surface :global(.nb-corrected) {
			animation: nb-correction-fade 1.8s ease-out forwards;
		}
		@keyframes nb-correction-fade {
			0%,
			60% {
				background: var(--nb-accent-wash);
			}
			100% {
				background: transparent;
			}
		}
	}
</style>
