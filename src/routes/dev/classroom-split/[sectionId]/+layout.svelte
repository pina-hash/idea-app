<script module lang="ts">
	// Module scope, so it survives client-side navigation between child routes.
	let mounts = 0;
</script>

<script lang="ts">
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassSplit from '$lib/classroom/ClassSplit.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import { itemTitle, sectionTitle } from '$lib/classroom/classroom';
	import {
		activeTab,
		classroomCrumbs,
		classroomMeasure,
		locateClassroom,
		sectionTabs
	} from '$lib/classroom/nav';
	import { itemById, loads } from '../fixture';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	/**
	 * The harness's own path rewritten to the real one, so `locateClassroom`,
	 * `classroomMeasure`, `classroomCrumbs` and `sectionTabs` are the SHIPPING
	 * functions running on a shipping-shaped path. Nothing about where-am-I is
	 * re-implemented here.
	 */
	const loc = $derived(
		locateClassroom(page.url.pathname.replace('/dev/classroom-split', '/classroom'))
	);
	const measure = $derived(classroomMeasure(loc));
	const split = $derived(loc.place === 'section' || loc.place === 'item');
	const selectedItemId = $derived(loc.place === 'item' ? loc.itemId : null);

	const crumbs = $derived(
		classroomCrumbs(
			loc,
			{
				section: sectionTitle(data.section),
				item: selectedItemId ? itemTitle(itemById(selectedItemId) ?? ({} as never)) : null
			},
			'/dev/classroom-split'
		)
	);
	const tabs = $derived(loc.sectionId ? sectionTabs(loc.sectionId) : []);

	/**
	 * MOUNTS OF THIS COMPONENT, counted in the instance body -- which runs once
	 * per instantiation and never again -- rather than in an effect, which would
	 * re-run on its own write. If opening an item remounted the layout, which is
	 * what would throw the list's state away, this would climb. It does not.
	 */
	mounts += 1;
	const myMount = mounts;

	/**
	 * The folded-groups state the real layout holds, mirrored here so "the list's
	 * own state survives opening an item" is something to drive rather than
	 * something to argue. It lives in the LAYOUT component, which is the whole
	 * mechanism.
	 */
	let collapsed = $state<string[]>([]);
	function toggleGroup(groupId: string) {
		collapsed = collapsed.includes(groupId)
			? collapsed.filter((id) => id !== groupId)
			: [...collapsed, groupId];
	}

	// Read from the console: `window.__splitProbe()`.
	$effect(() => {
		(window as unknown as Record<string, unknown>).__splitProbe = () => ({
			layoutLoads: loads.layout,
			itemLoads: loads.item,
			layoutMounts: mounts,
			thisInstance: myMount,
			collapsed: [...collapsed],
			place: loc.place,
			measure,
			selectedItemId
		});
	});
</script>

{#snippet classList()}
	<ClassView
		section={data.section}
		items={data.items}
		units={data.units}
		{selectedItemId}
		{collapsed}
		onToggleGroup={toggleGroup}
		asPane={!!selectedItemId}
		basePath="/dev/classroom-split"
	/>
{/snippet}

<div class="cr-root" style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}>
	<ClassroomShell
		sections={[data.section]}
		currentSectionId="s-1"
		{crumbs}
		{tabs}
		tab={activeTab(loc)}
		canManage={true}
	>
		{#if split}
			<ClassSplit hasDetail={!!selectedItemId} nav={classList}>{@render children()}</ClassSplit>
		{:else}
			{@render children()}
		{/if}
	</ClassroomShell>
</div>
