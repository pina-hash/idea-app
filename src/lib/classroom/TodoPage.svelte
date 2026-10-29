<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import { ICONS } from '$lib/shell/commands';
	import PostThumbnail from '$lib/classroom/PostThumbnail.svelte';
	import { hasThumbnailMedia } from '$lib/classroom/thumbnail';
	import { classroomPreferences, reactivePreferences } from '$lib/preferences/context';
	import { sectionTitle, type ClassroomItem, type ClassroomSection } from '$lib/classroom/classroom';
	import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
	import type { FeedSubmission } from '$lib/classroom/feed';
	import {
		TODO_VIEWS,
		TODO_VIEW_LABELS,
		buildTodo,
		rowsForClass,
		todoGroups,
		todoColumns,
		todoSections,
		todoViewCounts,
		todoWhen,
		type TodoView
	} from '$lib/classroom/todo';

	/**
	 * A STUDENT'S TO-DO ACROSS EVERY CLASS (ledger 0297): what is assigned, what
	 * is missing and what is done, one place, from any classroom page.
	 *
	 * Presentation only (the MyClasses convention): the route hands down the
	 * shared owed-work read (`$lib/classroom/student-work`) and this component
	 * classifies it through `$lib/classroom/todo`, so /dev/classroom-todo mounts
	 * the identical thing with fixture rows and no Supabase. Nothing here decides
	 * a standing; every word on a row is the one the class page prints.
	 *
	 * THE VIEW AND THE CLASS ARE THE URL'S, NOT A PREFERENCE. A door that opens
	 * this page on Missing for one class says so in its link
	 * (`?view=missing&class=<id>`); the route reads them once and a press here
	 * reports the change through `onstatechange`, which the route writes back to
	 * the address bar without a navigation. A choice is never stored: the next
	 * visit opens on Assigned, which is where new work lands.
	 */
	let {
		ready = true,
		sections,
		items,
		submissions,
		checkIns = [],
		myEmail,
		isAdmin = false,
		clock,
		basePath = '/classroom',
		view: initialView = 'assigned',
		classId: initialClass = null,
		onstatechange = null
	}: {
		ready?: boolean;
		sections: ClassroomSection[];
		items: ClassroomItem[];
		submissions: FeedSubmission[];
		checkIns?: ClassCheckIn[];
		myEmail: string;
		isAdmin?: boolean;
		/** The loader's one clock read; nothing on this page reads another. */
		clock: { now: string; today: string };
		basePath?: string;
		view?: TodoView;
		classId?: string | null;
		onstatechange?: ((view: TodoView, classId: string | null) => void) | null;
	} = $props();

	/* A post's own thumbnail (ledger 0396) stands in for the row's glyph, the
	   home feed's rule: a post with nothing set keeps the glyph exactly as it
	   was, so the list only changes where a teacher or a document gave it one. */
	const itemById = $derived(new Map(items.map((i) => [i.id, i])));
	/* A person who chose Off in Display settings sees no pictures here either:
	   the to-do list is a list of the same posts, read from the same store the
	   class page reads (no store, as in a harness that provides none, is the
	   default, which shows them). */
	const prefStore = classroomPreferences();
	const prefs = prefStore ? reactivePreferences(prefStore) : null;
	const thumbsOff = $derived(prefs?.current.display.thumbShape === 'off');
	const thumbFor = (key: string) => {
		if (thumbsOff) return null;
		const item = key.startsWith('item:') ? itemById.get(key.slice(5)) : undefined;
		return item && hasThumbnailMedia(item) ? item : null;
	};

	/* A press overrides what the route opened on; until then the route's answer
	   stands, so a door followed while the page is open is honoured too. */
	let chosenView = $state<TodoView | null>(null);
	let chosenClass = $state<{ id: string | null } | null>(null);
	const view = $derived(chosenView ?? initialView);
	const classes = $derived(todoSections(sections, myEmail, isAdmin));
	/* A class id that is not one of this student's classes reads as all classes,
	   never as an empty page with a filter nobody can see. */
	const classId = $derived.by(() => {
		const want = chosenClass ? chosenClass.id : initialClass;
		return want && classes.some((s) => s.id === want) ? want : null;
	});

	const rows = $derived(buildTodo({ sections, items, submissions, checkIns, myEmail, isAdmin, clock, basePath }));
	const shown = $derived(rowsForClass(rows, classId));
	const counts = $derived(todoViewCounts(shown));
	const groups = $derived(todoGroups(shown, view, clock.today));

	const VIEW_ICON: Record<TodoView, string> = {
		assigned: ICONS.todo,
		missing: ICONS.missing,
		done: ICONS.done
	};
	const EMPTY: Record<TodoView, string> = {
		assigned: 'Nothing assigned right now.',
		missing: 'Nothing missing.',
		done: 'Nothing turned in yet.'
	};

	function chooseView(next: TodoView) {
		chosenView = next;
		onstatechange?.(next, classId);
	}
	function chooseClass(next: string) {
		chosenClass = { id: next || null };
		onstatechange?.(view, next || null);
	}
</script>

<svelte:head>
	<title>To-do · Classroom · IDEA</title>
</svelte:head>

<main class="classroom-page todo-page" data-testid="todo-page">
	<header class="todo-head">
		<h1>To-do</h1>
		<div class="todo-controls">
			<div class="todo-views" role="group" aria-label="Show">
				{#each TODO_VIEWS as v (v)}
					<button
						type="button"
						class="todo-view"
						class:has-missing={v === 'missing' && counts.missing > 0}
						aria-pressed={view === v}
						data-testid="todo-view-{v}"
						onclick={() => chooseView(v)}
					>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d={VIEW_ICON[v]} /></svg>
						<span class="todo-view-word">{TODO_VIEW_LABELS[v]}</span>
						<span class="todo-view-count" data-testid="todo-count-{v}">{counts[v]}</span>
					</button>
				{/each}
			</div>
			{#if classes.length > 1}
				<label class="todo-class">
					<span class="todo-class-word">Class</span>
					<select
						value={classId ?? ''}
						data-testid="todo-class"
						onchange={(e) => chooseClass((e.currentTarget as HTMLSelectElement).value)}
					>
						<option value="">All classes</option>
						{#each classes as s (s.id)}
							<option value={s.id}>{sectionTitle(s)}</option>
						{/each}
					</select>
				</label>
			{/if}
		</div>
	</header>

	{#if !ready}
		<section class="card">
			<p class="note">Classroom is not available yet.</p>
		</section>
	{:else if !classes.length}
		<section class="card">
			<p class="note">You are not in any classes yet.</p>
		</section>
	{:else if !groups.length}
		<p class="todo-none" data-testid="todo-empty">{EMPTY[view]}</p>
	{:else}
		<!--
			THE GROUPS SHARE THE WIDTH IN COLUMNS (the ClassView rule, and
			CLAUDE.md's: panels of unequal height side by side are a multi-column
			container, never a grid, or a long "This week" kills the column beside
			it). The count is `todoColumns`: the columns the groups can actually
			fill, so a tall group beside two short ones never leaves a third column
			standing empty. Reading order is column-major, which is the order the
			groups are in.
		-->
		<div class="todo-groups" style="--todo-cols: {todoColumns(groups)}">
			{#each groups as g (g.id)}
				<section class="todo-group" data-testid="todo-group" data-group={g.id} aria-labelledby="todo-g-{g.id}">
					<h2 class="todo-group-head" id="todo-g-{g.id}">
						<span class="todo-group-label">{g.label}</span>
						<span class="todo-group-count">{g.rows.length}</span>
					</h2>
					<ul class="todo-rows">
						{#each g.rows as row (row.key)}
							<li>
								<a
									class="todo-row"
									href={row.href}
									data-testid="todo-row"
									data-key={row.key}
									data-tone={row.tone}
								>
									{#if thumbFor(row.key)}
										<!-- `passive`: the row is the link, so the click is the row's. -->
										<span class="todo-thumb" data-testid="todo-thumb">
											<PostThumbnail item={thumbFor(row.key)!} shape="tile" glyph="assignment" label={row.title} passive />
										</span>
									{:else}
										<svg class="todo-glyph" viewBox="0 0 24 24" aria-hidden="true">
											<path d={row.kind === 'check-in' ? ICONS.notebook : ICONS.assignment} />
										</svg>
									{/if}
									<span class="todo-text">
										<span class="todo-title">{row.title}</span>
										<span class="todo-meta">
											<!-- The course code and the class's own label: how a student
											     names their class, without the block, which is scheduling. -->
											<span class="todo-meta-bit todo-class-name"
												>{row.section.course?.code ?? 'Class'}&nbsp;{row.section.label}</span
											>
											{#if row.kind === 'check-in'}
												<span class="todo-meta-bit"
													><span class="todo-sep" aria-hidden="true">&middot;</span>&nbsp;Notebook check-in</span
												>
											{/if}
											<span class="todo-meta-bit" data-testid="todo-when"
												><span class="todo-sep" aria-hidden="true">&middot;</span>&nbsp;{todoWhen(
													row,
													clock.today
												)}</span
											>
										</span>
									</span>
									<span class="todo-state">
										<StatusChip tone={row.tone} glyph={row.glyph} label={row.state} data-testid="todo-state" />
										{#if row.feedbackUnread && g.id !== 'feedback'}
											<span class="todo-flag" data-testid="todo-feedback-flag">Feedback to read</span>
										{/if}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	/* THE MEASURE IS THE SPLIT'S. `classroomMeasure` answers `split` for this
	   place, so the shell's trail sits on the same line as the groups under
	   it; the fallback is what a mount with no route layout gets. */
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-split));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}
	.todo-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3) var(--space-4);
		margin: 0 0 var(--space-4);
	}
	.todo-head h1 {
		margin: 0;
		font-size: var(--fs-xl);
		line-height: 1.2;
	}
	.todo-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}
	.todo-views {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		min-width: 0;
	}
	/* 44px, a glyph AND a word AND the count, and the pressed one carries a
	   rule as well as a fill so colour is never what says which is on. */
	.todo-view {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		padding: 0 0.8rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font: inherit;
		font-size: var(--fs-sm);
		cursor: pointer;
	}
	.todo-view:hover {
		border-color: var(--hover-ink);
	}
	.todo-view[aria-pressed='true'] {
		background: var(--surface-2);
		border-color: var(--green);
		box-shadow: inset 0 -3px 0 var(--green);
	}
	.todo-view svg {
		flex: none;
		width: 17px;
		height: 17px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
		color: var(--text-2);
	}
	.todo-view-count {
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		min-width: 1.4em;
		padding: 0.05rem 0.35rem;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		text-align: center;
		color: var(--text-2);
	}
	/* Missing work waiting is the one count that asks for something, so it
	   takes the missing tone: the glyph and the count both, never the fill. */
	.todo-view.has-missing svg,
	.todo-view.has-missing .todo-view-count {
		color: var(--amber);
		border-color: var(--amber);
	}
	.todo-class {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}
	.todo-class-word {
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.todo-class select {
		min-height: 44px;
		min-width: 0;
		max-width: 100%;
		padding: 0 0.6rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font: inherit;
		font-size: var(--fs-sm);
	}
	.todo-none {
		margin: var(--space-5) 0;
		color: var(--text-2);
		font-size: var(--fs-base);
	}
	.note {
		color: var(--text-2);
	}

	.todo-groups {
		columns: 22rem var(--todo-cols, 3);
		column-gap: var(--space-4);
	}
	/* THE ROW GAP IS A MARGIN ON THE PANEL: multicol has no row gap. A group
	   is its own inline-size container, so a group given the whole width (one
	   group, or two) flows its own rows into columns instead of stretching a
	   title and its chip 1300px apart. */
	.todo-group {
		container-type: inline-size;
		break-inside: avoid;
		margin: 0 0 var(--space-4);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		overflow: hidden;
	}
	.todo-group-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
		margin: 0;
		padding: 0.65rem 0.9rem 0.55rem;
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
		border-bottom: 1px solid var(--hairline);
	}
	.todo-group-count {
		color: var(--text-2);
	}
	.todo-rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.todo-rows li + li {
		border-top: 1px solid var(--boundary);
	}
	.todo-rows li {
		break-inside: avoid;
	}
	/* Two row columns from 44rem of group width: measured, the group is 1376px
	   alone at 1440 and 680px as one of two, so this takes the lone group and
	   leaves a paired one a single column of rows. */
	@container (min-width: 44rem) {
		.todo-rows {
			columns: 20rem 3;
			column-gap: 0;
			column-rule: 1px solid var(--hairline);
		}
	}
	/* THE ROW IS THE LINK, and it is at least 44px tall at every width. The
	   state sits beside the title where there is room and wraps under it where
	   there is not, never over it. */
	.todo-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.3rem 0.7rem;
		min-height: 44px;
		padding: 0.6rem 0.9rem;
		color: var(--text-1);
		text-decoration: none;
	}
	.todo-row:hover {
		background: var(--surface-2);
	}
	.todo-row:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: -2px;
	}
	.todo-glyph {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
		color: var(--text-2);
	}
	.todo-text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.todo-title {
		font-weight: 600;
		font-size: var(--fs-ui);
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.todo-meta {
		display: flex;
		flex-wrap: wrap;
		column-gap: 0.1rem;
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		color: var(--text-2);
	}
	.todo-meta-bit {
		white-space: nowrap;
	}
	.todo-class-name {
		color: var(--cyan);
	}
	.todo-sep {
		color: var(--boundary);
	}
	.todo-state {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
	}
	.todo-flag {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		color: var(--gold);
		white-space: nowrap;
	}
	.page-footer {
		margin-top: var(--space-6);
		display: flex;
		justify-content: center;
	}

	/* A phone: the state drops under the title and the view controls share the
	   row, so nothing is pushed off the side of a 375px screen. */
	@media (max-width: 640px) {
		.todo-row {
			grid-template-columns: auto minmax(0, 1fr);
		}
		.todo-state {
			grid-column: 2;
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.4rem;
		}
		.todo-views {
			width: 100%;
		}
		.todo-view {
			flex: 1 1 0;
			justify-content: center;
			padding: 0 0.5rem;
		}
		.todo-class,
		.todo-class select {
			width: 100%;
		}
		.todo-controls {
			width: 100%;
		}
	}

	/* A post's own thumbnail in the glyph's place (ledger 0396): a 30px tile
	   whose box counts as the glyph's 20px (negative inline margins, inside the
	   row's 0.7rem gap), so its title lines up with every glyph row's title
	   rather than sitting 16px further in. */
	.todo-thumb {
		display: block;
		--thumb-tile: 30px;
		--thumb-tile-r: 6px;
		margin-inline: -5px;
	}
</style>
