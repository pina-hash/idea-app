<script lang="ts">
	import '$lib/classroom/classroom.css';
	import { page } from '$app/state';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import { classroomMeasure, locateClassroom } from '$lib/classroom/nav';
	import { BASE, CLOCK, MANAGER_EXTRA, NO_VIDEO_ITEMS, SECTION, STUDENT_ITEMS, UNITS } from './fixture';

	/*
	 * THE VIDEOS SECTION ON THE REAL CLASS PAGE (ledger 0298, R08). ClassView
	 * mounts it; nothing here draws a card. Three states over one fixture:
	 * the student's class (default), the teacher's (`?manage=1`, whose read also
	 * carries a draft and an instructor-only link, as a manager's does), and a
	 * class with links but no video (`?state=none`), where the section must not
	 * exist at all.
	 *
	 * THE CLASS PAGE'S OWN MEASURE, set the way the classroom layout sets it: a
	 * classroom harness that omits `--cr-measure-route` measures a width the
	 * real route never has (CLAUDE.md, the verification section).
	 */
	const manage = page.url.searchParams.get('manage') === '1';
	const none = page.url.searchParams.get('state') === 'none';
	/* THE CLASS LIST AS THE NAVIGATION COLUMN BESIDE AN OPEN ITEM, the way the
	   class layout mounts it (`asPane` plus the selected id): the same videos
	   are loaded and the section must not be drawn there. */
	const pane = page.url.searchParams.get('state') === 'pane';
	const themeParam = page.url.searchParams.get('theme');
	const items = none ? NO_VIDEO_ITEMS : manage ? [...STUDENT_ITEMS, ...MANAGER_EXTRA] : STUDENT_ITEMS;
	const measure = classroomMeasure(locateClassroom(`/classroom/${SECTION.id}`));

	/* FORCED THEME ATTRIBUTE, as /dev/classroom-live writes it: a harness holds
	   no session, so ThemeRoot's own decision is always "none" here. */
	$effect(() => {
		if (themeParam !== 'space-white') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', 'space-white');
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});
</script>

<svelte:head>
	<title>Class videos // dev harness</title>
</svelte:head>

<div class="harness videos-harness" data-testid="videos-harness" data-state={none ? 'none' : pane ? 'pane' : manage ? 'manage' : 'student'}>
	<section
		class="cr-root"
		aria-label="The class page"
		data-testid="videos-class"
		style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
	>
		<ClassView
			section={SECTION}
			{items}
			units={UNITS}
			canManage={manage}
			clock={CLOCK}
			basePath={BASE}
			asPane={pane}
			selectedItemId={pane ? 'mat-calipers' : null}
		/>
	</section>
</div>

<style>
	.videos-harness {
		padding: 0;
	}
</style>
