<script lang="ts">
	import '$lib/classroom/classroom.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { sectionTitle } from '$lib/classroom/classroom';
	import { activeTab, classroomCrumbs, locateClassroom, sectionTabs } from '$lib/classroom/nav';
	import { SITE_THEMES, setSiteTheme, siteTheme, type SiteTheme } from '$lib/theme.svelte';
	import { SECTION } from '../classroom-split/fixture';

	/**
	 * THE PROFILE MENU IN THE CLASSROOM'S APPLICATION FRAME (report R18).
	 *
	 * `.cr-app` is what `src/routes/classroom/+layout.svelte` puts on `.cr-root`
	 * for a console route, and `--measure-console` is the measure that route
	 * asks for; both are SET here rather than injected at measurement time, so
	 * the frame this measures is the frame a grading console has. The body is
	 * a `.cr-app-body` that scrolls inside itself and is taller than any
	 * window, which is what makes the frame's `overflow: hidden` load-bearing:
	 * the document cannot scroll, so a panel that runs past the floor is
	 * unreachable rather than merely below the fold.
	 */
	const loc = locateClassroom('/classroom/s-1');
	const crumbs = classroomCrumbs(
		loc,
		{ section: sectionTitle(SECTION), item: null },
		'/dev/classroom-profile-menu'
	);
	const tabs = sectionTabs('s-1');

	/* `?state=<id>` through the SHIPPING setter, the /dev/theme-switch shape:
	   the URL is read tracked, the write is `untrack`ed. */
	$effect(() => {
		const want = page.url.searchParams.get('state');
		if (!want || !SITE_THEMES.includes(want as SiteTheme)) return;
		untrack(() => {
			if (siteTheme() !== want) setSiteTheme(want as SiteTheme);
		});
	});
</script>

<svelte:head><title>Profile menu in the classroom frame</title></svelte:head>

<div class="cr-root cr-app" style="--cr-measure-route: var(--measure-console)">
	<ClassroomShell
		basePath="/dev/classroom-profile-menu"
		sections={[SECTION]}
		currentSectionId="s-1"
		{crumbs}
		{tabs}
		tab={activeTab(loc)}
		canManage={false}
	>
		<main class="cr-app-body pmc-body" data-testid="pmc-body">
			<p class="pmc-note">
				The frame is the viewport and does not scroll; this body scrolls inside it. Open the
				profile menu at the top right: the panel must end above the window's floor and scroll
				inside itself, with Theme and Sign out on screen.
			</p>
			{#each Array.from({ length: 24 }, (_, i) => i + 1) as n (n)}
				<section class="pmc-card">
					<p class="pmc-eyebrow">Row {n}</p>
					<p class="pmc-copy">A row of console content, so the body is taller than any window.</p>
				</section>
			{/each}
		</main>
	</ClassroomShell>
</div>

<style>
	.pmc-body {
		overflow-y: auto;
		padding: var(--space-4) var(--cr-gutter, 1rem) var(--space-8);
	}
	.pmc-note {
		color: var(--text-2);
		max-width: 40rem;
	}
	.pmc-card {
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		padding: var(--space-3) var(--space-4);
		margin-top: var(--space-3);
	}
	.pmc-eyebrow {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		letter-spacing: var(--track-label);
		text-transform: uppercase;
		color: var(--text-2);
	}
	.pmc-copy {
		margin: 0.3rem 0 0;
		color: var(--text-1);
	}
</style>
