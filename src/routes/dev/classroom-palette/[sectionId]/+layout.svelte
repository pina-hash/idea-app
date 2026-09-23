<script module lang="ts">
	/**
	 * `?manage=1` LATCHES for the session (the /dev/classroom-split rule): the
	 * palette's item rows are ordinary hrefs with no query, so without the
	 * latch a pick would drop a teacher back to the student view and every
	 * manager-side claim measured after it would be measuring the wrong page.
	 */
	let manageLatch = false;
	export function harnessManage(url: URL): boolean {
		if (url.searchParams.get('manage') === '1') manageLatch = true;
		if (url.searchParams.get('manage') === '0') manageLatch = false;
		return manageLatch;
	}

	/**
	 * THE PERSON'S PROFILE ROW, in memory, at module scope so it outlives a
	 * navigation between items exactly as the real row outlives one. The store
	 * writes it through the SHIPPING `profileNamespaceWriter` (read the row,
	 * merge the changed groups into the `classroom` namespace, write it back),
	 * so what this harness shows about the account half is the real write path
	 * answering in memory. `homepage` is here so a probe can see a sibling
	 * namespace survive every classroom write.
	 */
	export const harnessRow: { preferences: Record<string, unknown>; writes: number } = {
		preferences: { homepage: { pinned: ['gauntlet'] } },
		writes: 0
	};
	let seeded = false;
	/** `?opens=todo|missing|drafts` seeds the account default once, as if chosen on another computer. */
	export function seedOpensOn(url: URL) {
		const want = url.searchParams.get('opens');
		if (seeded || !want) return;
		seeded = true;
		harnessRow.preferences = { ...harnessRow.preferences, classroom: { classView: { opensOn: want } } };
	}
</script>

<script lang="ts">
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import { itemTitle, sectionTitle, type ClassroomComposerTransports, type TxResult } from '$lib/classroom/classroom';
	import { activeTab, classroomCrumbs, classroomMeasure, locateClassroom, sectionTabs } from '$lib/classroom/nav';
	import {
		CLASSROOM_PREFERENCES_NAMESPACE,
		classOpensOnFor,
		classroomLocalKey,
		createClassroomPreferences
	} from '$lib/preferences/classroom';
	import { reactivePreferences } from '$lib/preferences/context';
	import { namespaceOf, profileNamespaceWriter, type ProfilePreferenceIo } from '$lib/preferences/profile-io';
	import { liveCommandIds } from '$lib/shell/command-handlers';
	import type { PaletteSources, PaletteStudent } from '$lib/shell/palette';
	import {
		BASE,
		CLOCK,
		MANAGER_CHECK_INS,
		SECTIONS,
		STUDENTS,
		STUDENT_CHECK_INS,
		WORK,
		itemById
	} from '../fixture';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const manage = $derived(harnessManage(page.url));
	seedOpensOn(page.url);

	/* ---------------------------------------------------------------------
	 * THE OUTER CLASSROOM LAYOUT'S HALF (src/routes/classroom/+layout.svelte)
	 * ------------------------------------------------------------------ */

	const VIEWER = 'harness-viewer';
	const io: ProfilePreferenceIo = {
		key: `harness:${VIEWER}`,
		async read() {
			await new Promise((r) => setTimeout(r, 20));
			return structuredClone(harnessRow.preferences);
		},
		async write(preferences) {
			await new Promise((r) => setTimeout(r, 20));
			harnessRow.preferences = structuredClone(preferences);
			harnessRow.writes += 1;
		}
	};
	const preferences = createClassroomPreferences({
		viewer: VIEWER,
		account: {
			initial: namespaceOf(harnessRow.preferences, CLASSROOM_PREFERENCES_NAMESPACE),
			writer: profileNamespaceWriter(io, CLASSROOM_PREFERENCES_NAMESPACE)
		}
	});
	const prefs = reactivePreferences(preferences);

	const loc = $derived(locateClassroom(page.url.pathname.replace(BASE, '/classroom')));
	const measure = $derived(classroomMeasure(loc));
	const selectedItemId = $derived(loc.place === 'item' ? loc.itemId : null);
	const crumbs = $derived(
		classroomCrumbs(
			loc,
			{
				section: sectionTitle(data.section),
				item: selectedItemId ? itemTitle(itemById(selectedItemId) ?? ({} as never)) : null
			},
			BASE
		)
	);
	const tabs = $derived(loc.sectionId ? sectionTabs(loc.sectionId, BASE) : []);
	const checkIns = $derived(data.section.id === 's-1' ? (manage ? MANAGER_CHECK_INS : STUDENT_CHECK_INS) : []);
	/** What the read returns: a student's RLS never hands over an unpublished item. */
	const items = $derived(manage ? data.items : data.items.filter((i) => i.published));

	const paletteSources = $derived<PaletteSources>({
		section: data.section.id === loc.sectionId ? data.section : null,
		items,
		units: data.units,
		sections: SECTIONS,
		checkIns
	});

	/** The roster, answered in memory after a round trip's worth of wait. */
	let rosterLoads = $state(0);
	async function loadStudents(): Promise<PaletteStudent[]> {
		rosterLoads += 1;
		await new Promise((r) => setTimeout(r, 40));
		return STUDENTS;
	}

	/* ---------------------------------------------------------------------
	 * THE SECTION LAYOUT'S HALF (src/routes/classroom/[sectionId]/+layout.svelte)
	 * ------------------------------------------------------------------ */

	const opensOn = $derived(classOpensOnFor(prefs.current.classView.opensOn, manage));

	let collapsed = $state<string[]>([]);
	function toggleGroup(groupId: string) {
		collapsed = collapsed.includes(groupId) ? collapsed.filter((id) => id !== groupId) : [...collapsed, groupId];
	}

	/** Enough of a write surface for a manager's controls (and New post) to exist; nothing is stored. */
	const ok = <T,>(value: T): Promise<TxResult<T>> => Promise.resolve({ ok: true, data: value });
	const transports: ClassroomComposerTransports = {
		createItem: () => ok({ itemId: 'i-new', sectionIds: [], formattingDropped: false }),
		updateItem: (id) => ok({ itemId: id, sectionIds: [], formattingDropped: false }),
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
	let composeRequests = $state(0);

	// Read from the console or a spec: `window.__paletteProbe()`.
	$effect(() => {
		(window as unknown as Record<string, unknown>).__paletteProbe = () => {
			let local: unknown = null;
			try {
				const text = localStorage.getItem(classroomLocalKey(VIEWER));
				local = text ? JSON.parse(text) : null;
			} catch {
				local = 'unreadable';
			}
			return {
				manage,
				current: preferences.current,
				row: structuredClone(harnessRow.preferences),
				rowWrites: harnessRow.writes,
				local,
				density: document.querySelector('.cr-root')?.getAttribute('data-density') ?? null,
				handlers: [...liveCommandIds()].sort(),
				rosterLoads,
				composeRequests,
				path: location.pathname
			};
		};
		(window as unknown as Record<string, unknown>).__paletteFlush = () => preferences.flush();
	});
</script>

{#snippet classList()}
	<ClassView
		section={data.section}
		{items}
		units={data.units}
		sections={SECTIONS}
		{selectedItemId}
		{collapsed}
		canManage={manage}
		transports={manage ? transports : null}
		{checkIns}
		work={manage ? {} : WORK}
		onCompose={manage ? () => (composeRequests += 1) : null}
		onToggleGroup={toggleGroup}
		asPane={!!selectedItemId}
		basePath={BASE}
		notebookHref="/dev/notebook"
		{opensOn}
		clock={CLOCK}
	/>
{/snippet}

<div
	class="cr-root"
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
	data-density={prefs.current.display.density}
>
	<ClassroomShell
		basePath={BASE}
		sections={SECTIONS}
		currentSectionId={data.section.id}
		{crumbs}
		{tabs}
		tab={activeTab(loc)}
		canManage={manage}
		isStaff={manage}
		palette={paletteSources}
		{preferences}
		loadStudents={manage ? loadStudents : null}
	>
		<ClassSplit hasDetail={!!selectedItemId} nav={classList}>
			{@render children()}
		</ClassSplit>
	</ClassroomShell>
</div>
