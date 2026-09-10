<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import HallPass from '$lib/classroom/HallPass.svelte';
	import SongQueue from '$lib/classroom/SongQueue.svelte';
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import {
		readClassViewPrefs,
		toggleGroupCollapsed,
		type ClassroomItem,
		type ClassViewPrefs
	} from '$lib/classroom/classroom';
	import { COMPOSER_DISCARD_WARNING } from '$lib/classroom/composer-staging';
	import { createClassroomLive } from '$lib/classroom/live';
	import { locateClassroom, navKeepsComposer } from '$lib/classroom/nav';
	import {
		createCheckInTransports,
		createClassroomTransports,
		createReferenceTransports,
		createTeacherEngineTransports,
		createHallPassTransports,
		createLayoutTransports,
		createSongQueueTransports,
		createUnitTransports,
		deckTransports,
		fetchLinkPreviewClient,
		itemById,
		loadExportStatuses,
		mergeInstructorMaterials,
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
	// svelte-ignore state_referenced_locally
	const teacherTransports = createTeacherEngineTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const referenceTransports = createReferenceTransports(data.supabase);
	// The composer's third staged attachable (0120). Handed in only where the
	// schema can take it; `checkInLinksReady` is the load's own ladder answer.
	// svelte-ignore state_referenced_locally
	const checkInTransports = createCheckInTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const hallPassTransports = createHallPassTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const songQueueTransports = createSongQueueTransports(data.supabase);
	/**
	 * THE LIVE NOTICE BUS FOR THE TWO TOOLS (prompt 0118), built ONCE: the pass
	 * and the queue share one channel per section, reference-counted inside,
	 * so one instance here is what makes that sharing real. Read `live.ts`'s
	 * header for why it is a broadcast and not `postgres_changes`.
	 */
	// svelte-ignore state_referenced_locally
	const live = createClassroomLive(data.supabase);
	/**
	 * THE 0193 WRITES, built once and handed down ONLY when the load's probe
	 * says the columns exist (`layoutReady`). Null removes the placement, order
	 * and rename controls everywhere -- the honest state of a deployment where
	 * the migration has not been pasted yet, not a degraded one.
	 */
	// svelte-ignore state_referenced_locally
	const layoutTransports = createLayoutTransports(data.supabase);
	const liveLayoutTransports = $derived(data.layoutReady ? layoutTransports : null);

	/**
	 * THE ONE CLOCK ON THIS SURFACE.
	 *
	 * Read here and threaded down, exactly as the layout LOAD reads `today` once
	 * for the check-ins: nothing inside `HallPass` or `$lib/classroom/hall-pass`
	 * calls `Date.now()`, so every elapsed figure in one paint is measured
	 * against the same instant and each label is assertable at a pinned one.
	 *
	 * It only ticks where there is something to tick FOR: no 0143 in this
	 * database means no card, so no timer. The interval is the ELAPSED LABEL's
	 * only; re-asking the server is the card's own poll, at its own interval,
	 * because the two questions ("how long has it been" and "is it still true")
	 * do not want the same answer rate.
	 */
	let now = $state(Date.now());
	$effect(() => {
		// EITHER CARD IS A REASON TO TICK, and neither is a reason on its own. A
		// database with 0143 and not 0145 (they are applied by hand, separately) is
		// a real state, and so is the reverse.
		if (!data.hallPass && !data.songQueue) return;
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});

	/**
	 * The writes this DEPLOYMENT can execute, per capability rather than
	 * all-or-nothing. 0120 and 0123 are applied separately, so a schema with the
	 * item link and no guidance column is a real state: it stages a check-in and
	 * offers no prompt field, because the field is removed by the transport's
	 * absence rather than hidden by a flag somebody has to remember to read.
	 */
	const liveCheckInTransports = $derived(
		data.checkInLinksReady
			? data.checkInGuidanceReady
				? checkInTransports
				: { createForItem: checkInTransports.createForItem, unlink: checkInTransports.unlink }
			: null
	);

	/**
	 * COMPOSING IS LAYOUT STATE, NOT A ROUTE, and that is the whole design.
	 *
	 * The composer holds STAGED FILE HANDLES -- a picked zip, a pasted
	 * screenshot, an answer key -- which exist nowhere but in this browser's
	 * memory. A route for composing would be destroyed by opening an item and
	 * would take them with it; layout state survives every navigation inside
	 * this class, which is exactly the span a teacher writes a post across.
	 *
	 * It takes the WHOLE VIEWPORT now (prompt 0118, item EIGHT): a fixed
	 * `role="dialog"` layer with its own Close and its own scroller, rendered
	 * as a sibling of the split below. It used to take the split's detail pane,
	 * and before that it opened inside the list -- which, since the split, is
	 * ~26rem wide. Whatever was on screen stays mounted underneath, untouched,
	 * so closing the composer puts you back on what you were reading with its
	 * scroll and its open panels intact, and the route never changed, so
	 * nothing reloads.
	 */
	let composing = $state(false);
	let composerDirty = $state(false);
	let composeNotice = $state<string | null>(null);

	/**
	 * ONE guard for every way work gets discarded: the toolbar's Close, the
	 * form's own Cancel, and navigating out of the class. `beforeNavigate`
	 * covers the browser's own unload too (see below), so there is no second
	 * copy of the question anywhere.
	 */
	function confirmDiscard(): boolean {
		if (!composing || !composerDirty) return true;
		return window.confirm(`${COMPOSER_DISCARD_WARNING}\n\nDiscard it?`);
	}

	function closeComposer() {
		if (!confirmDiscard()) return;
		composerDirty = false;
		composing = false;
	}

	function toggleComposer() {
		if (composing) {
			closeComposer();
			return;
		}
		composeNotice = null;
		composing = true;
	}

	/**
	 * Navigating away is the one discard path this component cannot see coming,
	 * so it is asked here rather than on a control.
	 *
	 * A move WITHIN this class's two-pane shell keeps the composer mounted --
	 * clicking through items with a half-written post open is the point of
	 * owning it here -- so it is not a discard and must not warn. `navKeepsComposer`
	 * is the one place that distinction is written down.
	 *
	 * `type: 'leave'` is the browser closing the tab or following an external
	 * link; cancelling it there is what raises the native unload dialog, which
	 * is the only warning a page is allowed to show at that point.
	 */
	beforeNavigate((nav) => {
		if (!composing || !composerDirty) return;
		if (nav.type === 'leave') {
			nav.cancel();
			return;
		}
		const to = nav.to?.url.pathname;
		if (to && navKeepsComposer(data.section.id, to)) return;
		if (window.confirm(`${COMPOSER_DISCARD_WARNING}\n\nLeave anyway?`)) {
			composerDirty = false;
			composing = false;
			return;
		}
		nav.cancel();
	});

	/**
	 * THE LIST, OVERLAID WITH WHATEVER THIS COMPOSER JUST CREATED.
	 *
	 * `data.items` only moves on a real reload (`invalidateAll`, or a fresh
	 * navigation), so a post made here would otherwise sit unlisted until one
	 * happens -- there is no other trigger for the section to re-run its load.
	 * This overlay is dropped the moment the server's own list changes, which is
	 * when its answer should win again (the same pattern `collapsed` already
	 * uses for the same reason).
	 */
	let localItems = $state<ClassroomItem[] | null>(null);
	const items = $derived(localItems ?? data.items);
	$effect(() => {
		void data.items;
		localItems = null;
	});

	/**
	 * A post that fully landed closes the composer and reports itself in the
	 * list. One that PARTLY landed does not: `text` is empty exactly then, and
	 * closing would throw away the staged file or deck the message has just
	 * invited someone to save again. (The old inline composer closed on both,
	 * which quietly lost the retry.)
	 *
	 * THE ROW ITSELF IS NOT ON `info` -- `createItem` answers only the id -- so
	 * it is fetched by that one id, never by re-running the section's whole
	 * load: a single-row `eq('id', ...)` next to the ~26-row section list it
	 * would otherwise cost.
	 */
	async function composerSaved(info: { text: string; itemId: string }) {
		if (!info.text) return;
		composeNotice = info.text;
		composerDirty = false;
		composing = false;
		const created = await itemById(data.supabase, info.itemId);
		if (!created) return;
		const [withMaterials] = data.canManage
			? await mergeInstructorMaterials(data.supabase, [created])
			: [created];
		localItems = [withMaterials, ...(localItems ?? data.items)];
	}

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
	<!--
		THE TWO TOOLS SIT ABOVE THE CLASS CONTENT, IN ONE ROW, AND THAT IS THE
		FEATURE (prompt 0118, items SIX and TEN). Below 1024px this pane IS the
		class page, full width, so first-in-the-pane is zero scrolling and one
		tap from opening the class. A student who needs the pass needs it in
		about a second; anywhere further down and it is a scroll on the one
		surface where scrolling is the whole cost.

		`tool` folds each card into a trigger with a live status chip and a
		dialog holding the SAME card -- two cards stacked at the top of a 26rem
		pane used to push the class content a screen down. The pass keeps the
		first slot: its whole value is the second it takes, and a song request
		is never urgent. `live` is the shared notice bus, so a pass opened on
		one phone moves the chip on every other open page of this class without
		waiting for the poll (which stays, as the floor).

		Each is rendered ONLY when the load came back with a state, the fail-soft
		path for a database without 0143 / 0145 (applied by hand, separately from
		this deploy). No state, no trigger -- never a control that cannot work.
		The ROW renders only when at least one of them does, so a class with
		neither carries no empty strip.
	-->
	{#if data.hallPass || data.songQueue}
		<div class="class-tools" data-testid="class-tools">
			{#if data.hallPass}
				<HallPass
					sectionId={data.section.id}
					state={data.hallPass}
					transports={hallPassTransports}
					{now}
					{live}
					tool
				/>
			{/if}
			{#if data.songQueue}
				<SongQueue
					sectionId={data.section.id}
					state={data.songQueue}
					transports={songQueueTransports}
					{now}
					{live}
					tool
				/>
			{/if}
		</div>
	{/if}
	<ClassView
		section={data.section}
		{items}
		units={data.units}
		sections={data.sections}
		canManage={data.canManage}
		attachmentsEnabled={data.attachmentsEnabled}
				instructorAttachmentsEnabled={data.instructorAttachmentsEnabled}
		checkIns={data.checkIns}
		sectionOutstanding={data.sectionOutstanding}
		work={data.work}
		{collapsed}
		{selectedItemId}
		asPane={!!selectedItemId}
		{composing}
		onCompose={data.canManage ? toggleComposer : null}
		notice={composeNotice}
		onToggleGroup={toggleGroup}
		{transports}
		{unitTransports}
		{deckTransports}
		{teacherTransports}
		layoutTransports={liveLayoutTransports}
		{notebookHref}
		fetchPreview={fetchLinkPreviewClient}
		loadExportStatuses={(ids) => loadExportStatuses(data.supabase, ids)}
		retryExport={runClassroomExport}
		onchanged={() => invalidateAll()}
	/>
{/snippet}

{#if split}
	<!-- THE SPLIT NO LONGER KNOWS ABOUT THE COMPOSER (prompt 0118, item EIGHT).
	     `overlay` is null and `hasDetail` is the item alone: the composer is a
	     full-viewport layer now (see below), so the panes underneath keep the
	     geometry they had before it opened and get it back untouched when it
	     closes. -->
	<ClassSplit hasDetail={!!selectedItemId} nav={classList} overlay={null}>
		{@render children()}
	</ClassSplit>
{:else}
	{@render children()}
{/if}

<!--
	THE COMPOSER, AS A SIBLING OF THE SPLIT AND STILL IN THE LAYOUT. It used to
	take the split's detail pane through `overlay`; it takes the whole viewport
	now (`screen` on ContentComposer: a fixed `role="dialog"` layer with its
	own header, its own Close and its own scroller), so the pane it used to
	fold into is no longer the frame. WHAT HAS NOT MOVED IS WHERE IT IS
	MOUNTED: this is layout state, above every page route in the class, which
	is the whole reason it is here at all -- the staged File handles exist
	nowhere but in this browser's memory, and a route change inside the class
	must not destroy them. `{#if composing}` is what makes a fresh compose a
	fresh form and a close genuinely dispose the staged handles.

	`.compose-card` is the wrapper Surface B's specs select the kind toggle
	through (`.compose-card .kind-toggle`); it is `display: contents` because
	the layer inside it is fixed and the wrapper must take no box of its own.
-->
{#if composing}
	<div class="compose-card" data-testid="compose-card">
		<ContentComposer
			mode="create"
			sections={data.sections}
			initialTargets={[data.section.id]}
			{transports}
			{deckTransports}
			{teacherTransports}
			{referenceTransports}
			attachmentsEnabled={data.attachmentsEnabled}
			instructorAttachmentsEnabled={data.instructorAttachmentsEnabled}
			checkInTransports={liveCheckInTransports}
			layoutTransports={liveLayoutTransports}
			screen
			onsaved={composerSaved}
			ondirtychange={(d) => (composerDirty = d)}
			oncancel={closeComposer}
		/>
	</div>
{/if}

<style>
	.compose-card {
		display: contents;
	}
	/* THE TOOLS ROW: the two triggers side by side, wrapping to two rows where
	   the pane is too narrow for both words and both chips (a 375px phone with
	   "1 out · Ana Reyes" on one and "2 waiting" on the other). Each trigger
	   sizes itself; the row only decides the gap and that they share a line.
	   Sits where the two cards sat, at the top of the class pane. */
	.class-tools {
		display: flex;
		flex-wrap: wrap;
		align-items: stretch;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		min-width: 0;
	}
	.class-tools > :global(*) {
		flex: 1 1 12rem;
		min-width: 0;
	}
</style>
