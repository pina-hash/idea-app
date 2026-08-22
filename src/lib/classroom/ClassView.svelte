<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import ItemBody from '$lib/classroom/ItemBody.svelte';
	import LinkPreviewCard from '$lib/classroom/LinkPreviewCard.svelte';
	import UnitManager from '$lib/classroom/UnitManager.svelte';
	import type { AssignmentTeacherTransports } from '$lib/classroom/assignment-spec';
	import type { DeckTransports } from '$lib/classroom/deck';
	import {
		classifyExportError,
		exportFailed,
		exportFailureLabel,
		type ExportOutcome,
		type ItemExportStatus
	} from '$lib/classroom/revisions';
	import {
		UNFILED_GROUP_ID,
		authorLabel,
		classGroups,
		editedWhen,
		emailLocal,
		formatDue,
		instructorAttachmentSrc,
		isScheduled,
		isUpdatedForViewer,
		itemKindLabel,
		itemTitle,
		reorderedIds,
		scheduleLabel,
		sectionTitle,
		shortWhen,
		sortUnits,
		unitIdFor,
		workStateLabel,
		workStateTone,
		type ClassroomComposerTransports,
		type ClassroomItem,
		type ClassroomSection,
		type ClassroomUnit,
		type ClassroomUnitTransports,
		type LinkPreview,
		type StudentWork,
		type TxResult
	} from '$lib/classroom/classroom';
	import {
		checkInHref,
		checkInMeta,
		checkInStatusLabel,
		checkInTone,
		streamCheckIns,
		outstandingBadge,
		mergeCheckIns,
		outstandingCheckIns,
		type ClassCheckIn
	} from '$lib/classroom/class-check-ins';
	import { flagReasonLabel } from '$lib/notebook';
	import { formatSectionLabel } from '$lib/section-label';

	/**
	 * ONE view of a class's content, grouped by the units its teacher authored.
	 *
	 * THIS REPLACES THE STREAM/CLASSWORK PAIR. Both tabs showed the same items in
	 * two orderings: Stream duplicated the home feed, which already ranks by
	 * urgency and does it better, and Classwork grouped by due-date buckets these
	 * courses are simply not organized into -- they run in units and rotations,
	 * which the module had no concept of until 0111.
	 *
	 * RLS already decided what is in `items`: a student load never receives a
	 * draft, and `canManage` only adds chrome and controls, never data. Management
	 * lives on the rows because "edit that announcement" is a thought somebody has
	 * while looking at the announcement -- but BEHIND ONE MENU, so four buttons on
	 * every row no longer give management the same visual weight as the content.
	 */
	let {
		section,
		items,
		units = [],
		sections = [],
		canManage = false,
		transports = null,
		unitTransports = null,
		attachmentsEnabled = true,
		basePath = '/classroom',
		notebookHref = null,
		checkIns = [],
		sectionOutstanding = null,
		work = {},
		collapsed = [],
		selectedItemId = null,
		asPane = false,
		composing = false,
		onCompose = null,
		notice = null,
		onToggleGroup = null,
		fetchPreview = null,
		deckTransports = null,
		teacherTransports = null,
		loadExportStatuses = null,
		retryExport = null,
		onchanged = null
	}: {
		section: ClassroomSection;
		items: ClassroomItem[];
		/** This course's units (0111). Empty = one chronological list, as before. */
		units?: ClassroomUnit[];
		/** Every section the caller manages, for the composer's linkage controls. */
		sections?: ClassroomSection[];
		canManage?: boolean;
		/** Omitted (null) on every read-only surface. */
		transports?: ClassroomComposerTransports | null;
		/** Null = units are not offered here (a read-only surface, or pre-0111). */
		unitTransports?: ClassroomUnitTransports | null;
		attachmentsEnabled?: boolean;
		/** Link root: every item href is built from it. */
		basePath?: string;
		notebookHref?: string | null;
		checkIns?: ClassCheckIn[];
		sectionOutstanding?: number | null;
		/**
		 * The CALLER'S OWN standing on each assignment, keyed by item id. Empty for
		 * a manager, who has none -- see studentWorkMap.
		 */
		work?: Record<string, StudentWork>;
		/** Group ids this user keeps folded, persisted per user by the route. */
		collapsed?: string[];
		/**
		 * The item open in the detail pane beside this list, marked here so the
		 * two-pane shell says which row you are reading. Null on every surface
		 * that is not a split -- a phone, the dev harness -- where there
		 * is no detail pane for a row to correspond to.
		 */
		selectedItemId?: string | null;
		/**
		 * There is an open DETAIL PANE beside this list, so the list is no longer
		 * the main content of the page.
		 *
		 * Purely a landmark switch, and it tracks the detail rather than the split
		 * for a reason found at 375px: below the breakpoint the detail pane is the
		 * only pane on screen when something is open, and the list is the only one
		 * when nothing is. Keying on "is this a split" instead left the class page
		 * on a phone with its one `<main>` inside the hidden pane.
		 */
		asPane?: boolean;
		/**
		 * THE COMPOSER IS NOT MOUNTED HERE ANY MORE, and this pair is what is left
		 * of it: the trigger, and the state the trigger reflects.
		 *
		 * It opened inside this list, which is a ~26rem navigation pane -- a full
		 * authoring form (title, rich body, three assignment fields, links, two
		 * file lists, a deck, a spec, a posting checklist, a schedule) does not
		 * fit in it, and the pane it belongs in was sitting empty beside it. The
		 * OWNER is the section layout, so the staged Files it holds survive
		 * opening an item; a route-level component's would not.
		 */
		composing?: boolean;
		/** Null on every read-only surface: no transports, no trigger. */
		onCompose?: (() => void) | null;
		/**
		 * A message from an action the LIST did not run -- a post the composer
		 * made in the pane beside it. Shown in the same place as this component's
		 * own, which is BELOW the toolbar: it used to render above, so the primary
		 * actions were pushed down the moment anything was posted.
		 */
		notice?: string | null;
		onToggleGroup?: ((groupId: string) => void | Promise<void>) | null;
		fetchPreview?: ((url: string) => Promise<LinkPreview | null>) | null;
		deckTransports?: DeckTransports | null;
		teacherTransports?: AssignmentTeacherTransports | null;
		/**
		 * The GitHub export's last outcome for the items on screen (0110).
		 *
		 * A CALLBACK rather than a map, and its own query rather than columns on
		 * the shared item select, for the deploy-ordering reason ITEM_SELECT
		 * documents: naming 0110's columns there would blank every classroom read
		 * until 0110 landed. Null omits the chips, which is the fail-soft state on
		 * a deployment without it. It moved here from the retired console because
		 * this is where a manager now sees their content listed.
		 */
		loadExportStatuses?: ((itemIds: string[]) => Promise<Record<string, ItemExportStatus>>) | null;
		/** Null hides Retry -- a deployment with no token never exports at all. */
		retryExport?: ((itemId: string) => Promise<TxResult<ExportOutcome>>) | null;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	let unitsOpen = $state(false);
	let editing = $state<string | null>(null);
	let expanded = $state<Record<string, boolean>>({});
	let openMenu = $state<string | null>(null);
	let armDelete = $state<string | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);
	/** This list's own actions (pin, copy, file, delete); `notice` is the pane's. */
	let localNotice = $state<string | null>(null);
	let seen = $state<Record<string, boolean>>({});
	let menuHost = $state<HTMLElement | null>(null);

	const shownNotice = $derived(localNotice ?? notice);

	const editable = $derived(canManage && !!transports);
	const editingItem = $derived(items.find((i) => i.id === editing) ?? null);
	const orderedUnits = $derived(sortUnits(units));

	/**
	 * An empty unit is shown to a MANAGER (it is structure they are about to file
	 * into, and it has to be visible to be a target) and hidden from a student,
	 * for whom it is a heading over nothing.
	 */
	const groups = $derived(classGroups(items, units, { includeEmptyUnits: canManage }));

	/**
	 * CHECK-INS RIDE THE UNFILED GROUP, merged chronologically by the same
	 * insertion rule that has always placed them.
	 *
	 * A notebook check-in is not a `classroom_items` row and has no classroom
	 * unit, so "Not in a unit" is literally true of it -- and matching its
	 * notebook unit NUMBER against a freely-named classroom unit would be a guess
	 * dressed up as a link. On a class with no units at all this is the whole
	 * view, which is exactly the merged list the Stream used to be.
	 *
	 * A CHECK-IN ATTACHED TO AN ITEM (0120) IS NOT HERE AT ALL. It renders on
	 * that item, in whatever unit the item is filed under, and `mergeCheckIns`
	 * drops it -- so this list never has to know the rule, and no group can grow
	 * a second row for something already on the page.
	 */
	function entriesFor(groupId: string, groupItems: ClassroomItem[]) {
		return groupId === UNFILED_GROUP_ID
			? // mergeCheckIns, NOT streamEntries: that one starts by running the
				// items through `streamItems`, which DROPS MATERIALS -- correct for
				// the Stream it was written for, and it would make every syllabus and
				// handout vanish from this page. The group's order is already the
				// one classGroups decided.
				mergeCheckIns(groupItems, checkIns)
			: groupItems.map((item) => ({ kind: 'item' as const, key: `item:${item.id}`, item }));
	}

	const outstanding = $derived(
		outstandingBadge(canManage ? sectionOutstanding : outstandingCheckIns(checkIns))
	);

	/** With nothing filed and no units, the single group needs no heading at all. */
	const bare = $derived(groups.length === 1 && groups[0].id === UNFILED_GROUP_ID && !orderedUnits.length);

	function isCollapsed(id: string): boolean {
		return !bare && collapsed.includes(id);
	}

	function updated(item: ClassroomItem): boolean {
		return !seen[item.id] && isUpdatedForViewer(item);
	}

	function alsoIn(item: ClassroomItem): ClassroomSection[] {
		return item.postings
			.filter((p) => p.section_id !== section.id)
			.map((p) => sections.find((s) => s.id === p.section_id))
			.filter((s): s is ClassroomSection => !!s);
	}

	/**
	 * EXPANDING IS WHAT MARKS AN ANNOUNCEMENT READ, and that is a change from the
	 * Stream, honestly: there, an announcement was rendered in full, so being on
	 * the page genuinely was opening it. Here a row shows a title until somebody
	 * asks for the rest, so the badge clears when they do. The write is
	 * fire-and-forget (nobody waits on a bookkeeping row) and deferred out of the
	 * click handler's own turn, the LinkPreviewCard rule.
	 */
	function toggleExpand(item: ClassroomItem) {
		const next = !expanded[item.id];
		expanded = { ...expanded, [item.id]: next };
		openMenu = null;
		if (!next || canManage || !transports || seen[item.id] || !isUpdatedForViewer(item)) return;
		const write = transports;
		seen = { ...seen, [item.id]: true };
		queueMicrotask(() => void write.markViewed(item.id));
	}

	function toggleMenu(id: string) {
		openMenu = openMenu === id ? null : id;
		armDelete = null;
	}

	function onPointerDown(event: PointerEvent) {
		if (!openMenu) return;
		const target = event.target as Node | null;
		if (!target || !target.isConnected) return;
		if (menuHost?.contains(target)) return;
		openMenu = null;
		armDelete = null;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && openMenu) {
			openMenu = null;
			armDelete = null;
		}
	}

	async function run(fn: () => Promise<{ ok: boolean; message?: string }>, ok?: string) {
		busy = true;
		error = null;
		localNotice = null;
		const res = await fn();
		busy = false;
		if (!res.ok) {
			error = res.message ?? 'Something went wrong.';
			return false;
		}
		if (ok) localNotice = ok;
		await onchanged?.();
		return true;
	}

	async function remove(id: string) {
		if (!transports) return;
		// Two-step confirm, the gauntlet-room-delete convention.
		if (armDelete !== id) {
			armDelete = id;
			return;
		}
		armDelete = null;
		openMenu = null;
		if (editing === id) editing = null;
		await run(() => transports.deleteItem(id));
	}

	async function togglePin(item: ClassroomItem) {
		if (!transports) return;
		openMenu = null;
		await run(
			() => transports.setPinned(item.id, !item.pinned),
			item.pinned ? 'Unpinned.' : 'Pinned to the top of its unit.'
		);
	}

	async function duplicate(item: ClassroomItem) {
		if (!transports) return;
		openMenu = null;
		const res = await transports.duplicateItem(item.id);
		if (!res.ok) {
			error = res.message;
			return;
		}
		await onchanged?.();
		editing = res.data.itemId;
		localNotice = 'Copied as a new draft. Edit it below, then post it.';
	}

	async function move(groupItems: ClassroomItem[], item: ClassroomItem, direction: -1 | 1) {
		if (!transports) return;
		openMenu = null;
		const ids = reorderedIds(groupItems, item.id, direction);
		if (!ids) return;
		await run(() => transports.setOrder(ids));
	}

	/** Filing: one click and a pick, the fast path a teacher uses many times. */
	async function fileInto(item: ClassroomItem, value: string) {
		if (!unitTransports) return;
		const target = unitIdFor(value);
		if ((item.unit_id ?? null) === target) return;
		busy = true;
		error = null;
		localNotice = null;
		const res = await unitTransports.setItemUnit(item.id, target);
		busy = false;
		if (!res.ok) {
			error = res.message;
			return;
		}
		if (res.data.ok === false) {
			error =
				res.data.reason === 'wrong_course'
					? 'That unit belongs to another course.'
					: 'That move was refused.';
			return;
		}
		await onchanged?.();
	}

	function toggleEdit(id: string) {
		editing = editing === id ? null : id;
		openMenu = null;
		armDelete = null;
		error = null;
		localNotice = null;
	}

	async function saved() {
		editing = null;
		await onchanged?.();
	}

	// --- Export outcomes (0110) -------------------------------------------
	//
	// Loaded for whatever is on screen, and never on its own: an item id this
	// view is not showing has no chip to put a status on. Overrides layer OVER
	// the loaded map so a retry changes the chip without a reload, and a fresh
	// load supersedes them.
	let exportStatuses = $state<Record<string, ItemExportStatus>>({});
	let exportOverrides = $state<Record<string, ItemExportStatus>>({});
	let retrying = $state<string | null>(null);

	$effect(() => {
		const load = loadExportStatuses;
		const ids = items.map((i) => i.id);
		if (!load || !canManage || !ids.length) return;
		let alive = true;
		void load(ids).then((res) => {
			if (!alive) return;
			exportStatuses = res;
			exportOverrides = {};
		});
		return () => {
			alive = false;
		};
	});

	function exportStatusFor(itemId: string): ItemExportStatus | null {
		return exportOverrides[itemId] ?? exportStatuses[itemId] ?? null;
	}

	function blankExport(): ItemExportStatus {
		return { slug: null, lastExportAt: null, lastExportSha: null, lastExportError: null };
	}

	/**
	 * The chip's word for whatever went wrong, read out of the STORED message.
	 *
	 * Classified from the text rather than from a field, because after a reload
	 * the text is all there is -- `classroom_record_export` stores one column.
	 * A collision and a refusal are different problems with different answers:
	 * one of them is fixed by the button sitting right next to the chip, and
	 * the other never will be.
	 */
	function exportChipLabel(itemId: string): string {
		return exportFailureLabel(classifyExportError(exportStatusFor(itemId)?.lastExportError));
	}

	async function doRetryExport(item: ClassroomItem) {
		if (!retryExport || retrying) return;
		retrying = item.id;
		const res = await retryExport(item.id);
		retrying = null;
		const previous = exportStatusFor(item.id) ?? blankExport();
		if (!res.ok) {
			exportOverrides = { ...exportOverrides, [item.id]: { ...previous, lastExportError: res.message } };
			return;
		}
		const outcome = res.data;
		if (outcome.status === 'ok') {
			exportOverrides = {
				...exportOverrides,
				[item.id]: {
					slug: outcome.slug,
					lastExportAt: new Date().toISOString(),
					lastExportSha: outcome.sha,
					lastExportError: null
				}
			};
			return;
		}
		// Nothing to export is not a failure: the chip goes away rather than being
		// replaced with a different complaint.
		exportOverrides = {
			...exportOverrides,
			[item.id]: {
				...previous,
				lastExportError: outcome.status === 'skipped' ? null : outcome.error
			}
		};
	}
</script>

<svelte:window onpointerdown={onPointerDown} onkeydown={onKeyDown} />

{#snippet kindGlyph(kind: ClassroomItem['kind'])}
	<span class="kind-glyph kind-{kind}" aria-hidden="true">
		{#if kind === 'assignment'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
				<path d="M7 3.5h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
				<path d="M14 3.5v5h5" />
				<path d="M9 14.5l2 2 4-4.5" />
			</svg>
		{:else if kind === 'material'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 9.5h3.5L14 5v14l-6.5-4.5H4z" />
				<path d="M17.5 9.5a4 4 0 0 1 0 5" />
			</svg>
		{/if}
	</span>
{/snippet}

{#snippet badges(item: ClassroomItem)}
	{#if item.pinned}
		<span class="chip pin-chip" title="Pinned to the top of its unit">
			<span aria-hidden="true">&#9679;</span> Pinned
		</span>
	{/if}
	<!-- THE DATE IS IN THE TOOLTIP, NOT THE CHIP. `.sched-chip` carries a whole
	     timestamp and is deliberately allowed to WRAP below 32rem (classroom.css,
	     to stop it pushing a page sideways) -- which in a two-line row means a
	     third line every time. The row's signal is that this is scheduled at all;
	     the item page's own strip carries the date in full. -->
	{#if canManage && !item.published}<span class="draft-chip">Draft</span>{:else if canManage && isScheduled(item)}<span class="sched-chip row-sched" title="Students see this from {scheduleLabel(item)}">Scheduled</span>{/if}
	{#if updated(item)}<span class="chip updated-chip">Updated</span>{/if}
{/snippet}

{#snippet detail(item: ClassroomItem)}
	<div class="row-detail" data-testid="row-detail">
		{#if item.kind === 'post'}
			<ItemBody {item} compact />
		{:else if item.body.trim()}
			<ItemBody {item} compact />
		{/if}
		{#if item.links.length}
			<div class="link-list">
				{#each item.links as l (l.id ?? l.url)}
					<LinkPreviewCard link={l} {fetchPreview} />
				{/each}
			</div>
		{/if}
		{#if item.attachments.length}
			<AttachmentList attachments={item.attachments} />
		{/if}
		{#if canManage && ((item.instructorLinks?.length ?? 0) > 0 || (item.instructorAttachments?.length ?? 0) > 0)}
			<div class="instructor-note-box">
				<span class="instructor-note-label">
					<span class="lock-glyph" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
							<rect x="4.5" y="10.5" width="15" height="10" rx="1.5" />
							<path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
						</svg>
					</span>
					Instructor only
				</span>
				{#if item.instructorLinks?.length}
					<div class="link-list">
						{#each item.instructorLinks as l (l.id ?? l.url)}
							<LinkPreviewCard link={l} {fetchPreview} />
						{/each}
					</div>
				{/if}
				{#if item.instructorAttachments?.length}
					<AttachmentList
						attachments={item.instructorAttachments}
						resolveSrc={(a) => instructorAttachmentSrc(a.id)}
					/>
				{/if}
			</div>
		{/if}
		{#if canManage && alsoIn(item).length}
			<p class="also-line">
				Also posted to {alsoIn(item).map((s) => sectionTitle(s)).join(', ')}
			</p>
		{/if}
		{#if item.edited_at}
			<p class="also-line">Updated {editedWhen(item.edited_at)}</p>
		{/if}
		{#if canManage && exportFailed(exportStatusFor(item.id))}
			<p class="export-line">
				<span class="chip export-chip">{exportChipLabel(item.id)}</span>
				<span class="export-why">{exportStatusFor(item.id)?.lastExportError}</span>
				{#if retryExport}
					<button
						type="button"
						class="btn secondary tiny"
						disabled={retrying === item.id}
						data-testid="export-retry-{item.id}"
						onclick={() => doRetryExport(item)}
					>
						{retrying === item.id ? 'Retrying…' : 'Retry'}
					</button>
				{/if}
			</p>
		{/if}
		<p class="detail-open">
			<a href={`${basePath}/${section.id}/item/${item.id}`}>Open this {itemKindLabel(item.kind).toLowerCase()} &#9656;</a>
		</p>
	</div>
{/snippet}

{#snippet itemRow(item: ClassroomItem, groupItems: ClassroomItem[])}
	<!--
		A STUDENT ALWAYS SEES WHERE THEY STAND ON AN ASSIGNMENT, including when
		that is "nothing yet": no submission row is exactly what not-started means
		(0086 creates the row on the first save), and rendering nothing would leave
		the one state a student most needs to notice as the only silent one.
		Managers get no chip at all -- `work` is empty for them by construction,
		because they have no personal standing on their own assignment.
	-->
	{@const my =
		canManage || item.kind !== 'assignment'
			? null
			: (work[item.id] ?? { state: 'not-started' as const, score: null })}
	<li class="row-wrap" class:editing={editing === item.id} class:selected={selectedItemId === item.id}>
		<div class="row" data-testid="item-row" data-selected={selectedItemId === item.id ? 'true' : undefined}>
			<button
				type="button"
				class="row-expand"
				aria-expanded={!!expanded[item.id]}
				aria-label={expanded[item.id] ? `Collapse ${itemTitle(item)}` : `Expand ${itemTitle(item)}`}
				data-testid="row-expand"
				onclick={() => toggleExpand(item)}
			>
				<span aria-hidden="true">{expanded[item.id] ? '▾' : '▸'}</span>
			</button>

			<a
				class="row-main"
				href={`${basePath}/${section.id}/item/${item.id}`}
				aria-current={selectedItemId === item.id ? 'page' : undefined}
				data-testid="row-open"
			>
				{@render kindGlyph(item.kind)}
				<!--
					TWO LINES, NEVER MORE. The title takes the slack and ellipsises;
					the chips beside it keep their own width. Attachment and link
					counts are small inline INDICATORS on that same line rather than a
					row of pills on one of their own -- at 26rem, a third line per row
					is ten rows a screen instead of eighteen.
				-->
				<span class="row-text">
					<span class="row-title">
						<span class="row-name">{itemTitle(item)}</span>
						{#if item.attachments.length || item.links.length}
							<span class="row-inds" aria-hidden="true">
								{#if item.attachments.length}
									<span class="ind" data-testid="chip-files" title="{item.attachments.length} file{item.attachments.length === 1 ? '' : 's'} attached">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
											<path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8L9.7 17.4a1.8 1.8 0 0 1-2.5-2.5l7.8-7.8" />
										</svg>{item.attachments.length}
									</span>
								{/if}
								{#if item.links.length}
									<span class="ind" data-testid="chip-links" title="{item.links.length} link{item.links.length === 1 ? '' : 's'}">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
											<path d="M10 13.5a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 4.8l-1.7 1.7" />
											<path d="M14 10.5a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 19.2l1.7-1.7" />
										</svg>{item.links.length}
									</span>
								{/if}
							</span>
							<!-- The counts read as text to assistive tech, where an icon and
							     a bare number would not. -->
							<span class="sr-only">
								{#if item.attachments.length}{item.attachments.length} file{item.attachments.length === 1 ? '' : 's'} attached.{/if}
								{#if item.links.length}{item.links.length} link{item.links.length === 1 ? '' : 's'}.{/if}
							</span>
						{/if}
						{#if my}
							<span class="chip tone-{workStateTone(my.state)}" data-testid="work-status">
								{workStateLabel(my, item.points)}
							</span>
						{/if}
						{@render badges(item)}
						{#if exportFailed(exportStatusFor(item.id))}
							<!-- QUIET, and only when something is wrong: an item that exported
							     cleanly, or never exported, says nothing at all. Amber, this
							     palette's "needs attention" -- the content itself saved. The WORD
							     varies with the failure class: a lost race and a refused write
							     want different things from the person reading the row. -->
							<span class="chip export-chip" data-testid="export-fail-{item.id}">
								{exportChipLabel(item.id)}
							</span>
						{/if}
					</span>
					<span class="row-meta">
						<span class="row-kind">{itemKindLabel(item.kind)}</span>
						{#if item.kind === 'assignment'}
							<!-- NO DUE SEGMENT WHEN THERE IS NO DUE DATE, matching ItemDetail:
							     formatDue(null) is "No due date", which reads as a real value
							     and renders the sentence "Due No due date". -->
							{#if item.due_at}&middot; Due {formatDue(item.due_at)}{/if}
							{#if item.points != null}&nbsp;&middot; {item.points} pts{/if}
						{:else}
							&middot; {shortWhen(item.created_at)}
						{/if}
						{#if item.category}&nbsp;&middot; {item.category}{/if}
					</span>
				</span>
			</a>

			{#if editable}
				<div class="row-menu">
					<button
						type="button"
						class="menu-trigger"
						aria-expanded={openMenu === item.id}
						aria-haspopup="menu"
						aria-label="Actions for {itemTitle(item)}"
						data-testid="row-menu"
						onclick={() => toggleMenu(item.id)}
					>
						<span aria-hidden="true">&#8942;</span>
					</button>
					{#if openMenu === item.id}
						<div class="menu" data-testid="row-menu-open">
							<div role="menu">
							<button type="button" role="menuitem" disabled={busy} onclick={() => toggleEdit(item.id)}>
								{editing === item.id ? 'Close editor' : 'Edit'}
							</button>
							<button type="button" role="menuitem" disabled={busy} data-testid="menu-pin" onclick={() => togglePin(item)}>
								{item.pinned ? 'Unpin' : 'Pin to top'}
							</button>
							<button type="button" role="menuitem" disabled={busy} onclick={() => duplicate(item)}>
								Copy
							</button>
							{#if groupItems.length > 1}
								<button
									type="button"
									role="menuitem"
									disabled={busy || groupItems[0]?.id === item.id}
									onclick={() => move(groupItems, item, -1)}>Move up</button
								>
								<button
									type="button"
									role="menuitem"
									disabled={busy || groupItems[groupItems.length - 1]?.id === item.id}
									onclick={() => move(groupItems, item, 1)}>Move down</button
								>
							{/if}
							{#if item.kind === 'assignment'}
								<a role="menuitem" href={`${basePath}/${section.id}/item/${item.id}/grade`}>Grade work</a>
							{/if}
							<button
								type="button"
								role="menuitem"
								class="danger"
								disabled={busy}
								data-testid="menu-delete"
								onclick={() => remove(item.id)}
							>
								{armDelete === item.id ? 'Really delete?' : 'Delete'}
							</button>
							</div>
							{#if unitTransports}
								<!--
									FILING LIVES HERE NOW. It is a management action, and it was
									rendered AT REST in every row -- a select box per row, in a
									pane with no width to spare, permanently. It is one of the
									actions behind the one control the others are behind.

									Outside the `role="menu"` group deliberately: a select is not
									a menuitem, and the ARIA menu pattern has nowhere to put one.
									The popover is the container; the group is what has the role.
								-->
								<label class="menu-unit">
									<span class="menu-unit-label">Unit</span>
									<select
										value={item.unit_id ?? UNFILED_GROUP_ID}
										disabled={busy}
										data-testid="row-unit"
										onchange={(e) => fileInto(item, (e.currentTarget as HTMLSelectElement).value)}
									>
										<option value={UNFILED_GROUP_ID}>No unit</option>
										{#each orderedUnits as u (u.id)}
											<option value={u.id}>{u.name}</option>
										{/each}
									</select>
								</label>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#if expanded[item.id]}{@render detail(item)}{/if}

		{#if editable && editing === item.id && editingItem}
			{#key item.id}
				<div class="row-editor">
					<ContentComposer
						mode="edit"
						item={editingItem}
						{sections}
						transports={transports!}
						{attachmentsEnabled}
						compact
						onsaved={saved}
						oncancel={() => (editing = null)}
					/>
				</div>
			{/key}
		{/if}
	</li>
{/snippet}

{#snippet checkInRow(checkIn: ClassCheckIn)}
	{@const href = canManage ? notebookHref : notebookHref && checkInHref(checkIn, notebookHref)}
	<li class="row-wrap">
		<div class="row check-in-row">
			<span class="row-expand spacer" aria-hidden="true"></span>
			{#snippet inner()}
				<span class="kind-glyph kind-checkin" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
						<path d="M6 3.5h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
						<path d="M9 9h6M9 13h6M9 17h3" />
					</svg>
				</span>
				<!-- The same two-line shape as an item row: name gives way, chip
				     keeps its width. -->
				<span class="row-text">
					<span class="row-title">
						<span class="row-name">{checkIn.session_label}</span>
						{#if checkIn.status}
							<span class="chip tone-{checkInTone(checkIn.status)}" data-testid="check-in-status">
								{checkIn.status === 'flagged'
									? (flagReasonLabel(checkIn.flag_reason) ?? checkInStatusLabel(checkIn.status))
									: checkInStatusLabel(checkIn.status)}
							</span>
						{/if}
					</span>
					<span class="row-meta">
						<span class="row-kind">Notebook check-in</span> &middot; {checkInMeta(checkIn)}
					</span>
				</span>
			{/snippet}
			{#if href}
				<a class="row-main" {href} data-testid="check-in-link">{@render inner()}</a>
			{:else}
				<span class="row-main">{@render inner()}</span>
			{/if}
		</div>
	</li>
{/snippet}

<svelte:head>
	<title>{sectionTitle(section)} // IDEA Classroom</title>
</svelte:head>

<svelte:element
	this={asPane ? 'section' : 'main'}
	class="classroom-page"
	aria-label={asPane ? 'Class content' : undefined}
>
	<!--
		A COMPACT, LEFT-ALIGNED HEADER, NOT A PAGE HERO.

		This list is the navigation pane of a two-pane shell -- roughly 26rem --
		and the app-shell `.hero` it used to wear is the LANDING hero: centred,
		with 4rem of air above it. Centred text in a narrow column is the loudest
		possible signal that a component was designed for a wider page, and the
		class identity is already in the shell's breadcrumb trail and its section
		switcher, so this says it once, quietly, at heading scale.

		The heading is an h2 while a detail pane is open: the item beside it owns
		the page's h1 then, and two of them is one too many.
	-->
	<header class="pane-head">
		<svelte:element this={asPane ? 'h2' : 'h1'} class="pane-title">
			{section.course?.title ?? section.label}
		</svelte:element>
		<p class="pane-meta-row">
			<!-- TRUNCATES RATHER THAN WRAPS: a second and third line of course code,
			     period, block and teacher is a header taking the top of the pane
			     away from the content it is a header for. -->
			<span class="pane-meta" title={`${section.course?.code ?? ''} ${formatSectionLabel(section.label, section.block)} · ${emailLocal(section.teacher_email)}`.trim()}>
				{#if section.course?.code}<span class="pane-code">{section.course.code}</span>{/if}
				{formatSectionLabel(section.label, section.block)}
				&middot; {emailLocal(section.teacher_email)}
				{#if section.active === false}&nbsp;&middot; <span class="draft-chip">Archived</span>{/if}
			</span>
		</p>
	</header>

	<!--
		ONE ACTIONS ROW: what you can DO from this pane, in one place.

		The notebook link used to sit at the far end of the meta line, competing
		with a string that truncates -- a link squeezed by an ellipsis is a link
		that moves as the class name changes. It is a destination, not metadata,
		so it reads here beside the other things this pane can take you to, and
		the meta line gets the whole width to truncate into.

		The row renders for a student too (their own notebook is the one thing in
		it), which is why it is not inside the `editable` branch.
	-->
	{#if editable || notebookHref}
		<div class="pane-tools" data-testid="pane-tools">
			{#if editable && onCompose}
				<button
					type="button"
					class="btn secondary tiny"
					aria-expanded={composing}
					data-testid="new-post"
					onclick={() => onCompose?.()}
				>
					{composing ? 'Close' : 'New post'}
				</button>
			{/if}
			{#if editable && unitTransports && section.course}
				<button
					type="button"
					class="btn secondary tiny"
					aria-expanded={unitsOpen}
					data-testid="units-toggle"
					onclick={() => (unitsOpen = !unitsOpen)}
				>
					{unitsOpen ? 'Close units' : orderedUnits.length ? `Units (${orderedUnits.length})` : 'Add units'}
				</button>
			{/if}
			{#if notebookHref}
				<a class="manage-link" href={notebookHref} data-testid="class-notebook-link">
					{canManage ? 'Notebook' : 'My notebook'}
					{#if outstanding !== null}
						<span
							class="outstanding-badge"
							data-testid="notebook-outstanding"
							title={canManage
								? 'Check-ins this class is behind on'
								: 'Check-ins that still need something from you'}>{outstanding}</span
						>
					{/if}
				</a>
			{/if}
		</div>
	{/if}

	<!-- BELOW THE TOOLBAR, NEVER ABOVE IT. A status line that appears after an
	     action must not push the actions themselves down the pane. -->
	{#if error}
		<p class="feedback error">{error}</p>
	{/if}
	{#if shownNotice}
		<p class="feedback ok" data-testid="pane-notice">{shownNotice}</p>
	{/if}

	{#if editable && unitsOpen && unitTransports && section.course}
		<section class="card tool-panel">
			<UnitManager
				courseId={section.course.id}
				courseLabel={section.course.code}
				{units}
				transports={unitTransports}
				chrome={false}
				onchanged={() => onchanged?.()}
			/>
		</section>
	{/if}

	<!--
		THE STREAM. One column in the navigation pane, several across the width
		when nothing is open beside it -- see `.stream` in the styles for the
		measurement the column width comes from.
	-->
	<div class="stream" bind:this={menuHost}>
		{#each groups as group (group.id)}
			{@const entries = entriesFor(group.id, group.items)}
			{@const folded = isCollapsed(group.id)}
			<section class="card group-card" data-testid="unit-group">
				{#if !bare}
					<button
						type="button"
						class="group-head"
						aria-expanded={!folded}
						aria-controls={`group-${group.id}`}
						data-testid="group-head"
						onclick={() => onToggleGroup?.(group.id)}
					>
						<span class="group-caret" aria-hidden="true">{folded ? '▸' : '▾'}</span>
						<span class="group-label">{group.label}</span>
						<span class="group-count">
							{entries.length}
							{entries.length === 1 ? 'item' : 'items'}
						</span>
					</button>
				{/if}

				{#if !folded}
					<ul class="rows" id={`group-${group.id}`}>
						{#if entries.length === 0}
							<li class="empty-row">
								<p class="note">
									{#if canManage}
										Nothing filed here yet. Pick this unit in a row's Unit box to file something
										into it.
									{:else}
										Nothing here yet.
									{/if}
								</p>
							</li>
						{/if}
						{#each entries as entry (entry.key)}
							{#if entry.kind === 'check-in'}
								{@render checkInRow(entry.checkIn)}
							{:else}
								{@render itemRow(entry.item, group.items)}
							{/if}
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	</div>

	<!-- `streamCheckIns`, not `checkIns`: one attached to an item (0120) is not
	     an answer to "is this class empty", because the item it renders on is
	     already content on this page. -->
	{#if !items.length && !streamCheckIns(checkIns).length}
		<section class="card">
			<p class="note empty-state">
				{#if canManage}
					Nothing posted to this class yet. Use <strong>New post</strong> above to add an
					announcement, an assignment or a material.
				{:else}
					Nothing posted yet. Announcements, assignments and materials from your teacher show up
					here.
				{/if}
			</p>
		</section>
	{/if}

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</svelte:element>

<style>
	/* SPACING COMES FROM THE SCALE, NOT FROM LITERALS.
	   Every top-level block in this pane -- the header, the actions row, the
	   status line, the unit panel, the group cards -- used to be separated by
	   its own hand-picked number, and they all landed within a few pixels of
	   each other, which is why nothing in the pane read as GROUPED. They step
	   through --space-* now: tight inside the header, one step out to the row
	   of actions, two steps out to the content those actions act on. */
	.feedback {
		margin: 0 0 var(--space-4);
	}
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-page));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;

		/* THE STREAM'S COLUMN, and the number is measured rather than picked.
		   Driving the pane from 300px to 900px and counting ellipsised titles
		   in the 20-row harness fixture: 240px of content clips all 20, 280px
		   clips 4, 320px clips 3, 356px clips 1 -- and every width from 356px
		   to 840px clips that same 1, the fixture's deliberately-overlong
		   title, which needs 900px. So the row gains nothing above 356px and
		   falls apart below ~280px, and 356px (22.25rem) is exactly the
		   content width the row was designed against: the 26rem pane less its
		   own padding and the card's.

		   Using it as the column means a row is the SAME SHAPE in both states.
		   Opening an item changes how many columns there are, not what a row
		   looks like, which is most of why the change does not read as a
		   navigation. */
		--cr-stream-col: 22.25rem;
	}

	/* --- The stream --------------------------------------------------------
	   AS MANY COLUMNS AS THE MEASURE HOLDS, which at the widths this ships at
	   is one in the pane, two from 1024px and three from about 1245px (the
	   arithmetic is floor((content + 24) / (356 + 24)), and the split's own
	   92rem cap puts four out of reach).

	   `auto-fit`, NOT `auto-fill`: a class with two units must not lay itself
	   out in two columns and a void where a third would go. Empty tracks
	   collapse and the groups that exist share the width.

	   `min(..., 100%)` is what keeps the track from overflowing a pane
	   narrower than one column -- a bare `minmax(22.25rem, 1fr)` in a 356px
	   pane is a 356px box with a 22.25rem minimum inside it.

	   ONE GROUP TAKES THE READING MEASURE rather than the whole 1300px, since
	   there is nothing to put beside it and a row stretched that far puts its
	   due date a screen away from its title. */
	.stream {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(var(--cr-stream-col), 100%), 1fr));
		gap: var(--space-3) var(--space-5);
		align-items: start;
	}
	.stream:not(:has(> :nth-child(2))) {
		max-width: var(--measure-reading);
	}
	/* --- The pane header ---------------------------------------------------
	   Left-aligned and compact: this is a sidebar, and the class is already
	   named in the breadcrumb trail and the section switcher above it.
	   NO padding above it: the pane's own inset is the air over the header, and
	   a second one here is what made the top of the page simultaneously the
	   loosest gap and the most cramped-looking part of it. */
	.pane-head {
		padding: 0 0 var(--space-3);
	}
	.pane-title {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 1.15rem;
		line-height: 1.25;
		letter-spacing: 0;
		color: var(--text-1);
		/* Two lines at most, then it stops -- a long course title must not push
		   the list itself off the first screen. */
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.pane-meta-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: var(--space-1) 0 0;
		min-width: 0;
	}
	.pane-meta {
		flex: 1 1 auto;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.pane-code {
		color: var(--cyan);
	}
	/* The notebook link, now a peer of the buttons in the actions row rather
	   than the last thing on a truncating meta line. `margin-left: auto` puts it
	   at the far end of the row, which is where a destination belongs beside
	   two things that open panels. */
	.manage-link {
		/* 17.4px measured. A student's own way into their notebook from the
		   class page, so it takes the floor (IDEA_INTERFACE_STANDARDS 10). */
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		flex: none;
		margin-left: auto;
		align-self: center;
		color: var(--gold);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		white-space: nowrap;
	}

	/* --- The actions row ---------------------------------------------------
	   What used to be two full cards holding one button each. A whole step out
	   from the header above it and from the content below it, so it reads as
	   its own band rather than as another line of the header. */
	.pane-tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}
	.tool-panel {
		margin-bottom: var(--space-4);
	}
	.outstanding-badge {
		display: inline-block;
		margin-left: var(--space-1);
		min-width: 1.05rem;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--surface-0);
		background: var(--gold);
		border-radius: 999px;
		padding: 0.02rem 0.32rem;
	}
	.note {
		color: var(--text-2);
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.empty-state {
		padding: var(--space-2) 0;
	}

	/* Unit groups are PEERS, so they sit a step closer to each other than the
	   actions row sits to the first of them.

	   NO MARGIN: the stream is a grid and its `gap` is the whole spacing rule
	   now. `.card`'s own 1.25rem margin would add to the gap on the vertical
	   axis (grid items do not collapse margins) and indent the columns on the
	   horizontal one.

	   THE INLINE PADDING IS 1rem, NOT `.card`'s 1.5rem. Measured: at the pane's
	   356px the card was spending 48px -- 13.5% of the column -- on air beside
	   rows that were already ellipsising their titles. 32px reads the same and
	   gives the title 16px back. */
	.group-card {
		margin: 0;
		padding: var(--space-2) var(--space-4);
	}
	/* A real button, in the tab order, with aria-expanded -- the collapse used to
	   be a document-level click listener on a bare div, which no keyboard or
	   screen reader could reach. */
	.group-head {
		appearance: none;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-width: 0;
		padding: 0.3rem 0.1rem;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
		font: inherit;
		/* 40px measured. A unit header is how a student opens the work for that
		   unit, so it takes the 44px floor (IDEA_INTERFACE_STANDARDS 10). Block
		   padding carries it; the type is untouched. */
		min-height: 44px;
	}
	.group-caret {
		flex: none;
		font-size: 0.7rem;
		color: var(--text-2);
	}
	/* ONE LINE, TRUNCATING. A unit name is authored freely, and a two-line
	   heading in a 26rem pane costs a row of content every time. */
	.group-label {
		flex: 1 1 auto;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.group-count {
		flex: none;
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--text-2);
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row-wrap {
		border-top: 1px solid var(--boundary);
	}
	.row-wrap:first-child {
		border-top: none;
	}
	/* THE ROW YOU ARE READING, when a detail pane is open beside the list. Green
	   is the discipline's own colour for active navigation and this is exactly
	   that -- `.sec-tab.active` reads the same way one level up. Never colour
	   alone: it is a rule plus a lifted surface, and the link itself carries
	   aria-current="page". */
	.row-wrap.selected {
		background: var(--surface-2);
		box-shadow: inset 3px 0 0 var(--green);
	}
	.empty-row {
		padding: 0.3rem 0.1rem;
	}
	/* THE COMPACT ROW: one line of content, everything at a glance. Thirty items
	   used to be thirty cards; this is thirty rows. */
	.row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
	}
	.row-expand {
		appearance: none;
		flex: none;
		/* 30x40 measured. The WIDTH stays 30px on purpose: this sits at the
		   end of a row whose whole body is already a link to the same item,
		   so a 44px-wide box would eat into the target beside it. The height
		   is the floor (IDEA_INTERFACE_STANDARDS 10). */
		width: 30px;
		min-height: 44px;
		display: grid;
		place-items: center;
		background: none;
		border: none;
		color: var(--text-2);
		cursor: pointer;
		font-size: 0.7rem;
	}
	.row-expand:hover {
		color: var(--gold);
	}
	.row-expand.spacer {
		cursor: default;
	}
	/* THE ROW'S OWN AIR, and the floor under it is the tap target rather than
	   taste. Two lines measure 36.2px (18.7 + 0.8 + 16.6), so 0.3rem top and
	   bottom lands the row at 45.8px -- still over the 44px minimum, and 4.8px
	   a row cheaper than the 0.42rem it was, which is one more row on screen
	   every ten. Anything tighter would have to give up the target. */
	.row-main {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		flex: 1 1 auto;
		min-width: 0;
		padding: 0.3rem 0.2rem;
		text-decoration: none;
		color: var(--text-1);
	}
	a.row-main:hover .row-title {
		color: var(--gold);
	}
	.kind-glyph {
		flex: none;
		width: 1.15rem;
		height: 1.15rem;
		color: var(--text-2);
	}
	.kind-glyph svg {
		width: 100%;
		height: 100%;
	}
	/* Kind reads by GLYPH and by the word in the meta line, never by colour
	   alone; the tint is a second signal, not the only one. */
	.kind-assignment {
		color: var(--gold);
	}
	.kind-post {
		color: var(--text-2);
	}
	.kind-material {
		color: var(--cyan);
	}
	.kind-checkin {
		color: var(--cyan);
	}
	.row-text {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		min-width: 0;
		flex: 1 1 auto;
	}
	/* TWO LINES MAXIMUM, and this rule is what holds that. `nowrap` plus a
	   title that is the only shrinkable child: chips and indicators keep the
	   width they need and the NAME gives way, ellipsised, rather than the line
	   becoming two. */
	.row-title {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: nowrap;
		min-width: 0;
		font-weight: 700;
		font-size: 0.9rem;
		line-height: 1.3;
	}
	.row-name {
		flex: 1 1 auto;
		min-width: 2.5rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row-meta {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--text-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row-kind {
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	/* Counts as INDICATORS, not pills: a glyph and a number in the meta colour,
	   no border and no padding, so two of them cost about 34px between them. */
	.row-inds {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		flex: none;
	}
	.ind {
		display: inline-flex;
		align-items: center;
		gap: 0.1rem;
		font-family: var(--font-mono);
		font-size: 0.64rem;
		font-weight: 400;
		color: var(--text-2);
	}
	.ind svg {
		width: 0.72rem;
		height: 0.72rem;
		display: block;
	}
	.chip {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--cyan);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.06rem 0.45rem;
		white-space: nowrap;
	}
	/* One word, so it can never take the wrapping the shared rule allows it. */
	.row-sched {
		flex: none;
		white-space: nowrap;
	}
	.pin-chip {
		color: var(--gold);
		border-color: var(--gold);
	}
	.updated-chip {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.tone-good {
		color: var(--green);
		border-color: var(--green);
	}
	.tone-attention {
		color: var(--amber);
		border-color: var(--amber);
	}
	.tone-info {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.tone-muted {
		color: var(--text-2);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	/* MANAGEMENT BEHIND ONE CONTROL. Four buttons on every row gave managing the
	   class the same visual weight as the class; this is one glyph that opens
	   every action, each still one click away inside it. */
	.row-menu {
		position: relative;
		flex: none;
	}
	.menu-trigger {
		appearance: none;
		width: 32px;
		min-height: 40px;
		display: grid;
		place-items: center;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-card);
		color: var(--text-2);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
	}
	.menu-trigger:hover,
	.menu-trigger[aria-expanded='true'] {
		color: var(--text-1);
		border-color: var(--boundary);
		background: var(--surface-2);
	}
	.menu {
		position: absolute;
		top: calc(100% + 0.2rem);
		right: 0;
		z-index: 30;
		min-width: 11rem;
		padding: 0.25rem;
		display: flex;
		flex-direction: column;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		box-shadow: 0 10px 26px rgb(0 0 0 / 45%);
	}
	.menu button,
	.menu a {
		appearance: none;
		text-align: left;
		background: none;
		border: none;
		border-radius: var(--radius-card);
		color: var(--text-1);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.5rem 0.55rem;
		min-height: 36px;
		text-decoration: none;
	}
	.menu button:hover:not(:disabled),
	.menu a:hover {
		background: var(--surface-2);
		color: var(--gold);
	}
	.menu button:disabled {
		color: var(--text-3);
		cursor: default;
	}
	.menu .danger {
		color: var(--crimson);
	}
	.menu .danger:hover:not(:disabled) {
		color: var(--crimson);
	}
	/* Filing, moved off the row. Its own control rather than a menuitem -- see
	   the note at the markup. */
	.menu-unit {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.4rem 0.55rem 0.35rem;
		border-top: 1px solid var(--boundary);
		margin-top: 0.25rem;
	}
	.menu-unit-label {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.menu-unit select {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		padding: 0.2rem 0.3rem;
		width: 100%;
		min-height: 36px;
	}

	.row-detail {
		padding: 0.2rem 0.2rem 0.7rem 2.05rem;
	}
	.row-editor {
		padding: 0 0.2rem 0.6rem;
	}
	.link-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.5rem;
	}
	.instructor-note-box {
		margin-top: 0.6rem;
		padding: 0.6rem 0.7rem;
		border: 1px dashed var(--gold);
		border-radius: var(--radius-card);
	}
	.instructor-note-label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--gold);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
	}
	.lock-glyph {
		display: inline-flex;
		width: 0.8rem;
		height: 0.8rem;
	}
	.lock-glyph svg {
		width: 100%;
		height: 100%;
	}
	.also-line {
		margin: var(--space-2) 0 0;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.export-chip {
		color: var(--amber);
		border-color: var(--amber);
	}
	.export-line {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin: var(--space-2) 0 0;
	}
	.export-why {
		font-size: 0.72rem;
		color: var(--text-2);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.detail-open {
		margin: 0.6rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.7rem;
	}
	.detail-open a {
		color: var(--gold);
	}
	/* Left, with everything else in the pane. */
	.page-footer {
		margin-top: var(--space-4);
		display: flex;
		justify-content: flex-start;
	}

	/* Phone: the row is the same two lines it is in the pane -- the title
	   ellipsises rather than the line wrapping, which is what keeps the list
	   scannable at 375px too. Only the detail's indent gives way. */
	@media (max-width: 640px) {
		.row-detail {
			padding-left: 0.4rem;
		}
	}
</style>
