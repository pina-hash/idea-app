<script lang="ts">
	import { env as publicEnv } from '$env/dynamic/public';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { isStudentToken, STUDENT_PARAM } from '$lib/classroom/grading-student-url';
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import HtmlGradingWork from '$lib/classroom/html-assignment/HtmlGradingWork.svelte';
	import {
		createBulkGradingTransports,
		createTeacherEngineTransports
	} from '$lib/classroom/transports';
	import { createBulkFileSource } from '$lib/classroom/bulk-download-source';
	import { blockLabelsFromManifest, blockLabelsFromSpec } from '$lib/classroom/bulk-download';
	import { htmlAssignmentMount } from '$lib/classroom/html-assignment/mount';
	import { htmlManifestShaped } from '$lib/classroom/transports';
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import type { StudentWork } from '$lib/classroom/assignment-spec';
	import { createFeedbackTransports } from '$lib/classroom/feedback/transports';
	import type { HtmlWorkFeedback } from '$lib/classroom/feedback/work';
	import { createClassroomLive } from '$lib/classroom/live';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * THE STUDENT OPEN IS IN THE ADDRESS AS AN OPAQUE TOKEN (ledger 0380, report
	 * b31afb76), so a refresh keeps the student being graded. Read ONCE on
	 * arrival; written back with `replaceState`, never a navigation, so no load
	 * re-runs for a click on a name. The token is never the address
	 * (`grading-student-url.ts`).
	 */
	const requestedStudent = page.url.searchParams.get(STUDENT_PARAM);
	// svelte-ignore state_referenced_locally
	const initialStudent = isStudentToken(requestedStudent) ? requestedStudent : null;
	function onstudent(token: string | null) {
		const url = new URL(page.url);
		if (token) url.searchParams.set(STUDENT_PARAM, token);
		else url.searchParams.delete(STUDENT_PARAM);
		replaceState(url, page.state);
	}

	// One stable client for the session (the item page's convention).
	// svelte-ignore state_referenced_locally
	const transports = createTeacherEngineTransports(data.supabase);
	// THE BULK CAPABILITY IS ONE PROP. Handing it in is what turns the console
	// into the cross-class, many-student surface; the per-section route hands in
	// nothing and gets the console it has always had.
	// svelte-ignore state_referenced_locally
	const bulk = createBulkGradingTransports(data.supabase);
	// "DOWNLOAD ALL FILES" (ledger 0298): a ported document names its blocks
	// from its manifest, everything else from its spec.
	const fileDownload = $derived(
		createBulkFileSource(
			data.supabase,
			data.htmlAssignment
				? blockLabelsFromManifest(data.htmlAssignment.manifest)
				: blockLabelsFromSpec(data.spec)
		)
	);

	/**
	 * WHICH ENGINE THIS ITEM IS, ASKED THE WAY THE PER-CLASS CONSOLE ASKS IT
	 * (ledger 0298, R24), so the two consoles hand the console, and therefore
	 * the graded-work export, the same one of the two: the manifest for a ported
	 * document, the spec otherwise, never both. An item carrying a leftover spec
	 * beside its document is legal and the MANIFEST decides; before this the
	 * leftover spec went in here and the export read that instead of the answers.
	 */
	const htmlMount = $derived(htmlAssignmentMount(data.item, data.htmlAssignment));
	const manifest = $derived(
		htmlMount === 'html' && htmlManifestShaped(data.htmlAssignment?.manifest)
			? (data.htmlAssignment?.manifest as HtmlAssignmentManifest)
			: null
	);

	/**
	 * PROGRESSIVE FEEDBACK (0238, decision 60): the instructor's side, which is
	 * the side that may start a note and draw. Handed only for a ported
	 * worksheet; the console renders nothing for it on a spec assignment.
	 */
	// svelte-ignore state_referenced_locally
	const feedback = createFeedbackTransports(data.supabase, 'teacher');

	/**
	 * THE CLASS'S LIVE NOTICES, so a note sent from this console reaches the
	 * student's open worksheet at once rather than at their next heartbeat, and
	 * a reply reaches this console the same way.
	 */
	// svelte-ignore state_referenced_locally
	const live = createClassroomLive(data.supabase);
</script>

<GradingConsole
	{initialStudent}
	{onstudent}
	section={data.section}
	item={data.item}
	spec={htmlMount === 'spec' ? data.spec : null}
	{manifest}
	rubric={data.rubric}
	{transports}
	{bulk}
	htmlWork={htmlMount === 'spec' ? null : htmlWork}
	feedback={htmlMount === 'html' ? feedback : null}
	{live}
	{fileDownload}
/>

<!--
	THE WORK COLUMN FOR A PORTED WORKSHEET (ledger 0298). This console used to
	hand in no snippet, so with no spec its work column fell through to "Nothing
	handed in yet" for a student who had typed every answer and attached no
	file, beside a roster chip that said Complete. It is the per-class grade
	route's own component, mounted the same way off the same one expression
	(`htmlMount`), so the two consoles show a worksheet identically: the
	read-only document, the answers when the item is not live, the sentence
	when there is no document. The load already read the document for
	"Download all files"; nothing new is read.
-->
{#snippet htmlWork(student: StudentWork, feedbackFrame: HtmlWorkFeedback | null)}
	<HtmlGradingWork
		{student}
		item={data.item}
		htmlAssignment={data.htmlAssignment}
		sandboxOrigin={publicEnv.PUBLIC_HX_SANDBOX_ORIGIN}
		feedback={feedbackFrame}
	/>
{/snippet}
