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
	 * PROSE IS CAPPED AT A MEASURE, DATA IS NOT. `--rb-measure` (declared once on
	 * .ref-doc) holds body copy to roughly 70-80 characters; a table, a card grid
	 * and a calculator are objects to scan, not lines to read, so they take the
	 * full column. That contrast is most of what stops a long document reading as
	 * one slab.
	 *
	 * EVERY CLASS HERE IS `rb-` PREFIXED, INCLUDING THE VARIANTS. `.callout` and
	 * `.warn` already exist as global classes in src/app.css with a completely
	 * different layout (a flex row), and a scoped background override does not
	 * undo an inherited `display: flex` -- which is how a callout once rendered
	 * with its tag, title and body side by side. Check src/app.css's global class
	 * list before naming a new one.
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
	<div class="rb rb-prose"><MarkdownText body={block.content} /></div>
{:else if block.type === 'keyValue'}
	<div class="rb rb-panel rb-kv-panel">
		{#if block.title}<h3 class="rb-title">{block.title}</h3>{/if}
		<dl class="rb-kv">
			{#each block.items as item, i (i)}
				<dt>{item.label}</dt>
				<dd>{item.value}</dd>
			{/each}
		</dl>
	</div>
{:else if block.type === 'dataTable'}
	<div class="rb rb-panel rb-dt-panel">
		{#if block.title}<h3 class="rb-title">{block.title}</h3>{/if}
		<!-- The horizontal scroll lives on THIS wrapper, never the page: a wide
		     table must not push a phone's layout viewport past its own width.
		     Below 620px it does not scroll at all -- the table restacks, each
		     cell labelled from its own data-label. -->
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
		<div class="rb-callout-body">
			{#if block.title}<h3 class="rb-callout-title">{block.title}</h3>{/if}
			<MarkdownText body={block.content} />
		</div>
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
	<div class="rb rb-panel rb-tool">
		{#if block.title}<h3 class="rb-title">{block.title}</h3>{/if}
		{#if block.tool === 'gradeCalculator'}
			<GradeCalculator config={block.config as GradeCalculatorConfig} />
		{:else}
			<AiLevelLookup config={block.config as AiLevelLookupConfig} />
		{/if}
	</div>
{/if}

<style>
	/* Block-to-block spacing is the section's flex `gap` (ReferenceDoc), not a
	   margin here, so a block never has to know what follows it. */
	.rb {
		margin: 0;
		min-width: 0;
	}
	/* SPACING TIER 2: inside a block, between its label and its content. */
	.rb-title {
		margin: 0 0 var(--space-2);
		font-size: 0.72rem;
		font-family: var(--font-mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan);
		font-weight: 400;
	}

	/* A PANEL is what makes keyValue / dataTable / calc read as objects rather
	   than as more prose: a raised surface with a hairline, not a rule. */
	.rb-panel {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: var(--space-4);
	}

	/* -------------------------------------------------------------------
	   instructions: the only block held to the reading measure by itself.
	   ------------------------------------------------------------------- */
	.rb-prose {
		max-width: var(--rb-measure);
	}

	/* -------------------------------------------------------------------
	   keyValue: a compact facts strip -- aligned rows, deliberately not a
	   table's chrome.
	   ------------------------------------------------------------------- */
	.rb-kv-panel {
		max-width: var(--rb-measure);
	}
	.rb-kv {
		margin: 0;
		display: grid;
		grid-template-columns: minmax(7rem, max-content) 1fr;
		gap: 0 var(--space-4);
	}
	.rb-kv dt {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
		padding: 0.4rem 0;
		border-top: 1px solid var(--hairline);
	}
	.rb-kv dd {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.45;
		overflow-wrap: anywhere;
		padding: 0.35rem 0;
		border-top: 1px solid var(--hairline);
	}
	/* The first row needs no rule above it -- the panel edge is already there. */
	.rb-kv dt:first-of-type,
	.rb-kv dt:first-of-type + dd {
		border-top: none;
		padding-top: 0;
	}

	/* -------------------------------------------------------------------
	   dataTable: static, never gains a row, never accepts input.
	   ------------------------------------------------------------------- */
	.rb-dt-panel {
		padding: var(--space-4) var(--space-4) var(--space-3);
	}
	.rb-dt-scroll {
		overflow-x: auto;
		max-width: 100%;
	}
	.rb-dt {
		width: 100%;
		border-collapse: collapse;
		min-width: 20rem;
	}
	/* The header has to HOLD: its own surface and a solid rule under it, so a
	   reader scanning a long table always knows which column they are in. */
	.rb-dt th {
		text-align: left;
		font-family: var(--font-mono);
		font-size: 0.64rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
		background: var(--surface-2);
		border-bottom: 1px solid var(--line-strong);
		padding: var(--space-2) var(--space-3);
		font-weight: 400;
		white-space: nowrap;
	}
	.rb-dt th:first-child {
		border-top-left-radius: var(--radius-chip);
		border-bottom-left-radius: 0;
	}
	.rb-dt th:last-child {
		border-top-right-radius: var(--radius-chip);
	}
	/* QUIET separation: a hairline between rows, no grid, no zebra. */
	.rb-dt td {
		border-bottom: 1px solid var(--hairline);
		padding: var(--space-2) var(--space-3);
		font-size: 0.88rem;
		line-height: 1.5;
		vertical-align: top;
	}
	.rb-dt tbody tr:last-child td {
		border-bottom: none;
	}
	.rb-dt-caption {
		margin: var(--space-2) 0 0;
		font-size: 0.76rem;
		color: var(--text-2);
		line-height: 1.45;
	}

	/* -------------------------------------------------------------------
	   callout: the three variants must be tellable apart at a glance, and
	   `required` must be unmistakable -- on this page it carries a purchase a
	   parent has to make.
	   ------------------------------------------------------------------- */
	.rb-callout {
		display: block;
		max-width: var(--rb-measure);
		border: 1px solid var(--hairline);
		border-left-width: 3px;
		border-radius: var(--radius-card);
		padding: var(--space-3) var(--space-4);
		background: var(--surface-1);
	}
	.rb-callout-body {
		min-width: 0;
	}
	.rb-callout.v-info {
		border-left-color: var(--cyan);
		background: color-mix(in srgb, var(--cyan) 5%, var(--surface-1));
	}
	.rb-callout.v-warn {
		border-left-color: var(--amber);
		background: color-mix(in srgb, var(--amber) 7%, var(--surface-1));
	}
	/* Heavier on every axis at once -- rule, fill, glow and a tag that reads as
	   a stamp rather than a label. */
	.rb-callout.v-required {
		border-color: var(--gold);
		border-left-width: 5px;
		background: color-mix(in srgb, var(--gold) 11%, var(--surface-1));
		box-shadow: var(--glow-gold);
	}
	.rb-callout-tag {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--cyan);
		margin-bottom: var(--space-2);
	}
	.rb-callout.v-warn .rb-callout-tag {
		color: var(--amber);
	}
	.rb-callout.v-required .rb-callout-tag {
		color: var(--edge);
		background: var(--gold);
		border-radius: var(--radius-chip);
		padding: 0.15rem 0.45rem;
		font-weight: 700;
	}
	.rb-callout-title {
		margin: 0 0 var(--space-2);
		font-size: 1rem;
		line-height: 1.25;
	}

	/* -------------------------------------------------------------------
	   cardGrid: full width, one column on a phone.
	   ------------------------------------------------------------------- */
	.rb-cards {
		display: grid;
		grid-template-columns: repeat(var(--card-count, 3), minmax(0, 1fr));
		gap: var(--space-3);
	}
	.rb-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		background: var(--surface-1);
		box-shadow: var(--bevel-raised);
		padding: var(--space-3);
		text-decoration: none;
		color: var(--text-1);
		min-width: 0;
	}
	a.rb-card {
		transition: border-color var(--ease), transform var(--ease);
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
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.rb-card-body {
		font-size: 0.82rem;
		color: var(--text-2);
		line-height: 1.45;
	}

	/* -------------------------------------------------------------------
	   linkCard. The card itself is the shared LinkPreviewCard (classroom item
	   links mount it too), so it is dressed from HERE -- rooted at .rb-links,
	   which cannot reach any other surface.
	   ------------------------------------------------------------------- */
	.rb-links {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.rb-links :global(.lp) {
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3);
		background: var(--surface-1);
		border-radius: var(--radius-card);
		box-shadow: var(--bevel-raised);
	}
	.rb-links :global(.lp-body) {
		gap: 0.15rem;
	}
	.rb-links :global(.lp-title) {
		font-size: 0.95rem;
		line-height: 1.3;
	}
	/* The fallback label is the durable half of a link: when a retailer listing
	   dies, the part number is what is left. It reads as a spec line under the
	   title, always, not as an error state. */
	.rb-links :global(.lp-fallback) {
		font-size: 0.74rem;
		letter-spacing: 0.02em;
		margin-top: 0.1rem;
	}
	.rb-links :global(.lp-thumb) {
		border-radius: var(--radius-chip);
	}

	.rb-tool {
		padding: var(--space-4);
	}

	@media (max-width: 620px) {
		.rb-cards {
			grid-template-columns: 1fr;
		}
		.rb-kv {
			grid-template-columns: 1fr;
			gap: 0;
		}
		.rb-kv dt {
			padding-bottom: 0;
			border-top: 1px solid var(--hairline);
		}
		.rb-kv dd {
			padding-top: 0.1rem;
			border-top: none;
		}
		.rb-kv dt:first-of-type + dd {
			padding-top: 0.1rem;
		}

		/* RESTACK, never scroll sideways. Each cell carries its own column label
		   from data-label, so the table becomes a stack of labelled records and
		   the phone's layout viewport is never pushed past its own width. */
		.rb-dt-scroll {
			overflow-x: visible;
		}
		.rb-dt,
		.rb-dt tbody,
		.rb-dt tr,
		.rb-dt td {
			display: block;
			min-width: 0;
			width: auto;
		}
		.rb-dt thead {
			/* Visually hidden, still announced: the cell labels replace it. */
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.rb-dt tbody tr {
			border: 1px solid var(--hairline);
			border-radius: var(--radius-card);
			background: var(--surface-2);
			padding: var(--space-2) var(--space-3);
		}
		.rb-dt tbody tr + tr {
			margin-top: var(--space-2);
		}
		.rb-dt td {
			border-bottom: none;
			padding: var(--space-1) 0;
			display: grid;
			grid-template-columns: minmax(0, 6.5rem) 1fr;
			gap: var(--space-3);
			align-items: baseline;
		}
		.rb-dt td::before {
			content: attr(data-label);
			font-family: var(--font-mono);
			font-size: 0.6rem;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--text-2);
		}
		.rb-dt tbody tr:last-child td {
			border-bottom: none;
		}
		.rb-panel {
			padding: var(--space-3);
		}
		.rb-callout {
			padding: var(--space-3);
		}
	}

	@media print {
		.rb-dt-scroll {
			overflow: visible;
		}
		.rb-dt {
			min-width: 0;
		}
		.rb-dt th {
			background: none;
			color: #000;
			border-bottom-color: #000;
		}
		.rb-dt td,
		.rb-kv dt,
		.rb-kv dd {
			border-color: #bbb;
		}
		.rb-title,
		.rb-kv dt,
		.rb-dt-caption,
		.rb-card-body {
			color: #333;
		}
		/* Backgrounds drop out on paper. `.rb-callout.v-required` is listed
		   EXPLICITLY: it carries its own fill at a higher specificity than the
		   bare selector, so without it exactly the one block a printed page most
		   needs to read cleanly would still be painted. Its heavier border is
		   what keeps it unmistakable in ink. */
		.rb-panel,
		.rb-callout,
		.rb-callout.v-info,
		.rb-callout.v-warn,
		.rb-callout.v-required,
		.rb-card,
		.rb-tool {
			background: none;
			border-color: #999;
			box-shadow: none;
		}
		.rb-callout.v-required {
			border-color: #000;
			border-left-width: 5px;
		}
		.rb-callout.v-required .rb-callout-tag {
			background: none;
			color: #000;
			border: 1px solid #000;
		}
		.rb-prose,
		.rb-kv-panel,
		.rb-callout {
			max-width: none;
		}
		.rb-cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			break-inside: avoid;
		}
	}
</style>
