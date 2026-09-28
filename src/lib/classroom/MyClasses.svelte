<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import { sectionTitle, sortSections, emailLocal, type ClassroomSection } from '$lib/classroom/classroom';
	import { splitArchived } from '$lib/classroom/nav';
	import { recentUpdates, updateDateLabel } from '$lib/classroom/updates';
	import { formatSectionLabel } from '$lib/section-label';
	import { summaryWords, type TodoSummaries } from '$lib/classroom/todo';
	import { ICONS } from '$lib/shell/commands';
	import BadgeIcon from '$lib/tournaments/BadgeIcon.svelte';
	import { classThemeVars, classThemeWords, type ClassTheme } from '$lib/classroom/class-theme';

	/**
	 * The classroom home: one card per section the caller can see (their
	 * enrolled classes for a student, their own sections for a teacher --
	 * RLS already scoped the list, this only renders it). Presentation only,
	 * the CoinBalanceView split, so /dev/classroom mounts the same component.
	 *
	 * Cards carry the ONE shared accent (the homepage launcher's uniform --acc
	 * convention), and that accent is the HOVER-INK ROLE, never `--gold` itself
	 * (report R14, decision 40 item 1): brass on the dark themes, as before, and
	 * the green ink under Space White, where a lightness-only gold is the brown
	 * #715d22 Mr. Pina called ugly. Cards are differentiated by name and label
	 * first. A card now ALSO carries its class's own colour, and that reverses
	 * what this comment used to say ("never by a per-card color"): decision 45
	 * (report R07) gave each class a theme its students VOTE on, from a
	 * catalogue whose every colour is measured on every ground it lands on
	 * (`class-theme.ts`), so the colour is the class's own identity rather than
	 * one this page invented. It paints the card's edge and a badge beside the
	 * code, never the words, and a class nobody has voted on draws exactly the
	 * uniform card this comment described.
	 *
	 * ACTIVE CLASSES FIRST, ARCHIVED ONES UNDER ONE CLOSED DISCLOSURE (report
	 * R12): "it is difficult to differentiate between archived classes and
	 * active classes". The split is nav.ts's `splitArchived`, the same one the
	 * header's class strip reads, and the count stays on the disclosure's own
	 * line while it is closed.
	 */
	let {
		ready = true,
		isStaff = false,
		sections,
		todo = null,
		todoHref = '/classroom/todo',
		themes = {}
	}: {
		ready?: boolean;
		isStaff?: boolean;
		sections: ClassroomSection[];
		/**
		 * WHAT EACH CLASS OWES, for a student (ledger 0297): the to-do's own
		 * counts per class and across all of them, from the same rows the to-do
		 * page lists. Null (staff, or a read that failed) removes the counts and
		 * the door, rather than printing zeros nobody computed.
		 */
		todo?: TodoSummaries | null;
		todoHref?: string;
		/** Each class's voted look (decision 45), keyed by section id; absent draws the plain card. */
		themes?: Record<string, ClassTheme>;
	} = $props();

	const ordered = $derived(sortSections(sections));
	const split = $derived(splitArchived(ordered));
	const recent = recentUpdates(3);
	const totalWords = $derived(todo ? summaryWords(todo.total) : null);
</script>

{#snippet classCard(s: ClassroomSection)}
	{@const theme = themes[s.id] ?? null}
	<a
		class="class-card"
		class:archived={s.active === false}
		class:themed={!!theme}
		style={classThemeVars(theme) || undefined}
		href={`/classroom/${s.id}`}
	>
		{#if theme}
			<!-- Its own element, not the card's border: the plate draws every
			     card's edge and would repaint a border colour (measured: the
			     edge came out the plate's grey, not the class's accent). -->
			<span class="class-theme-edge" aria-hidden="true" data-testid="class-card-edge"></span>
		{/if}
		<span class="class-icon" aria-hidden="true">
			<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M16 6L3 12l13 6 13-6z" />
				<path d="M9 15v7c0 1.7 3.1 3.5 7 3.5s7-1.8 7-3.5v-7" />
				<path d="M29 12v8" />
			</svg>
		</span>
		<span class="class-text">
			<span class="class-code"
				>{#if theme && theme.badge.paths.length > 0}<span
						class="class-theme-badge"
						data-testid="class-card-badge"
						aria-hidden="true"><BadgeIcon id={theme.badge.id} size="0.95em" /></span
					>{/if}{s.course?.code ?? 'CLASS'}</span
			>
			{#if theme}<span class="sr-only">Class theme: {classThemeWords(theme)}.</span>{/if}
			<span class="class-title">{s.course?.title ?? sectionTitle(s)}</span>
			<span class="class-meta">
				{formatSectionLabel(s.label, s.block)}
				&nbsp;&middot; {emailLocal(s.teacher_email)}
			</span>
		</span>
		{#if todo?.bySection[s.id]}
			{@const words = summaryWords(todo.bySection[s.id])}
			{#if words.missing || words.dueThisWeek}
				<!-- Zero is no news, so a class with nothing owed says nothing. -->
				<span class="class-owed" data-testid="class-owed">
					{#if words.missing}
						<span class="owed owed-missing">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.missing} /></svg>
							{words.missing}
						</span>
					{/if}
					{#if words.dueThisWeek}
						<span class="owed">{words.dueThisWeek}</span>
					{/if}
				</span>
			{/if}
		{/if}
		<span class="class-cta">Open &#9656;</span>
	</a>
{/snippet}

<svelte:head>
	<title>Classroom // IDEA</title>
</svelte:head>

<!--
	NO MASTHEAD HERE. Every /classroom page renders inside the persistent shell
	(src/routes/classroom/+layout.svelte), which owns the logo, the section
	switcher and the trail back up -- so a page can no longer disagree with its
	neighbours about how you leave it.
-->
<main class="classroom-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Classroom</div>
		<h1>My Classes</h1>
		<p class="lead">
			Announcements and classwork for every class you are enrolled in, in one place.
		</p>
		{#if isStaff}
			<p class="staff-line">
				<a class="btn secondary" href="/classroom/admin">Courses &amp; setup</a>
			</p>
		{/if}
		{#if todo && totalWords}
			<!-- The door to everything owed across these classes, with the two
			     numbers that ask for something now. -->
			<p class="staff-line">
				<a class="todo-link" href={todoHref} data-testid="my-classes-todo">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.checklist} /></svg>
					<span class="todo-link-word">To-do</span>
					{#if totalWords.missing}
						<span class="owed owed-missing">
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.missing} /></svg>
							{totalWords.missing}
						</span>
					{/if}
					{#if totalWords.dueThisWeek}
						<span class="owed">{totalWords.dueThisWeek}</span>
					{/if}
				</a>
			</p>
		{/if}
	</section>

	{#if !ready}
		<section class="card">
			<p class="feedback error">
				Classroom is not available yet -- migration 0082 does not appear to be applied. Check back
				later.
			</p>
		</section>
	{:else if ordered.length === 0}
		<section class="card empty-card">
			{#if isStaff}
				<h2>No sections yet</h2>
				<p class="note">
					You have no sections yet. Head to <a href="/classroom/admin">Courses &amp; setup</a> to
					create your courses and sections; each class's roster is then on its own People tab.
				</p>
			{:else}
				<h2>No classes yet</h2>
				<p class="note">
					You are not enrolled in any classes yet. Your teacher adds the roster at the start of
					the year -- once that happens, your classes show up here automatically. Nothing for you
					to do.
				</p>
			{/if}
		</section>
	{:else}
		{#if split.active.length}
			<div class="class-grid" data-testid="my-classes-active">
				{#each split.active as s (s.id)}{@render classCard(s)}{/each}
			</div>
		{:else}
			<!-- Every class this person has is archived: say so, rather than an
			     empty space above a closed Archived line. -->
			<p class="note" data-testid="my-classes-none-active">
				None of your classes is running right now. Past classes are under Archived below.
			</p>
		{/if}
		{#if split.archived.length}
			<section class="archived-classes" data-testid="my-classes-archived">
				<Disclosure
					label="Archived"
					heading={2}
					collapseWhen={true}
					scope="classroom-home-archived"
					testId="my-classes-archived-toggle"
				>
					{#snippet meta()}
						<span data-testid="my-classes-archived-count"
							>{split.archived.length} {split.archived.length === 1 ? 'class' : 'classes'}</span
						>
					{/snippet}
					<p class="note archived-note">
						Archived classes keep every post, grade and hand-in, and can be brought back.
					</p>
					<div class="class-grid">
						{#each split.archived as s (s.id)}{@render classCard(s)}{/each}
					</div>
				</Disclosure>
			</section>
		{/if}
	{/if}

	<!-- What changed lately, in plain language. The full log is its own page;
	     three entries here is a nudge, not a second changelog. -->
	<section class="card updates-card">
		<div class="updates-head">
			<h2>What's new</h2>
			<a class="updates-all" href="/classroom/updates">All updates &#9656;</a>
		</div>
		<ul class="updates-list">
			{#each recent as u (u.date + u.title)}
				<li>
					<span class="update-when">{updateDateLabel(u.date)}</span>
					<span class="update-title">{u.title}</span>
				</li>
			{/each}
		</ul>
	</section>

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	.updates-card {
		margin-top: 1.4rem;
	}
	.updates-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.updates-head h2 {
		margin: 0;
		font-size: 1rem;
	}
	.updates-all {
		/* 17.9px measured, on the student home page. 44px floor (IDEA_INTERFACE_STANDARDS 10). */
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--hover-ink);
		text-decoration: none;
	}
	.updates-list {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.updates-list li {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.update-when {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--cyan);
		white-space: nowrap;
	}
	.update-title {
		font-size: 0.9rem;
	}
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-page));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}
	.staff-line {
		margin: 0.8rem 0 0;
	}
	.empty-card h2 {
		margin-top: 0;
	}
	.note {
		color: var(--text-2);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.note a {
		color: var(--hover-ink);
	}
	/* `auto-fit`, NOT `auto-fill`: a student in two classes must not be handed
	   two cards and an empty track beside them. Empty tracks collapse and the
	   sections that exist share the measure -- the same decision ClassView's
	   stream, the grading console's roster and the Foundry gallery each already
	   made, and the rule CLAUDE.md states. Measured at 1440 before the change:
	   two sections laid out in three tracks and left 303.5px of void.

	   `min(16rem, 100%)` keeps the track from overflowing a viewport narrower
	   than one column. */
	.class-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
		gap: 0.9rem;
	}
	/* Uniform accent (the launcher's shared --acc convention): every card
	   identical chrome, never a per-card color. The HOVER-INK ROLE rather than
	   --gold (report R14): brass on the dark themes, the green ink on Space
	   White, where gold is the brown #715d22. It paints the icon, the code and
	   Open, all words and glyphs. */
	.class-card {
		--acc: var(--hover-ink);
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 1rem 1.05rem 0.9rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		text-decoration: none;
		color: var(--text-1);
		transition:
			border-color 0.15s ease,
			transform 0.1s ease;
	}
	/* The edge under the pointer reads the hover role token directly (ledger
	   0298, decision 40 item 1); --acc is the same role now (report R14), so
	   the two cannot disagree. Brass on the dark themes, as before. */
	.class-card:hover {
		border-color: var(--hover-ink);
	}
	.class-card:active {
		transform: translateY(1px);
	}
	/* An archived card keeps the strip's dashed edge (ClassroomShell's
	   `.cls-icon.archived`), a shape as well as the section it sits in. */
	.class-card.archived {
		border-style: dashed;
	}
	/* A THEMED CARD (decision 45): the section's accent, or its palette's edge
	   when the teacher set none, as a thick left edge -- a graphical object,
	   measured at 3:1 on the card faces in class-theme.ts -- and the badge in
	   front of the code in the card's own ink. The words are untouched. */
	.class-card.themed {
		--ct-a: var(--ct-accent, var(--ct-edge));
		position: relative;
	}
	.class-theme-edge {
		position: absolute;
		left: 0;
		top: 0.7rem;
		bottom: 0.7rem;
		width: 5px;
		border-radius: 0 3px 3px 0;
		background: var(--ct-a);
		pointer-events: none;
	}
	:global(:root[data-theme='space-white']) .class-card.themed {
		--ct-a: var(--ct-accent-light, var(--ct-edge-light));
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
	.class-theme-badge {
		display: inline-flex;
		vertical-align: -0.12em;
		margin-right: 0.3em;
		color: var(--text-1);
	}
	.archived-classes {
		margin-top: 1.4rem;
	}
	.archived-note {
		margin: 0 0 0.8rem;
	}
	.class-icon {
		width: 2.2rem;
		height: 2.2rem;
		display: grid;
		place-items: center;
		color: var(--acc);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		background: var(--surface-2);
	}
	.class-icon svg {
		width: 1.5rem;
		height: 1.5rem;
	}
	.class-text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.class-code {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		color: var(--acc);
	}
	.class-title {
		font-weight: 700;
		font-size: 1.05rem;
		line-height: 1.25;
	}
	.class-meta {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	/* WHAT A CLASS OWES (ledger 0297): words, not a bare number, and the
	   missing count wears the missing tone with its mark beside it. */
	.class-owed {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.owed {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		padding: 0.12rem 0.5rem;
		border: 1px solid var(--cyan);
		border-radius: 999px;
		color: var(--cyan);
		white-space: nowrap;
	}
	.owed svg {
		width: 11px;
		height: 11px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.owed-missing {
		color: var(--amber);
		border-color: var(--amber);
		background: color-mix(in srgb, var(--amber) 14%, transparent);
		font-weight: 700;
	}
	/* The door: the header tools' look, 44px, a glyph and a word before the
	   counts. */
	.todo-link {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.45rem;
		min-height: 44px;
		padding: 0.35rem 0.8rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		text-decoration: none;
	}
	.todo-link:hover {
		border-color: var(--hover-ink);
	}
	.todo-link > svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
		color: var(--text-2);
	}
	.todo-link-word {
		font-weight: 600;
	}
	.class-cta {
		margin-top: auto;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--acc);
	}
	.page-footer {
		margin-top: var(--space-6);
		display: flex;
		justify-content: center;
	}
</style>
