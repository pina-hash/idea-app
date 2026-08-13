<script lang="ts">
	import { parseMarkdown, type MarkdownNode } from '$lib/classroom/reference-spec';

	/**
	 * Authored prose rendered as real elements.
	 *
	 * DELIBERATELY NOT {@html}, AND THERE IS NO SANITIZER HERE TO GET WRONG.
	 * parseMarkdown walks the text into typed nodes and this walks those into
	 * Svelte elements, which escape their own text by construction -- the
	 * notebook note-content doctrine applied to classroom reference documents.
	 * Anything the parser does not recognise stays literal text.
	 */
	let { body }: { body: string } = $props();

	const nodes = $derived<MarkdownNode[]>(parseMarkdown(body));
</script>

<div class="md">
	{#each nodes as node, ni (ni)}
		{#if node.type === 'paragraph'}
			<p>
				{#each node.runs as run, ri (ri)}
					{#if run.href}
						<a href={run.href} target="_blank" rel="noopener noreferrer">{run.text}</a>
					{:else if run.bold}
						<strong>{run.text}</strong>
					{:else if run.italic}
						<em>{run.text}</em>
					{:else}{run.text}{/if}
				{/each}
			</p>
		{:else if node.ordered}
			<ol>
				{#each node.items as item, ii (ii)}
					<li>
						{#each item as run, ri (ri)}
							{#if run.href}
								<a href={run.href} target="_blank" rel="noopener noreferrer">{run.text}</a>
							{:else if run.bold}
								<strong>{run.text}</strong>
							{:else if run.italic}
								<em>{run.text}</em>
							{:else}{run.text}{/if}
						{/each}
					</li>
				{/each}
			</ol>
		{:else}
			<ul>
				{#each node.items as item, ii (ii)}
					<li>
						{#each item as run, ri (ri)}
							{#if run.href}
								<a href={run.href} target="_blank" rel="noopener noreferrer">{run.text}</a>
							{:else if run.bold}
								<strong>{run.text}</strong>
							{:else if run.italic}
								<em>{run.text}</em>
							{:else}{run.text}{/if}
						{/each}
					</li>
				{/each}
			</ul>
		{/if}
	{/each}
</div>

<style>
	.md {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.md :global(p),
	.md :global(ul),
	.md :global(ol) {
		margin: 0;
	}
	.md :global(p) {
		line-height: 1.6;
		font-size: 0.95rem;
	}
	.md :global(ul),
	.md :global(ol) {
		padding-left: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.md :global(li) {
		line-height: 1.55;
		font-size: 0.93rem;
	}
	.md :global(strong) {
		color: var(--white);
	}
</style>
