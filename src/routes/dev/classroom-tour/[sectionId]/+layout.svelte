<script module lang="ts">
	import { classroomLocalKey } from '$lib/preferences/classroom';

	/** Where this harness is mounted; every href the shell and the list build starts here. */
	export const TOUR_BASE = '/dev/classroom-tour';

	/**
	 * `?manage=1` LATCHES for the session (the /dev/classroom-split rule): item
	 * links carry no query, so without the latch opening an item would drop a
	 * teacher back to the student view.
	 */
	let manageLatch = false;
	export function harnessManage(url: URL): boolean {
		if (url.searchParams.get('manage') === '1') manageLatch = true;
		if (url.searchParams.get('manage') === '0') manageLatch = false;
		return manageLatch;
	}

	/**
	 * THE PERSON'S PROFILE ROW, in memory, at module scope so it outlives a
	 * navigation between items exactly as the real row outlives one. Written
	 * through the SHIPPING `profileNamespaceWriter` (read the row, merge the
	 * changed groups into `classroom`, write it back), so what this harness
	 * shows about the tour's stored state is the real write path answering in
	 * memory. `homepage` is here so a probe can see a sibling namespace survive.
	 */
	export const tourRow: { preferences: Record<string, unknown>; writes: number } = {
		preferences: { homepage: { pinned: ['gauntlet'] } },
		writes: 0
	};
	let seeded = false;
	/**
	 * `?tour=unseen|offered|finished|dismissed` seeds BOTH tours' stored state
	 * once, as if set on another computer; absent is `unseen`, a first visit.
	 * `?nav=<rem>` seeds this device's list width.
	 */
	export function seedTour(url: URL, viewer: string) {
		if (seeded) return;
		seeded = true;
		const state = url.searchParams.get('tour');
		if (state) {
			tourRow.preferences = {
				...tourRow.preferences,
				classroom: { guidance: { tours: { teacher: state, student: state } } }
			};
		}
		const nav = url.searchParams.get('nav');
		try {
			const key = classroomLocalKey(viewer);
			if (nav) localStorage.setItem(key, JSON.stringify({ display: { navWidth: Number(nav) } }));
			else localStorage.removeItem(key);
		} catch {
			/* storage blocked: the default width */
		}
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
		createClassroomPreferences
	} from '$lib/preferences/classroom';
	import { provideClassroomPreferences, reactivePreferences } from '$lib/preferences/context';
	import { namespaceOf, profileNamespaceWriter, type ProfilePreferenceIo } from '$lib/preferences/profile-io';
	import { liveCommandIds } from '$lib/shell/command-handlers';
	import type { PaletteSources, PaletteStudent } from '$lib/shell/palette';
	import {
		CLOCK,
		MANAGER_CHECK_INS,
		SECTIONS,
		STUDENTS,
		STUDENT_CHECK_INS,
		WORK,
		itemById
	} from '../../classroom-palette/fixture';
	import type { LayoutData } from './$types';

	/**
	 * THE REAL CLASSROOM LAYOUT'S TWO HALVES, in one file: the outer layout
	 * (the store, provided by context exactly as src/routes/classroom/+layout.svelte
	 * provides it, the measure, the density attribute, the to-do door for a
	 * student) and the section layout (the list, the split). What differs from
	 * production is only where the data comes from.
	 */
	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const manage = $derived(harnessManage(page.url));
	const VIEWER = 'tour-viewer';
	seedTour(page.url, VIEWER);

	const io: ProfilePreferenceIo = {
		key: `harness:${VIEWER}`,
		async read() {
			await new Promise((r) => setTimeout(r, 20));
			return structuredClone(tourRow.preferences);
		},
		async write(preferences) {
			await new Promise((r) => setTimeout(r, 20));
			tourRow.preferences = structuredClone(preferences);
			tourRow.writes += 1;
		}
	};
	const preferences = createClassroomPreferences({
		viewer: VIEWER,
		account: {
			initial: namespaceOf(tourRow.preferences, CLASSROOM_PREFERENCES_NAMESPACE),
			writer: profileNamespaceWriter(io, CLASSROOM_PREFERENCES_NAMESPACE)
		}
	});
	provideClassroomPreferences(preferences);
	const prefs = reactivePreferences(preferences);

	const loc = $derived(locateClassroom(page.url.pathname.replace(TOUR_BASE, '/classroom')));
	const measure = $derived(classroomMeasure(loc));
	const selectedItemId = $derived(loc.place === 'item' ? loc.itemId : null);
	const crumbs = $derived(
		classroomCrumbs(
			loc,
			{
				section: sectionTitle(data.section),
				item: selectedItemId ? itemTitle(itemById(selectedItemId) ?? ({} as never)) : null
			},
			TOUR_BASE
		)
	);
	const tabs = $derived(loc.sectionId ? sectionTabs(loc.sectionId, TOUR_BASE) : []);
	const checkIns = $derived(data.section.id === 's-1' ? (manage ? MANAGER_CHECK_INS : STUDENT_CHECK_INS) : []);
	const items = $derived(manage ? data.items : data.items.filter((i) => i.published));

	const paletteSources = $derived<PaletteSources>({
		section: data.section.id === loc.sectionId ? data.section : null,
		items,
		units: data.units,
		sections: SECTIONS,
		checkIns
	});
	async function loadStudents(): Promise<PaletteStudent[]> {
		await new Promise((r) => setTimeout(r, 40));
		return STUDENTS;
	}

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

	// Read from the console or a spec: `window.__tourProbe()`.
	$effect(() => {
		(window as unknown as Record<string, unknown>).__tourProbe = () => {
			let local: unknown = null;
			try {
				const text = localStorage.getItem(classroomLocalKey(VIEWER));
				local = text ? JSON.parse(text) : null;
			} catch {
				local = 'unreadable';
			}
			return {
				manage,
				tours: preferences.current.guidance.tours,
				navWidth: preferences.current.display.navWidth,
				row: structuredClone(tourRow.preferences),
				rowWrites: tourRow.writes,
				local,
				offer: document.querySelector('[data-testid="tour-offer"]')?.getAttribute('data-tour-id') ?? null,
				handlers: [...liveCommandIds()].sort(),
				path: location.pathname
			};
		};
		(window as unknown as Record<string, unknown>).__tourFlush = () => preferences.flush();
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
		onCompose={manage ? () => {} : null}
		onToggleGroup={toggleGroup}
		asPane={!!selectedItemId}
		basePath={TOUR_BASE}
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
		basePath={TOUR_BASE}
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
		todoHref={manage ? null : `${TOUR_BASE}/s-1`}
	>
		<ClassSplit hasDetail={!!selectedItemId} nav={classList}>
			{@render children()}
		</ClassSplit>
	</ClassroomShell>
</div>
