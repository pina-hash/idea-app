<script lang="ts">
	/**
	 * DRAWING ON A STUDENT'S PICTURE (0238, decision 60; Mr. Pina: "drawing tools
	 * to draw on an image with a few different colors and point things out in a
	 * clear and understandable way").
	 *
	 * A native modal `<dialog>` in the top layer, as the photo overlays are, so
	 * nothing on the page can sit over it. Five tools (pen, arrow, box, circle,
	 * label), six colours, three widths, Undo and Redo and Clear, and the note's
	 * words beside the picture. What is saved is vector data in the picture's own
	 * coordinates (`Marks`), never pixels, so the drawing lands on the same spot
	 * at every size the student sees it.
	 *
	 * DRAWING IS A POINTER ACT; THE WORDS ARE THE KEYBOARD'S. A note can always be
	 * written without drawing, and every control here is a worded 44px button.
	 * The colour of a mark is never the only thing it says: the words beside it
	 * are the note.
	 *
	 * NOTHING IS LOST TO A STRAY ESCAPE. Closing with marks or words not yet
	 * saved asks first, in the dialog, and Save keeps everything on screen when
	 * the send is refused, with the refusal in words.
	 */
	import { onMount, tick } from 'svelte';
	import MarkLayer from './MarkLayer.svelte';
	import {
		MARK_COLOR_IDS,
		MARK_MAX_SHAPES,
		MARK_PAINT,
		MARK_SCALE,
		MARK_TEXT_MAX,
		MARK_TOOLS,
		MARK_WIDTHS,
		markCoord,
		normText,
		thinStroke,
		type MarkColor,
		type MarkShape,
		type MarkTool,
		type MarkWidth,
		type Marks
	} from './notes';

	let {
		src,
		alt,
		title = 'Draw on this picture',
		initialMarks = null,
		initialBody = '',
		saveLabel = 'Save and send',
		onsave,
		onclose
	}: {
		src: string;
		alt: string;
		title?: string;
		initialMarks?: Marks | null;
		initialBody?: string;
		saveLabel?: string;
		/** Resolves to null when it landed, or the sentence saying why not. */
		onsave: (marks: Marks, body: string) => Promise<string | null>;
		onclose: () => void;
	} = $props();

	const TOOL_LABEL: Record<MarkTool, string> = { pen: 'Pen', arrow: 'Arrow', box: 'Box', ellipse: 'Circle', text: 'Label' };
	const WIDTH_LABEL: Record<MarkWidth, string> = { 1: 'Thin', 2: 'Medium', 3: 'Thick' };

	let dialog = $state<HTMLDialogElement | null>(null);
	let img = $state<HTMLImageElement | null>(null);
	let natural = $state<{ w: number; h: number } | null>(null);
	// svelte-ignore state_referenced_locally
	let shapes = $state<MarkShape[]>(initialMarks ? [...initialMarks.shapes] : []);
	let undone = $state<MarkShape[]>([]);
	// svelte-ignore state_referenced_locally
	let body = $state(initialBody);
	let tool = $state<MarkTool>('arrow');
	let color = $state<MarkColor>('red');
	let width = $state<MarkWidth>(2);
	let label = $state('');
	let draft = $state<MarkShape | null>(null);
	let busy = $state(false);
	let problem = $state<string | null>(null);
	let confirmDiscard = $state(false);
	// svelte-ignore state_referenced_locally
	const startShapes = JSON.stringify(initialMarks?.shapes ?? []);
	// svelte-ignore state_referenced_locally
	const startBody = normText(initialBody);
	const dirty = $derived(JSON.stringify(shapes) !== startShapes || normText(body) !== startBody);
	const full = $derived(shapes.length >= MARK_MAX_SHAPES);

	onMount(() => {
		dialog?.showModal();
		const cancel = (e: Event) => {
			if (dirty && !busy) {
				e.preventDefault();
				confirmDiscard = true;
			}
		};
		const closed = () => onclose();
		dialog?.addEventListener('cancel', cancel);
		dialog?.addEventListener('close', closed);
		return () => {
			dialog?.removeEventListener('cancel', cancel);
			dialog?.removeEventListener('close', closed);
		};
	});

	function loaded() {
		if (img) natural = { w: img.naturalWidth, h: img.naturalHeight };
	}

	/** A pointer position to mark units, inside the picture's letterboxed content. */
	function toMark(e: PointerEvent): [number, number] | null {
		if (!img || !natural) return null;
		const r = img.getBoundingClientRect();
		const scale = Math.min(r.width / natural.w, r.height / natural.h);
		const cw = natural.w * scale;
		const ch = natural.h * scale;
		const left = r.left + (r.width - cw) / 2;
		const top = r.top + (r.height - ch) / 2;
		return [markCoord(((e.clientX - left) / cw) * MARK_SCALE), markCoord(((e.clientY - top) / ch) * MARK_SCALE)];
	}

	function commit(shape: MarkShape) {
		if (full) return;
		shapes = [...shapes, shape];
		undone = [];
		problem = null;
	}

	function down(e: PointerEvent) {
		if (e.button !== 0 || busy) return;
		const at = toMark(e);
		if (!at) return;
		e.preventDefault();
		if (tool === 'text') {
			const words = normText(label);
			if (!words) {
				problem = 'Type the label in the Label box first, then click where it goes.';
				return;
			}
			commit({ t: 'text', c: color, w: width, p: at, s: words.slice(0, MARK_TEXT_MAX) });
			return;
		}
		(e.currentTarget as Element).setPointerCapture?.(e.pointerId);
		draft = { t: tool, c: color, w: width, p: tool === 'pen' ? [...at, ...at] : [...at, ...at] };
	}
	function move(e: PointerEvent) {
		if (!draft) return;
		const at = toMark(e);
		if (!at) return;
		if (draft.t === 'pen') draft = { ...draft, p: [...draft.p, ...at] };
		else draft = { ...draft, p: [draft.p[0], draft.p[1], ...at] };
	}
	function up() {
		if (!draft) return;
		const d = draft;
		draft = null;
		if (d.t === 'pen') {
			const p = thinStroke(d.p.slice(2));
			if (p.length >= 4) commit({ ...d, p });
			return;
		}
		// A click with no drag draws nothing rather than a dot nobody meant.
		const moved = Math.hypot(d.p[2] - d.p[0], d.p[3] - d.p[1]);
		if (moved >= 40) commit(d);
	}

	function undo() {
		if (!shapes.length) return;
		undone = [...undone, shapes[shapes.length - 1]];
		shapes = shapes.slice(0, -1);
	}
	function redo() {
		if (!undone.length) return;
		shapes = [...shapes, undone[undone.length - 1]];
		undone = undone.slice(0, -1);
	}
	function clearAll() {
		if (!shapes.length) return;
		undone = [...undone, ...[...shapes].reverse()];
		shapes = [];
	}
	function keys(e: KeyboardEvent) {
		if (!(e.ctrlKey || e.metaKey)) return;
		const k = e.key.toLowerCase();
		if (k === 'z' && !e.shiftKey) {
			e.preventDefault();
			undo();
		} else if ((k === 'z' && e.shiftKey) || k === 'y') {
			e.preventDefault();
			redo();
		}
	}

	async function save() {
		if (busy) return;
		if (!shapes.length && !normText(body)) {
			problem = 'Draw on the picture or write a note before saving.';
			return;
		}
		busy = true;
		problem = null;
		try {
			const why = await onsave({ v: 1, shapes }, body);
			if (why) problem = why;
			else {
				dialog?.close();
			}
		} catch {
			problem = 'The drawing did not save. Check your connection and try again; it is still here.';
		} finally {
			busy = false;
		}
	}
	async function discard() {
		confirmDiscard = false;
		await tick();
		dialog?.close();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog class="ann" bind:this={dialog} aria-labelledby="ann-title" data-testid="annotator" onkeydown={keys}>
	<header class="ann-head">
		<h2 id="ann-title" class="ann-title">{title}</h2>
		<button type="button" class="btn secondary ann-close" onclick={() => (dirty ? (confirmDiscard = true) : dialog?.close())}>Close</button>
	</header>

	<div class="ann-tools" role="toolbar" aria-label="Drawing tools">
		<div class="ann-group" role="group" aria-label="Tool">
			{#each MARK_TOOLS as t (t)}
				<button type="button" class="btn secondary ann-key" aria-pressed={tool === t} class:on={tool === t} data-testid="ann-tool-{t}" onclick={() => (tool = t)}>{TOOL_LABEL[t]}</button>
			{/each}
		</div>
		<div class="ann-group" role="group" aria-label="Colour">
			{#each MARK_COLOR_IDS as c (c)}
				<button
					type="button"
					class="btn secondary ann-key ann-swatch"
					aria-pressed={color === c}
					class:on={color === c}
					data-testid="ann-color-{c}"
					onclick={() => (color = c)}
				>
					<span class="ann-chip" style="background: {MARK_PAINT[c].ink}; border-color: {MARK_PAINT[c].halo}" aria-hidden="true"></span>
					{MARK_PAINT[c].label}
				</button>
			{/each}
		</div>
		<div class="ann-group" role="group" aria-label="Line width">
			{#each MARK_WIDTHS as w (w)}
				<button type="button" class="btn secondary ann-key" aria-pressed={width === w} class:on={width === w} onclick={() => (width = w)}>{WIDTH_LABEL[w]}</button>
			{/each}
		</div>
		<div class="ann-group" role="group" aria-label="History">
			<button type="button" class="btn secondary ann-key" aria-disabled={!shapes.length} data-testid="ann-undo" onclick={undo}>Undo</button>
			<button type="button" class="btn secondary ann-key" aria-disabled={!undone.length} onclick={redo}>Redo</button>
			<button type="button" class="btn secondary ann-key" aria-disabled={!shapes.length} onclick={clearAll}>Clear</button>
		</div>
		{#if tool === 'text'}
			<label class="ann-label">
				<span>Label</span>
				<input class="input" maxlength={MARK_TEXT_MAX} bind:value={label} placeholder="Words to place on the picture" data-testid="ann-label" />
			</label>
		{/if}
	</div>

	<div class="ann-stage">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="ann-canvas"
			class:texting={tool === 'text'}
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
			data-testid="ann-canvas"
		>
			<img bind:this={img} {src} {alt} onload={loaded} draggable="false" />
			{#if natural}
				<MarkLayer marks={{ v: 1, shapes }} width={natural.w} height={natural.h} {draft} />
			{/if}
		</div>
		<label class="ann-note">
			<span class="ann-note-label">Note for the student</span>
			<textarea class="input" rows="4" maxlength="2000" bind:value={body} placeholder="Say what the marks mean and what to do next." data-testid="ann-body"></textarea>
		</label>
	</div>

	{#if full}<p class="ann-msg" role="status">This drawing holds as many marks as it can. Undo one to add another.</p>{/if}
	{#if problem}<p class="ann-msg ann-problem" role="alert">{problem}</p>{/if}
	{#if confirmDiscard}
		<div class="ann-confirm" role="alertdialog" aria-label="Discard the drawing?">
			<p>Close without saving? The marks and words you added will be lost.</p>
			<button type="button" class="btn secondary" onclick={() => (confirmDiscard = false)}>Keep drawing</button>
			<button type="button" class="btn danger" data-testid="ann-discard" onclick={discard}>Discard</button>
		</div>
	{/if}
	<footer class="ann-foot">
		<span class="ann-count" aria-live="polite">{shapes.length} {shapes.length === 1 ? 'mark' : 'marks'}</span>
		<button type="button" class="btn ann-save" aria-disabled={busy} data-testid="ann-save" onclick={save}>{busy ? 'Saving...' : saveLabel}</button>
	</footer>
</dialog>

<style>
	.ann {
		width: min(96vw, 1400px);
		max-width: none;
		height: min(94vh, 1000px);
		max-height: none;
		padding: 0;
		/* A modal over a dimmed backdrop: the edge is decoration. */
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card, 8px);
		background: var(--surface-1, var(--bg1));
		color: var(--text-1);
		overflow: hidden;
	}
	.ann[open] {
		display: flex;
		flex-direction: column;
	}
	.ann::backdrop {
		background: rgb(0 0 0 / 0.6);
	}
	.ann-head,
	.ann-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.6rem 0.9rem;
		flex: none;
	}
	.ann-title {
		margin: 0;
		font-size: var(--fs-base);
	}
	.ann-tools {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.9rem;
		padding: 0 0.9rem 0.6rem;
		flex: none;
	}
	.ann-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.ann-key,
	.ann-close,
	.ann-save,
	.ann-confirm .btn {
		min-height: 44px;
	}
	.ann-key[aria-disabled='true'] {
		opacity: 0.55;
	}
	.ann-swatch {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.ann-chip {
		width: 0.95rem;
		height: 0.95rem;
		border-radius: 50%;
		border: 2px solid;
		flex: none;
	}
	.ann-label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.ann-label input {
		min-height: 44px;
		width: 16rem;
		max-width: 60vw;
	}
	.ann-stage {
		flex: 1 1 auto;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(14rem, 22rem);
		gap: 0.9rem;
		padding: 0 0.9rem;
	}
	.ann-canvas {
		position: relative;
		min-height: 0;
		height: 100%;
		background: #0c0c0c;
		border-radius: var(--radius-control, 6px);
		cursor: crosshair;
		touch-action: none;
		user-select: none;
	}
	.ann-canvas.texting {
		cursor: text;
	}
	.ann-canvas img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		-webkit-user-drag: none;
	}
	.ann-note {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.ann-note textarea {
		flex: 1 1 auto;
		min-height: 8rem;
		resize: vertical;
	}
	.ann-note-label {
		font-weight: 600;
	}
	.ann-msg {
		margin: 0.4rem 0.9rem 0;
		color: var(--text-2);
	}
	.ann-problem {
		color: var(--status-error, var(--crimson));
	}
	.ann-confirm {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0.9rem 0;
		padding: 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
	}
	.ann-confirm p {
		margin: 0;
		flex: 1 1 14rem;
	}
	.ann-count {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
	}
	@media (max-width: 760px) {
		.ann {
			width: 100vw;
			height: 100dvh;
			border-radius: 0;
		}
		.ann-stage {
			grid-template-columns: 1fr;
			grid-template-rows: minmax(12rem, 1fr) auto;
			overflow-y: auto;
		}
	}
</style>
