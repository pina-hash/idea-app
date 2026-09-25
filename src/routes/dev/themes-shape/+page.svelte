<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import '$lib/classroom/classroom.css';
	import './shape.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import type { ClassroomSection } from '$lib/classroom/classroom';
	import { SITE_THEMES, setSiteTheme, siteTheme, type SiteTheme } from '$lib/theme.svelte';

	/**
	 * A MOCKUP OF THE SPACE WHITE SHAPE LANGUAGE (decision 40 item 4). See
	 * +page.ts for what it is and is not. What follows is the page's own
	 * reasoning, which is also the proposal's.
	 *
	 * ONE SET OF ELEMENTS, TWO RULESETS. Every specimen is written once, as a
	 * snippet, and rendered in both columns; the "after" column is a wrapper that
	 * redefines the SHAPE TOKENS and nothing else. So a difference between the
	 * columns can only come from the tokens, and the "before" column is today's
	 * shipping CSS by construction (the global `.btn` and `.card`, the classroom
	 * chips, the real `ClassroomShell`).
	 *
	 * THE CHAMFER IS `corner-shape: bevel`, NOT A `clip-path`, AND THE LAST
	 * SECTION OF THIS PAGE IS WHY. `clip-path` is the idiom of the logo window
	 * and the home stats plate, and it clips everything outside the polygon --
	 * the element's own focus outline included, and the border along the cut.
	 * `corner-shape` is a real border shape: the border, the background, the
	 * shadow and the focus outline all follow the bevel. A browser without it
	 * (Safari and Firefox as of this writing) ignores the declaration, and the
	 * tokens are declared inside `@supports (corner-shape: bevel)`, so such a
	 * browser renders exactly today's look rather than a half-applied one.
	 *
	 * THE CLASSROOM HEADER READS `--radius-card` FOR ITS CONTROLS, and that is
	 * a pre-existing inconsistency this mockup works around rather than fixes:
	 * inside the header the after wrapper points `--radius-card` at
	 * `--radius-control`, so a 44px tool takes the control cut and not the
	 * card's. Adopting this would move those rules to `--radius-control`.
	 */

	/* Three classes, so the header's class strip has something to shape. */
	const SECTIONS: ClassroomSection[] = [
		{
			id: 's-1',
			course_id: 'c-1',
			label: 'Period 1',
			block: 'P1',
			teacher_email: 'teacher@boscotech.edu',
			active: true,
			course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
		},
		{
			id: 's-2',
			course_id: 'c-2',
			label: 'Period 3',
			block: 'P3',
			teacher_email: 'teacher@boscotech.edu',
			active: true,
			course: { id: 'c-2', code: 'IDEA100', title: 'Introduction to Design', active: true }
		},
		{
			id: 's-3',
			course_id: 'c-3',
			label: 'Period 5',
			block: 'P5',
			teacher_email: 'teacher@boscotech.edu',
			active: true,
			course: { id: 'c-3', code: 'IDEA310', title: 'Engineering Design Studio', active: true }
		}
	];

	/**
	 * TWO CUT STYLES, ONE TOKEN SET EACH, so the decision is between two real
	 * renderings rather than a description. `two` cuts the top-left and
	 * bottom-right corners (a console tab); `four` cuts every corner (the
	 * octagon of the emblem plate and the stats plate). The default is `two`,
	 * the recommendation; `?cut=four` or the toggle shows the other.
	 */
	type Cut = 'two' | 'four';
	const CUTS: { id: Cut; label: string }[] = [
		{ id: 'two', label: 'Two corners' },
		{ id: 'four', label: 'Four corners' }
	];
	let cutChoice = $state<Cut | null>(null);
	const cut = $derived<Cut>(cutChoice ?? (page.url.searchParams.get('cut') === 'four' ? 'four' : 'two'));

	const current = $derived(siteTheme());

	/* `?state=<id>` starts the page on a theme through the SHIPPING call, as
	   /dev/themes does. `setSiteTheme` writes the very `$state` `siteTheme()`
	   reads, so the call is untracked and the URL, the input this effect
	   re-runs on, is read tracked above it. */
	$effect(() => {
		const want = page.url.searchParams.get('state');
		if (!want || !SITE_THEMES.includes(want as SiteTheme)) return;
		untrack(() => {
			if (siteTheme() !== want) setSiteTheme(want as SiteTheme);
		});
	});

	/** The proposed tokens, stated once for the table at the foot of the page. */
	const TOKENS: { name: string; two: string; four: string; today: string; note: string }[] = [
		{ name: '--shape-corner', two: 'bevel square', four: 'bevel', today: '(unset: round)', note: 'the corner-shape every shaped rule reads' },
		{ name: '--radius-control', two: '8px', four: '6px', today: '3px', note: 'buttons, inputs, header tools' },
		{ name: '--radius-card', two: '12px', four: '10px', today: '4px', note: 'cards, panels, menus' },
		{ name: '--shape-chip', two: 'bevel', four: 'bevel', today: '(unset: round)', note: 'chips: a hexagonal tag, never a slant' },
		{ name: '--surface-glass', two: 'surface-1 at 82%', four: 'surface-1 at 82%', today: '(none)', note: 'floating surfaces only, solid fallback' },
		{ name: '--glass-filter', two: 'blur(12px) saturate(1.2)', four: 'blur(12px) saturate(1.2)', today: '(none)', note: 'behind @supports and reduced transparency' }
	];
</script>

<svelte:head><title>Shape language mockup</title></svelte:head>

{#snippet controls()}
	<div class="ts-row">
		<button type="button" class="btn" data-ts="btn-primary">Turn in</button>
		<button type="button" class="btn secondary" data-ts="btn-secondary">Save draft</button>
	</div>
	<div class="ts-row">
		<span class="draft-chip" data-ts="chip-status">Draft</span>
		<span class="kind-chip" data-ts="chip-kind">Assignment</span>
	</div>
{/snippet}

{#snippet card()}
	<article class="card ts-card" data-ts="card">
		<span class="mini-label" data-ts="card-label">UNIT 3 &middot; DUE FRI 3:00 PM</span>
		<h4 class="ts-card-title" data-ts="card-title">Bracket redesign, test report</h4>
		<p class="ts-card-body" data-ts="card-body">
			Load the printed bracket until it fails, photograph the break, and explain in two sentences
			why it broke where it did.
		</p>
		<div class="ts-row">
			<button type="button" class="btn secondary" data-ts="card-btn">Open</button>
			<span class="kind-chip" data-ts="card-chip">Assignment</span>
		</div>
	</article>
{/snippet}

{#snippet shell()}
	<ClassroomShell
		sections={SECTIONS}
		currentSectionId="s-1"
		crumbs={[]}
		tabs={[]}
		tab={null}
		canManage={true}
		isStaff={true}
		isAdmin={false}
		todoHref="#todo"
	>
		<span class="ts-shell-end" aria-hidden="true"></span>
	</ClassroomShell>
{/snippet}

<!-- The room wrapper is the page's own root, the way a classroom route's is:
     `body:has(.cr-root)` has to see it for the room's canvas rule to apply. -->
<div class="cr-root ts-root" data-testid="shape-root" data-theme-now={current}>
	<main class="ts-page">
		<header class="ts-hero">
			<h1>Space White shape language: before and after</h1>
			<p class="ts-lead">
				A mockup for a decision, not a change: nothing on this page reaches a real page. The
				left or top of each pair is today's Space White. The right or bottom is the same element
				with the proposed shape tokens. The glass section is the proposed frosted surface for
				menus and anything that floats over content.
			</p>
			<div class="ts-bar">
				<span class="ts-theme" data-testid="shape-theme">
					Theme now: <strong>{current}</strong>
				</span>
				{#if current !== 'space-white'}
					<button type="button" class="ts-seg" onclick={() => setSiteTheme('space-white')}
						>Show Space White</button
					>
				{/if}
				<div class="ts-cut" role="group" aria-label="Cut style">
					{#each CUTS as c (c.id)}
						<button
							type="button"
							class="ts-seg"
							aria-pressed={cut === c.id}
							data-cut-set={c.id}
							onclick={() => (cutChoice = c.id)}>{c.label}</button
						>
					{/each}
				</div>
			</div>
		</header>

		<section class="ts-sec" aria-labelledby="ts-h-controls">
			<h2 id="ts-h-controls">Buttons and chips</h2>
			<div class="ts-pair">
				<div class="ts-col" data-col="before">
					<h3 class="ts-colh">Before</h3>
					{@render controls()}
				</div>
				<div class="ts-col ts-after" data-col="after" data-cut={cut}>
					<h3 class="ts-colh">After</h3>
					{@render controls()}
				</div>
			</div>
		</section>

		<section class="ts-sec" aria-labelledby="ts-h-card">
			<h2 id="ts-h-card">A card</h2>
			<div class="ts-pair">
				<div class="ts-col" data-col="before">
					<h3 class="ts-colh">Before</h3>
					{@render card()}
				</div>
				<div class="ts-col ts-after" data-col="after" data-cut={cut}>
					<h3 class="ts-colh">After</h3>
					{@render card()}
				</div>
			</div>
		</section>

		<section class="ts-sec" aria-labelledby="ts-h-header">
			<h2 id="ts-h-header">The classroom header</h2>
			<p class="ts-note">
				The real classroom header, twice. A header is as wide as the page, so the pair is stacked
				rather than side by side.
			</p>
			<div class="ts-stack">
				<div class="ts-col ts-wide" data-col="before">
					<h3 class="ts-colh">Before</h3>
					{@render shell()}
				</div>
				<div class="ts-col ts-wide ts-after" data-col="after" data-cut={cut}>
					<h3 class="ts-colh">After</h3>
					{@render shell()}
				</div>
			</div>
		</section>

		<section class="ts-sec" aria-labelledby="ts-h-glass">
			<h2 id="ts-h-glass">Glass</h2>
			<p class="ts-note">
				The after header held at the top of a scrolling region with work scrolled underneath it,
				and the class menu open over that work. Open <em>Classes</em> to see the menu. The
				classroom header does not stay at the top of the page today, so on a real page glass
				would only show on menus and panels that open over content.
			</p>
			<div class="ts-col ts-wide ts-after ts-glass" data-col="glass" data-cut={cut}>
				<div class="ts-stage" data-testid="glass-stage">
					<ClassroomShell
						sections={SECTIONS}
						currentSectionId="s-1"
						crumbs={[]}
						tabs={[]}
						tab={null}
						canManage={true}
						isStaff={true}
						isAdmin={false}
						todoHref="#todo"
					>
						<div class="ts-under" data-testid="glass-under">
							<div class="ts-under-dark nb-island" data-ts="under-dark">
								<span>Slide 4 of 12</span>
								<strong>Loads, supports and the free-body diagram</strong>
							</div>
							<div class="ts-under-field" data-ts="under-field"></div>
							<p class="ts-under-text">
								Every force on the bracket is drawn as an arrow from the point where it acts. The
								support at the wall pushes back with exactly the load it carries, and the bolt
								holds the moment.
							</p>
							{@render card()}
							{@render card()}
						</div>
					</ClassroomShell>
				</div>
			</div>
		</section>

		<section class="ts-sec" aria-labelledby="ts-h-build">
			<h2 id="ts-h-build">Why a real corner shape and not a clip</h2>
			<p class="ts-note">
				The same button built two ways, each showing its keyboard focus ring. A clip cuts the
				focus ring off completely, and it cuts the border along the diagonal too. A real corner
				shape keeps both.
			</p>
			<div class="ts-pair">
				<div class="ts-col" data-col="clip">
					<h3 class="ts-colh">Clipped (the logo window's method)</h3>
					<div class="ts-row">
						<button type="button" class="btn secondary ts-clip ts-demo-focus" data-ts="build-clip"
							>Save draft</button
						>
					</div>
				</div>
				<div class="ts-col ts-after" data-col="bevel" data-cut={cut}>
					<h3 class="ts-colh">Corner shape (proposed)</h3>
					<div class="ts-row">
						<button type="button" class="btn secondary ts-demo-focus" data-ts="build-bevel"
							>Save draft</button
						>
					</div>
				</div>
			</div>
		</section>

		<section class="ts-sec" aria-labelledby="ts-h-tokens">
			<h2 id="ts-h-tokens">The proposed tokens</h2>
			<p class="ts-note">
				Declared on Space White only, inside a check that the browser can draw a real corner shape.
				The dark themes never see them.
			</p>
			<div class="ts-tablewrap">
				<table class="ts-table" data-testid="token-table">
					<thead>
						<tr><th>Token</th><th>Two corners</th><th>Four corners</th><th>Today</th><th>For</th></tr>
					</thead>
					<tbody>
						{#each TOKENS as t (t.name)}
							<tr>
								<td><code>{t.name}</code></td>
								<td>{t.two}</td>
								<td>{t.four}</td>
								<td>{t.today}</td>
								<td>{t.note}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</main>
</div>

<style>
	/* THE PROPOSAL IS NOT HERE. It is ./shape.css, the one stylesheet a
	   decision would move into space-white.css; what follows is the mockup's
	   own layout and is not part of it. */
	.ts-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1.5rem 16px 4rem;
	}
	h1 {
		font-size: 1.3rem;
		color: var(--text-1);
		margin: 0;
	}
	.ts-lead,
	.ts-note {
		color: var(--text-2);
		max-width: 46rem;
		line-height: 1.5;
		margin: 0.5rem 0 0;
	}
	.ts-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem 1rem;
		margin-top: 1rem;
	}
	.ts-theme {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.ts-theme strong {
		color: var(--text-1);
	}
	.ts-cut {
		display: inline-flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.ts-seg {
		min-height: 44px;
		padding: 0 0.9rem;
		background: var(--surface-1);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.ts-seg[aria-pressed='true'] {
		border-color: var(--green);
		color: var(--green);
		background: var(--surface-2);
	}
	.ts-sec {
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
	.ts-pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
		gap: 1rem;
		margin-top: 0.75rem;
	}
	.ts-stack {
		display: grid;
		gap: 1rem;
		margin-top: 0.75rem;
	}
	.ts-col {
		min-width: 0;
		padding: 0.9rem 1rem 1.1rem;
		background: var(--surface-0);
		border: 1px solid var(--hairline);
	}
	.ts-wide {
		padding: 0.9rem 0 0;
	}
	.ts-wide > .ts-colh {
		padding: 0 1rem;
	}
	.ts-colh {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-2);
		margin: 0 0 0.75rem;
	}
	.ts-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.6rem;
	}
	.ts-card {
		margin: 0;
	}
	.ts-card-title {
		font-size: 1.1rem;
		color: var(--text-1);
		margin: 0.35rem 0 0.4rem;
	}
	.ts-card-body {
		color: var(--text-1);
		line-height: 1.5;
		margin: 0;
	}
	.ts-shell-end {
		display: block;
		height: 0.75rem;
	}
	.ts-stage {
		position: relative;
		height: 30rem;
		overflow: auto;
		background: var(--surface-0);
	}
	/* The header is held at the top of the stage so work scrolls under it. */
	.ts-stage :global(.cr-header) {
		position: sticky;
		top: 0;
	}
	.ts-under {
		display: grid;
		gap: 1rem;
		padding: 1rem;
	}
	/* A DARK ISLAND UNDER THE GLASS is the worst ground a real page can put
	   there: a projected deck and the IdeaCAD viewport stay dark on Space
	   White. It wears `.nb-island`, so space-white.css restores the dark
	   palette inside it exactly as it does for the photo overlays, and it is
	   the case the glass tint is sized against. */
	.ts-under-dark {
		display: grid;
		gap: 0.3rem;
		min-height: 9rem;
		padding: 1rem;
		background: var(--bg0);
		color: var(--white);
	}
	.ts-under-dark span {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.ts-under-dark strong {
		font-size: 1.4rem;
	}
	.ts-under-field {
		height: 4rem;
		background: var(--accent-field, var(--green));
	}
	.ts-under-text {
		color: var(--text-1);
		line-height: 1.5;
		margin: 0;
	}
	.ts-tablewrap {
		overflow-x: auto;
		margin-top: 0.75rem;
	}
	.ts-table {
		border-collapse: collapse;
		font-size: 0.9rem;
		color: var(--text-1);
		min-width: 36rem;
	}
	.ts-table th,
	.ts-table td {
		text-align: left;
		padding: 0.4rem 0.7rem;
		border-bottom: 1px solid var(--hairline);
	}
	.ts-table th {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.ts-table code {
		font-family: var(--font-mono);
		color: var(--text-1);
	}
</style>
