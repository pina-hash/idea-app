<script lang="ts">
	import { safeHref, type NoteDoc, type NoteInline } from '$lib/notebook-notes';

	/**
	 * The one way a written note is rendered anywhere in this app -- the
	 * student's own feed and the instructor review panel both mount this, so
	 * what an instructor reads is what the student wrote.
	 *
	 * IT WALKS THE DOCUMENT INTO REAL ELEMENTS. There is deliberately no
	 * `{@html}` here or anywhere else in the note path: a note is written by a
	 * student and read by an instructor, and rendering it as markup would make
	 * the server-side normalizer the only thing between the two. Svelte escapes
	 * every `{run.text}` below by construction, and `safeHref` runs AGAIN here
	 * -- the normalizer already checked it, but a doc that reached the database
	 * some other way must still be safe to display.
	 *
	 * A link whose target does not survive that second check renders as plain
	 * text rather than vanishing: the student's words are theirs either way.
	 */
	let { doc }: { doc: NoteDoc } = $props();

	function href(run: NoteInline): string | null {
		return safeHref(run.href);
	}
</script>

{#snippet runs(list: NoteInline[])}
	{#each list as run, i (i)}
		{@const url = href(run)}
		{#if url}
			<a class="note-link" href={url} target="_blank" rel="noopener noreferrer">
				{#if run.bold && run.italic}<strong><em>{run.text}</em></strong>
				{:else if run.bold}<strong>{run.text}</strong>
				{:else if run.italic}<em>{run.text}</em>
				{:else}{run.text}{/if}
			</a>
		{:else if run.bold && run.italic}
			<strong><em>{run.text}</em></strong>
		{:else if run.bold}
			<strong>{run.text}</strong>
		{:else if run.italic}
			<em>{run.text}</em>
		{:else}{run.text}{/if}
	{/each}
{/snippet}

<div class="note-body">
	{#each doc as block, i (i)}
		{#if block.type === 'p'}
			<p>{@render runs(block.runs)}</p>
		{:else if block.type === 'ul'}
			<ul>
				{#each block.items as item, j (j)}
					<li>{@render runs(item)}</li>
				{/each}
			</ul>
		{:else}
			<ol>
				{#each block.items as item, j (j)}
					<li>{@render runs(item)}</li>
				{/each}
			</ol>
		{/if}
	{/each}
</div>

<style>
	.note-body {
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--text-1);
	}
	.note-body p {
		margin: 0 0 var(--space-3);
	}
	.note-body p:last-child,
	.note-body ul:last-child,
	.note-body ol:last-child {
		margin-bottom: 0;
	}
	.note-body ul,
	.note-body ol {
		margin: 0 0 var(--space-3);
		padding-left: var(--space-5);
	}
	.note-body li {
		margin: var(--space-1) 0;
	}
	.note-link {
		color: var(--nb-accent-ink);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
</style>
