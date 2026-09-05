<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		ITEM_IMAGE_NODE,
		docToTiptap,
		type ItemDoc,
		type TiptapNode
	} from '$lib/classroom/classroom-doc';
	import { ITEM_SCHEMA_OPTIONS } from '$lib/rich-text-schema';
	import type { Editor } from '@tiptap/core';

	/**
	 * The rich-text control a teacher writes an item body in.
	 *
	 * EDITOR: Tiptap 3 (@tiptap/core + @tiptap/pm + @tiptap/starter-kit), already
	 * a dependency of this repo for the notebook's written notes. Deliberately
	 * NOT a second editor library: one ProseMirror schema, configured twice.
	 *
	 * WHY IT PRESERVES A PASTE. A plain textarea receives `text/plain` and a
	 * bulleted list arrives as lines that used to have bullets. ProseMirror
	 * parses the clipboard's `text/html` against its own SCHEMA instead, so a
	 * list pasted from a document stays a list, bold stays bold, and anything
	 * the schema does not have (a table, a font tag, a colour) contributes its
	 * text rather than its markup. The schema is the paste filter, which is also
	 * why turning a node type off in $lib/rich-text-schema is a real guarantee and not a preference.
	 *
	 * StarterKit is configured with everything out of the feature's scope turned
	 * OFF -- blockquotes, code, code blocks, horizontal rules, strike, underline
	 * and hard breaks -- leaving exactly bold, italic, bulleted and numbered
	 * lists, headings, and links.
	 *
	 * HEADINGS ARE LEVELS 3 AND 4 ONLY. The page around this body already owns
	 * h1 (the item's title) and h2 (the section label), so an h1 in a body would
	 * compete with the title of the thing it is inside. A paste carrying deeper
	 * or shallower headings is clamped into these two by the server-side
	 * normalizer, so nothing is lost either way.
	 *
	 * IT IS DYNAMICALLY IMPORTED, browser-only, on mount: ProseMirror is the
	 * heaviest thing on this page, no other classroom surface should pay for it,
	 * and it must never run during SSR.
	 *
	 * WHAT IT HANDS BACK is ProseMirror JSON, not HTML -- `onchange` fires with
	 * `editor.getJSON()` and the caller posts that. The server normalizes it into
	 * the stored shape (src/lib/server/classroom-doc.ts) and a SQL gate refuses
	 * anything outside it. Nothing here is trusted: the schema is a good
	 * editing experience, not a security boundary.
	 */
	let {
		value,
		onchange,
		onready,
		disabled = false,
		placeholder = 'Write the instructions...',
		label = 'Instructions',
		compact = false
	}: {
		/** Seeds the editor once, on mount: an existing body being edited. */
		value?: ItemDoc | null;
		/** Every keystroke, as the editor's own document. */
		onchange: (doc: TiptapNode) => void;
		/**
		 * Fired once, with the document as the editor itself serialized it at
		 * mount -- so a caller comparing later output against THIS is comparing
		 * two documents the same serializer produced, and an editor that
		 * normalizes its input in some harmless way cannot read as an unsaved
		 * change.
		 */
		onready?: (doc: TiptapNode) => void;
		disabled?: boolean;
		placeholder?: string;
		label?: string;
		/** Inline placement (class page / item detail) vs the console card. */
		compact?: boolean;
	} = $props();

	/**
	 * Map a pasted document's heading levels into the two this body may use.
	 *
		 * WHY IT IS NEEDED AT ALL: the schema only knows levels 3 and 4, and
	 * ProseMirror builds its HTML parse rules FROM that list -- so a pasted
	 * `<h1>` matches no heading rule and falls through to a plain paragraph.
	 * Found in the browser: a heading pasted out of a document arrived as body
	 * text, losing the structure this whole feature exists to preserve. The
	 * server-side normalizer clamps levels too, but it never got the chance --
	 * the heading was gone before the editor's own document was built.
	 *
	 * A string rewrite of the tag NAME only, on HTML that ProseMirror is about
	 * to parse against its schema regardless, so nothing security-relevant rests
	 * on it: the schema is still what decides what can exist.
	 */
	function clampPastedHeadings(html: string): string {
		return html
			.replace(/<(\/?)h[12]\b/gi, '<$1h3')
			.replace(/<(\/?)h[56]\b/gi, '<$1h4');
	}

	let host = $state<HTMLDivElement | null>(null);
	let editor = $state<Editor | null>(null);
	let failed = $state(false);

	/**
	 * What the toolbar shows, PUSHED from the editor's own transactions rather
	 * than derived from it.
	 *
	 * The obvious version -- a `$derived` reading a counter bumped on every
	 * transaction -- was written first for the notebook's editor and did not
	 * work: the buttons never lit up, because the thing the toolbar actually
	 * depends on (the editor's selection) is not reactive state, and a sentinel
	 * dependency next to a non-reactive read is exactly the kind of indirection
	 * that looks correct and is not. Tiptap already says when to re-read.
	 */
	let active = $state({
		bold: false,
		italic: false,
		bulletList: false,
		orderedList: false,
		h3: false,
		h4: false,
		link: false,
		empty: true
	});

	function syncActive(e: Editor) {
		active = {
			bold: e.isActive('bold'),
			italic: e.isActive('italic'),
			bulletList: e.isActive('bulletList'),
			orderedList: e.isActive('orderedList'),
			h3: e.isActive('heading', { level: 3 }),
			h4: e.isActive('heading', { level: 4 }),
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
				const [{ Editor, Node }, { StarterKit }] = await Promise.all([
					import('@tiptap/core'),
					import('@tiptap/starter-kit')
				]);
				if (cancelled) return;

				/**
				 * THE IMAGE NODE (0176), declared here and nowhere else.
				 *
				 * NOT IN `$lib/rich-text-schema`, deliberately. That module holds the
				 * StarterKit options BOTH rich-text features share, and a note has no
				 * pictures: putting the node there would widen what a NOTE can be
				 * asked to hold because an item body grew, which is the exact coupling
				 * the two contracts are kept apart to prevent. Its NAME and ATTRIBUTE
				 * LIST come from `ITEM_IMAGE_NODE`, which the server normalizer matches
				 * against and the tests build their fixtures from -- a second spelling
				 * of the name is a document this editor emits and the normalizer
				 * silently drops.
				 *
				 * NO `@tiptap/extension-image` DEPENDENCY, and that is not thrift. That
				 * extension's whole job is an arbitrary `src` URL, which is the one
				 * thing this feature must not have: an authored image here is an
				 * `attachment:` alias or a path under FIGURE_STATIC_PREFIXES, resolved
				 * at RENDER time against the item's own files. Adding the package would
				 * also rewrite a 4,649-line lockfile for a node that is twelve lines.
				 *
				 * AN ATOM: it has no editable content, so the caret cannot land inside
				 * it and there is no way to type a picture into a broken state.
				 * `renderHTML` emits a plain `<figure>` with the description visible --
				 * the editor is showing the author what they wrote, not resolving the
				 * reference, which is a render-time question it cannot answer.
				 */
				const ItemImageNode = Node.create({
					name: ITEM_IMAGE_NODE.name,
					group: 'block',
					atom: true,
					draggable: true,
					addAttributes: () => ({ src: { default: '' }, alt: { default: '' } }),
					parseHTML: () => [{ tag: `figure[data-${ITEM_IMAGE_NODE.name}]` }],
					renderHTML: ({ HTMLAttributes }) => [
						'figure',
						{ [`data-${ITEM_IMAGE_NODE.name}`]: '', class: 'rt-figure' },
						['span', { class: 'rt-figure-ref' }, String(HTMLAttributes.src ?? '')],
						['figcaption', {}, String(HTMLAttributes.alt ?? '')]
					]
				});

				const instance = new Editor({
					element,
					// The schema lives in $lib/rich-text-schema so the tests that fix the
					// normalizer's behaviour build their fixtures from the SAME declaration
					// this editor is configured with.
					extensions: [StarterKit.configure(ITEM_SCHEMA_OPTIONS), ItemImageNode],
					content: value && value.length ? docToTiptap(value) : undefined,
					editable: !disabled,
					editorProps: {
						attributes: {
							class: 'rt-input',
							'aria-label': label,
							'data-testid': 'classroom-body-editor'
						},
						transformPastedHTML: clampPastedHeadings
					},
					onUpdate: ({ editor: e }) => {
						syncActive(e);
						onchange(e.getJSON() as TiptapNode);
					},
					// Moving the caret changes what "bold" means without changing the
					// document, so selection needs its own hook.
					onSelectionUpdate: ({ editor: e }) => syncActive(e),
					// Covers the rest: toggling a mark with no text selected sets a
					// stored mark, which is a transaction and neither of the above.
					onTransaction: ({ editor: e }) => syncActive(e)
				});
				editor = instance;
				syncActive(instance);
				onready?.(instance.getJSON() as TiptapNode);
			} catch {
				// A body is still writable without formatting; say so rather than
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

	function run(
		fn: 'toggleBold' | 'toggleItalic' | 'toggleBulletList' | 'toggleOrderedList'
	) {
		const chain = editor?.chain().focus();
		if (!chain) return;
		chain[fn]().run();
	}

	function heading(level: 3 | 4) {
		editor?.chain().focus().toggleHeading({ level }).run();
	}

	// --- Links ---------------------------------------------------------------
	/**
	 * A small inline popover, not `window.prompt`.
	 *
	 * The prompt was a native modal in the middle of the screen for a field
	 * belonging to a toolbar button, and it blocks the page while it is open --
	 * so the text being linked is not even visible while its address is typed.
	 * This is the same control drawn in the editor's own language, anchored to
	 * the button that opened it.
	 *
	 * `mailto:` is offered as-is; a bare domain gets https:// so the common case
	 * does not silently produce a dead link.
	 */
	let linkOpen = $state(false);
	let imageOpen = $state(false);
	let imageRef = $state('');
	let imageAlt = $state('');
	let imageWrap: HTMLElement | null = $state(null);
	let imageInput: HTMLInputElement | null = $state(null);
	let linkValue = $state('');
	let linkInput = $state<HTMLInputElement | null>(null);
	let linkWrap = $state<HTMLElement | null>(null);

	function normalizeHref(raw: string): string | null {
		const trimmed = raw.trim();
		if (!trimmed || trimmed === 'https://') return null;
		return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
	}

	function openLink() {
		const e = editor;
		if (!e) return;
		// Already on a link: one click removes it, which is what the button's own
		// title has always said. The popover is for MAKING one.
		if (e.isActive('link')) {
			e.chain().focus().unsetLink().run();
			return;
		}
		linkValue = 'https://';
		linkOpen = true;
	}

	function closeLink(refocus = true) {
		linkOpen = false;
		if (refocus) editor?.chain().focus().run();
	}

	function applyLink() {
		const e = editor;
		const href = normalizeHref(linkValue);
		if (!e || !href) {
			closeLink();
			return;
		}
		// An empty selection would set a stored mark and look like nothing
		// happened, so the address becomes its own link text -- the outcome
		// someone who typed a URL into a link box is asking for either way.
		if (e.state.selection.empty) {
			e.chain()
				.focus()
				.insertContent([{ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }])
				// Stop the mark carrying on into whatever is typed next.
				.unsetMark('link')
				.run();
		} else {
			e.chain().focus().extendMarkRange('link').setLink({ href }).run();
		}
		linkOpen = false;
	}

	// ---------------------------------------------------------------------
	// The image control (0176). Deliberately the SAME SHAPE as the link
	// control above -- a toolbar button that opens a small inline form -- so
	// that inserting a picture needs no new prop from any of the three
	// surfaces that mount this editor and reaches production the day it ships.
	// ---------------------------------------------------------------------

	/**
	 * ALT TEXT IS REQUIRED HERE TOO, AND THE CONTROL SAYS SO RATHER THAN
	 * SILENTLY DOING NOTHING. `aria-disabled`, never `disabled`: a genuinely
	 * disabled control swallows pointer events, so it can never explain why it
	 * is refusing -- which is the whole reason somebody would press it.
	 */
	const imageReady = $derived(imageRef.trim() !== '' && imageAlt.trim() !== '');

	function openImage() {
		if (!editor) return;
		// `attachment:` prefilled because that is the form nearly every image
		// takes: the author copies the reference off the file they just
		// attached, and typing the prefix again is the step they would skip.
		imageRef = 'attachment:';
		imageAlt = '';
		imageOpen = true;
	}

	function closeImage(refocus = true) {
		imageOpen = false;
		if (refocus) editor?.chain().focus().run();
	}

	function applyImage() {
		const e = editor;
		if (!e || !imageReady) return;
		e.chain()
			.focus()
			.insertContent({
				type: ITEM_IMAGE_NODE.name,
				attrs: { src: imageRef.trim(), alt: imageAlt.trim() }
			})
			.run();
		imageOpen = false;
	}

	function onImageKey(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			applyImage();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			closeImage();
		}
	}

	$effect(() => {
		if (!imageOpen) return;
		const onDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target || !target.isConnected) return;
			if (imageWrap?.contains(target)) return;
			closeImage(false);
		};
		document.addEventListener('pointerdown', onDown, true);
		return () => document.removeEventListener('pointerdown', onDown, true);
	});

	$effect(() => {
		if (imageOpen) imageInput?.focus();
	});

	function onLinkKey(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			applyLink();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			closeLink();
		}
	}

	// Dismiss on POINTERDOWN, not click, and ignore a target already detached
	// from the document -- the ProfileMenu trap: the very press that opens this
	// would otherwise be seen by the handler and close it again.
	$effect(() => {
		if (!linkOpen) return;
		const onDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target || !target.isConnected) return;
			if (linkWrap?.contains(target)) return;
			closeLink(false);
		};
		document.addEventListener('pointerdown', onDown, true);
		return () => document.removeEventListener('pointerdown', onDown, true);
	});

	$effect(() => {
		if (linkOpen) linkInput?.focus();
	});
</script>

<div class="rt-editor" class:disabled class:compact>
	<div class="rt-toolbar" role="toolbar" aria-label="{label} formatting">
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
			class:on={active.h3}
			aria-pressed={active.h3}
			title="Heading"
			disabled={disabled || !editor}
			onclick={() => heading(3)}>H1</button
		>
		<button
			type="button"
			class:on={active.h4}
			aria-pressed={active.h4}
			title="Subheading"
			disabled={disabled || !editor}
			onclick={() => heading(4)}>H2</button
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
		<span class="link-wrap" bind:this={linkWrap}>
			<button
				type="button"
				class:on={active.link}
				aria-pressed={active.link}
				aria-expanded={linkOpen}
				title={active.link ? 'Remove link' : 'Add a link'}
				disabled={disabled || !editor}
				onclick={openLink}>Link</button
			>
			{#if linkOpen}
				<span class="link-pop" role="group" aria-label="Link address">
					<input
						bind:this={linkInput}
						bind:value={linkValue}
						type="url"
						class="link-input"
						placeholder="https://"
						aria-label="Link address"
						onkeydown={onLinkKey}
					/>
					<button type="button" class="link-go" onclick={applyLink}>Add</button>
					<button type="button" class="link-cancel" onclick={() => closeLink()}>Cancel</button>
				</span>
			{/if}
		</span>
		<span class="link-wrap" bind:this={imageWrap}>
			<button
				type="button"
				aria-expanded={imageOpen}
				title="Add a picture from this item's files"
				disabled={disabled || !editor}
				onclick={openImage}>Image</button
			>
			{#if imageOpen}
				<span class="link-pop image-pop" role="group" aria-label="Picture">
					<input
						bind:this={imageInput}
						bind:value={imageRef}
						type="text"
						class="link-input"
						placeholder="attachment:photo.jpg"
						aria-label="Picture file"
						onkeydown={onImageKey}
					/>
					<input
						bind:value={imageAlt}
						type="text"
						class="link-input"
						placeholder="What the picture shows"
						aria-label="Description of the picture (required)"
						onkeydown={onImageKey}
					/>
					<button
						type="button"
						class="link-go"
						aria-disabled={!imageReady}
						onclick={applyImage}>Add</button
					>
					<button type="button" class="link-cancel" onclick={() => closeImage()}>Cancel</button>
					<!-- The refusal says WHY, in the place the person is working, and
					     it is present rather than appearing only after a failed press:
					     a control that explains itself before the click saves the
					     click. -->
					<span class="image-hint" class:needed={!imageReady}>
						A description is required, so anyone using a screen reader knows what
						the picture shows.
					</span>
				</span>
			{/if}
		</span>
	</div>

	<!-- resize: vertical on the SCROLLER, so dragging the corner grows the
	     writing area rather than the whole card. Instructions routinely run
	     several paragraphs and how much of them a teacher wants on screen is
	     theirs to decide. -->
	<div class="rt-surface" class:empty={active.empty} data-placeholder={placeholder}>
		<div bind:this={host}></div>
	</div>

	{#if failed}
		<p class="rt-note" role="status">
			The formatting tools could not load, so this body will save as plain text.
		</p>
	{/if}
</div>

<style>
	.rt-editor {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2);
		overflow: hidden;
	}
	.rt-editor.disabled {
		opacity: 0.6;
	}
	.rt-toolbar {
		/* Positioned so the link popover can anchor to the TOOLBAR at narrow
		   widths rather than to its own button -- see .link-pop below. */
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.2rem;
		flex-wrap: wrap;
		padding: 0.3rem 0.35rem;
		border-bottom: 1px solid var(--hairline);
		background: var(--surface-1);
	}
	.rt-toolbar button {
		min-width: 2.2rem;
		/* 44px, the touch target this codebase standardised on. */
		min-height: 2.75rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid transparent;
		border-radius: var(--radius-card);
		background: none;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		cursor: pointer;
	}
	.rt-toolbar button:hover:not(:disabled) {
		border-color: var(--line-strong);
		color: var(--text-1);
	}
	.rt-toolbar button.on {
		border-color: var(--line-strong);
		color: var(--green);
	}
	.rt-toolbar button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.sep {
		width: 1px;
		height: 1.1rem;
		background: var(--hairline);
		margin: 0 0.15rem;
	}
	/* The popover is a SIBLING of the button inside a positioned wrapper, never
	   nested in it: a control inside a button is invalid markup and its clicks
	   would fire the button underneath. */
	.link-wrap {
		position: relative;
		display: inline-flex;
	}
	.link-pop {
		position: absolute;
		top: calc(100% + 0.25rem);
		left: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
	}
	.link-input {
		width: 15rem;
		max-width: 52vw;
		min-width: 0;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.9rem;
		padding: 0.3rem 0.45rem;
	}
	.link-input:focus {
		outline: 1px solid var(--focus-ring);
	}
	.link-pop button {
		min-width: 0;
		white-space: nowrap;
	}
	.link-pop .link-go {
		color: var(--green);
		border-color: var(--line-strong);
	}
	/* Two fields and a sentence, so the popover wraps where the link one does
	   not. Same anchor rules apply -- the narrow-screen block below moves both,
	   because they share `.link-pop`. */
	.image-pop {
		flex-wrap: wrap;
		max-width: min(30rem, 92vw);
	}
	.image-hint {
		flex: 1 0 100%;
		font-size: 0.78rem;
		line-height: 1.35;
		color: var(--text-2);
	}
	/* The one thing that CHANGES when the description is missing is the tone of
	   a sentence that was already on screen. It is never the only signal: the
	   sentence says the rule in words either way, and the Add control carries
	   `aria-disabled`. */
	.image-hint.needed {
		color: var(--amber);
	}
	/* THE EDITOR SHOWS THE REFERENCE, NOT THE PICTURE, and that is honest rather
	   than unfinished: resolving an `attachment:` alias is a render-time question
	   against the item's own files, which this component is not given and must
	   not start fetching. What the author needs to see here is which file they
	   named and what they said about it. */
	.rt-surface :global(.rt-figure) {
		margin: 0.5rem 0;
		padding: 0.5rem 0.6rem;
		border: 1px dashed var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2);
	}
	.rt-surface :global(.rt-figure .rt-figure-ref) {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.03em;
		color: var(--text-2);
	}
	.rt-surface :global(.rt-figure figcaption) {
		font-size: 0.86rem;
		color: var(--text-1);
		margin-top: 0.2rem;
	}
	.rt-surface :global(.rt-figure.ProseMirror-selectednode) {
		border-style: solid;
		border-color: var(--green);
	}
	/**
	 * NARROW SCREENS ANCHOR TO THE TOOLBAR, NOT TO THE BUTTON.
	 *
	 * The toolbar WRAPS at phone width, so the Link button can sit anywhere
	 * along it -- and a popover anchored to that button runs off whichever edge
	 * the button happens to be near. Measured at 375px before this rule: left
	 * -82px, i.e. unreachable and not even scrollable to. (The same trap the
	 * notebook's theme picker hit, and the same fix: drop the wrapper out of the
	 * positioning chain so the containing block becomes something that spans the
	 * width, and measure the insets from THAT.)
	 */
	@media (max-width: 30rem) {
		.link-wrap {
			position: static;
		}
		.link-pop {
			left: 0.35rem;
			right: 0.35rem;
			flex-wrap: wrap;
		}
		.link-input {
			width: auto;
			max-width: none;
			flex: 1 1 8rem;
		}
	}
	.rt-surface {
		position: relative;
		padding: 0.55rem 0.7rem;
		font-family: var(--font-display);
		font-size: 0.95rem;
		line-height: 1.6;
		color: var(--text-1);
		/* Generous by default: an instructions field that shows three lines is
		   the reason the old textarea was unusable for real assignments. */
		min-height: 15rem;
		max-height: 70vh;
		overflow-y: auto;
		resize: vertical;
	}
	.rt-editor.compact .rt-surface {
		min-height: 10rem;
	}
	/* ProseMirror owns the inner element, so its styles have to be global. */
	.rt-surface :global(.rt-input) {
		min-height: 100%;
		outline: none;
	}
	.rt-surface :global(.rt-input p),
	.rt-surface :global(.rt-input ul),
	.rt-surface :global(.rt-input ol) {
		margin: 0 0 0.7rem;
	}
	.rt-surface :global(.rt-input ul),
	.rt-surface :global(.rt-input ol) {
		padding-left: 1.4rem;
	}
	.rt-surface :global(.rt-input li) {
		margin: 0.15rem 0;
	}
	/* Matches ItemBody's rendering, so what is typed is what is published. */
	.rt-surface :global(.rt-input h3),
	.rt-surface :global(.rt-input h4) {
		font-family: var(--font-mono);
		letter-spacing: 0.04em;
		color: var(--text-1);
		margin: 1.1rem 0 0.4rem;
	}
	.rt-surface :global(.rt-input h3) {
		font-size: 0.82rem;
		text-transform: uppercase;
	}
	.rt-surface :global(.rt-input h4) {
		font-size: 0.74rem;
		color: var(--text-2);
		margin-top: 0.9rem;
	}
	.rt-surface :global(.rt-input a) {
		color: var(--cyan);
		text-decoration: underline;
	}
	.rt-surface.empty::before {
		content: attr(data-placeholder);
		position: absolute;
		top: 0.55rem;
		left: 0.7rem;
		color: var(--text-2);
		pointer-events: none;
	}
	.rt-note {
		margin: 0;
		padding: 0.35rem 0.7rem 0.5rem;
		color: var(--amber);
		font-size: 0.78rem;
	}
</style>
