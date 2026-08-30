<script lang="ts">
	import { dev } from '$app/environment';
	import {
		parseMarkdown,
		type InlineRun,
		type MarkdownList,
		type MarkdownNode
	} from '$lib/classroom/reference-spec';
	import { resolveFigureSrc, type ClassroomAttachment } from '$lib/classroom/classroom';

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
	 *
	 * A FIGURE IS THE ONE ELEMENT HERE THAT FETCHES SOMETHING. Every other node
	 * is text this component escapes; an `img` makes the browser go and get
	 * whatever the author named, automatically, before the reader has decided
	 * anything. `resolveFigureSrc` is the whole of the rule and it lives in
	 * classroom.ts beside the other src builders -- NOT `safeHref`, which is for
	 * anchors and admits external http (see that function's header). A src it
	 * refuses never reaches an `img` attribute at all: the element is not
	 * rendered, rather than rendered with a blank or sanitized value.
	 */
	let {
		body,
		attachments = [],
		publicAttachments = false
	}: {
		body: string;
		/**
		 * The attachments of the ITEM THIS PROSE BELONGS TO, which is what an
		 * `attachment:<filename>` reference resolves against. Absent is a normal
		 * state, not an error: every such reference then reads as unresolved and
		 * renders as its caption plus a marker, which is exactly what a typo does.
		 */
		attachments?: ClassroomAttachment[];
		/** The public reference viewer's `?public=1` branch (see resolveFigureSrc). */
		publicAttachments?: boolean;
	} = $props();

	const nodes = $derived<MarkdownNode[]>(parseMarkdown(body));

	const figureSrc = (src: string) => resolveFigureSrc(src, attachments, { public: publicAttachments });
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

{#snippet tableBlock(headers: InlineRun[][], rows: InlineRun[][][])}
	<div class="md-table-wrap">
		<table class="md-table">
			<thead>
				<tr>
					{#each headers as cell, ci (ci)}
						<th scope="col">{@render inline(cell)}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row, ri (ri)}
					<tr>
						{#each row as cell, ci (ci)}
							<td>{@render inline(cell)}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
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
		{:else if node.type === 'table'}
			{@render tableBlock(node.headers, node.rows)}
		{:else if node.type === 'quote'}
			<blockquote>
				{#each node.paragraphs as para, pi (pi)}
					<p>{@render inline(para)}</p>
				{/each}
			</blockquote>
		{:else if node.type === 'figure'}
			{@const resolved = figureSrc(node.src)}
			<figure class="md-figure" class:unresolved={!resolved.ok}>
				{#if resolved.ok}
					<!-- The alt IS the caption, deliberately: one authored string, so a
					     reader using a screen reader and a reader looking at the page
					     are told the same thing, and neither can be given a description
					     the other does not have. -->
					<img src={resolved.src} alt={node.alt} loading="lazy" />
				{:else}
					<!-- NEVER A BROKEN IMAGE ELEMENT AND NEVER SILENCE. An `img` with a
					     refused src would either 404 in the layout or, worse, render as
					     nothing and leave a caption describing a picture that is not
					     there. The marker carries a WORD, not only a colour, so it is
					     legible in print and to anyone not distinguishing hues. -->
					<span class="md-figure-marker">Image unavailable</span>
				{/if}
				<figcaption>{node.alt}</figcaption>
			</figure>
		{:else if node.type === 'code'}
			<pre><code>{node.text}</code></pre>
		{:else if dev}
			<!-- A NODE TYPE THIS RENDERER DOES NOT KNOW. Unreachable from
			     parseMarkdown as it stands; it exists for the state where a stored
			     document outlives the code that read it. Dev only: production is
			     unchanged and still renders nothing, because a marker on a
			     student's screen is not an improvement on a gap. -->
			<p class="md-unknown">Unsupported content ({(node as { type: string }).type})</p>
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

	/* A table is data to scan, not prose to read, so it takes the full width
	   available rather than the reading measure -- the reference-document
	   convention (rb-dt) applied here. The scroll lives on the wrapper, never
	   the page, so a wide table cannot push a narrow column past its own
	   width. */
	.md :global(.md-table-wrap) {
		overflow-x: auto;
		max-width: 100%;
	}
	.md :global(.md-table) {
		width: 100%;
		border-collapse: collapse;
		min-width: 20rem;
	}
	.md :global(.md-table th) {
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
	.md :global(.md-table td) {
		border-bottom: 1px solid var(--hairline);
		padding: var(--space-2) var(--space-3);
		font-size: 0.88rem;
		line-height: 1.5;
		vertical-align: top;
	}
	.md :global(.md-table tbody tr:last-child td) {
		border-bottom: none;
	}

	/* A FIGURE TAKES AT MOST THE MEASURE OF THE COLUMN IT IS IN, AND NEVER MORE
	   THAN ITS OWN PIXELS. This rule was `width: 100%` with `height: auto`,
	   which keeps the aspect ratio in both directions but is a floor as well as
	   a ceiling: a small diagram was BLOWN UP to the full column and rendered
	   soft. Measured at 1440 before the change, a 200x150 diagram painted 736px
	   wide -- 3.67x its own width; at 375 it painted 341px, 1.7x. A 600x900
	   portrait was upscaled 1.22x at 1440 for the same reason.

	   Both dimensions automatic with `max-width: 100%` is the whole fix: the
	   intrinsic size wins until the column is narrower, and then the column
	   does. `aspect-ratio` is still deliberately NOT set -- it would need a
	   per-image value the spec does not carry, and getting it wrong crops.

	   `align-self: flex-start` IS THE OTHER HALF, and it is the same one the
	   print block below found by measuring. `.md-figure` is a flex COLUMN, so
	   the default stretch alignment sizes the img box to the figure's full
	   width whatever `width: auto` says -- which with `object-fit` at its
	   default `fill` does not letterbox, it DISTORTS. */
	.md :global(.md-figure) {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.md :global(.md-figure img) {
		display: block;
		align-self: flex-start;
		width: auto;
		height: auto;
		max-width: 100%;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		background: var(--surface-2);
	}
	/* Real caption copy, so --text-2 (6.3:1 on --surface-1) rather than --text-3,
	   which the design system reserves for separators and disabled glyphs and
	   which sits below any text threshold. Measured against the ground it
	   actually composites over, per IDEA_INTERFACE_STANDARDS 10. */
	.md :global(.md-figure figcaption) {
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-2);
	}
	/* The refused / unresolved state. A dashed box says "something was meant to
	   be here" without pretending to be a picture, and the word inside it says
	   what happened -- colour is never the only signal. */
	.md :global(.md-figure-marker) {
		display: block;
		padding: var(--space-3);
		border: 1px dashed var(--line-strong);
		border-radius: var(--radius-card);
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--amber);
		text-align: center;
	}
	.md :global(.md-unknown) {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--amber);
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
		.md :global(.md-table-wrap) {
			overflow: visible;
		}
		.md :global(.md-table) {
			min-width: 0;
		}
		.md :global(.md-table th) {
			background: none;
			color: #000;
			border-bottom-color: #000;
		}
		.md :global(.md-table td) {
			border-color: #bbb;
		}

		/* FIGURES PRINT. They are content, not chrome: a procedure that says
		   "match the surface to the photograph" is unusable on paper without it.

		   CAPPED AT 4in, WHICH IS NOW THE WHOLE OF WHAT THIS BLOCK ADDS. US Letter
		   leaves roughly 9in of printable height, so a figure can take a little
		   under half a page and never the whole of one -- otherwise a single tall
		   image pushes every step of the procedure it belongs to onto the
		   following sheet, which is the failure this cap exists to prevent.

		   `width: auto`, `height: auto` and `align-self: flex-start` USED TO BE
		   STATED HERE TOO, and they are gone from this block because the screen
		   rule above carries all three now. They are not lost, and the reasoning
		   that found them is worth keeping: `.md-figure` is a flex COLUMN, so the
		   default stretch alignment sizes the img box to the figure's full width
		   whatever `width: auto` says -- and `max-height` then clamps the height
		   independently of it. With `object-fit` at its default `fill`, that does
		   not letterbox, it DISTORTS: a 1202x1202 square measured 846x384 in the
		   print box, squashed to 45% of its height, and 384x384 once aligned to
		   the start. That measurement is what the screen rule was eventually
		   fixed FROM; restating it here would be a second copy of one decision,
		   and the copy is the one that stops matching. */
		.md :global(.md-figure) {
			break-inside: avoid;
			page-break-inside: avoid;
		}
		.md :global(.md-figure img) {
			max-height: 4in;
			border-color: #999;
			background: none;
		}
		.md :global(.md-figure figcaption) {
			color: #333;
		}
		/* The marker prints too. A caption on paper describing a picture that is
		   not on the paper is worse than the marker, since nobody printing it can
		   tell whether the image failed or was never meant to be there. */
		.md :global(.md-figure-marker) {
			border-color: #999;
			background: none;
			color: #333;
		}
	}
</style>
