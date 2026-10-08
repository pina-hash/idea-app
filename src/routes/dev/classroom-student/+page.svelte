<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import StudentOverview from '$lib/classroom/StudentOverview.svelte';
	import { sectionTitle } from '$lib/classroom/classroom';
	import {
		activeTab,
		classroomCrumbs,
		classroomMeasure,
		locateClassroom,
		sectionTabs,
		studentNotebookHref
	} from '$lib/classroom/nav';
	import { EMAIL, SECTION, TODAY, fixturePage, fixtureState } from './fixture';

	/**
	 * ONE STUDENT'S PAGE, AS A TEACHER OPENS IT FROM PEOPLE (the 2026-10-07
	 * round): the real shell on the People tab under the real route's measure,
	 * and the real StudentOverview over the page `buildStudentPage` makes from
	 * the fixture's reads. `?state=` picks the case:
	 *   full         every section with something in it (the default)
	 *   no-account   a student on the roster who has never signed in
	 *   unavailable  a database without 0233: the new read answers PGRST202
	 *   inactive     a student who left the class (no full-notebook link)
	 */
	const BASE = '/dev/classroom-student';
	const fixture = fixtureState(page.url.searchParams.get('state'));
	const data = fixturePage(fixture);

	const loc = locateClassroom(`/classroom/s-1/people/${encodeURIComponent(EMAIL)}`);
	const measure = classroomMeasure(loc);
	const crumbs = classroomCrumbs(
		loc,
		{ section: sectionTitle(SECTION), student: data.student.display_name },
		BASE
	);
	const tabs = sectionTabs('s-1', BASE);
	const notebookHref = data.student.active ? studentNotebookHref(EMAIL, 's-1', BASE) : null;

	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
</script>

<svelte:head><title>dev // one student's page</title></svelte:head>

<div
	class="cr-root {CLASSROOM_PLATE}"
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
	data-ready={ready ? 'true' : undefined}
	data-state={fixture}
>
	<ClassroomShell basePath={BASE} sections={[SECTION]} currentSectionId="s-1" {crumbs} {tabs} tab={activeTab(loc)} canManage={true}>
		<StudentOverview
			section={SECTION}
			{data}
			today={TODAY}
			peopleHref={`${BASE}?view=people`}
			itemHref={(id) => `${BASE}?item=${id}`}
			{notebookHref}
		/>
	</ClassroomShell>
</div>
