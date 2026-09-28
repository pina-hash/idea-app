<script lang="ts">
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ReturnedGrade from '$lib/classroom/ReturnedGrade.svelte';
	import type { ClassroomSection } from '$lib/classroom/classroom';
	import { CARDS, ITEMS, RETURNED, UNITS } from './plate-fixtures';

	/**
	 * THE PLATE VIEW (ledger 0341): one sci-fi shape language for every theme,
	 * after the Sci-Fi Line references, shown as before/after pairs on the REAL
	 * components. The proposal itself is `./plate.css`; this file is only the
	 * specimens, and every specimen is written ONCE, as a snippet, and rendered
	 * in both columns. The after column is a wrapper (`.pl-after`) that the
	 * stylesheet keys on and nothing else, so a difference between the two
	 * columns can only come from the proposal, and the before column is today's
	 * shipping CSS by construction.
	 *
	 * THE ONE RULE: geometry is the same in every theme. Nothing in this file
	 * branches on the theme, and `plate.css` puts every length in one shared
	 * block and every colour and shadow in a per-theme block, so a theme can
	 * only ever change what a control is painted with, never where it is.
	 * `_themes-shape-plate-pixels.mjs` reads every control's box in each theme
	 * and diffs them.
	 */
	let { sections }: { sections: ClassroomSection[] } = $props();

	const SECTION = $derived(sections[0]);
</script>

<!-- ------------------------------------------------------------------ -->
<!-- The specimens, each written once.                                   -->
<!-- ------------------------------------------------------------------ -->

{#snippet buttons()}
	<div class="pl-group" data-pl="group-buttons">
		<div class="pl-row">
			<button type="button" class="btn" data-ts="btn-primary">Turn in</button>
			<button type="button" class="btn secondary" data-ts="btn-secondary">Save draft</button>
			<button type="button" class="btn secondary pl-selected" aria-pressed="true" data-ts="btn-selected"
				>Week view</button
			>
		</div>
		<div class="pl-row">
			<button type="button" class="btn secondary pl-hold-active" data-ts="btn-pressed">Pressed</button>
			<button type="button" class="btn" disabled data-ts="btn-disabled">Closed</button>
			<button type="button" class="btn secondary pl-hold-focus" data-ts="btn-focus">Focused</button>
		</div>
		<span class="mini-label pl-group-label" data-ts="label-buttons">BUTTONS: PRIMARY, SECONDARY, SELECTED, PRESSED, DISABLED, FOCUS</span>
	</div>
{/snippet}

{#snippet chips()}
	<div class="pl-group" data-pl="group-chips">
		<div class="pl-row">
			<span class="draft-chip" data-ts="chip-status">Draft</span>
			<span class="kind-chip" data-ts="chip-kind">Assignment</span>
			<span class="kind-chip pinned" data-ts="chip-pinned">Pinned</span>
		</div>
		<span class="mini-label pl-group-label" data-ts="label-chips">CHIPS</span>
	</div>
{/snippet}

{#snippet card(c: (typeof CARDS)[number], ts: string)}
	<article class="card pl-card" data-ts={ts}>
		<span class="mini-label" data-ts="card-label">{c.label}</span>
		<h4 class="pl-card-title" data-ts="card-title">{c.title}</h4>
		<p class="pl-card-body" data-ts="card-body">{c.body}</p>
		<div class="pl-row">
			<button type="button" class="btn secondary" data-ts="card-btn">Open</button>
			<span class="kind-chip" data-ts="card-chip">{c.chip}</span>
		</div>
	</article>
{/snippet}

{#snippet fields()}
	<div class="pl-group" data-pl="group-fields">
		<div class="pl-fields">
			<label class="pl-field">
				<span class="mini-label" data-ts="field-label">TITLE</span>
				<input class="pl-input" type="text" value="Bracket redesign" data-ts="input" />
			</label>
			<label class="pl-field">
				<span class="mini-label" data-ts="field-label">UNIT</span>
				<select class="cr-select" data-ts="select">
					<option>Unit 3 · Materials and testing</option>
					<option>Unit 2 · Bridges</option>
				</select>
			</label>
		</div>
		<span class="mini-label pl-group-label" data-ts="label-fields">INPUT AND SELECT</span>
	</div>
{/snippet}

{#snippet list()}
	<div class="pl-group" data-pl="group-list">
		<div class="pl-list" data-ts="list">
			<ClassView
				section={SECTION}
				items={ITEMS}
				units={UNITS}
				selectedItemId="i-2"
				asPane={true}
				basePath="/dev/themes-shape"
			/>
		</div>
		<span class="mini-label pl-group-label" data-ts="label-list">THE CLASS LIST, ONE ROW OPEN</span>
	</div>
{/snippet}

{#snippet shell(extra = '')}
	<ClassroomShell
		{sections}
		currentSectionId="s-1"
		crumbs={[]}
		tabs={[]}
		tab={null}
		canManage={true}
		isStaff={true}
		isAdmin={false}
		todoHref="#todo"
	>
		<span class="pl-shell-end" data-extra={extra} aria-hidden="true"></span>
	</ClassroomShell>
{/snippet}

{#snippet menuOver()}
	<div class="pl-stage" data-testid="menu-stage">
		<ClassroomShell
			{sections}
			currentSectionId="s-1"
			crumbs={[]}
			tabs={[]}
			tab={null}
			canManage={true}
			isStaff={true}
			isAdmin={false}
			todoHref="#todo"
		>
			<div class="pl-under">
				{@render card(CARDS[0], 'under-card')}
			</div>
		</ClassroomShell>
	</div>
{/snippet}

{#snippet display()}
	<div class="pl-display-wrap" data-ts="display">
		<ReturnedGrade submission={RETURNED} points={20} />
	</div>
{/snippet}

{#snippet region()}
	<div class="pl-region" data-ts="region">
		{@render shell('region')}
		<div class="pl-titlebar">
			<h3 class="pl-title" data-ts="region-title">Period 1 · Engineering I Honors</h3>
		</div>
		<div class="pl-region-body">
			<section class="pl-main" aria-label="This week">
				<span class="mini-label pl-col-label" data-ts="region-label">THIS WEEK</span>
				<div class="pl-cards">
					{#each CARDS as c, i (c.title)}
						{@render card(c, `region-card-${i}`)}
					{/each}
				</div>
			</section>
			<aside class="pl-side" aria-label="Returned work">
				<span class="mini-label pl-col-label" data-ts="region-label">RETURNED</span>
				<ReturnedGrade submission={RETURNED} points={20} />
				<a class="btn secondary pl-side-link" href="#todo" data-ts="region-link">Open to-do</a>
			</aside>
		</div>
	</div>
{/snippet}

<!-- ------------------------------------------------------------------ -->
<!-- The pairs.                                                          -->
<!-- ------------------------------------------------------------------ -->

{#snippet pair(id: string, title: string, note: string, body: import('svelte').Snippet, wide = false)}
	<section class="pl-sec" aria-labelledby="pl-h-{id}" data-pl-sec={id}>
		<h2 id="pl-h-{id}">{title}</h2>
		<p class="pl-note">{note}</p>
		<div class={wide ? 'pl-stack' : 'pl-pair'}>
			<div class="pl-col" class:pl-wide={wide} data-col="before">
				<h3 class="pl-colh">Before</h3>
				{@render body()}
			</div>
			<div class="pl-col pl-after" class:pl-wide={wide} data-col="after">
				<h3 class="pl-colh">After</h3>
				{@render body()}
			</div>
		</div>
	</section>
{/snippet}

<div class="pl-view" data-testid="plate-view">
	{@render pair(
		'buttons',
		'Buttons and chips',
		'Primary, secondary, selected, pressed, disabled and a held keyboard focus ring, then the three chips. Pressed and focus are held on so they can be compared in one look.',
		buttonsAndChips
	)}
	{@render pair('card', 'An item card', 'The card every class list item opens into.', cardOne)}
	{@render pair(
		'fields',
		'An input and a select in a well',
		'The select is the classroom’s own .cr-select. The text input borrows the composer’s input rule, because every classroom text input is styled inside its own component.',
		fields
	)}
	{@render pair(
		'list',
		'A list with a selected row',
		'The real class list with one item open, as it reads beside the detail pane.',
		list
	)}
	{@render pair(
		'header',
		'The classroom header',
		'The real classroom header. A header is as wide as the page, so the pair is stacked.',
		headerOnly,
		true
	)}
	{@render pair(
		'menu',
		'The class menu open over content',
		'The same header with its class menu open over a card (Classes, or Menu on a phone).',
		menuOver,
		true
	)}
	{@render pair(
		'display',
		'A dark inset display: the returned grade',
		'The one dark surface on a light plate, and the only place the accent glows. The classroom’s returned grade is the readout.',
		display
	)}
	{@render pair(
		'region',
		'A composed page region',
		'The header, a title bar, a panel of three item cards and a side panel, so the proposal is judged as a page and not as a parts sheet.',
		region,
		true
	)}
</div>

{#snippet buttonsAndChips()}
	{@render buttons()}
	{@render chips()}
{/snippet}
{#snippet cardOne()}
	{@render card(CARDS[0], 'card')}
{/snippet}
{#snippet headerOnly()}
	{@render shell()}
{/snippet}

<style>
	/* THE PROPOSAL IS NOT HERE. It is ./plate.css. What follows is the
	   mockup's own layout, shared by both columns, and is not part of it. */
	.pl-sec {
		margin-top: 2rem;
	}
	h2 {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-2);
		margin: 0;
	}
	.pl-note {
		color: var(--text-2);
		max-width: 46rem;
		line-height: 1.5;
		margin: 0.4rem 0 0;
	}
	.pl-pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(24rem, 100%), 1fr));
		gap: 1rem;
		margin-top: 0.75rem;
	}
	.pl-stack {
		display: grid;
		gap: 1rem;
		margin-top: 0.75rem;
	}
	.pl-col {
		min-width: 0;
		padding: 0.9rem 1rem 1.1rem;
		background: var(--surface-0);
		border: 1px solid var(--hairline);
	}
	.pl-wide {
		padding: 0.9rem 0 0;
	}
	.pl-wide > .pl-colh {
		padding: 0 1rem;
	}
	.pl-colh {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-2);
		margin: 0 0 0.75rem;
	}
	.pl-group {
		display: grid;
		gap: 0.6rem;
		margin-top: 0.6rem;
	}
	.pl-group + .pl-group {
		margin-top: 1.2rem;
	}
	.pl-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.pl-card {
		margin: 0;
	}
	.pl-card-title {
		font-size: 1.1rem;
		color: var(--text-1);
		margin: 0.35rem 0 0.4rem;
	}
	.pl-card-body {
		color: var(--text-1);
		line-height: 1.5;
		margin: 0 0 0.6rem;
	}
	.pl-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
		gap: 0.75rem;
	}
	.pl-field {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
	}
	/* TODAY'S TEXT INPUT, COPIED, and the one copy on this page. Every text
	   input in the classroom is styled inside its own component (this is
	   ContentComposer's `input` rule, byte for byte), so a mockup outside that
	   component cannot reach it; the select beside it is the global
	   `.cr-select` and needs no copy. The 44px floor is the only addition, and
	   it is the composer's own measured height rounded up. */
	.pl-input {
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
		width: 100%;
		min-width: 0;
		min-height: 44px;
		box-sizing: border-box;
	}
	.pl-list {
		min-width: 0;
	}
	.pl-shell-end {
		display: block;
		height: 0.75rem;
	}
	.pl-stage {
		position: relative;
		min-height: 26rem;
		background: var(--surface-0);
	}
	/* Below the header's fold (1180px, ClassroomShell's own breakpoint) the
	   class list opens inside the Menu panel, which measured 476px tall from
	   62px down the stage at 375; the stage holds all of it, so the open panel
	   never lies over the next column. */
	@media (max-width: 1179.98px) {
		.pl-stage {
			min-height: 36rem;
		}
	}
	.pl-under {
		padding: 1rem;
	}
	.pl-region-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		padding: 1rem;
	}
	@media (min-width: 1024px) {
		.pl-region-body {
			grid-template-columns: minmax(0, 2.2fr) minmax(16rem, 1fr);
		}
	}
	.pl-main,
	.pl-side {
		display: grid;
		align-content: start;
		gap: 0.75rem;
		min-width: 0;
	}
	.pl-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
		gap: 0.75rem;
	}
	.pl-titlebar {
		padding: 0.75rem 1rem 0;
	}
	.pl-title {
		margin: 0;
		font-size: 1.15rem;
		color: var(--text-1);
	}
	.pl-side-link {
		justify-self: start;
	}
	/* HELD STATES. `:active` and `:focus-visible` cannot be held for a
	   screenshot, so two classes hold them. These are today's rules copied
	   (app.css `.btn:active` and `:focus-visible`), which is what the before
	   column must show; the after column's own pressed rule in plate.css
	   outranks this one. */
	.pl-hold-active {
		transform: translateY(1px);
		box-shadow: var(--bevel-inset);
	}
	.pl-hold-focus {
		outline: 2px solid var(--cyan);
		outline-offset: 2px;
	}
</style>
