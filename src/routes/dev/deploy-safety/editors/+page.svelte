<script lang="ts">
	import '$lib/classroom/classroom.css';
	import '$lib/notebook/notebook-theme.css';
	import RichTextEditor from '$lib/classroom/RichTextEditor.svelte';
	import NoteEditor from '$lib/notebook/NoteEditor.svelte';
	import type { ItemDoc, TiptapNode } from '$lib/classroom/classroom-doc';
	import type { NoteDoc } from '$lib/notebook-notes';

	/**
	 * THE TWO RICH-TEXT EDITORS, each in its own room, for the day their code
	 * cannot be downloaded.
	 *
	 * Both editors arrive as a separate chunk. After a deploy renames the site's
	 * files, an open tab can ask for one that no longer exists, and the editor
	 * used to be left as a box nothing could be typed into. Now a failed load
	 * puts a working plain textarea in its place, whose text reaches the caller
	 * through the same `onchange`. A normal load is what this page shows; the
	 * failed load is produced from OUTSIDE the page, by refusing the editor's
	 * download (the proof script aborts every `@tiptap` request), because
	 * nothing inside the page can make a real `import()` fail.
	 *
	 * Each mount is seeded with a two-paragraph document so the fallback's seed
	 * (the body's own text) is visible, and each prints what `onready` and the
	 * last `onchange` handed back -- the only things a caller ever sees.
	 */
	const BODY: ItemDoc = [
		{ type: 'p', runs: [{ text: 'Measure the span before you cut.' }] },
		{ type: 'p', runs: [{ text: 'Photograph the joint from two sides.' }] }
	];
	const NOTE: NoteDoc = [
		{ type: 'p', runs: [{ text: 'The glue line failed first.' }] },
		{ type: 'p', runs: [{ text: 'Next time clamp it overnight.' }] }
	];

	let bodyReady = $state<TiptapNode | null>(null);
	let bodyLast = $state<TiptapNode | null>(null);
	let noteReady = $state<TiptapNode | null>(null);
	let noteLast = $state<TiptapNode | null>(null);

	/** The text of an editor document, block per line: what a reader would see. */
	function textOf(node: TiptapNode | null): string {
		if (!node) return '(nothing yet)';
		const lines: string[] = [];
		const walk = (n: TiptapNode) => {
			const kids = n.content ?? [];
			if (kids.some((k) => typeof k.text === 'string')) {
				lines.push(kids.map((k) => k.text ?? '').join(''));
				return;
			}
			kids.forEach(walk);
		};
		walk(node);
		return lines.join(' / ') || '(empty)';
	}
</script>

<svelte:head><title>Deploy safety: editors</title></svelte:head>

<main class="harness">
	<h1>The editors, when their download fails</h1>
	<nav class="ds-links" aria-label="In-app links">
		<a class="btn secondary tap-44" href="/dev/deploy-safety" data-testid="link-back">
			Back to the assignment
		</a>
	</nav>

	<section class="ds-room cr-root" data-testid="classroom-editor">
		<h2>A post body (classroom)</h2>
		<RichTextEditor
			value={BODY}
			label="Instructions"
			onready={(doc) => (bodyReady = doc)}
			onchange={(doc) => (bodyLast = doc)}
		/>
		<p class="ds-readout" data-testid="classroom-ready">ready: {textOf(bodyReady)}</p>
		<p class="ds-readout" data-testid="classroom-last">last change: {textOf(bodyLast)}</p>
	</section>

	<section class="ds-room nb-root" data-testid="notebook-editor">
		<h2>A note (notebook)</h2>
		<NoteEditor
			value={NOTE}
			label="Note"
			onready={(doc) => (noteReady = doc)}
			onchange={(doc) => (noteLast = doc)}
		/>
		<p class="ds-readout" data-testid="notebook-ready">ready: {textOf(noteReady)}</p>
		<p class="ds-readout" data-testid="notebook-last">last change: {textOf(noteLast)}</p>
	</section>
</main>

<style>
	.harness {
		max-width: 60rem;
		margin: 0 auto;
		padding: var(--space-4) var(--space-3) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	h1 {
		margin: 0;
		font-size: 1.3rem;
	}
	h2 {
		margin: 0 0 var(--space-2);
		font-size: 1rem;
	}
	.ds-links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.ds-room {
		padding: var(--space-3);
		border-radius: var(--radius-2);
		/* Both rooms are full-viewport pages in the app (`min-height: 100vh`);
		   here they are two sections of one page. */
		min-height: 0;
	}
	.ds-readout {
		margin: var(--space-2) 0 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
</style>
