<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import ClassSplit from '$lib/classroom/ClassSplit.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import {
		readClassViewPrefs,
		toggleGroupCollapsed,
		type ClassViewPrefs
	} from '$lib/classroom/classroom';
	import { locateClassroom } from '$lib/classroom/nav';
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
	import type { LayoutData } from './$types';

	/**
	 * ONE CLASS, as a two-pane master-detail shell.
	 *
	 * WHY THIS IS A LAYOUT. The class content is the NAVIGATION for everything
	 * inside the class, so above 1024px it stays on screen on the left while the
	 * thing you picked opens on the right. Mounting ClassView here rather than on
	 * the page is what makes that true structurally: a layout component is not
	 * remounted when a child route changes, so opening an item preserves every
	 * bit of the list's local state -- which groups are folded, which rows are
	 * expanded, an open composer, an open row menu, and the pane's scroll
	 * position -- and re-runs only the item's own load.
	 *
	 * BELOW 1024px NOTHING ABOUT THE OLD BEHAVIOUR CHANGES. The panes stack to
	 * one column and exactly one of them is on screen: the class page shows the
	 * list, an item shows the item, full width. See `.cr-split` in classroom.css
	 * -- which pane is hidden is CSS reading `has-detail`, so no state and no
	 * viewport measurement decides it.
	 *
	 * SPLIT ONLY WHERE A LIST BESIDE A DETAIL MEANS SOMETHING: the class page and
	 * an item. Grading, the roster, the marks table and the full-screen deck
	 * viewer are their own surfaces and render full width, exactly as they do
	 * today. Reading the pathname HERE is free -- it is component reactivity, not
	 * a load dependency (see the layout load's own note on that).
	 */
	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const loc = $derived(locateClassroom(page.url.pathname));
	const split = $derived(loc.place === 'section' || loc.place === 'item');
	const selectedItemId = $derived(loc.place === 'item' ? loc.itemId : null);

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
	 *
	 * The effect reads the LAYOUT's data, which is not re-created when a child
	 * route changes -- so opening an item does not reset the folded groups. It
	 * still fires on a real reload of the class (invalidateAll after an edit),
	 * which is when the server's answer should win again.
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

{#snippet classList()}
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
		{selectedItemId}
		asPane={!!selectedItemId}
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
{/snippet}

{#if split}
	<ClassSplit hasDetail={!!selectedItemId} nav={classList}>{@render children()}</ClassSplit>
{:else}
	{@render children()}
{/if}
