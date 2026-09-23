<script lang="ts">
	import '$lib/classroom/classroom.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { sectionTitle } from '$lib/classroom/classroom';
	import {
		activeTab,
		classroomCrumbs,
		classroomMeasure,
		locateClassroom,
		sectionTabs
	} from '$lib/classroom/nav';
	import { SITE_THEMES, setSiteTheme, siteTheme, type SiteTheme } from '$lib/theme.svelte';
	import { SECTION } from '../classroom-split/fixture';

	/**
	 * THE CLASSROOM MASTHEAD WITH A SESSION, for the one-tap theme switch.
	 *
	 * Where-am-I is the SHIPPING nav functions on a shipping-shaped path, as
	 * /dev/classroom-split does it: a class page's location, measure, crumbs
	 * and tabs, so the header this measures is the header a class page has.
	 * The body is a single card of the register's own tiers and controls, so a
	 * press of the switch has something on the page to repaint.
	 */
	const loc = locateClassroom('/classroom/s-1');
	const measure = classroomMeasure(loc);
	const crumbs = classroomCrumbs(loc, { section: sectionTitle(SECTION), item: null }, '/dev/theme-switch');
	const tabs = sectionTabs('s-1');

	/* `?state=<id>` through the SHIPPING setter. `untrack` around the write is
	   the repository's rule: `setSiteTheme` writes the state `siteTheme()`
	   reads, and a tracked write is `effect_update_depth_exceeded` on mount.
	   The URL is read tracked above it, so the effect still re-runs on it. */
	$effect(() => {
		const want = page.url.searchParams.get('state');
		if (!want || !SITE_THEMES.includes(want as SiteTheme)) return;
		untrack(() => {
			if (siteTheme() !== want) setSiteTheme(want as SiteTheme);
		});
	});
</script>

<svelte:head><title>Theme switch harness</title></svelte:head>

<div class="cr-root" style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}>
	<ClassroomShell
		basePath="/dev/theme-switch"
		sections={[SECTION]}
		currentSectionId="s-1"
		{crumbs}
		{tabs}
		tab={activeTab(loc)}
		canManage={false}
	>
		<main class="ts-body" data-testid="ts-body">
			<section class="ts-card">
				<p class="ts-eyebrow">Assignment</p>
				<h2 class="ts-title">Truss bridge analysis</h2>
				<p class="ts-copy">
					Work through the member sizing for the span you sketched, then justify every choice.
				</p>
				<p class="ts-meta">Due Aug 20 · 40 pts · Unit Labs</p>
				<div class="ts-row">
					<button type="button" class="btn">Turn in</button>
					<span class="ts-chip ok" data-testid="ts-chip-ok">Returned</span>
					<span class="ts-chip warn" data-testid="ts-chip-warn">Late</span>
				</div>
			</section>
		</main>
	</ClassroomShell>
</div>

<style>
	.ts-body {
		max-width: var(--cr-measure);
		margin: 0 auto;
		padding: var(--space-5) var(--cr-gutter, 1rem) var(--space-8);
	}
	.ts-card {
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		padding: var(--space-5);
	}
	.ts-eyebrow {
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--text-2);
	}
	.ts-title {
		margin: 0.3rem 0 0.6rem;
	}
	.ts-copy {
		color: var(--text-1);
	}
	.ts-meta {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
		margin-top: 0.4rem;
	}
	.ts-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-top: var(--space-4);
	}
	.ts-chip {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.2rem 0.55rem;
		border-radius: var(--radius-chip);
	}
	.ts-chip.ok {
		color: var(--status-ok);
		background: var(--status-ok-fill);
	}
	.ts-chip.warn {
		color: var(--status-warn);
		background: var(--status-warn-fill);
	}
</style>
