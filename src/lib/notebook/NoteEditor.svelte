<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { docText, docToTiptap, type NoteDoc, type TiptapNode } from '$lib/notebook-notes';
	import { plainTextNote } from '$lib/notebook/capture';
	import { requestVersionCheck } from '$lib/shell/deploy-safety';
	import { NOTE_SCHEMA_OPTIONS } from '$lib/rich-text-schema';
	/**
	 * THE PURE MODULE, NOT `$lib/notebook/grid`. The index re-exports the
	 * ProseMirror node, which imports `@tiptap/core`; this component's whole
	 * design is that ProseMirror arrives through a DYNAMIC import on mount and
	 * never during SSR, so a static import of the node here would undo that for
	 * every surface that mounts an editor. The name and the caps are plain data
	 * and cost nothing.
	 */
	import {
		GRID_NODE_NAME,
		NOTE_GRID_DEFAULT_COLS,
		NOTE_GRID_DEFAULT_ROWS
	} from '$lib/notebook/grid/grid-doc';
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
		/**
		 * Tiptap's own values: `true`/`'start'`, `'end'`, or a document position
		 * (a template puts the cursor under its first heading, ledger 0298).
		 */
		autofocus?: boolean | 'start' | 'end' | number;
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
	 * WHAT IS TYPED WHEN THE EDITOR COULD NOT LOAD.
	 *
	 * The editor is a separate download, and after a deploy renames the site's
	 * files an open tab can ask for one that no longer exists. That used to
	 * leave a box with nothing editable in it under a note promising plain text,
	 * and every keystroke landed nowhere. So a failed load puts a working plain
	 * textarea in the editor's place, and what is typed reaches the caller
	 * through the SAME `onchange`, as paragraphs of plain text -- the classroom's
	 * `docFromPlainText`, the one reader of that shape, whose paragraphs of
	 * plain runs are exactly a note's.
	 *
	 * SEEDED WITH THE NOTE'S OWN TEXT, one paragraph per line (a grid's cells as
	 * one line per row, the way the note's own plain-text projection reads
	 * them), so a revision or a restored draft starts from what is there.
	 * `onready` still fires, with the document the editor WOULD have been seeded
	 * from, so the caller's baseline and the draft mirror hold the real note
	 * until something is typed here; only typing replaces the formatting, and
	 * the note below says so.
	 */
	let plainText = $state('');

	/** An editor document's text, one entry per block, for the seed only. */
	function editorLines(node: TiptapNode | null | undefined, out: string[] = []): string[] {
		if (!node) return out;
		if (node.type === GRID_NODE_NAME) {
			const rows: unknown = node.attrs?.rows;
			for (const row of Array.isArray(rows) ? rows : []) {
				if (!Array.isArray(row)) continue;
				const line = row.filter((cell) => typeof cell === 'string' && cell !== '').join(' ');
				if (line) out.push(line);
			}
			return out;
		}
		const children = node.content ?? [];
		if (children.some((c) => typeof c.text === 'string')) {
			out.push(children.map((c) => c.text ?? '').join(''));
			return out;
		}
		for (const child of children) editorLines(child, out);
		return out;
	}

	function plainTextSeed(): string {
		const lines = initialDoc
			? editorLines(initialDoc)
			: value && value.length
				? docText(value).split('\n')
				: [];
		return lines.filter((line) => line.trim() !== '').join('\n\n');
	}

	function typedPlain(text: string) {
		plainText = text;
		const doc = plainTextNote(text);
		liveDoc = doc;
		onchange(doc);
	}

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
		empty: true,
		grid: false
	});

	/*
	 * `untrack` AROUND THE WRITE, and it changes nothing in the ordinary case:
	 * this runs from the editor's own transactions, outside any reaction. The
	 * case it is for (ledger 0298 review) is an editor REMOVED WHILE FOCUSED --
	 * the header's quick note unmounting as a person moves from the home page to
	 * a class, say. Chromium fires blur as the node leaves the DOM, ProseMirror
	 * dispatches a transaction for it, and that lands here inside Svelte's own
	 * block update, where a plain write throws `state_unsafe_mutation`
	 * (measured on /dev/quick-note with the Remount header control). The value
	 * written then belongs to a component being destroyed.
	 */
	function syncActive(e: Editor) {
		const next = {
			bold: e.isActive('bold'),
			italic: e.isActive('italic'),
			bulletList: e.isActive('bulletList'),
			orderedList: e.isActive('orderedList'),
			link: e.isActive('link'),
			empty: e.isEmpty,
			// PUSHED FROM THE EDITOR'S OWN TRANSACTIONS like everything else here.
			// A grid is `selectable`, so the selection can be ON one -- which is
			// when inserting a second grid is not what the student meant.
			grid: e.isActive(GRID_NODE_NAME)
		};
		untrack(() => {
			active = next;
		});
	}

	$effect(() => {
		const element = host;
		if (!element || editor) return;
		let cancelled = false;

		void (async () => {
			try {
				const [{ Editor, Extension }, { StarterKit }, plugin, grid, gridNodeView] =
					await Promise.all([
						import('@tiptap/core'),
						import('@tiptap/starter-kit'),
						// Same ProseMirror bundle the two above pull in, so this costs no
						// extra request and still never runs during SSR.
						import('$lib/notebook/autocorrect-plugin'),
						// THE GRID NODE AND ITS NODEVIEW, LOADED THE SAME WAY AND FOR THE
						// SAME REASON (0199). The node is `@tiptap/core`'s `Node.create`
						// and the NodeView mounts a Svelte component into a ProseMirror
						// `atom`; neither may run during SSR, and neither should be paid
						// for by a surface that never opens an editor. They are two
						// modules because `grid-node.ts` is importable by a test with no
						// DOM and `grid-nodeview.svelte.ts` is not -- see that directory's
						// index for the split.
						import('$lib/notebook/grid/grid-node'),
						import('$lib/notebook/grid/grid-nodeview.svelte')
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
						}),
						/**
						 * THE SPREADSHEET GRID, WITH ITS NODEVIEW ATTACHED HERE RATHER
						 * THAN INSIDE THE NODE (0199). `grid-node.ts` must stay
						 * importable by a test with no DOM and no Svelte -- it is the
						 * schema, and the schema is the paste filter -- so the drawing
						 * half is bound on at the one place that already has a browser.
						 * This is the construction `/dev/notebook-sheet` was written to
						 * be copied from, and it is copied rather than re-derived.
						 */
						grid.NotebookGrid.extend({
							addNodeView: () => gridNodeView.notebookGridNodeView
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
				// A note is still writable without formatting: the textarea below
				// takes the editor's place (see `plainText`), and the site is asked,
				// unthrottled, whether a new version is live -- a chunk that failed
				// to download is the strongest sign there is.
				plainText = plainTextSeed();
				failed = true;
				const seeded = initialDoc ?? docToTiptap(value ?? []);
				liveDoc = seeded;
				onready?.(seeded);
				requestVersionCheck({ force: true });
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
	 * INSERT A GRID (0199). The last piece of decision 08: `0210` widened the
	 * gate, ledger 0192 built the node and its NodeView, ledger 0187 built the
	 * formula engine, and until this control existed a student could not make
	 * one.
	 *
	 * IT IS ONE PRESS AND NO DIALOG. A grid arrives at
	 * `NOTE_GRID_DEFAULT_ROWS x NOTE_GRID_DEFAULT_COLS` and is resized with the
	 * controls on the grid itself, which already exist and are already measured.
	 * Asking for a size first would be a modal in front of the cheapest possible
	 * undo -- the grid is a ProseMirror node, so Ctrl+Z removes an unwanted one
	 * -- and a phone-first surface should not open a form to answer a question
	 * the student can answer by looking at the thing.
	 *
	 * `.focus()` FIRST, WHICH IS WHAT MAKES IT LAND WHERE THE STUDENT WAS. The
	 * toolbar button takes focus when it is pressed, so without it the insertion
	 * runs against whatever the selection was before the editor lost focus --
	 * the same chain every other control here uses, for the same reason.
	 *
	 * IT IS REFUSED WHILE THE SELECTION IS ALREADY ON A GRID, and that refusal
	 * is `aria-disabled` rather than `disabled`, so the control can say why. A
	 * genuinely `disabled` control swallows pointer events and can never explain
	 * itself; here there IS something to explain, because "press the button and
	 * nothing happens" is otherwise what a student gets when ProseMirror
	 * declines to put a block inside an `isolating` atom.
	 */
	function insertGrid() {
		if (active.grid) return;
		editor?.chain().focus().insertNotebookGrid(NOTE_GRID_DEFAULT_ROWS, NOTE_GRID_DEFAULT_COLS).run();
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
			THE GRID CONTROL. A visible WORD, like every other control in this
			toolbar and for the reason `CLAUDE.md` gives: a `title` tooltip is not
			discoverable and a phone cannot hover. "Grid" and not a table glyph,
			because the thing it inserts calls itself a grid everywhere else -- in
			its own `aria-label`, in the refusal sentences and in the caps.

			`aria-disabled`, NEVER `disabled`, while the selection is on a grid.
			The control has a reason to give and a `disabled` control cannot give
			one; the handler carries the same guard, so the refusal is real and not
			only an attribute. It IS genuinely `disabled` while the editor is still
			loading, which is a different state -- there is nothing to explain
			about a control whose editor does not exist yet, and every one of its
			neighbours behaves the same way.
		-->
		<button
			type="button"
			aria-disabled={active.grid}
			data-testid="nb-insert-grid"
			title={active.grid
				? 'The cursor is already inside a grid. Click below it to add another.'
				: 'Insert a grid for numbers and formulas'}
			disabled={disabled || !editor}
			onclick={insertGrid}>Grid</button
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

	{#if failed}
		<textarea
			class="note-surface note-plain"
			value={plainText}
			{placeholder}
			{disabled}
			aria-label={label}
			data-testid="note-editor-plain"
			oninput={(e) => typedPlain(e.currentTarget.value)}
		></textarea>
	{:else}
		<div class="note-surface" class:empty={active.empty} data-placeholder={placeholder}>
			<div bind:this={host}></div>
		</div>
	{/if}

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
	/*
		A CONTROL THAT REFUSES STILL LOOKS LIKE A CONTROL, because it is one: it
		takes focus, it answers a click, and its `title` says why the answer is
		no. What changes is that it reads as unavailable -- a dashed edge, and the
		pointer that says "not here" -- which is the whole difference between
		`aria-disabled` and `disabled` made visible. `:hover` above is already
		scoped `:not(:disabled)`; this adds the aria case so the hover lift does
		not promise something the handler will decline.

		THE LABEL DOES NOT DIM, AND THAT IS A MEASUREMENT RATHER THAN A
		PREFERENCE. It was `--text-3` first, which on the notebook's default plate
		is `--nb-ink-faint` and measured **2.95:1** on the toolbar's own ground at
		1440 against the 6.84:1 of its enabled neighbour -- and this is a control
		whose entire job in that state is to be READ, because the refusal it is
		giving is one a student has to understand to get past. Dimming below the
		text floor to say "unavailable" is the `--dim`-on-`--bg1` mistake in
		miniature: it spends legibility on a signal that has three other carriers
		(`aria-disabled` for assistive tech, the `title` for the reason, the
		cursor for the pointer). So the tone is the tone every other control in
		this toolbar has, and the DASHED EDGE is the visual difference -- a shape,
		not a colour, which is also this codebase's own rule about colour never
		being the only signal.
	*/
	.note-toolbar button[aria-disabled='true'] {
		border-style: dashed;
		border-color: var(--boundary);
		cursor: not-allowed;
	}
	.note-toolbar button[aria-disabled='true']:hover {
		border-color: var(--boundary);
		color: var(--text-2);
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
	/* The fallback textarea wears the editor surface's own box and type, with
	   the editable area's own minimum height, and drops what a textarea brings. */
	.note-plain {
		display: block;
		width: 100%;
		box-sizing: border-box;
		min-height: calc(6.5rem + 2 * var(--space-3));
		border: 0;
		background: transparent;
		font-family: inherit;
		resize: vertical;
	}
	.note-plain:focus-visible {
		outline: 1px solid var(--focus-ring);
		outline-offset: -2px;
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
