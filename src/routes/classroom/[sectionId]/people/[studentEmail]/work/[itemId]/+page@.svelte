<script lang="ts">
	import '$lib/classroom/classroom.css';
	import { env as publicEnv } from '$env/dynamic/public';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import HtmlGradingWork from '$lib/classroom/html-assignment/HtmlGradingWork.svelte';
	import { htmlAssignmentMount } from '$lib/classroom/html-assignment/mount';
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
	import SubmissionFileList from '$lib/classroom/SubmissionFileList.svelte';
	import { gateApproved, type StudentWork } from '$lib/classroom/assignment-spec';
	import { itemTitle, sectionTitle } from '$lib/classroom/classroom';
	import { STUDENT_PARAM } from '$lib/classroom/grading-student-url';
	import { studentPageHref } from '$lib/classroom/nav';
	import type { PageData } from './$types';

	/**
	 * ONE STUDENT'S FILLED ASSIGNMENT, ALONE (report 5464ceb2), RESET TO THE
	 * ROOT LAYOUT the way the class projector is: the root layout still wraps
	 * it (theme, deploy safety, the navigation indicator), and what it drops is
	 * the classroom masthead, trail and tabs, so the work has the whole window
	 * for a parent to read over a teacher's shoulder.
	 *
	 * THE WORK IS THE GRADING CONSOLE'S OWN READ-ONLY RENDER, through the same
	 * two components (`HtmlGradingWork` for a ported worksheet, `SpecRenderer`
	 * read-only for a spec assignment), so what this page shows is what the
	 * console shows beside its rubric, never a second rendering of a student's
	 * answers. No write, no transport, no poll: a page opened for a conference
	 * is read, not graded, and the Grade key goes to the console for that.
	 *
	 * THE FEEDBACK BUTTON IS THE ROOT LAYOUT'S, in the bottom-right corner as on
	 * every page (ledger 0396); the room's own foot clears it (`.cr-root` in
	 * classroom.css).
	 */
	let { data }: { data: PageData } = $props();

	const student: StudentWork = $derived({
		email: data.student.email,
		displayName: data.student.displayName,
		active: data.student.active,
		submission: data.work.submission,
		responses: data.work.responses,
		files: data.work.files,
		approvals: data.work.approvals
	});
	const mount = $derived(htmlAssignmentMount(data.item, data.htmlAssignment));
	const title = $derived(itemTitle(data.item));
	const backHref = $derived(studentPageHref(data.section.id, data.student.email));
	const gradeHref = $derived(`/classroom/${data.section.id}/item/${data.item.id}/grade?${STUDENT_PARAM}=${data.gradeToken}`);
	const looseFiles = $derived(student.files.filter((f) => !f.block_id));
</script>

<svelte:head>
	<title>{data.student.displayName} · {title} · {sectionTitle(data.section)} · IDEA Classroom</title>
</svelte:head>

<div class="cr-root {CLASSROOM_PLATE} cr-instructor-surface sw-root" style="--cr-measure-route: var(--measure-console)" data-testid="student-work-page">
	<header class="sw-bar">
		<div class="sw-who">
			<p class="eyebrow sw-eyebrow">{sectionTitle(data.section)}</p>
			<h1 class="sw-title plate-title">
				<span class="sw-name">{data.student.displayName}</span>
				<span class="sw-sep" aria-hidden="true">/</span>
				<span class="sw-item">{title}</span>
			</h1>
		</div>
		<nav class="sw-keys" aria-label="This page">
			<a class="btn secondary tiny" href={backHref} data-testid="sw-back">Back to student</a>
			<a class="btn secondary tiny" href={gradeHref} data-testid="sw-grade">Grade</a>
			<a class="btn secondary tiny" href={`/classroom/${data.section.id}/item/${data.item.id}`} data-testid="sw-item">Assignment</a>
		</nav>
	</header>

	<main class="classroom-page sw-main" aria-label="Their work">
		{#if !data.work.complete}
			<p class="note card sw-note" data-testid="sw-incomplete">Part of their work could not be loaded just now, so what is below may be short. Reload to try again.</p>
		{/if}
		{#if mount === 'spec' && data.spec}
			{#if looseFiles.length}
				<div class="card sw-files">
					<h2 class="section-label">Files handed in</h2>
					<SubmissionFileList files={looseFiles} />
				</div>
			{/if}
			<SpecRenderer
				spec={data.spec}
				initialValues={Object.fromEntries(student.responses.map((r) => [r.block_id, r.value ?? {}]))}
				attachments={data.item.attachments}
				files={student.files}
				readonly
				approved={gateApproved(data.spec, student.approvals)}
			/>
		{:else}
			<HtmlGradingWork {student} item={data.item} htmlAssignment={data.htmlAssignment} sandboxOrigin={publicEnv.PUBLIC_HX_SANDBOX_ORIGIN} />
		{/if}
	</main>
</div>

<style>
	.sw-root {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	/* THE BAR IS STICKY AND OPAQUE, and it outranks the work: the frame's
	   overlays are positioned, so without a z-index they would paint over it. */
	.sw-bar {
		position: sticky;
		top: 0;
		z-index: 3;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		padding: 0.6rem var(--cr-gutter, 1rem);
		background: var(--surface-1, var(--bg1));
		border-bottom: 1px solid var(--boundary);
	}
	.sw-who {
		min-width: 0;
		flex: 1 1 20rem;
	}
	.sw-eyebrow {
		margin: 0 0 0.15rem;
	}
	.sw-title {
		margin: 0;
		font-size: 1.15rem;
		line-height: 1.25;
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.5rem;
	}
	.sw-name {
		color: var(--text-1);
	}
	.sw-sep {
		color: var(--text-3);
	}
	.sw-item {
		color: var(--text-2);
		font-weight: 500;
	}
	.sw-keys {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.sw-main {
		flex: 1 1 auto;
		width: 100%;
		max-width: none;
		padding: 1rem var(--cr-gutter, 1rem) 2rem;
		margin: 0;
	}
	.sw-note {
		color: var(--amber);
		margin: 0 0 1rem;
	}
	.sw-files {
		margin: 0 0 1rem;
	}
</style>
