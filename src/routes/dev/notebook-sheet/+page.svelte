<script lang="ts">
	import { onDestroy } from 'svelte';
	import { NOTE_SCHEMA_OPTIONS } from '$lib/rich-text-schema';
	import { GRID_NODE_NAME, NotebookGrid, type NoteGrid } from '$lib/notebook/grid';
	import GridView from '$lib/notebook/grid/GridView.svelte';
	import type { Editor } from '@tiptap/core';

	/**
	 * THE GRID, INSIDE A REAL NOTE EDITOR. See `+page.ts` for why this route
	 * exists rather than only a `tests/dom/` file.
	 *
	 * THE EDITOR IS BUILT THE WAY `NoteEditor.svelte` BUILDS ONE -- dynamically
	 * imported, browser-only, `StarterKit.configure(NOTE_SCHEMA_OPTIONS)` from
	 * the shared declaration -- plus `NotebookGrid` with its NodeView. The
	 * autocorrect plugin is deliberately absent: it is `NoteEditor`'s and has
	 * nothing to do with the grid, and a harness that mounts more than the thing
	 * under test is a harness whose failures are ambiguous.
	 *
	 * IT IS NOT `NoteEditor.svelte` ITSELF, and that is the sequencing rather
	 * than a shortcut. This bundle does not wire the grid into that component,
	 * because the gate widens BEFORE any producer can emit the shape and the
	 * server normalizer -- the only path from an editor document into
	 * `notebook_entry_notes` -- is not this bundle's file. When the next bundle
	 * adds the node to `NoteEditor`'s extension list, this route's editor
	 * construction is the thing it copies, and this route should then mount
	 * `NoteEditor` directly.
	 */

	let host = $state<HTMLDivElement | null>(null);
	let editor = $state<Editor | null>(null);
	let failed = $state<string | null>(null);
	/** Bumped by every transaction, so the readouts below re-derive. */
	let revision = $state(0);

	const SEED = {
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [{ type: 'text', text: 'Bracket stock, cut list and cost.' }]
			},
			{
				type: GRID_NODE_NAME,
				attrs: {
					rows: [
						['Part', 'Qty', 'Each', 'Cost'],
						['Angle 1x1', '4', '3.25', '=B2*C2'],
						['Plate 6x6', '2', '11.40', '=B3*C3'],
						['Rivet', '24', '0.08', '=B4*C4'],
						['', '', 'Total', '=SUM(D2:D4)']
					]
				}
			},
			{
				type: 'paragraph',
				content: [{ type: 'text', text: 'Undo walks back through cells and prose together.' }]
			}
		]
	};

	/**
	 * The read-only mount's own grid, held apart from `SEED` so the two cannot
	 * be confused for one document. It carries an ERROR CELL on purpose: a
	 * refusal is a thing an instructor reads as often as a student, and it is
	 * the one rendering state a clean fixture never reaches.
	 *
	 * IT IS A DIVISION BY ZERO -- a mean over zero runs -- AND IT WAS A
	 * SELF-REFERENCE FIRST. `Mean` was written `=B2/B3` in the cell B3, which
	 * refers to itself, so the browser pass reported `#CYCLE!` where the spec
	 * expected `#DIV/0!`. Both are correct refusals and the engine was right
	 * both times; what was wrong was the fixture, and it is worth recording
	 * because a plausible-looking formula referring to its own cell is the
	 * easiest mistake to make in a grid and the hardest to see in a diff.
	 */
	const READ_ONLY: NoteGrid = {
		type: 'grid',
		rows: [
			['Measurement', 'Value'],
			['Runs', '0'],
			['Total', '12'],
			['Mean', '=B3/B2']
		]
	};

	$effect(() => {
		const element = host;
		if (!element || editor) return;
		let cancelled = false;

		void (async () => {
			try {
				const [{ Editor }, { StarterKit }, nodeView] = await Promise.all([
					import('@tiptap/core'),
					import('@tiptap/starter-kit'),
					import('$lib/notebook/grid/grid-nodeview.svelte')
				]);
				if (cancelled) return;

				const instance = new Editor({
					element,
					extensions: [
						StarterKit.configure(NOTE_SCHEMA_OPTIONS),
						NotebookGrid.extend({
							addNodeView: () => nodeView.notebookGridNodeView
						})
					],
					content: SEED,
					editorProps: {
						attributes: { class: 'note-input', 'data-testid': 'note-editor-input' }
					},
					// A COUNTER, PUSHED FROM THE EDITOR'S OWN TRANSACTIONS. The
					// readouts below depend on the document, which is not reactive
					// state -- a `$derived` beside an untracked read is the
					// indirection that looks correct and is not.
					onTransaction: () => {
						revision += 1;
					}
				});
				editor = instance;
			} catch (e) {
				failed = e instanceof Error ? e.message : String(e);
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	onDestroy(() => {
		editor?.destroy();
		editor = null;
	});

	/** The document's grid blocks, so the readout can prove there is exactly one. */
	const gridCount = $derived.by(() => {
		void revision;
		if (!editor) return 0;
		let n = 0;
		editor.state.doc.descendants((node) => {
			if (node.type.name === GRID_NODE_NAME) n += 1;
			return true;
		});
		return n;
	});

	const canUndo = $derived.by(() => {
		void revision;
		return editor ? editor.can().undo() : false;
	});
	const canRedo = $derived.by(() => {
		void revision;
		return editor ? editor.can().redo() : false;
	});
</script>

<svelte:head><title>dev: notebook spreadsheet grid</title></svelte:head>

<div class="harness nb-root">
	<div class="dev-bar">
		<h1>Notebook grid</h1>
		<p class="lead">
			The real ProseMirror node, the real NodeView and the real formula engine, inside a Tiptap
			editor configured the way a note's editor is. Click a cell to see its source; Enter or Tab
			commits, Escape abandons. Ctrl+Z walks back through cell edits and prose in the order they
			were made.
		</p>
		<div class="dev-controls">
			<button
				type="button"
				class="btn tap-44"
				onclick={() => editor?.commands.undo()}
				disabled={!canUndo}
				data-testid="sheet-undo">Undo</button
			>
			<button
				type="button"
				class="btn tap-44"
				onclick={() => editor?.commands.redo()}
				disabled={!canRedo}
				data-testid="sheet-redo">Redo</button
			>
			<button
				type="button"
				class="btn tap-44"
				onclick={() => editor?.chain().focus().insertNotebookGrid().run()}
				data-testid="sheet-insert">Insert grid</button
			>
			<span class="readout" data-testid="sheet-readout">
				grids: {gridCount} · transactions: {revision}
			</span>
		</div>
	</div>

	{#if failed}
		<p class="failed" data-testid="sheet-failed">The editor did not load: {failed}</p>
	{/if}

	<div class="editor-shell">
		<div bind:this={host} data-testid="sheet-editor"></div>
	</div>

	<section class="ro">
		<h2>Read-only, the same component with no write path</h2>
		<p class="lead">
			`GridView` mounted directly with no `oncommit`. Absence is the mechanism: there is no
			write to execute, so read-only is structural rather than a flag. It is outside the
			editor deliberately, because this is the arrangement an instructor reading a student's
			note gets, where there is no ProseMirror document at all.
		</p>
		<div class="editor-shell" data-testid="sheet-readonly">
			<GridView grid={READ_ONLY} label="Read-only grid" />
		</div>
	</section>
</div>

<style>
	.harness {
		padding: var(--space-4);
		max-width: 64rem;
		margin: 0 auto;
	}
	.dev-bar {
		margin-bottom: var(--space-4);
	}
	h1 {
		font-family: var(--font-display);
		margin: 0 0 var(--space-2);
	}
	h2 {
		font-family: var(--font-display);
		font-size: 1.05rem;
		margin: 0 0 var(--space-2);
	}
	.lead {
		color: var(--text-2);
		margin: 0 0 var(--space-3);
		max-width: 46rem;
	}
	.dev-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.readout {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.editor-shell {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 6px);
		background: var(--nb-surface, var(--surface-1));
		padding: var(--space-3);
	}
	.editor-shell :global(.note-input) {
		outline: none;
		min-height: 6rem;
	}
	.editor-shell :global(.nb-grid-host.is-selected) {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.failed {
		color: var(--nb-error, var(--crimson));
	}
	.ro {
		margin-top: var(--space-5);
	}
</style>
