<script lang="ts">
	import {
		attachmentSrc,
		fileKindLabel,
		figureReference,
		formatBytes,
		isImageAttachment,
		type ClassroomAttachment,
		type TxResult
	} from '$lib/classroom/classroom';
	import { reorderIds } from '$lib/classroom/attachments';
	import { sortDrag } from '$lib/classroom/sort-drag';

	/**
	 * Attachments on a post or an assignment. ONE renderer, mounted by the
	 * stream, the classwork detail and the composer's existing-files list (the
	 * NotebookPhotos convention), so the student view and the teacher view can
	 * never drift into showing different things.
	 *
	 * Every src goes through attachmentSrc -> the app's own RLS-enforcing proxy;
	 * there is deliberately no drive.google.com link anywhere, since that only
	 * renders for a viewer who personally has access to the school's shared
	 * drive.
	 *
	 * IT NO LONGER TAKES A `viewAs`. That prop appended `?as=<email>` so an
	 * impersonated page was answered as that student; the classroom view-as
	 * class and item previews are gone and the proxy no longer reads the
	 * parameter, so every list here is the caller's own read.
	 *
	 * THE THREE AUTHORING CONTROLS 0193 ADDS -- reorder, rename, and the
	 * sentence that blocks a rename -- ARE EACH A PROP, AND ABSENCE REMOVES
	 * THE CONTROL. The stream and the item page hand none of them in and get
	 * the list exactly as it was; the composer hands them in only when the
	 * layout transports exist (a deployment without 0193 applied by hand hands
	 * `null`). Read-only is structural here, not a discipline: there is no
	 * write to execute. The list never reorders itself -- `onreorder` gets the
	 * NEW id array and the parent's own state decides; a keyed `{#each}` on
	 * the prop's order is what renders it.
	 */
	let {
		attachments,
		onremove = null,
		removing = null,
		resolveSrc = null,
		figureRefs = false,
		onreorder = null,
		onrename = null,
		renameBlocked = null
	}: {
		attachments: ClassroomAttachment[];
		/** Teacher-only; omitted entirely on the student-facing views. */
		onremove?: ((a: ClassroomAttachment) => void) | null;
		removing?: string | null;
		/**
		 * Overrides how a source URL is built -- for the instructor-only list,
		 * which goes through its OWN proxy rather than
		 * the student-facing one attachmentSrc builds.
		 */
		resolveSrc?: ((a: ClassroomAttachment) => string) | null;
		/**
		 * THE AUTHORING AFFORDANCE FOR FIGURES, and it is off by default.
		 *
		 * An author writing `![alt](attachment:<filename>)` has to get the
		 * filename exactly right, and the only place it is written down is the
		 * row they are looking at. Making them retype it -- or worse, hunt for it
		 * in a Drive folder -- is how the reference ends up pointing at
		 * `Photo (1).JPG` when the file is `photo (1).jpg`.
		 *
		 * TURNED ON ONLY WHERE THE VIEWER MANAGES THE ITEM, and only on the
		 * STUDENT-FACING list. It is deliberately not offered on the
		 * instructor-only list (0090): those files resolve through their own proxy
		 * which `resolveFigureSrc` never calls, so a reference to one could not
		 * work -- and if it ever did, it would be embedding an instructor-only
		 * file into prose every student in the class reads.
		 */
		figureRefs?: boolean;
		/**
		 * REORDER. Given, every row gets a grip (`data-sort-handle`, driven by
		 * `sortDrag`: pointer drag, or ArrowUp / ArrowDown on the focused grip)
		 * and a worded Move up / Move down pair. Every path calls this with the
		 * FULL id array in its new order; the parent reorders its own array and
		 * this list renders whatever order the prop then carries.
		 */
		onreorder?: ((ids: string[]) => void) | null;
		/**
		 * RENAME. Given, every row gets a Rename control that turns the name
		 * into an input with a visible Save / Cancel pair (Enter and Escape are
		 * the keyboard spellings). The result's `message` is shown on a
		 * refusal, verbatim -- it is the one vocabulary the client pre-check
		 * and the database share (`RENAME_REFUSALS`), so nothing here re-tones
		 * it. On success the PARENT updates the row; this list only closes the
		 * editor.
		 */
		onrename?:
			| ((a: ClassroomAttachment, filename: string) => Promise<TxResult<{ filename: string }>>)
			| null;
		/**
		 * WHY THIS ROW CANNOT BE RENAMED RIGHT NOW, as a sentence, or null.
		 * A file used as a figure in the body or the spec is one whose rename
		 * would leave a picture pointing at a name that no longer exists; the
		 * parent knows the documents, so the parent answers. Pressing Rename on
		 * such a row shows the sentence INSTEAD OF the input, so the refusal
		 * arrives before anything is typed rather than after.
		 */
		renameBlocked?: ((a: ClassroomAttachment) => string | null) | null;
	} = $props();

	const srcOf = (a: ClassroomAttachment) => resolveSrc?.(a) ?? attachmentSrc(a.id);

	/** Which row is showing its "copied" confirmation, and the timer clearing it. */
	let copied = $state<string | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	async function copyRef(a: ClassroomAttachment) {
		// ONE SPELLING OF THE REFERENCE, shared with the resolver (classroom.ts),
		// so what an author is handed is by construction what the parser reads.
		const ref = figureReference(a.filename);
		try {
			await navigator.clipboard.writeText(ref);
		} catch {
			// A denied or unavailable clipboard is ordinary (an insecure origin, a
			// permission prompt dismissed). Falling back to a selected textarea
			// keeps the string reachable rather than reporting a failure the
			// author can do nothing with.
			const scratch = document.createElement('textarea');
			scratch.value = ref;
			scratch.setAttribute('readonly', '');
			scratch.style.position = 'fixed';
			scratch.style.opacity = '0';
			document.body.appendChild(scratch);
			scratch.select();
			try {
				document.execCommand('copy');
			} catch {
				/* Nothing further to offer; the confirmation below is not shown. */
			}
			document.body.removeChild(scratch);
		}
		copied = a.id;
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = null), 2000);
	}

	// A broken fetch is an ordinary outcome (an expired session, a Drive
	// hiccup), so a failed image falls back to the file row rather than a
	// broken-image glyph.
	let broken = $state<Record<string, boolean>>({});

	/**
	 * THE ONE REORDER. `sortDrag`'s `ondrop` (a pointer drag, or an arrow key
	 * on a focused grip) and the two worded buttons all arrive here as
	 * `(from, to)` over the CURRENT prop order, and `reorderIds` -- the pure
	 * helper the composer's own tests pin -- produces the array the parent is
	 * handed. Two spellings of "move one row" is how a drag and a button stop
	 * agreeing about where a row lands.
	 */
	function move(from: number, to: number) {
		if (!onreorder) return;
		if (from === to || to < 0 || to >= attachments.length) return;
		onreorder(reorderIds(attachments.map((a) => a.id), from, to));
	}

	/** The rename editor: which row, the draft, the refusal shown under it,
	 *  and whether a call is in flight. `blocked` is the row whose blocking
	 *  sentence is showing instead of an input. */
	let renamingId = $state<string | null>(null);
	let renameDraft = $state('');
	let renameMessage = $state<string | null>(null);
	let renameBusy = $state(false);
	let blockedId = $state<string | null>(null);
	let blockedText = $state<string | null>(null);

	function startRename(a: ClassroomAttachment) {
		if (!onrename || renameBusy) return;
		// The block is asked FIRST, before an input is offered: a sentence
		// shown after somebody has typed a new name is a sentence read as "you
		// did it wrong", where the truth is that nothing they could type would
		// have been accepted.
		const why = renameBlocked?.(a) ?? null;
		if (why) {
			renamingId = null;
			blockedId = a.id;
			blockedText = why;
			return;
		}
		blockedId = null;
		blockedText = null;
		renamingId = a.id;
		renameDraft = a.filename;
		renameMessage = null;
	}

	function cancelRename() {
		if (renameBusy) return;
		renamingId = null;
		renameDraft = '';
		renameMessage = null;
	}

	function dismissBlocked() {
		blockedId = null;
		blockedText = null;
	}

	async function commitRename(a: ClassroomAttachment) {
		if (!onrename || renameBusy) return;
		const next = renameDraft.trim();
		// Nothing typed, or the same name: nothing to send. Closing rather than
		// refusing, because "you changed nothing" is not a problem to report.
		if (!next || next === a.filename) {
			cancelRename();
			return;
		}
		renameBusy = true;
		renameMessage = null;
		try {
			const res = await onrename(a, next);
			if (res.ok) {
				// The parent has updated the row (or will on its next render);
				// this editor's only job is to get out of the way.
				renamingId = null;
				renameDraft = '';
			} else {
				// VERBATIM, and the input stays open with the draft in it, so a
				// refusal for a taken name costs one edit rather than a retype.
				renameMessage = res.message;
			}
		} finally {
			renameBusy = false;
		}
	}

	function onRenameKey(e: KeyboardEvent, a: ClassroomAttachment) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void commitRename(a);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelRename();
		}
	}

	/** Focus the rename input the moment it exists. An action, keyed on the
	 *  element (CLAUDE.md: never on mount), rather than `autofocus`: the input
	 *  appears on a press, and this is the caret going where it was asked for. */
	function focusOnMount(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	const sortable = $derived(!!onreorder && attachments.length > 1);
</script>

{#if attachments.length}
	<!-- `sortDrag` is bound whether or not `onreorder` is given and simply
	     DISABLED without it -- but with no grip rendered there is nothing for
	     the pointer or the arrow keys to start from, so absence removes the
	     control structurally and the disabled flag is the second lock. -->
	<ul
		class="attach-list"
		use:sortDrag={{ items: '.attach-row', ondrop: move, disabled: !sortable }}
	>
		{#each attachments as a, i (a.id)}
			<li
				class="attach-row"
				class:image={isImageAttachment(a) && !broken[a.id]}
				data-sort-item
				data-testid="attach-row"
			>
				{#if isImageAttachment(a) && !broken[a.id]}
					<a class="attach-preview" href={srcOf(a)} target="_blank" rel="noopener noreferrer">
						<img
							src={srcOf(a)}
							alt={a.filename}
							loading="lazy"
							onerror={() => (broken = { ...broken, [a.id]: true })}
						/>
					</a>
				{/if}
				{#if renamingId === a.id}
					<!-- THE INLINE RENAME. Enter saves, Escape cancels, and the
					     visible Save / Cancel pair is what a phone reaches. The
					     refusal, when there is one, renders UNDER the input in the
					     row it is about, in the transport's own words. -->
					<div class="attach-rename" data-testid="attach-rename">
						<label class="attach-rename-label">
							<span class="attach-rename-word">New name</span>
							<input
								class="attach-rename-input"
								type="text"
								bind:value={renameDraft}
								onkeydown={(e) => onRenameKey(e, a)}
								use:focusOnMount
								readonly={renameBusy}
								data-testid="attach-rename-input"
							/>
						</label>
						{#if renameMessage}
							<p class="attach-refusal" role="alert" data-testid="attach-rename-refusal">
								{renameMessage}
							</p>
						{/if}
						<span class="attach-rename-actions">
							<button
								type="button"
								class="attach-btn"
								data-testid="attach-rename-save"
								aria-disabled={renameBusy}
								onclick={() => commitRename(a)}
							>
								{renameBusy ? 'Saving...' : 'Save name'}
							</button>
							<button
								type="button"
								class="attach-btn quiet"
								data-testid="attach-rename-cancel"
								aria-disabled={renameBusy}
								onclick={cancelRename}
							>
								Cancel
							</button>
						</span>
					</div>
				{:else}
					<span class="attach-meta">
						{#if sortable}
							<!-- THE GRIP. The one control on this row without a word of its
							     own, allowed because the Move up / Move down buttons beside
							     it are the worded spelling of the same move; the grip adds
							     only the pointer path. `data-sort-handle` is what `sortDrag`
							     listens on. -->
							<button
								type="button"
								class="attach-grip"
								data-sort-handle
								data-testid="attach-grip"
								aria-label={`Reorder ${a.filename}: drag, or use the arrow keys`}
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
						{/if}
						<a class="attach-name tap-reach-44" href={srcOf(a)} target="_blank" rel="noopener noreferrer">
							{#if !isImageAttachment(a)}
								<span class="attach-glyph" aria-hidden="true">{fileKindLabel(a.filename, a.mime_type)}</span>
							{/if}
							{a.filename}
						</a>
						{#if a.size_bytes}<span class="attach-size">{formatBytes(a.size_bytes)}</span>{/if}
						<!-- Images only: a figure is an image, and offering the reference
						     beside a PDF would hand an author a string that resolves to a
						     refusal. `isImageAttachment` already excludes SVG, which the
						     resolver refuses outright, so the two agree without a second
						     rule here. A visible WORD, not a glyph: a phone cannot hover
						     and a tooltip is not discoverable. -->
						{#if figureRefs && isImageAttachment(a)}
							<button
								type="button"
								class="attach-ref"
								data-testid="attach-figure-ref"
								onclick={() => copyRef(a)}
							>
								{copied === a.id ? 'Reference copied' : 'Copy figure reference'}
							</button>
						{/if}
						{#if sortable}
							<!-- aria-disabled at the ends, never disabled: the first row's
							     Move up still explains itself and still takes focus. -->
							<button
								type="button"
								class="attach-btn quiet"
								data-testid="attach-move-up"
								aria-disabled={i === 0}
								onclick={() => move(i, i - 1)}
							>
								Move up
							</button>
							<button
								type="button"
								class="attach-btn quiet"
								data-testid="attach-move-down"
								aria-disabled={i === attachments.length - 1}
								onclick={() => move(i, i + 1)}
							>
								Move down
							</button>
						{/if}
						{#if onrename}
							<button
								type="button"
								class="attach-btn quiet"
								data-testid="attach-rename-start"
								onclick={() => startRename(a)}
							>
								Rename
							</button>
						{/if}
						{#if onremove}
							<button
								type="button"
								class="attach-remove"
								disabled={removing === a.id}
								onclick={() => onremove?.(a)}
							>
								{removing === a.id ? 'Removing...' : 'Remove'}
							</button>
						{/if}
					</span>
					{#if blockedId === a.id && blockedText}
						<!-- THE BLOCKING SENTENCE, where the input would have been. It
						     is a fact about the row, not an error the person made, so
						     it is worded by the parent and dismissed with a word. -->
						<p class="attach-blocked" data-testid="attach-rename-blocked">
							<span>{blockedText}</span>
							<button type="button" class="attach-btn quiet" onclick={dismissBlocked}>OK</button>
						</p>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.attach-list {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.attach-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	/* `align-self: flex-start` IS WHAT STOPS THE FRAME STANDING WIDER THAN THE
	   PICTURE, and it is the fix MarkdownText's print block already found by
	   measuring (a 1202x1202 square in a stretched box: 846x384 before, 384x384
	   after). `.attach-row` is a flex COLUMN, so the default stretch alignment sizes
	   this wrapper to the whole row while the img inside it -- `width: auto`,
	   `height: auto` -- shrinks to its own intrinsic size. The wrapper draws a
	   border and a `--surface-2` ground, so what is left over is a bordered
	   empty panel beside the handout. Measured at 1440 before the change: a
	   600x900 image sat 234.7px wide inside a 1406px frame, 1171.3px of panel;
	   a 200x150 one, 1206px.

	   The border and the background stay: they are what says where a picture
	   ends against the plate. They are drawn around the picture now. */
	.attach-preview {
		display: block;
		align-self: flex-start;
		max-width: 100%;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		overflow: hidden;
		background: var(--surface-2);
		line-height: 0;
	}
	.attach-preview img {
		display: block;
		max-width: 100%;
		max-height: 22rem;
		width: auto;
		height: auto;
		object-fit: contain;
	}
	/* THE ROW OWNS A 44px BAND, AND THAT IS WHAT STOPS TWO REACHES STEALING
	   FROM EACH OTHER. `.attach-name` carries `.tap-reach-44` with the width
	   knob at zero, so each filename link has a 44px-TALL hit area centred on
	   itself. Hit-tested 2026-09-05 on the packed item page at 375 and 1440:
	   the first of two rows walked **88 x 41.5**. Nothing clipped it -- the
	   rows simply sat 41.3px apart centre to centre (22.5/2 + 8px gap + 44/2),
	   so the NEXT link's reach, which paints later, took the bottom 2.7px of
	   this one's. Two reaches stacked closer than 44px apart steal from each
	   other exactly as two side by side do, and only the vertical case had no
	   rule against it.

	   `min-height` ON THE LINE, NOT A BIGGER GAP. Raising `.attach-list`'s gap
	   from 8px to 11px also clears 44 for THIS pair of row heights (41.3 ->
	   44.3) and costs only 3px, and it is refused: the centre-to-centre
	   distance is `h1/2 + gap + h2/2`, so two 22.5px rows at an 11px gap are
	   33.5px apart and overlap again. A 44px floor on the line HOLDING the link
	   makes the distance at least `22 + gap + 22`, which is a property rather
	   than an arithmetic coincidence that happens to hold for the fixture in
	   front of us. `IDEA_INTERFACE_STANDARDS` 10 (2.12) step 1: the list is a
	   column in a card with the full measure to itself, so nothing competes for
	   the height. The cost is 21.5px per row that was shorter than 44. */
	.attach-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		min-width: 0;
		min-height: 44px;
	}
	.attach-name {
		display: inline-flex;
		align-items: center;
		/* 22.5px measured, and it CANNOT grow: it is the filename inside an
		   attachment row that already carries a size, a type chip and a remove
		   button on the same line, and a 44px box would wrap the row. The hit
		   area is expanded instead -- see `.tap-reach-44` in src/app.css.
		   Height only; the remove button sits within 44px horizontally
		   (IDEA_INTERFACE_STANDARDS 10). */
		--tap-reach-w: 0px;
		gap: 0.4rem;
		color: var(--text-1);
		text-decoration: none;
		font-size: 0.88rem;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.attach-name:hover {
		color: var(--gold);
	}
	.attach-glyph {
		flex: none;
		display: inline-flex;
		align-items: center;
		height: 1.3rem;
		padding: 0 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		color: var(--gold);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
	}
	.attach-size {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	/* 44px MINIMUM, PER IDEA_INTERFACE_STANDARDS 10. Measured at 131x16 when
	   this first shipped, which is under even the absolute 24px floor. A teacher
	   authoring on a phone can reach this control, so it takes the touch target
	   rather than the console floor. The pill keeps its type scale; only the box
	   grows, so the row's reading weight is unchanged. */
	.attach-ref {
		appearance: none;
		background: none;
		border: 1px solid var(--boundary);
		border-radius: 999px;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.1rem 0.75rem;
		min-height: 44px;
		cursor: pointer;
	}
	.attach-ref:hover {
		color: var(--gold);
		border-color: var(--gold);
	}
	/* PRE-EXISTING, and raised in the same pass for the same reason: it is the
	   adjacent sibling in this row and also measured 16px. One compliant control
	   beside one non-compliant one reads as a broken row rather than a fixed one,
	   so the two move together. */
	.attach-remove {
		appearance: none;
		background: none;
		border: 1px solid var(--boundary);
		border-radius: 999px;
		color: var(--crimson);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.1rem 0.75rem;
		min-height: 44px;
		cursor: pointer;
	}
	.attach-remove:disabled {
		color: var(--text-3);
		cursor: default;
	}
	/* THE 0193 CONTROLS TAKE THE SAME PILL AS Copy figure reference: the same
	   type scale, the same 44px floor, the same ring. A row that mixes two
	   control shapes reads as two generations of the same list. */
	.attach-btn {
		appearance: none;
		background: none;
		border: 1px solid var(--boundary);
		border-radius: 999px;
		color: var(--text-1);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.1rem 0.75rem;
		min-height: 44px;
		/* BOTH dimensions: the floor is the smaller side, and a two-letter
		   word ("OK") in this type scale measured 36.7px wide at 375 and 1440
		   with the height already at 44. */
		min-width: 44px;
		cursor: pointer;
	}
	.attach-btn.quiet {
		color: var(--text-2);
	}
	.attach-btn:hover {
		color: var(--gold);
		border-color: var(--gold);
	}
	.attach-btn[aria-disabled='true'] {
		opacity: 0.45;
		cursor: default;
	}
	/* 44px square, the dots at 16px inside it: the box is the target, not the
	   glyph. `cursor: grab` on a desktop; `touch-action: none` is what lets a
	   finger drag the row instead of scrolling the pane (the action sets it
	   too -- this is the same value declared where a stylesheet reader looks). */
	.attach-grip {
		appearance: none;
		width: 44px;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: none;
		color: var(--text-2);
		cursor: grab;
		touch-action: none;
	}
	.attach-grip svg {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}
	.attach-grip:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}
	.attach-rename {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}
	.attach-rename-label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.attach-rename-word {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.attach-rename-input {
		min-height: 44px;
		width: 100%;
		min-width: 0;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2);
		color: var(--text-1);
		font-family: var(--font-display, inherit);
		font-size: 0.95rem;
	}
	.attach-rename-input:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}
	.attach-rename-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	/* THE REFUSAL, IN THE TRANSPORT'S OWN WORDS. `--nb-error` where a room
	   provides one (the notebook plates correct the raw accent), `--crimson`
	   otherwise -- crimson is the error status colour and this is an error. */
	.attach-refusal {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--nb-error, var(--crimson));
	}
	/* THE BLOCKING SENTENCE is not an error -- it is a fact about the row --
	   so it reads in body ink, not crimson. */
	.attach-blocked {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--text-1);
	}

	/* AUTHORING CHROME NEVER PRINTS. The reference string is a thing you paste
	   into a spec, so on paper it is a button nobody can press beside a filename
	   that is already there -- and the same goes for a grip, a Move and a
	   Rename. */
	@media print {
		.attach-ref,
		.attach-btn,
		.attach-grip {
			display: none;
		}
	}
</style>
