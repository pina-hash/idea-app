<script lang="ts">
	import NoteEditor from '$lib/notebook/NoteEditor.svelte';
	import NoteContent from '$lib/notebook/NoteContent.svelte';
	import {
		docIsEmpty,
		docSummary,
		docText,
		type NoteDoc,
		type TiptapNode
	} from '$lib/notebook-notes';
	import { GRID_NODE_NAME } from '$lib/notebook/grid/grid-doc';

	/**
	 * THE INSERTION PATH, END TO END, IN THE REAL EDITOR. See `+page.ts` for why
	 * this stands beside `/dev/notebook-sheet` rather than replacing it.
	 *
	 * THE THREE MOUNTS ARE THREE DIFFERENT QUESTIONS and they are deliberately
	 * not one screen with three states:
	 *
	 *   1. AN EMPTY NOTE. Press Grid and a grid appears where the caret was.
	 *      This is the path that did not exist before ledger 0199 and it is the
	 *      one a student takes first. Its grid, once inserted, is empty -- which
	 *      is the notice case.
	 *   2. A NOTE WITH A GRID THAT HAS PROBLEMS IN IT. A circular reference, a
	 *      division by zero, a malformed formula and a `VLOOKUP` nobody built --
	 *      the four refusals ledger 0187 shipped, on screen at once, each with
	 *      the engine's own sentence under the grid. A clean fixture never
	 *      reaches this state and it is the one a fifteen-year-old is most
	 *      likely to be looking at.
	 *   3. THE STORED SHAPE, RENDERED READ-ONLY. `NoteContent.svelte`, which is
	 *      what an instructor reads, mounting the same `GridView` with no write
	 *      path.
	 *
	 * NOTHING HERE REIMPLEMENTS A REFUSAL. The malformed formula's position, the
	 * cycle's path and the `#NAME?` for a function that does not exist are all
	 * the engine's, produced by the same code the note will run in production.
	 */

	/** What the editor last handed back, per mount. */
	let empty = $state<TiptapNode | null>(null);
	let problems = $state<TiptapNode | null>(null);

	const SEED_PROBLEMS: TiptapNode = {
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [{ type: 'text', text: 'Four refusals, on one grid.' }]
			},
			{
				type: GRID_NODE_NAME,
				attrs: {
					rows: [
						['Check', 'Value'],
						['Runs', '0'],
						['Mean', '=12/B2'],
						['Loop', '=B5'],
						['Loop back', '=B4'],
						['Typo', '=SUM(A1:'],
						['Lookup', '=VLOOKUP(A2,A1:B6,2)']
					]
				}
			}
		]
	};

	/**
	 * THE STORED SHAPE, WRITTEN OUT RATHER THAN NORMALIZED HERE. The normalizer
	 * is `$lib/server`, which SvelteKit refuses to bundle into a page -- that
	 * refusal is what makes it a real boundary -- so a harness cannot call it.
	 * This is the shape it produces, and `tests/dom/notebook-grid-insert.test.ts`
	 * is where the editor's own document is put THROUGH the normalizer and
	 * compared against this, so the fixture cannot quietly drift from what the
	 * server would store.
	 */
	const STORED: NoteDoc = [
		{ type: 'p', runs: [{ text: 'Bracket stock, cut list and cost.' }] },
		{
			type: 'grid',
			rows: [
				['Part', 'Qty', 'Each', 'Cost'],
				['Angle 1x1', '4', '3.25', '=B2*C2'],
				['Plate 6x6', '2', '11.40', '=B3*C3'],
				['Rivet', '24', '0.08', '=B4*C4'],
				['', '', 'Total', '=SUM(D2:D4)']
			]
		},
		{ type: 'p', runs: [{ text: 'This is what an instructor reads.' }] }
	];

	/** The document's block types, so a reader can see there is exactly one grid. */
	function blockNames(doc: TiptapNode | null): string {
		const content = doc?.content;
		if (!Array.isArray(content) || content.length === 0) return '(nothing)';
		return content.map((node) => node.type).join(', ');
	}
</script>

<svelte:head><title>dev: notebook grid insertion</title></svelte:head>

<div class="harness nb-root">
	<header class="dev-bar">
		<h1>Inserting a grid</h1>
		<p class="lead">
			The real <code>NoteEditor</code>, with the real toolbar. Press <strong>Grid</strong> to add
			one where the caret is; the control refuses while the selection is already inside a grid and
			says so rather than doing nothing. Ctrl+Z walks back through cell edits and prose in the
			order they were made.
		</p>
	</header>

	<section data-testid="mount-empty">
		<h2>1. An empty note</h2>
		<p class="lead">
			The path a student takes first. The inserted grid has nothing in it, so it says what that
			means for saving rather than waiting for the save to refuse.
		</p>
		<NoteEditor onchange={(doc) => (empty = doc)} label="Empty note" placeholder="Write your note..." />
		<p class="readout" data-testid="insert-readout">
			blocks: {blockNames(empty)}
		</p>
	</section>

	<section data-testid="mount-problems">
		<h2>2. The four refusals</h2>
		<p class="lead">
			A cycle, a division by zero, a formula that does not parse, and a function this engine does
			not have. Each cell shows its code; each sentence under the grid is the engine's own.
		</p>
		<NoteEditor
			initialDoc={SEED_PROBLEMS}
			onchange={(doc) => (problems = doc)}
			label="Note with refusals"
		/>
		<p class="readout" data-testid="problems-readout">
			blocks: {blockNames(problems)}
		</p>
	</section>

	<section data-testid="mount-stored">
		<h2>3. The stored shape, read-only</h2>
		<p class="lead">
			<code>NoteContent</code>, which is what the feed and the review console mount. The same
			<code>GridView</code> with no write path: absence is the mechanism.
		</p>
		<div class="reader" data-testid="stored-reader">
			<NoteContent doc={STORED} />
		</div>
		<p class="readout" data-testid="stored-readout">
			empty: {docIsEmpty(STORED)} · chars: {docText(STORED).length} · summary: {docSummary(STORED)}
		</p>
	</section>
</div>

<style>
	.harness {
		padding: var(--space-4);
		max-width: 64rem;
		margin: 0 auto;
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
	section {
		margin-bottom: var(--space-5);
	}
	.reader {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 6px);
		background: var(--nb-surface, var(--surface-1));
		padding: var(--space-3);
	}
	.readout {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
		margin: var(--space-2) 0 0;
		/* A readout is metadata about a document somebody may have pasted into;
		   it must not be able to push the page wider than the viewport. */
		overflow-wrap: anywhere;
	}
</style>
