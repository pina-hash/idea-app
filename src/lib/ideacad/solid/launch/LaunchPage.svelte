<!--
  THE IDEACAD FRONT DOOR. One component the real route (`/ideacad`), the
  legacy chooser (`DirectDocuments.svelte`, embedded) and the dev harness
  (`/dev/ideacad-launch`) all mount; the api is injected, so the harness and
  the mount test answer in memory and the route answers through
  `createSolidTransports`.

  ROWS ARE THE PAGE'S OWN STATE, SEEDED FROM THE PROPS. The server load hands
  the first list down so the first paint is not a spinner; every write here
  re-reads through the api (`refresh`) and the parent may re-seed the props
  after its own refresh, so both directions keep the list current.

  AN ACKNOWLEDGEMENT SURVIVES THE ACT IT REPORTS (CLAUDE.md): a trash, a purge
  and a folder delete each unmount the card they were pressed in, so their
  notice lands HERE, on the list that is on screen afterwards, and never in
  the card.
-->
<script lang="ts">
	import '../../ideacad.css';
	import { onMount } from 'svelte';
	import Pending from '$lib/Pending.svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import IdeaCadMark from '$lib/marks/IdeaCadMark.svelte';
	import type { LaunchApi } from './api';
	import { IDEACAD_CHOOSER_CONTROLS_AT } from '../../app/types';
	import { collectTags, filterDocuments, groupDocuments, LAUNCH_SORTS, LAUNCH_SORT_LABELS, searchDocuments, sortDocuments, type LaunchDocument, type LaunchFolder, type LaunchSort, type LaunchView, type TrashedDocument } from './library';
	import { EMPTY_ARCHIVED, EMPTY_FOLDER, EMPTY_LIBRARY, EMPTY_SEARCH, FOLDER_DELETE_SENTENCE, NEW_MODEL_TITLE, folderDeleteConfirm, folderDeletedSentence } from './wording';
	import DocumentCard from './DocumentCard.svelte';
	import TrashList from './TrashList.svelte';
	import type { IdeaCadDocumentSource } from '../../app/types';
	let { api, rows: rowsProp = [], folders: foldersProp = [], sources = [], onopen, onchange, embedded = false, storageMessage = null, refusal = null, opening = '', now = () => new Date() }: {
		api: LaunchApi; rows?: LaunchDocument[]; folders?: LaunchFolder[]; sources?: IdeaCadDocumentSource[];
		onopen: (id: string) => void; onchange?: () => void; embedded?: boolean;
		/** The server's own word when the folders RPC is absent (a deployment before 0217). */
		storageMessage?: string | null;
		/** A refusal from OPENING a document, which happens outside this component. */
		refusal?: string | null; opening?: string; now?: () => Date;
	} = $props();
	let rows = $derived(rowsProp);
	let folders = $derived(foldersProp);
	let storageNote = $derived(storageMessage ?? '');
	let view = $state<LaunchView>('live'), folderId = $state<string | null>(null), tag = $state<string | null>(null), query = $state(''), sort = $state<LaunchSort>('updated');
	let noticeText = $state(''), pageRefusal = $state('');
	let trashRows: TrashedDocument[] = $state([]), trashLoaded = $state(false), trashMessage = $state('');
	let newOpen = $state(false), newTitle = $state(NEW_MODEL_TITLE), newRefusal = $state(''), creating = $state(false);
	let folderForm = $state(false), folderName = $state(''), folderEdit = $state<string | null>(null), folderRename = $state(''), folderArmed = $state<string | null>(null), folderRefusal = $state(''), folderBusy = $state(false);
	const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
	const focus = (el: HTMLElement) => { el.focus(); };
	const visible = $derived(sortDocuments(searchDocuments(filterDocuments(rows, { view, folderId, tag }), query), sort));
	const controlsShown = $derived(rows.length >= IDEACAD_CHOOSER_CONTROLS_AT);
	const groups = $derived(groupDocuments(visible));
	const tags = $derived(collectTags(rows));
	/** What the folder filter is set to, for the one-line summary a phone shows while the rail is folded. */
	const filterSummary = $derived([folderId ? (folders.find((f) => f.id === folderId)?.name ?? '') : 'All folders', tag ? `#${tag}` : ''].filter(Boolean).join(' · '));
	const emptySentence = $derived.by(() => {
		if (view === 'trash' || visible.length) return null;
		if (query.trim()) return EMPTY_SEARCH;
		if (folderId) return EMPTY_FOLDER;
		if (tag) return EMPTY_SEARCH;
		if (view === 'archived') return EMPTY_ARCHIVED;
		return EMPTY_LIBRARY;
	});
	async function refreshFolders() { try { folders = await api.folders(); storageNote = ''; } catch (err) { storageNote = message(err); } }
	async function loadTrash() { try { trashRows = await api.trashList(); trashMessage = ''; } catch (err) { trashMessage = message(err); } finally { trashLoaded = true; } }
	/** Re-read everything on screen. Exported so the route can call it when the workspace hands back. */
	export async function refresh(notice = '') {
		try { rows = await api.list(); pageRefusal = ''; } catch (err) { pageRefusal = message(err); }
		await refreshFolders();
		if (view === 'trash') await loadTrash();
		if (notice) noticeText = notice;
		onchange?.();
	}
	function show(next: LaunchView) { view = next; noticeText = ''; if (next === 'trash' && !trashLoaded) void loadTrash(); }
	async function createModel() {
		creating = true; newRefusal = '';
		try { const { id } = await api.create(newTitle); newOpen = false; newTitle = NEW_MODEL_TITLE; onopen(id); }
		catch (err) { newRefusal = message(err); }
		finally { creating = false; }
	}
	async function folderRun(action: () => Promise<unknown>) {
		folderBusy = true; folderRefusal = '';
		try { await action(); folderForm = false; folderEdit = null; folderName = ''; await refreshFolders(); }
		catch (err) { folderRefusal = message(err); }
		finally { folderBusy = false; }
	}
	async function deleteFolder(folder: LaunchFolder) {
		folderBusy = true; folderRefusal = '';
		try { const r = await api.deleteFolder(folder.id); if (folderId === folder.id) folderId = null; folderArmed = null; await refresh(folderDeletedSentence(folder.name, r.movedOut)); }
		catch (err) { folderRefusal = message(err); }
		finally { folderBusy = false; }
	}
	onMount(() => { if (embedded) void refreshFolders(); });
</script>

<section class="ic-root launch" class:embedded aria-label="IdeaCAD models">
	{#snippet controls()}
		<div class="new">
			{#if newOpen}
				<form class="new-form" onsubmit={(e) => { e.preventDefault(); void createModel(); }}>
					<label>Name<input use:focus bind:value={newTitle} maxlength="120" /></label>
					<button class="accept" data-testid="new-model-create" disabled={creating}>Create and open</button><button type="button" class="cancel" onclick={() => (newOpen = false)}>Cancel</button>
					{#if newRefusal}<p class="refusal" role="alert">{newRefusal}</p>{/if}
				</form>
			{:else}
				<button class="accept" data-testid="new-model" onclick={() => { newOpen = true; noticeText = ''; }}>+ New model</button>
			{/if}
		</div>
		{#if controlsShown}
			<!-- Search and sort are drawn only once the list is long enough to need them (the chooser's own threshold, IDEACAD_CHOOSER_CONTROLS_AT); below it they cost a reader more than they save, and a page with two searches on it is the embedded case this rule was measured on. -->
			<label class="search">Search<input type="search" bind:value={query} placeholder="Title, owner or tag" /></label>
			<label class="sort">Sort<select bind:value={sort}>{#each LAUNCH_SORTS as s (s)}<option value={s}>{LAUNCH_SORT_LABELS[s]}</option>{/each}</select></label>
		{/if}
		<div class="views" role="group" aria-label="View">
			<button aria-pressed={view === 'live'} data-testid="view-live" onclick={() => show('live')}>All models</button>
			<button aria-pressed={view === 'archived'} data-testid="view-archived" onclick={() => show('archived')}>Archived</button>
			<button aria-pressed={view === 'trash'} data-testid="view-trash" onclick={() => show('trash')}>Trash</button>
		</div>
	{/snippet}
	{#if embedded}
		<div class="toolbar">{@render controls()}</div>
	{:else}
		<!-- ONE BAND: the site's own logo home, the IdeaCAD lockup beside it, and the page's controls on the same row wherever the width holds them. -->
		<header class="masthead" class:full={controlsShown} class:naming={newOpen}>
			<div class="brandline">
				<a class="site-logo logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width="var(--site-logo-w)" /></a>
				<span class="rule" aria-hidden="true"></span>
				<h1 class="ic-logo"><span class="cube"><IdeaCadMark once /></span><span class="word" aria-hidden="true">IDEA<span class="cad">CAD</span></span><span class="sr">IdeaCAD models</span></h1>
			</div>
			<div class="toolbar">{@render controls()}</div>
			<nav class="links" aria-label="IdeaCAD pages"><a href="/ideacad?legacy=1" aria-label="Legacy chooser">Legacy<span class="wide">chooser</span></a></nav>
		</header>
	{/if}
	{#if refusal}<p class="refusal page-refusal" role="alert">{refusal}</p>{/if}
	{#if pageRefusal}<p class="refusal page-refusal" role="alert">{pageRefusal}</p>{/if}
	{#if noticeText.trim()}<p class="said notice-line" role="status" data-testid="notice">{noticeText}</p>{/if}
	<div class="body">
		<!-- THE MODELS COME FIRST ON A PHONE: below 960px the rail folds into one row naming the active filter, and opens in place. Above it the rail is a column and the fold is never drawn. -->
		<aside class="rail" aria-label="Folders and tags">
			<Disclosure label="Folders" collapseWhen={true} scope="ideacad-launch-filters" testId="filters-toggle" bodyClass="rail-body">
				{#snippet meta()}{filterSummary}{/snippet}
				<h2 class="eyebrow folders-head">Folders</h2>
				{#if storageNote}<p class="note" data-testid="storage-note">{storageNote}</p>{/if}
				<ul class="folders">
					<li><button class="folder" aria-pressed={folderId === null} onclick={() => (folderId = null)}>All folders</button></li>
					{#each folders as folder (folder.id)}
						<li>
							<button class="folder" data-testid="folder" aria-pressed={folderId === folder.id} onclick={() => (folderId = folderId === folder.id ? null : folder.id)}><span class="name">{folder.name}</span><span class="count">{folder.documentCount}</span></button>
							{#if folderId === folder.id}
								<div class="folder-tools">
									{#if folderEdit === folder.id}
										<form onsubmit={(e) => { e.preventDefault(); void folderRun(() => api.renameFolder(folder.id, folderRename)); }}>
											<label>Folder name<input use:focus bind:value={folderRename} maxlength="80" /></label>
											<div class="pair"><button class="accept" disabled={folderBusy}>Save name</button><button type="button" class="cancel" onclick={() => (folderEdit = null)}>Cancel</button></div>
										</form>
									{:else if folderArmed === folder.id}
										<p class="ask">{folderDeleteConfirm(folder.name, folder.documentCount)}</p><p class="note">{FOLDER_DELETE_SENTENCE}</p>
										<div class="pair"><button class="danger" data-testid="folder-delete-confirm" disabled={folderBusy} onclick={() => void deleteFolder(folder)}>Confirm: delete folder</button><button class="cancel" onclick={() => (folderArmed = null)}>Cancel</button></div>
									{:else}
										<div class="pair"><button onclick={() => { folderRename = folder.name; folderEdit = folder.id; }}>Rename</button><button class="danger" data-testid="folder-delete" onclick={() => (folderArmed = folder.id)}>Delete folder</button></div>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
				{#if folderForm}
					<form class="folder-form" onsubmit={(e) => { e.preventDefault(); void folderRun(() => api.createFolder(folderName)); }}>
						<label>New folder name<input use:focus bind:value={folderName} maxlength="80" /></label>
						<div class="pair"><button class="accept" data-testid="folder-create" disabled={folderBusy}>Create folder</button><button type="button" class="cancel" onclick={() => (folderForm = false)}>Cancel</button></div>
					</form>
				{:else}
					<button class="new-folder" data-testid="new-folder" onclick={() => { folderForm = true; folderRefusal = ''; }}>+ New folder</button>
				{/if}
				{#if folderRefusal}<p class="refusal" role="alert">{folderRefusal}</p>{/if}
				{#if tags.length}
					<h2 class="eyebrow">Tags</h2>
					<ul class="tags">{#each tags as t (t)}<li><button class="tagbtn" aria-pressed={tag === t} onclick={() => (tag = tag === t ? null : t)}>#{t}</button></li>{/each}</ul>
				{/if}
			</Disclosure>
		</aside>
		<div class="library">
			{#if view === 'trash'}
				{#if trashMessage}<p class="refusal" role="alert">{trashMessage}</p>
				{:else if !trashLoaded}<Pending label="Loading the trash" />
				{:else}<TrashList rows={trashRows} {api} onrefresh={refresh} {now} />{/if}
			{:else if emptySentence}
				<div class="empty-state" data-testid="empty">
					<p class="empty-title">{emptySentence}</p>
					{#if emptySentence === EMPTY_LIBRARY}<button class="accept" data-testid="new-model-empty" onclick={() => (newOpen = true)}>+ New model</button>{/if}
				</div>
			{:else}
				{#each groups as group (group.key)}
					<section class="group" aria-label={group.label}>
						<h2 class="eyebrow">{group.label} <span class="count">{group.rows.length}</span></h2>
						<div class="cards">{#each group.rows as row (row.id)}<DocumentCard {row} {folders} {api} {sources} {onopen} onrefresh={refresh} {now} opening={opening === row.id} />{/each}</div>
					</section>
				{/each}
			{/if}
		</div>
	</div>
</section>

<style>
	/* The bottom inset clears the site's own floating Voice and Report controls, so the last row of cards can scroll out from under them. */
	.launch { display: grid; align-content: start; gap: 0.75rem; min-height: 100%; min-width: 0; padding: 0 0 4.5rem; box-sizing: border-box; }
	.launch.embedded { background: transparent; padding: 0; }
	/* THE MASTHEAD IS ONE BAND AND EVERY PART OF IT IS A CONTROL OR A NAME. It used to be a 64px row that was 88% empty
	   at 1440, with the page's own controls in a second band under it. The controls are grid items of the band itself
	   (the toolbar is `display: contents` here), so each one can sit on the row that has room for it: one row at 1440,
	   New model beside the name and the rest under it at 960, and three short rows on a phone. */
	.masthead { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto auto auto; grid-template-areas: 'brand new search sort views links'; align-items: center; gap: 0.5rem 0.75rem; padding: 0.5rem var(--ic-pad); background: var(--ic-head); border-bottom: 1px solid var(--ic-edge); --site-logo-w: 88px; }
	.masthead.naming { grid-template-areas: 'brand new new new new links' 'search search search sort views views'; }
	.masthead .toolbar { display: contents; }
	/* Measured with the search and sort drawn: the one row needs about 1230px, so below 1280 the search and the sort
	   take a second row and the views stay up beside the name, which is where the first row had room for them. */
	@media (min-width: 900px) and (max-width: 1279px) {
		.masthead.full { grid-template-columns: auto auto minmax(0, 1fr) auto auto; grid-template-areas: 'brand new . views links' 'search search search search sort'; }
		.masthead.full.naming { grid-template-areas: 'brand new new views links' 'search search search search sort'; }
	}
	@media (min-width: 700px) and (max-width: 899px) {
		.masthead { grid-template-columns: auto auto minmax(0, 1fr) auto auto; grid-template-areas: 'brand new . . links' 'search search search sort views'; }
		.masthead.naming { grid-template-areas: 'brand new new new links' 'search search search sort views'; }
	}
	.brandline { grid-area: brand; display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
	.new { grid-area: new; display: flex; min-width: 0; }
	.search { grid-area: search; }
	.sort { grid-area: sort; }
	.views { grid-area: views; display: flex; gap: 0.35rem; justify-self: end; }
	.links { grid-area: links; justify-self: end; }
	.site-logo { display: inline-flex; align-items: center; min-height: var(--ic-tap); flex: none; }
	.rule { align-self: stretch; width: 1px; margin: 0.35rem 0; background: var(--ic-edge); flex: none; }
	/* THE IDEACAD LOCKUP: the extruded cube in the room's own green, lit on top with a highlight along its leading edges, beside the wordmark it has always had. */
	.ic-logo { display: inline-flex; align-items: center; gap: 0.5rem; min-width: 0; margin: 0; font: 700 20px / 1 var(--font-hero); letter-spacing: 0.08em; color: var(--ic-text-1); white-space: nowrap; }
	.ic-logo .cube { flex: none; width: 34px; height: 34px; color: var(--ic-accent); --icm-top: color-mix(in srgb, var(--ic-accent) 62%, var(--ic-head)); --icm-right: color-mix(in srgb, var(--ic-accent) 32%, var(--ic-head)); --icm-left: color-mix(in srgb, var(--ic-accent) 15%, var(--ic-head)); --icm-hl: var(--ic-text-1); }
	.ic-logo .cad { color: var(--ic-accent); }
	.sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
	.links a { display: inline-flex; align-items: center; gap: 0.4em; min-height: var(--ic-tap); padding: 0 0.6rem; font: var(--ic-fs-label) / 1.2 var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ic-text-2); text-decoration: none; border: 1px solid var(--ic-line); border-radius: var(--ic-radius); white-space: nowrap; }
	.links a:hover { color: var(--ic-text-1); border-color: var(--ic-accent); }
	/* Embedded in the legacy chooser there is no band, and the same controls are one wrapping row. */
	.embedded .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; min-width: 0; padding: 0 var(--ic-pad); }
	.embedded .search { flex: 1 1 240px; }
	.new-form { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; min-width: 0; max-width: 100%; flex: 1 1 auto; }
	.new-form label { flex: 1 1 200px; }
	.new-form .refusal { flex: 1 1 100%; }
	.pair { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	label { display: grid; gap: 0.25rem; min-width: 0; font: var(--ic-fs-label) / 1.3 var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--ic-text-2); }
	/* A control's label sits on its own row in a form and BESIDE the field in the band, so the band stays one control high. */
	.toolbar label { display: flex; align-items: center; gap: 0.5rem; }
	input, select { width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; padding: 0 0.5rem; text-transform: none; letter-spacing: 0; }
	.toolbar input { flex: 1 1 auto; width: auto; }
	.sort select { width: auto; }
	/* On a phone: the name and the legacy link, then New model with the sort, the search, and the three views sharing a row. */
	@media (max-width: 699px) {
		.masthead { --site-logo-w: 68px; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'brand links' 'new sort' 'search search' 'views views'; gap: 0.5rem; }
		.masthead.naming { grid-template-areas: 'brand links' 'new new' 'sort sort' 'search search' 'views views'; }
		.masthead:not(.full) { grid-template-areas: 'brand links' 'new new' 'views views'; }
		.brandline { gap: 0.6rem; }
		.ic-logo { font-size: 17px; gap: 0.4rem; }
		.ic-logo .cube { width: 30px; height: 30px; }
		.links .wide { display: none; }
		.new .accept { flex: 1 1 auto; }
		/* Naming on a phone: the name on its own row, then Create and open with Cancel beside it rather than under it. */
		.new-form label { flex-basis: 100%; }
		.sort { justify-self: start; }
		.views { justify-self: stretch; }
		.views button { flex: 1 1 0; }
	}
	.page-refusal, .notice-line { margin: 0 var(--ic-pad); padding: 0.4rem 0.6rem; border-left: var(--ic-rail) solid var(--ic-accent); background: var(--ic-panel); }
	.page-refusal { border-left-color: var(--ic-warn); }
	.body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.75rem; min-width: 0; padding: 0 var(--ic-pad); }
	@media (min-width: 960px) { .body { grid-template-columns: 220px minmax(0, 1fr); gap: 1rem; } }
	.rail { min-width: 0; }
	.rail :global(.rail-body) { gap: 0.5rem; align-content: start; min-width: 0; }
	.rail :global(.rail-body[data-open='true']) { display: grid; }
	/* Above 960px the rail is a column and there is nothing to unfold: the trigger is not drawn and the body always shows. */
	@media (min-width: 960px) {
		.launch .rail :global(.disc-trigger) { display: none; }
		.launch .rail :global(.rail-body) { display: grid; padding-top: 0; }
	}
	/* Below it the trigger itself says Folders, so the heading inside would say it twice. The trigger is a plain row,
	   so the room's raised-plate bevel comes off it, and it keeps the folder rows' own inset for when hover fills it. */
	.rail :global(.disc-trigger) { padding-inline: 0.6rem; box-shadow: none; }
	@media (max-width: 959px) { .folders-head { display: none; } }
	.folders, .tags { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
	.tags { display: flex; flex-wrap: wrap; }
	.folder { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; width: 100%; text-align: left; padding: 0 0.6rem; }
	.folder .name { min-width: 0; overflow-wrap: anywhere; }
	.new-folder { width: 100%; }
	.count { font: var(--ic-fs-label) / 1 var(--font-mono); color: var(--ic-text-2); }
	.folder-tools { display: grid; gap: 0.35rem; padding: 0.5rem 0 0.5rem 0.6rem; border-left: var(--ic-rail) solid var(--ic-accent); margin: 0.35rem 0; }
	.folder-tools form, .folder-form { display: grid; gap: 0.35rem; min-width: 0; }
	.tagbtn { text-transform: none; letter-spacing: 0; padding: 0 0.6rem; }
	.ask { margin: 0; font: 600 var(--ic-fs-ui) / 1.3 var(--font-display); color: var(--ic-text-1); }
	.note { margin: 0; }
	.refusal { margin: 0; padding-left: 0.5rem; border-left: var(--ic-rail) solid var(--ic-warn); }
	.library { display: grid; gap: 1rem; min-width: 0; align-content: start; }
	.group { display: grid; gap: 0.5rem; min-width: 0; }
	.group h2 { display: flex; align-items: center; gap: 0.5rem; }
	.group h2::after { content: ''; flex: 1; height: 1px; background: var(--ic-line); }
	/* A row of comparable cards, so a grid with `align-items: start`; the one transient exception (an opened Manage
	   panel) grows its own card only. */
	.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 0.75rem; align-items: start; min-width: 0; }
	.empty-state { display: grid; gap: 0.5rem; justify-items: start; padding: 1.5rem 0; }
	.empty-title { margin: 0; font: 600 20px / 1.2 var(--font-display); color: var(--ic-text-1); }
</style>
