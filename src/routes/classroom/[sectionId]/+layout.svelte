<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import {
		readClassViewPrefs,
		toggleGroupCollapsed,
		type ClassViewPrefs
	} from '$lib/classroom/classroom';
	import { COMPOSER_DISCARD_WARNING } from '$lib/classroom/composer-staging';
	import { locateClassroom, navKeepsComposer } from '$lib/classroom/nav';
	import {
		createCheckInTransports,
		createClassroomTransports,
		createReferenceTransports,
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
	// svelte-ignore state_referenced_locally
	const teacherTransports = createTeacherEngineTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const referenceTransports = createReferenceTransports(data.supabase);
	// The composer's third staged attachable (0120). Handed in only where the
	// schema can take it; `checkInLinksReady` is the load's own ladder answer.
	// svelte-ignore state_referenced_locally
	const checkInTransports = createCheckInTransports(data.supabase);

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
	 * It takes the DETAIL PANE. It used to open inside the list, which since the
	 * split is ~26rem wide, while the pane a full authoring form belongs in sat
	 * empty beside it. The item underneath stays mounted and hidden, so closing
	 * the composer puts you back on what you were reading -- and the item's
	 * route never changed, so nothing reloads.
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
	 * A post that fully landed closes the composer and reports itself in the
	 * list. One that PARTLY landed does not: `text` is empty exactly then, and
	 * closing would throw away the staged file or deck the message has just
	 * invited someone to save again. (The old inline composer closed on both,
	 * which quietly lost the retry.)
	 */
	function composerSaved(info: { text: string }) {
		if (!info.text) return;
		composeNotice = info.text;
		composerDirty = false;
		composing = false;
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
		asPane={!!selectedItemId || composing}
		{composing}
		onCompose={data.canManage ? toggleComposer : null}
		notice={composeNotice}
		onToggleGroup={toggleGroup}
		{transports}
		{unitTransports}
		{deckTransports}
		{teacherTransports}
		{notebookHref}
		fetchPreview={fetchLinkPreviewClient}
		loadExportStatuses={(ids) => loadExportStatuses(data.supabase, ids)}
		retryExport={runClassroomExport}
		onchanged={() => invalidateAll()}
	/>
{/snippet}

{#snippet composer()}
	<!-- Keyed on the OPEN, so a fresh compose is a fresh form and a close
	     genuinely disposes the staged handles rather than leaving them to be
	     re-adopted by the next one. -->
	{#key composing}
		<section class="card compose-card">
			<h2 class="compose-title">New post</h2>
			<ContentComposer
				mode="create"
				sections={data.sections}
				initialTargets={[data.section.id]}
				{transports}
				{deckTransports}
				{teacherTransports}
				{referenceTransports}
				attachmentsEnabled={data.attachmentsEnabled}
				checkInTransports={liveCheckInTransports}
				onsaved={composerSaved}
				ondirtychange={(d) => (composerDirty = d)}
				oncancel={closeComposer}
			/>
		</section>
	{/key}
{/snippet}

{#if split}
	<!-- `hasDetail` is what hides the list below the breakpoint, so composing
	     reports one: a phone gets the composer full width exactly as it gets an
	     item full width. -->
	<ClassSplit
		hasDetail={!!selectedItemId || composing}
		nav={classList}
		overlay={composing ? composer : null}
	>
		{@render children()}
	</ClassSplit>
{:else}
	{@render children()}
{/if}

<style>
	.compose-card {
		padding: var(--space-5);
	}
	.compose-title {
		margin: 0 0 var(--space-4);
		font-size: 1.05rem;
	}
</style>
