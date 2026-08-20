<script lang="ts">
	import { itemBodyDoc, safeHref, type ItemDoc, type ItemInline } from '$lib/classroom/classroom-doc';

	/**
	 * The ONE way a classroom item's body is rendered anywhere in this app.
	 *
	 * The class stream, the item page, the student view and the composer's own
	 * preview all mount this, so what a student reads is what the teacher wrote
	 * -- identically, on every surface. A second renderer per surface is exactly
	 * how two of them end up disagreeing about what a bulleted list looks like.
	 *
	 * IT WALKS THE DOCUMENT INTO REAL ELEMENTS. There is deliberately no
	 * `{@html}` here or anywhere else in the item-body path: a body is written by
	 * a teacher and rendered into every student's browser in the class, and
	 * rendering it as markup would make the server-side normalizer the only thing
	 * between the two. Svelte escapes every `{run.text}` below by construction,
	 * and `safeHref` runs AGAIN here -- the normalizer already checked it and
	 * 0108's SQL gate refuses it a second time, but a document that reached the
	 * database by some other door must still be safe to display.
	 *
	 * A link whose target does not survive that third check renders as plain text
	 * rather than vanishing: the teacher's words are theirs either way.
	 *
	 * TAKES THE ITEM, NOT THE DOC, on purpose. `itemBodyDoc` is what falls back
	 * to the plain-text body when `body_doc` is absent -- an item authored before
	 * 0108, or any read on a deployment where that migration has not been applied
	 * yet -- so every caller gets that fallback for free instead of each one
	 * remembering to ask for it.
	 */
	let {
		item,
		compact = false
	}: {
		item: { body: string; body_doc?: ItemDoc | null };
		/** The stream's denser type scale; the item page uses the roomy one. */
		compact?: boolean;
	} = $props();

	const doc = $derived(itemBodyDoc(item));

	function href(run: ItemInline): string | null {
		return safeHref(run.href);
	}
</script>

{#snippet runs(list: ItemInline[])}
	{#each list as run, i (i)}
		{@const url = href(run)}
		{#if url}
			<a class="item-link" href={url} target="_blank" rel="noopener noreferrer">
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

<div class="item-body" class:compact>
	{#each doc as block, i (i)}
		{#if block.type === 'p'}
			<p>{@render runs(block.runs)}</p>
		{:else if block.type === 'h3'}
			<h3>{@render runs(block.runs)}</h3>
		{:else if block.type === 'h4'}
			<h4>{@render runs(block.runs)}</h4>
		{:else if block.type === 'ul'}
			<ul>
				{#each block.items as entry, j (j)}
					<li>{@render runs(entry)}</li>
				{/each}
			</ul>
		{:else}
			<ol>
				{#each block.items as entry, j (j)}
					<li>{@render runs(entry)}</li>
				{/each}
			</ol>
		{/if}
	{/each}
</div>

<style>
	.item-body {
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--text-1);
		/* A pasted URL with no spaces must not widen the column it sits in. */
		overflow-wrap: anywhere;
	}
	.item-body.compact {
		font-size: 0.95rem;
		line-height: 1.55;
	}
	.item-body p,
	.item-body ul,
	.item-body ol {
		margin: 0 0 0.7rem;
	}
	.item-body ul,
	.item-body ol {
		padding-left: 1.4rem;
	}
	.item-body li {
		margin: 0.15rem 0;
	}
	/* h1 is the item's title and h2 its section label, so a body starts at h3
	   and is styled to read as subordinate to both -- the same rule, for the
	   same reason, the reference-document renderer applies. */
	.item-body h3,
	.item-body h4 {
		font-family: var(--font-mono);
		letter-spacing: 0.04em;
		color: var(--text-1);
		margin: 1.1rem 0 0.4rem;
	}
	.item-body h4 {
		color: var(--text-2);
		margin-top: 0.9rem;
	}
	.item-body h3 {
		font-size: 0.82rem;
		text-transform: uppercase;
	}
	.item-body h4 {
		font-size: 0.74rem;
	}
	.item-body > :global(:first-child) {
		margin-top: 0;
	}
	.item-body > :last-child {
		margin-bottom: 0;
	}
	.item-link {
		color: var(--cyan);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
</style>
