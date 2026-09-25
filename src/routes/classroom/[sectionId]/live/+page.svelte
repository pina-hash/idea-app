<script lang="ts">
	import { page } from '$app/state';
	import LiveControl from '$lib/classroom/live-class/LiveControl.svelte';
	import { sectionTitle } from '$lib/classroom/classroom';
	import { createClassroomLive } from '$lib/classroom/live';
	import { createPresenceTransports } from '$lib/classroom/presence/transports';
	import { createHallPassTransports, createTeacherEngineTransports } from '$lib/classroom/transports';
	import { withWorksheetManifest } from '$lib/classroom/live-class/grid';
	import { readWorksheetManifests } from '$lib/classroom/student-work';
	import type { PageData } from './$types';

	/**
	 * THE LIVE CLASS ROUTE: the transports, built once, and the one component.
	 *
	 * Every transport here re-checks the caller in the database (the hall-pass
	 * RPCs, `classroom_presence_state`, the RLS-scoped grading read), so this is
	 * plumbing and never a boundary. The page's own load already refused anybody
	 * who does not manage the class.
	 */
	let { data }: { data: PageData } = $props();

	// One stable client for the session, captured once (the item page's convention).
	// svelte-ignore state_referenced_locally
	const hallPassTransports = createHallPassTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const live = createClassroomLive(data.supabase);
	// svelte-ignore state_referenced_locally
	const presence = createPresenceTransports(data.supabase, '');
	// svelte-ignore state_referenced_locally
	const teacher = createTeacherEngineTransports(data.supabase);
	/**
	 * THE GRADING READ, WITH A PORTED WORKSHEET'S MANIFEST BESIDE IT (decision
	 * 37, ledger 0298), so a student who filled in every block reads Complete
	 * on this grid as on their class page rather than Missing. The answers were
	 * already in the grading read; the manifest is two small reads pinned to the
	 * item, and a manifest that cannot be read leaves the grid as it was.
	 */
	// svelte-ignore state_referenced_locally
	const client = data.supabase;
	const loadGrading = withWorksheetManifest(teacher.loadGrading, async (itemId) =>
		(await readWorksheetManifests(client, [itemId]))?.get(itemId) ?? null
	);

	const base = $derived(`/classroom/${data.section.id}`);
</script>

<svelte:head>
	<title>Live · {sectionTitle(data.section)} // IDEA Classroom</title>
</svelte:head>

<LiveControl
	section={data.section}
	viewer={data.claims?.sub ?? 'signed-out'}
	today={data.classClock.today}
	items={data.items}
	checkIns={data.checkIns}
	roster={data.roster}
	hallPass={data.hallPass}
	{hallPassTransports}
	{live}
	{presence}
	{loadGrading}
	projectorHref={`${base}/live/projector`}
	peopleHref={`${base}/people`}
	gradeHrefFor={(itemId) => `${base}/item/${itemId}/grade`}
	initialItemId={page.url.searchParams.get('item')}
/>
