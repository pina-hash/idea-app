<script lang="ts">
	import {
		NOTE_LIST_MAX_DEPTH,
		safeHref,
		type NoteDoc,
		type NoteInline,
		type NoteItem,
		type NoteList
	} from '$lib/notebook-notes';
	import { itemParts } from '$lib/rich-text-doc';

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
	 *
	 * IT RECURSES, AND IT CARRIES THE CAP DOWN (0122). A list item may hold a
	 * sublist, so `list` and `listItem` below call each other; the depth is
	 * passed rather than read from the document, and a level past
	 * NOTE_LIST_MAX_DEPTH is not rendered. The gate refuses a deeper note, but
	 * a renderer that trusts the gate is a renderer that hangs the day
	 * something reaches the table another way.
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

{#snippet listItem(item: NoteItem, depth: number)}
	{@const parts = itemParts(item)}
	{@render runs(parts.runs)}
	{#each parts.lists as sub, k (k)}
		{#if depth < NOTE_LIST_MAX_DEPTH}{@render list(sub, depth + 1)}{/if}
	{/each}
{/snippet}

{#snippet list(block: NoteList, depth: number)}
	{#if block.type === 'ul'}
		<ul>
			{#each block.items as item, j (j)}
				<li>{@render listItem(item, depth)}</li>
			{/each}
		</ul>
	{:else}
		<ol>
			{#each block.items as item, j (j)}
				<li>{@render listItem(item, depth)}</li>
			{/each}
		</ol>
	{/if}
{/snippet}

<div class="note-body">
	{#each doc as block, i (i)}
		{#if block.type === 'p'}
			<p>{@render runs(block.runs)}</p>
		{:else}
			{@render list(block, 1)}
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
	/* A sublist sits INSIDE its item, so it takes the item's own leading rather
	   than a block's trailing gap -- the bottom margin above would open a hole
	   between the sublist and the next bullet of the list it is inside. */
	.note-body li > ul,
	.note-body li > ol {
		margin: var(--space-1) 0 0;
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
