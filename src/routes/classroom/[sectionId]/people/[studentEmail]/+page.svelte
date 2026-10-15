<script lang="ts">
	import StudentOverview from '$lib/classroom/StudentOverview.svelte';
	import { sectionTitle } from '$lib/classroom/classroom';
	import { STUDENT_PARAM } from '$lib/classroom/grading-student-url';
	import { studentNotebookHref } from '$lib/classroom/nav';
	import { studentWorkHref } from '$lib/classroom/student-overview';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/*
	 * THE FULL NOTEBOOK OPENS ONLY WHILE THEY ARE ON THE LIVE ROSTER, OR FOR AN
	 * ADMIN: the notebook's reviewer gate asks for an active enrollment, so for
	 * anybody else the link would answer 404. Without it the page says why.
	 */
	const notebookHref = $derived(
		data.studentPage.student.active || data.navIsAdmin === true
			? studentNotebookHref(data.studentPage.student.email, data.section.id)
			: null
	);
</script>

<svelte:head>
	<title>{data.studentPage.student.display_name} · Student · {sectionTitle(data.section)} // IDEA Classroom</title>
</svelte:head>

<StudentOverview
	section={data.section}
	data={data.studentPage}
	today={data.classClock.today}
	peopleHref={`/classroom/${data.section.id}/people`}
	itemHref={(itemId) => `/classroom/${data.section.id}/item/${itemId}`}
	gradeHref={(itemId) =>
		data.gradeTokens[itemId]
			? `/classroom/${data.section.id}/item/${itemId}/grade?${STUDENT_PARAM}=${data.gradeTokens[itemId]}`
			: null}
	workHref={(itemId) => studentWorkHref(data.section.id, data.studentPage.student.email, itemId)}
	{notebookHref}
/>
