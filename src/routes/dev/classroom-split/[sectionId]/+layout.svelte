<script module lang="ts">
	// Module scope, so it survives client-side navigation between child routes.
	let mounts = 0;

	/**
	 * `?manage=1` LATCHES for the session. The row links are ordinary hrefs with
	 * no query on them, so without this a client-side navigation would drop back
	 * to the student view -- and every teacher-side claim measured after a click
	 * would be measuring the wrong page. In production `canManage` comes from the
	 * load, so there is nothing here to mirror.
	 */
	let manageLatch = false;
	export function harnessManage(url: URL): boolean {
		if (url.searchParams.get('manage') === '1') manageLatch = true;
		if (url.searchParams.get('manage') === '0') manageLatch = false;
		return manageLatch;
	}
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
	import type {
		ClassroomComposerTransports,
		ClassroomUnitTransports,
		TxResult
	} from '$lib/classroom/classroom';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	/**
	 * `?manage=1` mounts the list AS A TEACHER, which is what makes the toolbar,
	 * the row menu and the unit picker inside it measurable -- with no transports
	 * every management control is correctly absent, so "the select is not in the
	 * row any more" would be vacuously true. Read in the COMPONENT, never in a
	 * load: the layout load taking a `url` dependency is exactly what the split
	 * exists to avoid.
	 */
	const manage = $derived(harnessManage(page.url));

	const ok = <T,>(value: T): Promise<TxResult<T>> => Promise.resolve({ ok: true, data: value });

	/** Stubs. This harness is for geometry; /dev/classroom drives the writes. */
	const transports: ClassroomComposerTransports = {
		createItem: () => ok({ itemId: 'i-new', sectionIds: [], formattingDropped: false }),
		updateItem: () => ok({ itemId: 'i-1', sectionIds: [], formattingDropped: false }),
		deleteItem: () => ok(undefined),
		duplicateItem: () => ok({ itemId: 'i-copy' }),
		addPostings: () => ok({ added: 0 }),
		removePosting: () => ok({ ok: true }),
		setPublished: () => ok(undefined),
		setPinned: () => ok(undefined),
		setOrder: () => ok(undefined),
		uploadAttachment: () => ok(undefined),
		deleteAttachment: () => ok(undefined),
		uploadInstructorAttachment: () => ok(undefined),
		deleteInstructorAttachment: () => ok(undefined),
		setInstructorResources: () => ok(undefined),
		markViewed: () => ok(undefined)
	};

	const unitTransports: ClassroomUnitTransports = {
		upsertUnit: () => ok({ unitId: 'u-new', created: true, duplicate: false }),
		deleteUnit: () => ok({ unfiled: 0 }),
		setUnitOrder: () => ok(undefined),
		reloadUnits: () => ok(data.units),
		setItemUnit: () => ok({ ok: true })
	};

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
		canManage={manage}
		transports={manage ? transports : null}
		unitTransports={manage ? unitTransports : null}
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
