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
	import type { LaunchApi } from './api';
	import { collectTags, filterDocuments, groupDocuments, LAUNCH_SORTS, LAUNCH_SORT_LABELS, searchDocuments, sortDocuments, type LaunchDocument, type LaunchFolder, type LaunchSort, type LaunchView, type TrashedDocument } from './library';
	import { EMPTY_ARCHIVED, EMPTY_FOLDER, EMPTY_LIBRARY, EMPTY_LIBRARY_HINT, EMPTY_SEARCH, FOLDER_DELETE_SENTENCE, NEW_MODEL_TITLE, folderDeleteConfirm, folderDeletedSentence } from './wording';
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
	const groups = $derived(groupDocuments(visible));
	const tags = $derived(collectTags(rows));
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
	{#if !embedded}
		<header class="masthead">
			<a class="brand" href="/" aria-label="IDEA home">IDEA<span>CAD</span></a>
			<h1>Models</h1>
			<nav class="links" aria-label="IdeaCAD pages"><a href="/ideacad?legacy=1">Legacy chooser</a></nav>
		</header>
	{/if}
	<div class="toolbar">
		<div class="new">
			{#if newOpen}
				<form class="new-form" onsubmit={(e) => { e.preventDefault(); void createModel(); }}>
					<label>Name the model<input use:focus bind:value={newTitle} maxlength="120" /></label>
					<div class="pair"><button class="accept" data-testid="new-model-create" disabled={creating}>Create and open</button><button type="button" class="cancel" onclick={() => (newOpen = false)}>Cancel</button></div>
					{#if newRefusal}<p class="refusal" role="alert">{newRefusal}</p>{/if}
				</form>
			{:else}
				<button class="accept" data-testid="new-model" onclick={() => { newOpen = true; noticeText = ''; }}>+ New model</button>
			{/if}
		</div>
		<label class="search">Search<input type="search" bind:value={query} placeholder="Title, owner or tag" /></label>
		<label class="sort">Sort<select bind:value={sort}>{#each LAUNCH_SORTS as s (s)}<option value={s}>{LAUNCH_SORT_LABELS[s]}</option>{/each}</select></label>
		<div class="views" role="group" aria-label="View">
			<button aria-pressed={view === 'live'} data-testid="view-live" onclick={() => show('live')}>All models</button>
			<button aria-pressed={view === 'archived'} data-testid="view-archived" onclick={() => show('archived')}>Archived</button>
			<button aria-pressed={view === 'trash'} data-testid="view-trash" onclick={() => show('trash')}>Trash</button>
		</div>
	</div>
	{#if refusal}<p class="refusal page-refusal" role="alert">{refusal}</p>{/if}
	{#if pageRefusal}<p class="refusal page-refusal" role="alert">{pageRefusal}</p>{/if}
	{#if noticeText.trim()}<p class="said notice-line" role="status" data-testid="notice">{noticeText}</p>{/if}
	<div class="body">
		<aside class="rail" aria-label="Folders and tags">
			<h2 class="eyebrow">Folders</h2>
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
				<button data-testid="new-folder" onclick={() => { folderForm = true; folderRefusal = ''; }}>+ New folder</button>
			{/if}
			{#if folderRefusal}<p class="refusal" role="alert">{folderRefusal}</p>{/if}
			{#if tags.length}
				<h2 class="eyebrow">Tags</h2>
				<ul class="tags">{#each tags as t (t)}<li><button class="tagbtn" aria-pressed={tag === t} onclick={() => (tag = tag === t ? null : t)}>#{t}</button></li>{/each}</ul>
			{/if}
		</aside>
		<div class="library">
			{#if view === 'trash'}
				{#if trashMessage}<p class="refusal" role="alert">{trashMessage}</p>
				{:else if !trashLoaded}<Pending label="Loading the trash" />
				{:else}<TrashList rows={trashRows} {api} onrefresh={refresh} {now} />{/if}
			{:else if emptySentence}
				<div class="empty-state" data-testid="empty">
					<p class="empty-title">{emptySentence}</p>
					{#if emptySentence === EMPTY_LIBRARY}<p class="note">{EMPTY_LIBRARY_HINT}</p><button class="accept" data-testid="new-model-empty" onclick={() => (newOpen = true)}>+ New model</button>{/if}
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
	.launch { display: grid; gap: 0.75rem; min-height: 100%; min-width: 0; padding: 0 0 2rem; box-sizing: border-box; }
	.launch.embedded { background: transparent; padding: 0; }
	.masthead { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1.25rem; padding: 0.6rem var(--ic-pad); background: var(--ic-head); border-bottom: 1px solid var(--ic-edge); }
	.brand { font: 700 18px / 1 var(--font-hero); letter-spacing: 0.08em; color: var(--ic-text-1); text-decoration: none; display: inline-flex; align-items: center; min-height: var(--ic-tap); }
	.brand span { color: var(--ic-accent); }
	h1 { margin: 0; font: 600 var(--ic-fs-doc) / 1.15 var(--font-hero); }
	.links { margin-left: auto; }
	.links a { display: inline-flex; align-items: center; min-height: var(--ic-tap); padding: 0 0.6rem; font: var(--ic-fs-label) / 1.2 var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ic-text-2); text-decoration: none; border: 1px solid var(--ic-line); border-radius: var(--ic-radius); }
	.links a:hover { color: var(--ic-text-1); border-color: var(--ic-accent); }
	.toolbar, .body { padding: 0 var(--ic-pad); }
	.toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: 0.6rem 0.9rem; min-width: 0; }
	.new { display: grid; min-width: 0; }
	.new-form { display: grid; gap: 0.35rem; padding: 0.5rem; border: 1px solid var(--ic-edge); border-radius: var(--ic-radius); background: var(--ic-panel); min-width: 0; max-width: 100%; }
	.pair { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	label { display: grid; gap: 0.25rem; min-width: 0; font: var(--ic-fs-label) / 1.3 var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--ic-text-2); }
	.search { flex: 1 1 200px; }
	input, select { width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; padding: 0 0.5rem; text-transform: none; letter-spacing: 0; }
	.views { display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.page-refusal, .notice-line { margin: 0 var(--ic-pad); padding: 0.4rem 0.6rem; border-left: var(--ic-rail) solid var(--ic-accent); background: var(--ic-panel); }
	.page-refusal { border-left-color: var(--ic-warn); }
	.body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; min-width: 0; }
	@media (min-width: 960px) { .body { grid-template-columns: 240px minmax(0, 1fr); } }
	.rail { display: grid; gap: 0.5rem; align-content: start; min-width: 0; }
	.folders, .tags { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
	.tags { display: flex; flex-wrap: wrap; }
	.folder { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; width: 100%; text-align: left; padding: 0 0.6rem; }
	.folder .name { min-width: 0; overflow-wrap: anywhere; }
	.count { font: var(--ic-fs-label) / 1 var(--font-mono); color: var(--ic-text-2); }
	.folder-tools { display: grid; gap: 0.35rem; padding: 0.5rem 0 0.5rem 0.6rem; border-left: var(--ic-rail) solid var(--ic-accent); margin: 0.35rem 0; }
	.folder-tools form, .folder-form { display: grid; gap: 0.35rem; min-width: 0; }
	.tagbtn { text-transform: none; letter-spacing: 0; padding: 0 0.6rem; }
	.ask { margin: 0; font: 600 var(--ic-fs-ui) / 1.3 var(--font-display); color: var(--ic-text-1); }
	.note { margin: 0; }
	.refusal { margin: 0; padding-left: 0.5rem; border-left: var(--ic-rail) solid var(--ic-warn); }
	.library { display: grid; gap: 1.25rem; min-width: 0; align-content: start; }
	.group { display: grid; gap: 0.5rem; min-width: 0; }
	.group h2 { display: flex; align-items: center; gap: 0.5rem; }
	.group h2::after { content: ''; flex: 1; height: 1px; background: var(--ic-line); }
	/* Cards are equal in height by construction; a grid with `align-items: start` is the row-of-comparable-things case,
	   and the one transient exception (an opened Manage panel) grows its own card only. */
	.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 0.75rem; align-items: start; min-width: 0; }
	.empty-state { display: grid; gap: 0.5rem; justify-items: start; padding: 2rem 0; }
	.empty-title { margin: 0; font: 600 20px / 1.2 var(--font-display); color: var(--ic-text-1); }
</style>
