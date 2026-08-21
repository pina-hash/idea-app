<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import { sectionTitle, sortSections, type ClassroomSection } from '$lib/classroom/classroom';
	import type { Crumb, SectionTab, SectionTabId } from '$lib/classroom/nav';
	import { formatSectionLabel } from '$lib/section-label';

	/**
	 * The persistent room every /classroom page renders inside.
	 *
	 * WHY IT EXISTS: each capability used to own its own page with nothing
	 * between them, so moving between a class, an item, grading and the roster
	 * meant returning to the hub and drilling back down. The switcher is the fix
	 * -- every class the caller is enrolled in or teaches, always on screen, one
	 * click away, on every route below /classroom.
	 *
	 * Presentation only (the MyClasses/ClassPage convention): the layout works
	 * out where it is from the URL through `$lib/classroom/nav` and hands the
	 * answer down, so this component can be mounted in the dev harness with no
	 * router at all. It decides nothing about access -- `tabs` is filtered by the
	 * `canManage` the SERVER answered with, and the People and Grades routes 404
	 * for anybody else regardless of what is rendered here.
	 */
	let {
		sections = [],
		currentSectionId = null,
		crumbs = [],
		tabs = [],
		tab = null,
		canManage = false,
		isStaff = false,
		isAdmin = false,
		minimal = false,
		backHref = '/classroom',
		backLabel = 'Classroom',
		children
	}: {
		sections?: ClassroomSection[];
		currentSectionId?: string | null;
		crumbs?: Crumb[];
		/** Every tab this section has; manager-only ones are filtered here. */
		tabs?: SectionTab[];
		tab?: SectionTabId | null;
		canManage?: boolean;
		isStaff?: boolean;
		isAdmin?: boolean;
		/**
		 * The view-as tree: that page renders somebody else's classroom under an
		 * impersonation banner, so a switcher listing the ADMIN'S OWN classes
		 * beside a student's name would be actively misleading. It keeps the room
		 * and loses the furniture.
		 */
		minimal?: boolean;
		/** The way up in minimal mode, where there is no switcher to be the way up. */
		backHref?: string;
		backLabel?: string;
		children: import('svelte').Snippet;
	} = $props();

	let switcherOpen = $state(false);
	let switcherEl = $state<HTMLElement | null>(null);

	const ordered = $derived(sortSections(sections));
	const current = $derived(ordered.find((s) => s.id === currentSectionId) ?? null);
	const visibleTabs = $derived(tabs.filter((t) => !t.manageOnly || canManage));

	/**
	 * Dismiss on POINTERDOWN, not click, and ignore a target already detached --
	 * the ProfileMenu trap: the press that OPENS the panel would otherwise be the
	 * same event that closes it.
	 */
	function onPointerDown(event: PointerEvent) {
		if (!switcherOpen) return;
		const target = event.target as Node | null;
		if (!target || !target.isConnected) return;
		if (switcherEl?.contains(target)) return;
		switcherOpen = false;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && switcherOpen) {
			switcherOpen = false;
			(switcherEl?.querySelector('.sw-trigger') as HTMLElement | null)?.focus();
		}
	}
</script>

<svelte:window onpointerdown={onPointerDown} onkeydown={onKeyDown} />

<div class="app-header cr-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>

	{#if !minimal}
		<!-- The switcher sits in the masthead itself rather than on the page, so it
		     is in the same place on every route below /classroom. -->
		<div class="switcher" bind:this={switcherEl}>
			<button
				type="button"
				class="sw-trigger"
				class:on={switcherOpen}
				aria-expanded={switcherOpen}
				aria-haspopup="menu"
				data-testid="section-switcher"
				onclick={() => (switcherOpen = !switcherOpen)}
			>
				<span class="sw-label">
					{#if current}
						<span class="sw-code">{current.course?.code ?? 'CLASS'}</span>
						<span class="sw-name">{formatSectionLabel(current.label, current.block)}</span>
					{:else}
						<span class="sw-name">My Classes</span>
					{/if}
				</span>
				<span class="sw-caret" aria-hidden="true">{switcherOpen ? '▴' : '▾'}</span>
			</button>

			{#if switcherOpen}
				<div class="sw-menu" role="menu" data-testid="section-switcher-menu">
					<a
						class="sw-item"
						class:current={!currentSectionId}
						role="menuitem"
						href="/classroom"
						onclick={() => (switcherOpen = false)}
					>
						<span class="sw-item-name">All my classes</span>
					</a>
					{#if ordered.length}
						<div class="sw-sep" aria-hidden="true"></div>
					{/if}
					{#each ordered as s (s.id)}
						<a
							class="sw-item"
							class:current={s.id === currentSectionId}
							role="menuitem"
							aria-current={s.id === currentSectionId ? 'true' : undefined}
							href={`/classroom/${s.id}`}
							data-testid="switcher-section"
							onclick={() => (switcherOpen = false)}
						>
							<span class="sw-item-code">{s.course?.code ?? 'CLASS'}</span>
							<span class="sw-item-name">{formatSectionLabel(s.label, s.block)}</span>
							{#if s.active === false}<span class="sw-item-flag">Archived</span>{/if}
						</a>
					{/each}
					{#if isStaff}
						<div class="sw-sep" aria-hidden="true"></div>
						<a class="sw-item" role="menuitem" href="/classroom/admin" onclick={() => (switcherOpen = false)}>
							<span class="sw-item-name">Courses &amp; setup</span>
						</a>
					{/if}
					{#if isAdmin}
						<a class="sw-item" role="menuitem" href="/classroom/view-as" onclick={() => (switcherOpen = false)}>
							<span class="sw-item-name">Student notebooks</span>
						</a>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<div class="header-right">
		{#if minimal}
			<a class="btn secondary" href={backHref}>&lsaquo; {backLabel}</a>
		{/if}
		<ProfileMenu />
	</div>
</div>

{#if !minimal && crumbs.length > 1}
	<nav class="crumbs" aria-label="Breadcrumb" data-testid="crumbs">
		<ol>
			{#each crumbs as crumb, i (crumb.label + i)}
				<li>
					{#if crumb.href}
						<a href={crumb.href}>{crumb.label}</a>
						<span class="crumb-sep" aria-hidden="true">/</span>
					{:else}
						<span aria-current="page">{crumb.label}</span>
					{/if}
				</li>
			{/each}
		</ol>
	</nav>
{/if}

{#if !minimal && visibleTabs.length > 1 && tab}
	<nav class="sec-tabs" aria-label="Class views" data-testid="section-tabs">
		{#each visibleTabs as t (t.id)}
			<a
				class="sec-tab"
				class:active={t.id === tab}
				aria-current={t.id === tab ? 'page' : undefined}
				href={t.href}
				data-testid="section-tab-{t.id}"
			>
				{t.label}
			</a>
		{/each}
	</nav>
{/if}

{@render children()}

<style>
	/* The masthead grows a third slot for the switcher; the shared .app-header
	   rule in classroom.css still owns everything else about it. */
	.cr-header {
		gap: var(--space-3);
	}
	.switcher {
		position: relative;
		min-width: 0;
	}
	.sw-trigger {
		appearance: none;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		max-width: 100%;
		padding: 0.34rem 0.6rem;
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		color: var(--text-1);
		cursor: pointer;
		font: inherit;
		min-height: 34px;
	}
	.sw-trigger:hover,
	.sw-trigger.on {
		border-color: var(--gold);
	}
	.sw-label {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		min-width: 0;
	}
	.sw-code {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		color: var(--gold);
		white-space: nowrap;
	}
	.sw-name {
		font-size: 0.84rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sw-caret {
		font-size: 0.6rem;
		color: var(--text-2);
	}
	.sw-menu {
		position: absolute;
		top: calc(100% + 0.35rem);
		left: 0;
		z-index: 40;
		min-width: 15rem;
		max-width: min(22rem, 90vw);
		max-height: 60vh;
		overflow-y: auto;
		padding: 0.3rem;
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		box-shadow: 0 10px 30px rgb(0 0 0 / 45%);
	}
	.sw-item {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		padding: 0.45rem 0.55rem;
		border-radius: var(--radius-card);
		text-decoration: none;
		color: var(--text-1);
		min-height: 40px;
		box-sizing: border-box;
	}
	.sw-item:hover {
		background: var(--surface-2);
	}
	/* The current class is marked by more than colour: it carries a gold rule. */
	.sw-item.current {
		background: var(--surface-2);
		box-shadow: inset 2px 0 0 var(--gold);
	}
	.sw-item-code {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--gold);
		white-space: nowrap;
	}
	.sw-item-name {
		font-size: 0.85rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sw-item-flag {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--text-2);
	}
	.sw-sep {
		height: 1px;
		margin: 0.3rem 0.2rem;
		background: var(--hairline);
	}

	/* THE CHROME IS AS WIDE AS THE PAGE UNDER IT. Both read `--cr-measure`,
	   which src/routes/classroom/+layout.svelte sets once per route from
	   nav.ts's `classroomMeasure` -- so the trail and the tabs line up with a
	   46rem item and a 62rem grading console, not only with the 60rem pages
	   they used to be pinned to. The fallback is what the dev harness (which
	   mounts this with no layout) and view-as get. */
	.crumbs {
		max-width: var(--cr-measure, var(--measure-page));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem);
	}
	.crumbs ol {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.35rem;
		list-style: none;
		margin: 0 0 0.5rem;
		padding: 0;
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}
	.crumbs li {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		min-width: 0;
	}
	.crumbs a {
		color: var(--text-2);
		text-decoration: none;
	}
	.crumbs a:hover {
		color: var(--gold);
	}
	.crumbs span[aria-current] {
		color: var(--text-1);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 22rem;
	}
	.crumb-sep {
		color: var(--hairline);
	}

	/* THE TAB BAR IS THE LAST THING BEFORE THE CONTENT, so the space under it is
	   the space between the chrome and the page -- and at 0.9rem it was the
	   tightest gap on the whole screen, with the top of both panes crowding the
	   rule above them. 24px, from the scale. */
	.sec-tabs {
		display: flex;
		gap: 0.3rem;
		max-width: var(--cr-measure, var(--measure-page));
		margin: 0 auto var(--space-5);
		padding: 0 var(--cr-gutter, 1.2rem);
		border-bottom: 1px solid var(--hairline);
	}
	.sec-tab {
		padding: 0.5rem 0.9rem;
		border-bottom: 2px solid transparent;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		text-decoration: none;
		min-height: 40px;
		box-sizing: border-box;
	}
	.sec-tab:hover {
		color: var(--text-1);
	}
	.sec-tab.active {
		color: var(--green);
		border-bottom-color: var(--green);
	}

	/* Phone: the switcher keeps its place in the masthead and simply narrows --
	   it is the one control that must never fall off the page, since it is how
	   you get to another class from anywhere. */
	@media (max-width: 640px) {
		.cr-header {
			gap: var(--space-2);
		}
		.sw-trigger {
			padding: 0.3rem 0.45rem;
		}
		.sw-name {
			max-width: 7.5rem;
		}
		.sw-menu {
			left: auto;
			right: 0;
		}
		/* No phone override for the trail and the tabs: `--cr-gutter` is already
		   the narrow number below the desktop breakpoint, and a second literal
		   here is exactly how the chrome came to sit on a different line from
		   the content it sits above. */
	}
</style>
