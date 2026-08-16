<script lang="ts">
	import {
		parseMarkdown,
		type InlineRun,
		type MarkdownList,
		type MarkdownNode
	} from '$lib/classroom/reference-spec';

	/**
	 * Authored prose rendered as real elements.
	 *
	 * DELIBERATELY NOT {@html}, AND THERE IS NO SANITIZER HERE TO GET WRONG.
	 * parseMarkdown walks the text into typed nodes and this walks those into
	 * Svelte elements, which escape their own text by construction -- the
	 * notebook note-content doctrine applied to classroom reference documents.
	 * Anything the parser does not recognise stays literal text, so raw HTML, a
	 * javascript: url and an onerror attribute are inert without anything having
	 * to strip them. The only href that reaches the DOM is one safeHref accepted
	 * (http, https, mailto), and every link carries rel="noopener noreferrer".
	 *
	 * AUTHORED HEADINGS ARE h3/h4 AND CARRY NO id. h1 is the document title and
	 * h2 the section title; section slugs are the only anchor contract, so a
	 * heading inside a block is never a link target.
	 */
	let { body }: { body: string } = $props();

	const nodes = $derived<MarkdownNode[]>(parseMarkdown(body));
</script>

{#snippet inline(runs: InlineRun[])}
	{#each runs as run, ri (ri)}
		{#if run.href}
			<a href={run.href} target="_blank" rel="noopener noreferrer">{run.text}</a>
		{:else if run.code}
			<code>{run.text}</code>
		{:else if run.bold}
			<strong>{run.text}</strong>
		{:else if run.italic}
			<em>{run.text}</em>
		{:else}{run.text}{/if}
	{/each}
{/snippet}

{#snippet listBlock(list: MarkdownList)}
	{#if list.ordered}
		<ol>
			{#each list.items as item, ii (ii)}
				<li>
					{@render inline(item.runs)}
					{#if item.child}{@render listBlock(item.child)}{/if}
				</li>
			{/each}
		</ol>
	{:else}
		<ul>
			{#each list.items as item, ii (ii)}
				<li>
					{@render inline(item.runs)}
					{#if item.child}{@render listBlock(item.child)}{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<div class="md">
	{#each nodes as node, ni (ni)}
		{#if node.type === 'heading'}
			{#if node.level === 3}
				<h3 class="md-h3">{@render inline(node.runs)}</h3>
			{:else}
				<h4 class="md-h4">{@render inline(node.runs)}</h4>
			{/if}
		{:else if node.type === 'paragraph'}
			<p>{@render inline(node.runs)}</p>
		{:else if node.type === 'list'}
			{@render listBlock(node)}
		{:else if node.type === 'quote'}
			<blockquote>
				{#each node.paragraphs as para, pi (pi)}
					<p>{@render inline(para)}</p>
				{/each}
			</blockquote>
		{:else}
			<pre><code>{node.text}</code></pre>
		{/if}
	{/each}
</div>

<style>
	/* SPACING TIERS. Most room above an authored heading, less between
	   paragraphs, least between list items -- so the structure of a long
	   section is legible before a word of it is read. The gap is the base tier
	   and headings add to it with margin-top. */
	.md {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.md :global(p),
	.md :global(ul),
	.md :global(ol),
	.md :global(pre),
	.md :global(blockquote) {
		margin: 0;
	}
	.md :global(p) {
		line-height: 1.6;
		font-size: 0.95rem;
	}

	/* Subordinate to the section's own h2 by construction: smaller, mono,
	   tracked and coloured as a label rather than as a title. */
	.md :global(.md-h3),
	.md :global(.md-h4) {
		margin: var(--space-5) 0 0;
		font-family: var(--font-mono);
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		line-height: 1.3;
	}
	.md :global(.md-h3) {
		font-size: 0.78rem;
		color: var(--text-1);
	}
	.md :global(.md-h4) {
		margin-top: var(--space-3);
		font-size: 0.7rem;
		color: var(--cyan);
	}
	/* No leading gap when a heading opens the block. */
	.md :global(.md-h3:first-child),
	.md :global(.md-h4:first-child) {
		margin-top: 0;
	}

	.md :global(ul),
	.md :global(ol) {
		padding-left: 1.35rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.md :global(li) {
		line-height: 1.55;
		font-size: 0.93rem;
	}
	.md :global(li)::marker {
		color: var(--text-2);
	}
	/* One level of nesting: inset, and visibly a sub-list. */
	.md :global(li > ul),
	.md :global(li > ol) {
		margin-top: var(--space-1);
		padding-left: 1.1rem;
	}
	.md :global(li li::marker) {
		color: var(--gear);
	}

	.md :global(strong) {
		color: var(--text-1);
		font-weight: 700;
	}
	.md :global(em) {
		color: var(--text-1);
	}
	.md :global(code) {
		font-family: var(--font-mono);
		font-size: 0.86em;
		color: var(--gold);
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-chip);
		padding: 0.05em 0.3em;
		overflow-wrap: anywhere;
	}

	.md :global(blockquote) {
		border-left: 3px solid var(--line-strong);
		padding: 0.1rem 0 0.1rem 0.8rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		color: var(--text-2);
		font-style: italic;
	}

	.md :global(pre) {
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: var(--space-3);
		overflow-x: auto;
		max-width: 100%;
	}
	.md :global(pre code) {
		background: none;
		border: none;
		padding: 0;
		color: var(--text-1);
		font-size: 0.8rem;
		line-height: 1.5;
		white-space: pre;
	}

	@media print {
		.md :global(.md-h3),
		.md :global(.md-h4) {
			color: #000;
		}
		.md :global(code),
		.md :global(pre) {
			background: none;
			border-color: #999;
			color: #000;
		}
		.md :global(blockquote) {
			border-left-color: #999;
			color: #000;
		}
	}
</style>
