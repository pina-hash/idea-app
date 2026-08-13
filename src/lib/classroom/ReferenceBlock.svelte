<script lang="ts">
	import AiLevelLookup from '$lib/classroom/AiLevelLookup.svelte';
	import GradeCalculator from '$lib/classroom/GradeCalculator.svelte';
	import LinkPreviewCard from '$lib/classroom/LinkPreviewCard.svelte';
	import MarkdownText from '$lib/classroom/MarkdownText.svelte';
	import type { LinkPreview } from '$lib/classroom/classroom';
	import type {
		AiLevelLookupConfig,
		GradeCalculatorConfig,
		ReferenceBlock
	} from '$lib/classroom/reference-spec';

	/**
	 * One reference block. Every type here is DISPLAY-ONLY: none of them accepts
	 * student input or produces any state that leaves the browser. The two calc
	 * tools do take typed input, but it lives and dies in local component state
	 * -- there is no transport on this component at all, which is the structural
	 * version of that promise.
	 *
	 * Each type carries its own print rendering in the stylesheet at the bottom;
	 * the route's @media print block expands the tabs, and these make sure what
	 * lands on paper is legible rather than a dark card.
	 */
	let {
		block,
		fetchPreview = null
	}: {
		block: ReferenceBlock;
		fetchPreview?: ((url: string) => Promise<LinkPreview | null>) | null;
	} = $props();
</script>

{#if block.type === 'instructions'}
	<div class="rb prose"><MarkdownText body={block.content} /></div>
{:else if block.type === 'keyValue'}
	<div class="rb">
		{#if block.title}<h3 class="rb-title">{block.title}</h3>{/if}
		<dl class="rb-kv">
			{#each block.items as item, i (i)}
				<dt>{item.label}</dt>
				<dd>{item.value}</dd>
			{/each}
		</dl>
	</div>
{:else if block.type === 'dataTable'}
	<div class="rb">
		{#if block.title}<h3 class="rb-title">{block.title}</h3>{/if}
		<!-- The horizontal scroll lives on THIS wrapper, never the page: a wide
		     table must not push a phone's layout viewport past its own width. -->
		<div class="rb-dt-scroll">
			<table class="rb-dt">
				<thead>
					<tr>
						{#each block.columns as col (col.key)}
							<th scope="col">{col.label}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each block.rows as row, ri (ri)}
						<tr>
							{#each block.columns as col (col.key)}
								<td data-label={col.label}>{row[col.key] ?? ''}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if block.caption}<p class="rb-dt-caption">{block.caption}</p>{/if}
	</div>
{:else if block.type === 'callout'}
	<aside class="rb rb-callout v-{block.variant}">
		<span class="rb-callout-tag">
			{block.variant === 'required' ? 'Required' : block.variant === 'warn' ? 'Careful' : 'Note'}
		</span>
		{#if block.title}<h3 class="rb-callout-title">{block.title}</h3>{/if}
		<MarkdownText body={block.content} />
	</aside>
{:else if block.type === 'cardGrid'}
	<div class="rb">
		{#if block.title}<h3 class="rb-title">{block.title}</h3>{/if}
		<div class="rb-cards" style={`--card-count:${block.cards.length}`}>
			{#each block.cards as card, ci (ci)}
				{#if card.url}
					<a class="rb-card" href={card.url} target="_blank" rel="noopener noreferrer">
						<span class="rb-card-title">{card.title}</span>
						{#if card.body}<span class="rb-card-body">{card.body}</span>{/if}
					</a>
				{:else}
					<div class="rb-card">
						<span class="rb-card-title">{card.title}</span>
						{#if card.body}<span class="rb-card-body">{card.body}</span>{/if}
					</div>
				{/if}
			{/each}
		</div>
	</div>
{:else if block.type === 'linkCard'}
	<div class="rb">
		{#if block.title}<h3 class="rb-title">{block.title}</h3>{/if}
		<div class="rb-links">
			{#each block.links as link, li (li)}
				<LinkPreviewCard
					link={{ label: link.label ?? '', url: link.url }}
					{fetchPreview}
					fallbackLabel={link.fallbackLabel}
					note={link.note ?? null}
				/>
			{/each}
		</div>
	</div>
{:else if block.type === 'calc'}
	<div class="rb rb-tool">
		{#if block.title}<h3 class="rb-title">{block.title}</h3>{/if}
		{#if block.tool === 'gradeCalculator'}
			<GradeCalculator config={block.config as GradeCalculatorConfig} />
		{:else}
			<AiLevelLookup config={block.config as AiLevelLookupConfig} />
		{/if}
	</div>
{/if}

<style>
	.rb {
		margin: 0 0 1rem;
	}
	.rb:last-child {
		margin-bottom: 0;
	}
	.rb-title {
		margin: 0 0 0.45rem;
		font-size: 0.95rem;
		font-family: 'Share Tech Mono', monospace;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--cyan);
	}

	/* keyValue: aligned rows, deliberately not a table's chrome. */
	.rb-kv {
		margin: 0;
		display: grid;
		grid-template-columns: minmax(7rem, max-content) 1fr;
		gap: 0.3rem 1rem;
	}
	.rb-kv dt {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--dim);
		padding-top: 0.12rem;
	}
	.rb-kv dd {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}

	/* dataTable: static, never gains a row, never accepts input. */
	.rb-dt-scroll {
		overflow-x: auto;
		max-width: 100%;
	}
	.rb-dt {
		width: 100%;
		border-collapse: collapse;
		min-width: 22rem;
	}
	.rb-dt th {
		text-align: left;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--cyan);
		border-bottom: 1px solid var(--line);
		padding: 0.32rem 0.45rem;
		font-weight: 400;
		white-space: nowrap;
	}
	.rb-dt td {
		border-bottom: 1px solid var(--line);
		padding: 0.32rem 0.45rem;
		font-size: 0.88rem;
		line-height: 1.45;
		vertical-align: top;
	}
	.rb-dt-caption {
		margin: 0.35rem 0 0;
		font-size: 0.76rem;
		color: var(--dim);
	}

	/* callout: `required` must be unmistakable. */
	.rb-callout {
		border: 1px solid var(--line);
		border-left-width: 3px;
		border-radius: 6px;
		padding: 0.7rem 0.85rem;
		background: var(--bg2);
	}
	.rb-callout.v-info {
		border-left-color: var(--cyan);
	}
	.rb-callout.v-warn {
		border-left-color: var(--amber);
	}
	.rb-callout.v-required {
		border-color: var(--gold);
		border-left-width: 4px;
		background: color-mix(in srgb, var(--gold) 9%, var(--bg2));
	}
	.rb-callout-tag {
		display: block;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cyan);
		margin-bottom: 0.25rem;
	}
	.rb-callout.v-warn .rb-callout-tag {
		color: var(--amber);
	}
	.rb-callout.v-required .rb-callout-tag {
		color: var(--gold);
	}
	.rb-callout-title {
		margin: 0 0 0.35rem;
		font-size: 1rem;
	}

	/* cardGrid: one column on a phone. */
	.rb-cards {
		display: grid;
		grid-template-columns: repeat(var(--card-count, 3), minmax(0, 1fr));
		gap: 0.6rem;
	}
	.rb-card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg2);
		padding: 0.65rem 0.75rem;
		text-decoration: none;
		color: var(--white);
		min-width: 0;
	}
	a.rb-card:hover {
		border-color: var(--line-strong);
	}
	a.rb-card:hover .rb-card-title {
		color: var(--gold);
	}
	.rb-card-title {
		font-size: 0.95rem;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.rb-card-body {
		font-size: 0.82rem;
		color: var(--dim);
		line-height: 1.45;
	}

	.rb-links {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.rb-tool {
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.75rem 0.85rem;
	}

	@media (max-width: 600px) {
		.rb-cards {
			grid-template-columns: 1fr;
		}
		.rb-kv {
			grid-template-columns: 1fr;
			gap: 0.05rem;
		}
		.rb-kv dd {
			margin-bottom: 0.45rem;
		}
	}

	@media print {
		.rb-dt-scroll {
			overflow: visible;
		}
		.rb-dt {
			min-width: 0;
		}
		/* Backgrounds drop out on paper. `.rb-callout.v-required` is listed
		   EXPLICITLY: it carries its own fill at a higher specificity than
		   `.callout`, so the bare selector would leave exactly the one block a
		   printed page most needs to read cleanly still painted. Its heavier
		   border is what keeps it unmistakable in ink. */
		.rb-callout,
		.rb-callout.v-required,
		.rb-card,
		.rb-tool {
			background: none;
			border-color: #999;
		}
		.rb-callout.v-required {
			border-color: #000;
			border-left-width: 4px;
		}
		.rb-cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
