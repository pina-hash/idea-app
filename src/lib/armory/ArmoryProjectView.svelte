<script lang="ts">
	/**
	 * `/armory/[project]`: a header, then ONE view (Mr. Pina's report of
	 * 2026-10-07: the page "scrolls on for way too long when someone has a lot
	 * of items checked out", with every section stacked under the last).
	 *
	 * THE HEADER: the archived and admin-viewer notices, one status line (the
	 * project's folder on every computer, then live or polling, in words; the
	 * folder used to be a lead paragraph of its own, which cost 81px on a
	 * phone), recessed readouts (the viewer's role, what is
	 * theirs, the storage; the tab labels carry the file and checkout counts,
	 * so the header does not say them twice), and the tab strip Files | Checked out | Team | Activity |
	 * Project, each tab a link to `?view=` (`$lib/armory/nav`). The ROUTE reads
	 * the view off `page.url` and hands it down; no load reads the url, so a tab
	 * reruns nothing. A harness with no address of its own passes `onview`, and
	 * then a tab press is handed to it instead of followed.
	 *
	 * Presentational: the route owns the load, the realtime subscription and
	 * the transports. EVERY OMITTED TRANSPORT REMOVES ITS CONTROL: no `takeBack`
	 * is no Force check in, no `rename` / `setArchived` / `purge` is no Project
	 * view, no `addMember` is no adding, no `searchPeople` is the paste box only.
	 *
	 * ONE NAME MAP (`teamNames`) for every name on the page: file rows, the
	 * checkout table, the activity and the team all say the same name for the
	 * same person, from their site account where the server links one.
	 */
	import { untrack } from 'svelte';
	import ArmoryActivity from './ArmoryActivity.svelte';
	import ArmoryCheckouts from './ArmoryCheckouts.svelte';
	import ArmoryFiles from './ArmoryFiles.svelte';
	import ArmoryProjectSettings from './ArmoryProjectSettings.svelte';
	import ArmoryTeam from './ArmoryTeam.svelte';
	import { holderFilterOf, type HolderFilter } from './checkouts';
	import { ForceCheckIn, type ForceOutcome } from './force-check-in.svelte';
	import { projectViewHref, projectViewOf, projectViewsFor, PROJECT_VIEW_WORDS, type ProjectView } from './nav';
	import {
		peopleSearchOffered,
		teamNames,
		type ArmoryPurgePreview,
		type MemberOutcome,
		type PeopleSearchAnswer,
		type PurgeAnswer
	} from './team';
	import {
		checkoutCounts,
		ROLE_WORDS,
		sizeWords,
		type ArmoryChange,
		type ArmoryCheckout,
		type ArmoryFile,
		type ArmoryMember,
		type ArmoryProjectSummary,
		type ArmoryRole,
		type FileFilter
	} from './view';

	type Outcome = { ok: true } | { ok: false; message: string };

	let {
		project,
		files,
		members,
		sideCounts = {},
		deviceSeen = {},
		checkouts = [],
		activity = [],
		storage = null,
		now,
		myEmail,
		live = 'off',
		view = 'files',
		viewHref = projectViewHref,
		onview = null,
		isAdmin = false,
		adminReach = false,
		teamReady = true,
		addMember = null,
		removeMember = null,
		takeBack = null,
		takeBackNeedsComputer = false,
		rename = null,
		setArchived = null,
		searchPeople = null,
		loadTeam = null,
		refresh = null,
		purge = null,
		purgePreview = null,
		onpurged = null,
		initialFilter = 'all',
		initialQuery = '',
		initialHolder = 'all'
	}: {
		project: ArmoryProjectSummary;
		files: ArmoryFile[];
		members: ArmoryMember[];
		sideCounts?: Record<string, number>;
		deviceSeen?: Record<string, number>;
		checkouts?: ArmoryCheckout[];
		activity?: ArmoryChange[];
		storage?: { bytes: number; files: number } | null;
		now: number;
		myEmail: string;
		live?: 'live' | 'polling' | 'off';
		/** The view asked for (`?view=`); one this viewer is not offered falls back to Files. */
		view?: string | null;
		viewHref?: (view: ProjectView) => string;
		/** A harness with no address: tab presses are handed here instead of followed. */
		onview?: ((view: ProjectView) => void) | null;
		isAdmin?: boolean;
		/**
		 * A site admin on a database with 0233 (the summaries rung): manages the
		 * project's people as a mentor would, member or not.
		 */
		adminReach?: boolean;
		/** False on a database without `armory_team_status`. */
		teamReady?: boolean;
		/** Adds a person, or changes the role of one already in the project (the same RPC). */
		addMember?: ((email: string, role: ArmoryRole, opts?: { refresh?: boolean }) => Promise<MemberOutcome>) | null;
		removeMember?: ((email: string) => Promise<MemberOutcome>) | null;
		takeBack?: ((fileId: string) => Promise<ForceOutcome>) | null;
		/** True when the caller may force a check in but this database needs one of their computers to send it from. */
		takeBackNeedsComputer?: boolean;
		rename?: ((name: string) => Promise<Outcome>) | null;
		setArchived?: ((archived: boolean) => Promise<Outcome>) | null;
		searchPeople?: ((query: string) => Promise<PeopleSearchAnswer>) | null;
		loadTeam?: (() => Promise<ArmoryMember[] | null>) | null;
		refresh?: (() => Promise<void>) | null;
		purge?: ((confirmName: string, operation: string) => Promise<PurgeAnswer>) | null;
		purgePreview?: (() => Promise<ArmoryPurgePreview | null>) | null;
		onpurged?: ((name: string, storageProblem: string | null) => void) | null;
		/** Where the filter and the search start (the harness opens a state on one). */
		initialFilter?: FileFilter;
		initialQuery?: string;
		/** 'all', 'me' or an address: the Checked out view's holder at first. */
		initialHolder?: HolderFilter;
	} = $props();

	const me = $derived(myEmail.trim().toLowerCase());
	const seen = $derived(new Map(Object.entries(deviceSeen)));
	const names = $derived(teamNames(members, checkouts));
	const byId = $derived(new Map(files.map((f) => [f.id, f])));
	const fileName = (id: string) => byId.get(id)?.name ?? null;
	const live_ = $derived(files.filter((f) => !f.deleted));
	const counts = $derived(checkoutCounts(live_, me));

	const settings = $derived(!!rename || !!setArchived || (isAdmin && !!purge));
	/** The people search's gate, asked once (`peopleSearchOffered`): it also says why the paste box is the way in. */
	const searchOffered = $derived(peopleSearchOffered({ isAdmin, role: project.role, email: me }));
	const tabs = $derived(projectViewsFor({ settings }));
	const shown = $derived(projectViewOf(view, { settings }));

	/** The Checked out view's holder, kept here so the Team view can open it on one person. */
	let holder = $state<HolderFilter>(untrack(() => holderFilterOf(initialHolder, checkouts)));

	/**
	 * One Force check in for the page: arming a key on one view disarms the
	 * other's. Made ONCE and calling whichever transport the page holds now,
	 * because every write reloads the page's data and hands down a new
	 * transport, and a state rebuilt on each would drop "Checked in." the moment
	 * it was said.
	 */
	const forceState = new ForceCheckIn((fileId) => (takeBack ? takeBack(fileId) : Promise.resolve({ ok: false, message: '' })));
	const force = $derived(takeBack ? forceState : null);

	const LIVE_WORDS = {
		live: 'Live: changes appear as they happen',
		polling: 'Checking for changes every few seconds',
		off: 'Showing the files as of when this page opened'
	};

	function tabCount(v: ProjectView): string {
		if (v === 'files') return ` (${counts.all})`;
		if (v === 'checked-out') return ` (${checkouts.length})`;
		if (v === 'team') return ` (${members.length})`;
		return '';
	}

	function press(event: MouseEvent, v: ProjectView) {
		if (!onview) return;
		event.preventDefault();
		onview(v);
	}
</script>

{#if project.archived}
	<div class="ar-notice" role="status" data-testid="armory-archived-notice">
		<span class="ar-notice-glyph" aria-hidden="true">!</span>
		<div>
			<strong>This project is archived.</strong>
			Computers do not sync it, and nothing in it was deleted.{setArchived
				? ' Restore it from the Project view to sync it again.'
				: ' A mentor can restore it.'}
		</div>
	</div>
{/if}
{#if project.role === null}
	<div class="ar-notice ar-notice-quiet" role="status" data-testid="armory-admin-viewer">
		<span class="ar-notice-glyph" aria-hidden="true">i</span>
		<div>
			<strong>You are viewing this project as a site admin.</strong>
			You are not a member, so its folder is not on your computers.
		</div>
	</div>
{/if}

<div class="ar-status" data-testid="armory-status">
	<span class="ar-path" data-testid="armory-path">The folder <code>C:\IDEA\Armory\{project.name}</code> on every connected computer.</span>
	<span class="ar-live" data-live={live} data-testid="armory-live">
		<span class="ar-live-dot" aria-hidden="true"></span>{LIVE_WORDS[live]}
	</span>
	<span class="ar-readouts">
		{#if project.role}<span class="ar-readout" data-testid="armory-role-chip">You are {ROLE_WORDS[project.role]}</span>{/if}
		{#if project.role}<span class="ar-readout"><span aria-hidden="true">★</span> {counts.mine} yours</span>{/if}
		{#if storage}<span class="ar-readout"><span aria-hidden="true">◫</span> {sizeWords(storage.bytes)} stored</span>{/if}
	</span>
</div>

<nav class="ar-tabs" aria-label="Project views" data-testid="armory-tabs">
	{#each tabs as v (v)}
		<a
			class="ar-tab"
			href={viewHref(v)}
			aria-current={v === shown ? 'page' : undefined}
			data-sveltekit-noscroll
			data-testid={`armory-tab-${v}`}
			onclick={(e) => press(e, v)}
		>
			{PROJECT_VIEW_WORDS[v]}{tabCount(v)}
		</a>
	{/each}
</nav>

<div class="ar-view" data-view-shown={shown}>
	{#if shown === 'files'}
		<ArmoryFiles
			projectId={project.id}
			projectName={project.name}
			{files}
			{sideCounts}
			{seen}
			{names}
			{now}
			{me}
			{force}
			{initialFilter}
			{initialQuery}
		/>
	{:else if shown === 'checked-out'}
		<ArmoryCheckouts
			projectId={project.id}
			{checkouts}
			{names}
			{now}
			{me}
			{force}
			forceNeedsComputer={takeBackNeedsComputer}
			bind:holder
		/>
	{:else if shown === 'team'}
		<ArmoryTeam
			role={project.role}
			{isAdmin}
			{adminReach}
			{searchOffered}
			{members}
			{checkouts}
			{teamReady}
			{now}
			{me}
			checkedOutHref={viewHref('checked-out')}
			onholder={(email) => {
				holder = email;
				if (!onview) return false;
				onview('checked-out');
				return true;
			}}
			{addMember}
			{removeMember}
			{searchPeople}
			{loadTeam}
			{refresh}
		/>
	{:else if shown === 'activity'}
		<ArmoryActivity {activity} {fileName} {names} {now} />
	{:else}
		<ArmoryProjectSettings {project} {storage} {isAdmin} {rename} {setArchived} {purge} {purgePreview} {onpurged} />
	{/if}
</div>
