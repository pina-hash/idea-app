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
	import { createMemoryAvatarModeration } from '$lib/avatar-moderation';

	/**
	 * ONE STUDENT'S PAGE, AS A TEACHER OPENS IT FROM PEOPLE (the 2026-10-07
	 * round): the real shell on the People tab under the real route's measure,
	 * and the real StudentOverview over the page `buildStudentPage` makes from
	 * the fixture's reads. `?state=` picks the case:
	 *   full         every section with something in it (the default)
	 *   no-account   a student on the roster who has never signed in
	 *   unavailable  a database without 0233: the new read answers PGRST202
	 *   inactive     a student who left the class (no full-notebook link)
	 * `&moderate=1` hands in the admin's profile picture control over an
	 * in-memory stand-in (`&held=1` starts with the picture already off), as the
	 * route does for a site admin; without it there is no control, as for a
	 * teacher who is not one.
	 */
	const BASE = '/dev/classroom-student';
	const fixture = fixtureState(page.url.searchParams.get('state'));
	const moderating = page.url.searchParams.get('moderate') === '1';
	/* Under `moderate=1` Ana has chosen a preset picture, so turning it off visibly changes something. */
	const base = fixturePage(fixture);
	const data = moderating ? { ...base, student: { ...base.student, avatar: 'preset:gear' } } : base;

	const loc = locateClassroom(`/classroom/s-1/people/${encodeURIComponent(EMAIL)}`);
	const measure = classroomMeasure(loc);
	const crumbs = classroomCrumbs(
		loc,
		{ section: sectionTitle(SECTION), student: data.student.display_name },
		BASE
	);
	const tabs = sectionTabs('s-1', BASE);
	const notebookHref = data.student.active ? studentNotebookHref(EMAIL, 's-1', BASE) : null;
	const avatarModeration =
		moderating
			? createMemoryAvatarModeration({
					accounts: [EMAIL],
					held:
						page.url.searchParams.get('held') === '1'
							? [{ email: EMAIL, name: data.student.display_name, hiddenAt: '2026-10-16T15:12:00Z', hiddenBy: 'apina@boscotech.edu', reason: 'Not school appropriate.', hadPicture: true }]
							: []
				})
			: null;

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
			gradeHref={(id) => `${BASE}?grade=${id}`}
			workHref={(id) => `${BASE}?work=${id}`}
			{notebookHref}
			{avatarModeration}
		/>
	</ClassroomShell>
</div>
