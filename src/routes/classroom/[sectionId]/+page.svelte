<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import {
		readClassViewPrefs,
		toggleGroupCollapsed,
		type ClassViewPrefs
	} from '$lib/classroom/classroom';
	import {
		classroomFeedbackSubmit,
		createClassroomTransports,
		createTeacherEngineTransports,
		createUnitTransports,
		deckTransports,
		fetchLinkPreviewClient,
		loadExportStatuses,
		runClassroomExport
	} from '$lib/classroom/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The same transports the rest of the module uses. Handing them in is what
	// turns the on-row controls on; every one of them is re-authorized by the RPC
	// it calls, so this is plumbing, never a boundary.
	// The Supabase client is ONE stable instance for the session, so capturing it
	// once is the intent here, not a missed reactive read.
	// svelte-ignore state_referenced_locally
	const transports = createClassroomTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const unitTransports = createUnitTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const submitFeedback = classroomFeedbackSubmit(data.supabase, data.claims?.sub);
	// svelte-ignore state_referenced_locally
	const teacherTransports = createTeacherEngineTransports(data.supabase);

	/**
	 * The notebook door for whoever is looking. A manager of this section gets the
	 * review console already scoped to it -- `notebook_get_section_grid` asks
	 * `classroom_manages_section`, the same question `canManage` is, so the link
	 * can never offer a grid the database would refuse. Everyone else reading this
	 * page is an actively enrolled student, and theirs is their own notebook.
	 */
	const notebookHref = $derived(
		data.canManage ? `/notebook/review?section=${data.section.id}` : '/notebook'
	);

	/**
	 * Folded units, optimistic locally so the caret turns on the click rather
	 * than on the round trip -- the home feed's own pattern, including writing
	 * the WHOLE preferences object back so a sibling key (the launcher's layout,
	 * the feed's own collapse) is never clobbered.
	 */
	let prefs = $state<ClassViewPrefs>({});
	let localCollapsed = $state<string[] | null>(null);
	$effect(() => {
		prefs = readClassViewPrefs(data.preferences);
		localCollapsed = null;
	});
	const collapsed = $derived(localCollapsed ?? data.collapsed ?? []);

	async function toggleGroup(groupId: string) {
		const next = toggleGroupCollapsed(prefs, data.section.id, groupId);
		prefs = next;
		localCollapsed = collapsed.includes(groupId)
			? collapsed.filter((id) => id !== groupId)
			: [...collapsed, groupId];
		if (!data.claims?.sub) return;
		const merged = { ...(data.preferences ?? {}), classroomUnits: next };
		await data.supabase.from('profiles').update({ preferences: merged }).eq('id', data.claims.sub);
	}
</script>

<ClassView
	section={data.section}
	items={data.items}
	units={data.units}
	sections={data.sections}
	canManage={data.canManage}
	attachmentsEnabled={data.attachmentsEnabled}
	checkIns={data.checkIns}
	sectionOutstanding={data.sectionOutstanding}
	work={data.work}
	{collapsed}
	onToggleGroup={toggleGroup}
	{transports}
	{unitTransports}
	{deckTransports}
	{teacherTransports}
	{submitFeedback}
	{notebookHref}
	fetchPreview={fetchLinkPreviewClient}
	loadExportStatuses={(ids) => loadExportStatuses(data.supabase, ids)}
	retryExport={runClassroomExport}
	onchanged={() => invalidateAll()}
/>
