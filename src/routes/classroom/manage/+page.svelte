<script lang="ts">
	import ManageConsole from '$lib/classroom/ManageConsole.svelte';
	import {
		classroomFeedbackSubmit,
		createClassroomTransports,
		createTeacherEngineTransports,
		deckTransports
	} from '$lib/classroom/transports';
	import type { ReviewTransports, SectionGrid } from '$lib/notebook-review';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The REAL transports live in $lib/classroom/transports so the console, the
	 * class stream and the item page all reach the SAME calls -- a per-page copy
	 * is how one surface quietly ends up on a stale RPC signature.
	 */
	// The Supabase client is ONE stable instance for the session, so capturing
	// it once is the intent here, not a missed reactive read.
	// svelte-ignore state_referenced_locally
	const transports = createClassroomTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const submitFeedback = classroomFeedbackSubmit(data.supabase, data.claims?.sub);
	/**
	 * A deck and an assignment spec can be attached from the composer itself,
	 * so the console hands it those transports too. Both are re-authorized
	 * server-side by the route and the RPC they call -- the console is
	 * teacher-only, but that gate is convenience and these are plumbing.
	 */
	// svelte-ignore state_referenced_locally
	const teacherTransports = createTeacherEngineTransports(data.supabase);

	/**
	 * The notebook compliance element's one read: the SAME
	 * `notebook_get_section_grid` call `/notebook/review` makes, with the same
	 * signature, so there is no second grid query and no second copy of who may
	 * run one -- that RPC asks `classroom_manages_section` itself.
	 *
	 * A refusal or a missing table is reported inside the element and nowhere
	 * else, so a project without the notebook migrations simply shows the rest
	 * of the section panel as it always did.
	 */
	const loadNotebookGrid: ReviewTransports['loadGrid'] = async (sectionId, unitNumber) => {
		const { data: result, error } = await data.supabase.rpc('notebook_get_section_grid', {
			p_section_id: sectionId,
			p_unit_number: unitNumber
		});
		if (error) {
			return {
				ok: false,
				error: error.message?.trim() || 'Could not read this class’s notebook compliance.'
			};
		}
		return { ok: true, value: result as SectionGrid };
	};
</script>

<ManageConsole
	ready={data.ready}
	email={data.email}
	isAdmin={data.isAdmin}
	attachmentsEnabled={data.attachmentsEnabled}
	initialSections={data.sections}
	initialCourses={data.courses}
	{transports}
	{deckTransports}
	{teacherTransports}
	{loadNotebookGrid}
	{submitFeedback}
/>
