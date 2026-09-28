<script lang="ts">
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ReturnedGrade from '$lib/classroom/ReturnedGrade.svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import type { ClassroomSection } from '$lib/classroom/classroom';
	import PlateRing from '$lib/classroom/PlateRing.svelte';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import { CARDS, ITEMS, REGION_CARDS, RETURNED, UNITS, type PlateCard } from './plate-fixtures';

	/**
	 * THE PLATE VIEW, ROUND 3 (ledger 0344), SHIPPED BY LEDGER 0345. The look is
	 * no longer a proposal: it is `$lib/classroom/plate.css`, the production
	 * stylesheet, switched on by the after column carrying `CLASSROOM_PLATE`,
	 * the same constant the live classroom's layout reads. So this page and
	 * the site cannot drift apart. `./plate-v3.css` keeps only what belongs to
	 * the mockup itself (the plate columns, the composed region's title bar,
	 * rails and recessed column, the group brackets and the corner study).
	 *
	 * THE SAME PAIRS AS ROUND 2, AND THE SAME DISCIPLINE. Every specimen is a
	 * snippet rendered in both columns, and the after column (`.p3-after` plus
	 * the plate class) is the only thing the stylesheets key on, so the before column is today's
	 * shipping CSS by construction. Round 3 adds one thing to that: a snippet
	 * takes `after`, and a few pieces that have NO equivalent today (the
	 * progress ring, the held switch states, the region's engraved rails)
	 * render in the after column only. Every one of them is named in the
	 * section's note, so nothing in the after column pretends to be a
	 * restyle of something that is not there.
	 *
	 * SECTION LABELS SIT ABOVE WHAT THEY NAME (ledger 0345, polish 3): the
	 * chips, the class list, the grade and the region's THIS WEEK and RETURNED
	 * read top down. The kit's centred label BELOW stays only on a small group
	 * of controls: the buttons, the switch and the two fields.
	 *
	 * THE ONE RULE: nothing here branches on the theme. `plate.css` declares
	 * every length once and every colour per theme; the ring's lengths are in
	 * its viewBox. `_themes-shape-plate-pixels.mjs` diffs every element's box
	 * across the three themes.
	 */
	let { sections }: { sections: ClassroomSection[] } = $props();

	const SECTION = $derived(sections[0]);
	const GRADE = RETURNED.score ?? 0;
	const OUT_OF = 20;
	const PCT = Math.round((GRADE / OUT_OF) * 100);

	/** The corner study (C3): five shapes at three scales, in the v3 material. */
	const SHAPES = [
		{ id: 'round', label: 'round' },
		{ id: 'bevel', label: 'bevel' },
		{ id: 'k25', label: 'superellipse(0.25)' },
		{ id: 'k50', label: 'superellipse(0.5)' },
		{ id: 'k75', label: 'superellipse(0.75)' }
	];
	const SCALES = [
		{ id: 'control', label: 'CONTROL, 44PX TALL' },
		{ id: 'card', label: 'CARD' },
		{ id: 'plate', label: 'PLATE' }
	];
</script>

<!-- ------------------------------------------------------------------ -->
<!-- The specimens, each written once.                                   -->
<!-- ------------------------------------------------------------------ -->

{#snippet buttons(after: boolean)}
	<div class="pl-group p3-group" data-pl="group-buttons">
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
		<span class="mini-label pl-group-label p3-group-label" data-ts="label-buttons"
			>BUTTONS: PRIMARY, SECONDARY, SELECTED, PRESSED, DISABLED, FOCUS</span
		>
	</div>
	{#if after}
		<!-- THE SWITCH, HELD OFF AND ON. A copy of the header's ThemeSwitch
		     markup (the glyph and the word), because the real one follows the
		     live theme and so can only ever show one state per theme; the real
		     one is in the header specimen below. These two do nothing when
		     pressed, like the held Pressed and Focused buttons above. -->
		<div class="pl-group p3-group" data-pl="group-switches">
			<div class="pl-row">
				{#each [false, true] as on (on)}
					<button type="button" class="theme-switch p3-switch-held" class:on aria-pressed={on} data-ts="switch-{on ? 'on' : 'off'}">
						<svg class="ts-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
							<circle cx="8" cy="8" r="3.1" class="ts-disc" />
						</svg>
						<span class="ts-word">Light</span>
					</button>
				{/each}
			</div>
			<span class="mini-label pl-group-label p3-group-label" data-ts="label-switches">SWITCH: OFF, ON</span>
		</div>
	{/if}
{/snippet}

{#snippet chips()}
	<div class="pl-group p3-group p3-group-top" data-pl="group-chips">
		<span class="mini-label pl-group-label p3-group-label" data-ts="label-chips">CHIPS</span>
		<div class="pl-row">
			<span class="draft-chip" data-ts="chip-status">Draft</span>
			<span class="kind-chip" data-ts="chip-kind">Assignment</span>
			<span class="kind-chip pinned" data-ts="chip-pinned">Pinned</span>
		</div>
	</div>
{/snippet}

{#snippet card(c: PlateCard, ts: string)}
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
	<div class="pl-group p3-group" data-pl="group-fields">
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
		<span class="mini-label pl-group-label p3-group-label" data-ts="label-fields">INPUT AND DROPDOWN</span>
	</div>
{/snippet}

{#snippet list()}
	<div class="pl-group p3-group p3-group-top" data-pl="group-list">
		<span class="mini-label pl-group-label p3-group-label" data-ts="label-list">THE CLASS LIST, ONE ROW SELECTED</span>
		<div class="pl-list p3-list" data-ts="list">
			<ClassView
				section={SECTION}
				items={ITEMS}
				units={UNITS}
				selectedItemId="i-2"
				asPane={true}
				basePath="/dev/themes-shape"
			/>
		</div>
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

{#snippet ring(size = 168)}
	<PlateRing value={GRADE / OUT_OF} text="{PCT}%" label="{GRADE} of {OUT_OF} points, {PCT} percent" {size} />
{/snippet}

{#snippet display(after: boolean)}
	<div class="p3-display-row">
		<div class="pl-display-wrap p3-housing-wrap" data-ts="display">
			<ReturnedGrade submission={RETURNED} points={OUT_OF} />
		</div>
		{#if after}
			<div class="p3-group p3-group-top p3-ring-group" data-ts="ring">
				<span class="mini-label p3-group-label" data-ts="label-ring">GRADE</span>
				{@render ring()}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet region(after: boolean)}
	<div class="pl-region p3-region" data-ts="region">
		{@render shell('region')}
		<div class="pl-titlebar p3-titlebar">
			<!-- The dot is held to both neighbours, so a narrow title never leaves it
			     hanging at the end of a line. -->
			<h3 class="pl-title p3-title {after ? 'plate-title' : ''}" data-ts="region-title">Period 1&nbsp;·&nbsp;Engineering I Honors</h3>
		</div>
		<div class="pl-region-body p3-region-body">
			<section class="pl-main p3-main" aria-label="This week">
				<div class="p3-group p3-group-top p3-cards-group">
					<span class="mini-label pl-col-label p3-group-label" data-ts="region-label">THIS WEEK</span>
					<div class="pl-cards p3-cards">
						{#each REGION_CARDS as c, i (c.title)}
							{@render card(c, `region-card-${i}`)}
						{/each}
					</div>
				</div>
			</section>
			<aside class="pl-side p3-side" aria-label="Returned work">
				{#if after}
					<!-- An engraved line that runs straight and turns 45 degrees (D5),
					     paint only. -->
					<svg class="p3-engrave" viewBox="0 0 120 22" preserveAspectRatio="none" aria-hidden="true" focusable="false">
						<path class="e-dk" d="M0 17.5 H62 L76 3.5 H120" />
						<path class="e-lt" d="M0 18.5 H62.4 L76.4 4.5 H120" />
					</svg>
				{/if}
				<div class="p3-group p3-group-top">
					<span class="mini-label pl-col-label p3-group-label" data-ts="region-label">RETURNED</span>
					<ReturnedGrade submission={RETURNED} points={OUT_OF} />
				</div>
				{#if after}
					<div class="p3-group p3-group-top p3-side-ring" data-ts="region-ring">
						<span class="mini-label pl-col-label p3-group-label" data-ts="region-label">GRADE</span>
						{@render ring(152)}
					</div>
				{/if}
				<a class="btn secondary pl-side-link" href="#todo" data-ts="region-link">Open to-do</a>
			</aside>
			{#if after}
				<!-- The right rail: a vertical engraved line that turns 45 degrees,
				     with three angled lines beside the turn (D5). -->
				<svg class="p3-rail" viewBox="0 0 22 180" aria-hidden="true" focusable="false">
					<path class="e-dk" d="M6.5 0 V104 L21.5 119" />
					<path class="e-dk" d="M6.5 120 L21.5 135" />
					<path class="e-dk" d="M6.5 128 L21.5 143" />
					<path class="e-dk" d="M6.5 136 L21.5 151" />
				</svg>
			{/if}
		</div>
	</div>
{/snippet}

<!-- ------------------------------------------------------------------ -->
<!-- The pairs.                                                          -->
<!-- ------------------------------------------------------------------ -->

{#snippet pair(id: string, title: string, note: string, body: import('svelte').Snippet<[boolean]>, wide = false)}
	<section class="pl-sec" aria-labelledby="p3-h-{id}" data-pl-sec={id}>
		<h2 id="p3-h-{id}">{title}</h2>
		<p class="pl-note">{note}</p>
		<div class={wide ? 'pl-stack' : 'pl-pair'}>
			<div class="pl-col" class:pl-wide={wide} data-col="before">
				<h3 class="pl-colh">Before</h3>
				{@render body(false)}
			</div>
			<div class="pl-col p3-after {CLASSROOM_PLATE}" class:pl-wide={wide} data-col="after">
				<h3 class="pl-colh">After</h3>
				{@render body(true)}
			</div>
		</div>
	</section>
{/snippet}

<div class="pl-view p3-view" data-testid="plate-v3-view">
	<div class="p3-study-wrap">
		<Disclosure label="Corner study" collapseWhen={true} heading={2} testId="corner-study">
			<p class="pl-note">
				Round, bevel and three superellipses between them, each at a control's, a card's and the
				plate's scale, in the proposal's own material. A superellipse near 0 is a chamfer whose two
				ends are rounded rather than knife-sharp, which is Sci-Fi Line's "combination of two".
				Every control, card and plate on the page is a plain rounded rectangle (marked
				<em>chosen</em>); the chamfer is a detail, and where it appears on a large shape (the display
				screen's lower corners, the column tabs) it is <strong>superellipse(0.25)</strong>, marked
				<em>chamfer detail</em>.
			</p>
			<div class="pl-col p3-after {CLASSROOM_PLATE} p3-study" data-col="study">
				{#each SCALES as sc (sc.id)}
					<div class="p3-study-row" data-scale={sc.id}>
						<span class="mini-label p3-study-scale">{sc.label}</span>
						<div class="p3-study-cells">
							{#each SHAPES as sh (sh.id)}
								<figure class="p3-study-cell">
									<div class="p3-study-tile" data-shape={sh.id} data-scale={sc.id}></div>
									<figcaption class="mini-label">
										{sh.label}{#if sh.id === 'round'}
											<strong class="p3-chosen"> · chosen</strong>{:else if sh.id === 'k25' && sc.id === 'card'}
											<strong class="p3-chosen"> · chamfer detail</strong>{/if}
									</figcaption>
								</figure>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</Disclosure>
	</div>

	{@render pair(
		'buttons',
		'Buttons, chips and a switch',
		'Primary, secondary, selected, pressed, disabled and a held keyboard focus ring, then the three chips. Pressed and focus are held on so they can be compared in one look. The switch pair is new (after column only): the header’s Light control, held off and on.',
		buttonsAndChips
	)}
	{@render pair('card', 'An item card', 'The card every class list item opens into.', cardOne)}
	{@render pair(
		'fields',
		'An input and a dropdown, each in a well',
		'The dropdown is the classroom’s own .cr-select. The text input borrows the composer’s input rule, because every classroom text input is styled inside its own component.',
		fieldsOne
	)}
	{@render pair(
		'list',
		'A list with a selected row',
		'The real class list with one item open, as it reads beside the detail pane.',
		listOne
	)}
	{@render pair(
		'header',
		'The classroom header',
		'The real classroom header. The period tiles are pads and the current class is the lit one; the Light control is a switch. A header is as wide as the page, so the pair is stacked.',
		headerOnly,
		true
	)}
	{@render pair(
		'menu',
		'The class menu open over content',
		'The same header with its class menu open over a card (Classes, or Menu on a phone).',
		menuOne,
		true
	)}
	{@render pair(
		'display',
		'A dark display and a progress ring: the returned grade',
		'The returned grade sits in the display, the one dark screen on a light plate and the only place the accent glows. The progress ring is new (after column only): the same grade as a fraction.',
		display
	)}
	{@render pair(
		'region',
		'A composed page region',
		'The header, a title bar, a recessed column of six item cards and a side column, so the proposal is judged as a page and not as a parts sheet. The ring and the engraved rails are after column only.',
		region,
		true
	)}
</div>

{#snippet buttonsAndChips(after: boolean)}
	{@render buttons(after)}
	{@render chips()}
{/snippet}
{#snippet cardOne()}
	{@render card(CARDS[0], 'card')}
{/snippet}
{#snippet fieldsOne()}
	{@render fields()}
{/snippet}
{#snippet listOne()}
	{@render list()}
{/snippet}
{#snippet headerOnly()}
	{@render shell()}
{/snippet}
{#snippet menuOne()}
	{@render menuOver()}
{/snippet}

<style>
	/* THE PROPOSAL IS NOT HERE. It is ./plate-v3.css. What follows is the
	   mockup's own layout, shared by both columns, and is not part of it. It
	   repeats round 2's page layout (PlateView.svelte) so the two rounds are
	   laid out alike and compared on their material alone. */
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
	/* A card is a column whose action row sits at its foot, so the Open
	   buttons of a row of cards line up however long each body runs. */
	.pl-card {
		margin: 0;
		display: flex;
		flex-direction: column;
	}
	.pl-card > .pl-row {
		margin-top: auto;
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
	/* TODAY'S TEXT INPUT, COPIED, as round 2 copies it (ContentComposer's
	   `input` rule, plus the 44px floor): every classroom text input is styled
	   inside its own component, so a mockup outside it cannot reach it. */
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
	@media (max-width: 1179.98px) {
		.pl-stage {
			min-height: 36rem;
		}
	}
	.pl-under {
		padding: 1rem;
	}
	.p3-display-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem 1.5rem;
	}
	.p3-housing-wrap {
		flex: 1 1 16rem;
		min-width: 0;
	}
	.p3-ring-group {
		flex: none;
		justify-items: center;
	}
	.pl-region-body {
		position: relative;
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
		position: relative;
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
	/* Six cards read as two rows of three at desktop width, in both columns. */
	@media (min-width: 1024px) {
		.pl-cards {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
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
	.p3-side-ring {
		justify-self: center;
	}
	.p3-study-wrap {
		margin-top: 1.5rem;
	}
	.p3-study {
		margin-top: 0.75rem;
		display: grid;
		gap: 1.25rem;
	}
	.p3-study-row {
		display: grid;
		gap: 0.5rem;
	}
	.p3-study-cells {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem 1.25rem;
	}
	.p3-study-cell {
		margin: 0;
		display: grid;
		gap: 0.4rem;
		justify-items: start;
	}
	/* HELD STATES, as round 2 holds them: today's `.btn:active` and
	   `:focus-visible`, copied, which is what the before column must show; the
	   after column's own rules in plate-v3.css outrank these. */
	.pl-hold-active {
		transform: translateY(1px);
		box-shadow: var(--bevel-inset);
	}
	.pl-hold-focus {
		outline: 2px solid var(--cyan);
		outline-offset: 2px;
	}
</style>
