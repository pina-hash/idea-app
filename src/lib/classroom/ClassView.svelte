<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import ClassroomFeedback from '$lib/classroom/ClassroomFeedback.svelte';
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import ItemBody from '$lib/classroom/ItemBody.svelte';
	import LinkPreviewCard from '$lib/classroom/LinkPreviewCard.svelte';
	import UnitManager from '$lib/classroom/UnitManager.svelte';
	import type { AssignmentTeacherTransports } from '$lib/classroom/assignment-spec';
	import type { DeckTransports } from '$lib/classroom/deck';
	import { exportFailed, type ExportOutcome, type ItemExportStatus } from '$lib/classroom/revisions';
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
		outstandingBadge,
		mergeCheckIns,
		outstandingCheckIns,
		type ClassCheckIn
	} from '$lib/classroom/class-check-ins';
	import { flagReasonLabel } from '$lib/notebook';
	import type { FeedbackEntry } from '$lib/feedback/feedback';
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
		onToggleGroup = null,
		viewAs = null,
		fetchPreview = null,
		submitFeedback = null,
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
		/** Omitted (null) on every read-only surface, view-as included. */
		transports?: ClassroomComposerTransports | null;
		/** Null = units are not offered here (a read-only surface, or pre-0111). */
		unitTransports?: ClassroomUnitTransports | null;
		attachmentsEnabled?: boolean;
		/** Link root -- rewritten under /classroom/view-as/<email>. */
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
		onToggleGroup?: ((groupId: string) => void | Promise<void>) | null;
		viewAs?: string | null;
		fetchPreview?: ((url: string) => Promise<LinkPreview | null>) | null;
		submitFeedback?: ((entry: FeedbackEntry) => Promise<{ error: string | null }>) | null;
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

	let composing = $state(false);
	let editing = $state<string | null>(null);
	let expanded = $state<Record<string, boolean>>({});
	let openMenu = $state<string | null>(null);
	let armDelete = $state<string | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let seen = $state<Record<string, boolean>>({});
	let menuHost = $state<HTMLElement | null>(null);

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
		notice = null;
		const res = await fn();
		busy = false;
		if (!res.ok) {
			error = res.message ?? 'Something went wrong.';
			return false;
		}
		if (ok) notice = ok;
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
		notice = 'Copied as a new draft. Edit it below, then post it.';
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
		notice = null;
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
		notice = null;
	}

	async function saved() {
		editing = null;
		await onchanged?.();
	}

	async function created(info: { text: string }) {
		composing = false;
		if (info.text) notice = info.text;
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
	{#if canManage && !item.published}<span class="draft-chip">Draft</span>{:else if canManage && isScheduled(item)}<span class="sched-chip" title="Students see this from {scheduleLabel(item)}">Scheduled &middot; {scheduleLabel(item)}</span>{/if}
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
			<AttachmentList attachments={item.attachments} {viewAs} />
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
				<span class="chip export-chip">Export failed</span>
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
	<li class="row-wrap" class:editing={editing === item.id}>
		<div class="row" data-testid="item-row">
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

			<a class="row-main" href={`${basePath}/${section.id}/item/${item.id}`} data-testid="row-open">
				{@render kindGlyph(item.kind)}
				<span class="row-text">
					<span class="row-title">
						{itemTitle(item)}
						{@render badges(item)}
					</span>
					<span class="row-meta">
						<span class="row-kind">{itemKindLabel(item.kind)}</span>
						{#if item.kind === 'assignment'}
							&middot; Due {formatDue(item.due_at)}
							{#if item.points != null}&nbsp;&middot; {item.points} pts{/if}
						{:else}
							&middot; {shortWhen(item.created_at)}
						{/if}
						{#if item.category}&nbsp;&middot; {item.category}{/if}
					</span>
				</span>
				<span class="row-chips">
					{#if my}
						<span class="chip tone-{workStateTone(my.state)}" data-testid="work-status">
							{workStateLabel(my, item.points)}
						</span>
					{/if}
					{#if item.attachments.length}
						<span class="chip icon-chip" title="{item.attachments.length} file{item.attachments.length === 1 ? '' : 's'} attached" data-testid="chip-files">
							<span aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
									<path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8L9.7 17.4a1.8 1.8 0 0 1-2.5-2.5l7.8-7.8" />
								</svg>
							</span>
							{item.attachments.length}
						</span>
					{/if}
					{#if exportFailed(exportStatusFor(item.id))}
						<!-- QUIET, and only when something is wrong: an item that exported
						     cleanly, or never exported, says nothing at all. Amber, this
						     palette's "needs attention" -- the content itself saved. -->
						<span class="chip export-chip" data-testid="export-fail-{item.id}">Export failed</span>
					{/if}
					{#if item.links.length}
						<span class="chip icon-chip" title="{item.links.length} link{item.links.length === 1 ? '' : 's'}" data-testid="chip-links">
							<span aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
									<path d="M10 13.5a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 4.8l-1.7 1.7" />
									<path d="M14 10.5a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 19.2l1.7-1.7" />
								</svg>
							</span>
							{item.links.length}
						</span>
					{/if}
				</span>
			</a>

			{#if editable && unitTransports}
				<label class="unit-pick" title="File this into a unit">
					<span class="sr-only">Unit for {itemTitle(item)}</span>
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
						<div class="menu" role="menu" data-testid="row-menu-open">
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
						{deckTransports}
						{teacherTransports}
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
				<span class="row-text">
					<span class="row-title">{checkIn.session_label}</span>
					<span class="row-meta">
						<span class="row-kind">Notebook check-in</span> &middot; {checkInMeta(checkIn)}
					</span>
				</span>
				<span class="row-chips">
					{#if checkIn.status}
						<span class="chip tone-{checkInTone(checkIn.status)}" data-testid="check-in-status">
							{checkIn.status === 'flagged'
								? (flagReasonLabel(checkIn.flag_reason) ?? checkInStatusLabel(checkIn.status))
								: checkInStatusLabel(checkIn.status)}
						</span>
					{/if}
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

<main class="classroom-page">
	<section class="hero">
		<div class="eyebrow">{section.course?.code ?? 'IDEA // Classroom'}</div>
		<h1>{section.course?.title ?? section.label}</h1>
		<p class="section-line">
			{formatSectionLabel(section.label, section.block)}
			&nbsp;&middot; {emailLocal(section.teacher_email)}
			{#if section.active === false}&nbsp;&middot; <span class="draft-chip">Archived</span>{/if}
			{#if notebookHref}
				&nbsp;&middot; <a class="manage-link" href={notebookHref} data-testid="class-notebook-link">
					{canManage ? 'Notebook review' : 'My notebook'}
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
		</p>
	</section>

	{#if error}
		<p class="feedback error">{error}</p>
	{/if}
	{#if notice}
		<p class="feedback ok">{notice}</p>
	{/if}

	{#if editable}
		<section class="card compose-card">
			<div class="compose-head">
				<h2 class="compose-title">Post to this class</h2>
				<button
					type="button"
					class="btn secondary tiny"
					aria-expanded={composing}
					data-testid="new-post"
					onclick={() => (composing = !composing)}
				>
					{composing ? 'Close' : 'New post'}
				</button>
			</div>
			{#if composing}
				{#key composing}
					<ContentComposer
						mode="create"
						{sections}
						initialTargets={[section.id]}
						transports={transports!}
						{attachmentsEnabled}
						{deckTransports}
						{teacherTransports}
						compact
						onsaved={created}
						oncancel={() => (composing = false)}
					/>
				{/key}
			{/if}
		</section>

		{#if unitTransports && section.course}
			<UnitManager
				courseId={section.course.id}
				courseLabel={section.course.code}
				{units}
				transports={unitTransports}
				onchanged={() => onchanged?.()}
			/>
		{/if}
	{/if}

	<div bind:this={menuHost}>
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

	{#if !items.length && !checkIns.length}
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

	<ClassroomFeedback
		context="class"
		meta={{ section_id: section.id, section: sectionTitle(section) }}
		submit={submitFeedback}
	/>

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	/* Spacing and the row system only: the surface look lives in classroom.css. */
	.feedback {
		margin: 0 0 0.8rem;
	}
	.classroom-page {
		max-width: 60rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.section-line {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.manage-link {
		color: var(--gold);
	}
	.outstanding-badge {
		display: inline-block;
		margin-left: var(--space-1);
		min-width: 1.05rem;
		text-align: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--surface-0);
		background: var(--gold);
		border-radius: 999px;
		padding: 0.02rem 0.32rem;
	}
	.compose-card {
		margin-bottom: var(--space-4);
	}
	.compose-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.compose-title {
		margin: 0;
		font-size: 1rem;
	}
	.note {
		color: var(--text-2);
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.empty-state {
		padding: 0.6rem 0;
	}

	.group-card {
		margin-bottom: var(--space-3);
		padding-block: 0.7rem;
	}
	/* A real button, in the tab order, with aria-expanded -- the collapse used to
	   be a document-level click listener on a bare div, which no keyboard or
	   screen reader could reach. */
	.group-head {
		appearance: none;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		padding: 0.3rem 0.1rem;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
		font: inherit;
		min-height: 40px;
	}
	.group-caret {
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.group-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.group-count {
		margin-left: auto;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--text-2);
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row-wrap {
		border-top: 1px solid var(--hairline);
	}
	.row-wrap:first-child {
		border-top: none;
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
		width: 30px;
		min-height: 40px;
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
	.row-main {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		flex: 1 1 auto;
		min-width: 0;
		padding: 0.42rem 0.2rem;
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
	.row-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		font-weight: 700;
		font-size: 0.92rem;
		line-height: 1.3;
	}
	.row-meta {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--text-2);
	}
	.row-kind {
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.row-chips {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
		flex: none;
	}
	.chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--cyan);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.06rem 0.45rem;
		white-space: nowrap;
	}
	.icon-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		color: var(--text-2);
	}
	.icon-chip svg {
		width: 0.72rem;
		height: 0.72rem;
		display: block;
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

	.unit-pick {
		flex: none;
	}
	.unit-pick select {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		padding: 0.2rem 0.3rem;
		max-width: 8.5rem;
		min-height: 32px;
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
		border-color: var(--hairline);
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
		border: 1px solid var(--hairline);
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
		font-family: 'Share Tech Mono', monospace;
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
		font-family: 'Share Tech Mono', monospace;
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
		font-family: 'Share Tech Mono', monospace;
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
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
	}
	.detail-open a {
		color: var(--gold);
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}

	/* Phone: the row wraps its chips under the title rather than pushing the
	   page wider. The expand control, the menu and the unit picker stay put. */
	@media (max-width: 640px) {
		.row-main {
			flex-wrap: wrap;
		}
		.row-chips {
			flex-basis: 100%;
			padding-left: 1.7rem;
		}
		.unit-pick select {
			max-width: 6rem;
		}
		.row-detail {
			padding-left: 0.4rem;
		}
	}
</style>
