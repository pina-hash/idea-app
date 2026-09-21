<!--
  ONE MODEL ON THE LAUNCH PAGE: what it IS (title, picture, counts, last edit,
  owner when not yours, role, assignment, folder, tags, Archived) and what can
  be done to it, behind one Manage disclosure.

  ARCHIVE AND MOVE TO TRASH ARE VISIBLY DIFFERENT CONTROLS WITH DIFFERENT
  SENTENCES (`wording.ts`), and a LINKED assignment document shows decision
  29's sentence IN PLACE OF the trash control: 0217 refuses the trash for it,
  and a control whose only outcome is a refusal is not offered. Every write is
  the api's; a refusal renders here, under the control that was pressed.

  AN OMITTED OPTIONAL TRANSPORT REMOVES ITS CONTROL: sharing, linking and the
  class share exist only when `api.share`, `api.link`, `api.classShare` do.
-->
<script lang="ts">
	import type { LaunchApi } from './api';
	import { folderNameOf, parseTagLine, roleWord, type LaunchDocument, type LaunchFolder } from './library';
	import { ARCHIVE_SENTENCE, LINKED_KEPT_SENTENCE, TRASH_SENTENCE, UNARCHIVE_SENTENCE, archiveConfirm, archivedSentence, countsSentence, duplicatedSentence, editedSentence, trashConfirm, trashedSentence, unarchiveConfirm, unarchivedSentence } from './wording';
	import type { IdeaCadDocumentSource } from '../../app/types';
	let { row, folders, api, sources = [], onopen, onrefresh, now, opening = false }: {
		row: LaunchDocument; folders: LaunchFolder[]; api: LaunchApi; sources?: IdeaCadDocumentSource[];
		onopen: (id: string) => void; onrefresh: (notice?: string) => Promise<void>; now: () => Date; opening?: boolean;
	} = $props();
	let expanded = $state(false), armed = $state<'' | 'trash' | 'archive' | 'unarchive'>(''), refusal = $state(''), busy = $state(false);
	let renaming = $state(false), titleDraft = $state(''), tagsDraft = $state(''), tagsEditing = $state(false);
	let shareEmail = $state(''), shareRole = $state<'viewer' | 'editor' | 'none'>('viewer'), assignment = $state('');
	let sections: { id: string; label: string }[] = $state([]), sectionId = $state('');
	const folderName = $derived(folderNameOf(row, folders));
	const role = $derived(roleWord(row));
	const focus = (el: HTMLElement) => { el.focus(); };
	async function run(action: () => Promise<unknown>, notice?: string) {
		busy = true; refusal = '';
		try { await action(); armed = ''; renaming = false; tagsEditing = false; await onrefresh(notice); }
		catch (err) { refusal = err instanceof Error ? err.message : String(err); }
		finally { busy = false; }
	}
	async function toggle() {
		expanded = !expanded; refusal = ''; armed = '';
		if (expanded && api.sections && api.classShare && row.canArchive && row.itemId && row.archivedAt) {
			try { sections = await api.sections(row.itemId); } catch (err) { refusal = err instanceof Error ? err.message : String(err); }
		}
	}
	function startRename() { titleDraft = row.title; renaming = true; refusal = ''; }
	function startTags() { tagsDraft = row.tags.join(', '); tagsEditing = true; refusal = ''; }
</script>

<article class="card" class:archived={row.archivedAt !== null} data-testid="model-card" data-id={row.id} aria-labelledby={`title-${row.id}`}>
	<div class="picture" aria-hidden="true">
		{#if row.thumbnail}<img src={row.thumbnail} alt="" />{:else}
			<svg viewBox="0 0 64 48" class="thumb"><polyline points="12,18 32,8 52,18 52,36 32,46 12,36 12,18" fill="none" stroke-width="1.5" /><polyline points="12,18 32,28 52,18" fill="none" stroke-width="1.5" /><polyline points="32,28 32,46" fill="none" stroke-width="1.5" /></svg>
			<span class="eyebrow">No preview yet</span>
		{/if}
	</div>
	<div class="ident">
		{#if renaming}
			<form class="rename" onsubmit={(e) => { e.preventDefault(); void run(() => api.rename(row.id, titleDraft)); }}>
				<label>Model title<input use:focus bind:value={titleDraft} maxlength="120" /></label>
				<div class="pair"><button class="accept" disabled={busy}>Save name</button><button type="button" class="cancel" onclick={() => (renaming = false)}>Cancel</button></div>
			</form>
		{:else}
			<h3 id={`title-${row.id}`}><button class="title" onclick={() => onopen(row.id)} aria-disabled={opening ? 'true' : undefined}>{row.title}</button></h3>
		{/if}
		<p class="facts"><span class="num">{countsSentence(row.featureCount, row.bodyCount)}</span><span class="sep" aria-hidden="true">·</span><span>{editedSentence(row.updatedAt, now())}</span></p>
		{#if !row.isOwn}<p class="owner">by {row.ownerEmail}</p>{/if}
		<ul class="chips" aria-label="Status">
			{#if row.archivedAt !== null}<li class="chip">Archived</li>{/if}
			{#if role}<li class="chip mine">{role}</li>{/if}
			{#if row.itemId}<li class="chip pass">Assignment</li>{/if}
			{#if folderName}<li class="chip folder">Folder: {folderName}</li>{/if}
			{#each row.tags as tag (tag)}<li class="chip tag">#{tag}</li>{/each}
		</ul>
	</div>
	<div class="row-actions">
		<button class="open" onclick={() => onopen(row.id)} aria-disabled={opening ? 'true' : undefined}>{opening ? 'Opening' : 'Open'}</button>
		<button data-testid="manage" aria-expanded={expanded} aria-controls={`manage-${row.id}`} onclick={() => void toggle()}>{expanded ? 'Close' : 'Manage'}</button>
	</div>
	{#if expanded}
		<div class="manage" id={`manage-${row.id}`}>
			<div class="tools">
				{#if row.canWrite}<button onclick={startRename}>Rename</button>{/if}
				<button data-testid="duplicate" disabled={busy} onclick={() => void run(() => api.duplicate(row.id), duplicatedSentence(`Copy of ${row.title}`))}>{row.isOwn ? 'Duplicate' : 'Copy to my library'}</button>
				{#if row.isOwn}<button onclick={startTags}>{row.tags.length ? 'Edit tags' : 'Add tags'}</button>{/if}
			</div>
			{#if row.isOwn}
				<label class="field">Folder
					<select aria-label="Folder" value={row.folderId ?? ''} disabled={busy} onchange={(e) => void run(() => api.move(row.id, (e.currentTarget as HTMLSelectElement).value || null))}>
						<option value="">No folder</option>
						{#each folders as folder (folder.id)}<option value={folder.id}>{folder.name}</option>{/each}
					</select>
				</label>
				{#if tagsEditing}
					<form class="tags-form" onsubmit={(e) => { e.preventDefault(); void run(() => api.tag(row.id, parseTagLine(tagsDraft))); }}>
						<label>Tags, separated by commas<input use:focus bind:value={tagsDraft} placeholder="gear, bracket, v2" /></label>
						<div class="pair"><button class="accept" disabled={busy}>Save tags</button><button type="button" class="cancel" onclick={() => (tagsEditing = false)}>Cancel</button></div>
					</form>
				{/if}
				{#if api.share}
					<form class="share" onsubmit={(e) => { e.preventDefault(); void run(() => api.share!(row.id, shareEmail, shareRole)); }}>
						<label>Share with<input type="email" required placeholder="Email address" bind:value={shareEmail} /></label>
						<label>Permission<select bind:value={shareRole}><option value="viewer">Can view</option><option value="editor">Can edit</option><option value="none">Remove access</option></select></label>
						<button disabled={busy}>Update sharing</button>
					</form>
				{/if}
				{#if api.link && !row.itemId && sources.length}
					<form class="link" onsubmit={(e) => { e.preventDefault(); void run(() => api.link!(row.id, assignment)); }}>
						<label>Link to assignment<select required bind:value={assignment}><option value="">Choose assignment</option>{#each sources as source (source.itemId)}<option value={source.itemId}>{source.title}</option>{/each}</select></label>
						<button disabled={busy || !assignment}>Link model</button>
					</form>
				{/if}
			{/if}
			{#if row.canArchive}
				<div class="keep" data-testid="archive-block">
					{#if armed === 'archive'}
						<p class="ask">{archiveConfirm(row.title)}</p><p class="note">{ARCHIVE_SENTENCE}</p>
						<div class="pair"><button class="accept" data-testid="archive-confirm" disabled={busy} onclick={() => void run(() => api.archive(row.id, true), archivedSentence(row.title))}>Confirm archive</button><button class="cancel" onclick={() => (armed = '')}>Cancel</button></div>
					{:else if armed === 'unarchive'}
						<p class="ask">{unarchiveConfirm(row.title)}</p><p class="note">{UNARCHIVE_SENTENCE}</p>
						<div class="pair"><button class="accept" data-testid="unarchive-confirm" disabled={busy} onclick={() => void run(() => api.archive(row.id, false), unarchivedSentence(row.title))}>Confirm restore</button><button class="cancel" onclick={() => (armed = '')}>Cancel</button></div>
					{:else if row.archivedAt !== null}
						<button data-testid="unarchive" onclick={() => (armed = 'unarchive')}>Restore from archive</button><p class="note">{UNARCHIVE_SENTENCE}</p>
					{:else}
						<button data-testid="archive" onclick={() => (armed = 'archive')}>Archive</button><p class="note">{ARCHIVE_SENTENCE}</p>
					{/if}
				</div>
				{#if api.classShare && row.archivedAt !== null && row.itemId && sections.length}
					<form class="class-share" onsubmit={(e) => { e.preventDefault(); void run(() => api.classShare!(row.id, sectionId)); }}>
						<label>Share reference with class<select required bind:value={sectionId}><option value="">Choose class</option>{#each sections as section (section.id)}<option value={section.id}>{section.label}</option>{/each}</select></label>
						<p class="note">Shares the model and the creator's name with this class, view only.</p>
						<div class="pair"><button disabled={busy || !sectionId}>Share view only</button><button type="button" disabled={busy || !sectionId} onclick={() => void run(() => api.classShare!(row.id, sectionId, true))}>Remove class access</button></div>
					</form>
				{/if}
			{/if}
			{#if row.itemId}
				<p class="kept" data-testid="linked-kept"><span class="chip pass">Kept</span> {LINKED_KEPT_SENTENCE}</p>
			{:else if row.canTrash}
				<div class="remove" data-testid="trash-block">
					{#if armed === 'trash'}
						<p class="ask">{trashConfirm(row.title)}</p><p class="note">{TRASH_SENTENCE}</p>
						<div class="pair"><button class="danger" data-testid="trash-confirm" disabled={busy} onclick={() => void run(async () => { const receipt = await api.trash(row.id); await onrefresh(trashedSentence(receipt.title, receipt.purgeAt)); })}>Confirm: move to trash</button><button class="cancel" onclick={() => (armed = '')}>Cancel</button></div>
					{:else}
						<button class="danger" data-testid="trash" onclick={() => (armed = 'trash')}>Move to trash</button><p class="note">{TRASH_SENTENCE}</p>
					{/if}
				</div>
			{/if}
			{#if refusal}<p class="refusal" role="alert">{refusal}</p>{/if}
		</div>
	{/if}
</article>

<style>
	.card { display: grid; grid-template-columns: 96px minmax(0, 1fr); grid-template-areas: 'picture ident' 'actions actions' 'manage manage'; gap: 0.5rem 0.75rem; padding: 0.75rem; min-width: 0; background: var(--ic-panel); border: 1px solid var(--ic-edge); border-radius: var(--ic-radius); box-shadow: var(--ic-bevel); }
	.card.archived { border-style: dashed; }
	.picture { grid-area: picture; display: grid; place-items: center; align-content: center; gap: 0.25rem; aspect-ratio: 4 / 3; min-width: 0; background: var(--ic-ground); border: 1px solid var(--ic-line); border-radius: var(--ic-radius); overflow: hidden; }
	.picture img { width: 100%; height: 100%; object-fit: contain; }
	.picture .thumb { width: 56px; height: 42px; border: 0; background: transparent; }
	.picture .eyebrow { color: var(--ic-text-2); font-size: 9px; text-align: center; }
	.ident { grid-area: ident; display: grid; gap: 0.3rem; min-width: 0; align-content: start; }
	h3 { font: 600 17px / 1.2 var(--font-display); min-width: 0; }
	.title { display: block; width: 100%; min-width: 0; padding: 0.35rem 0; background: transparent; border: 0; box-shadow: none; color: var(--ic-text-1); font: inherit; text-align: left; white-space: normal; overflow-wrap: anywhere; cursor: pointer; }
	.title:hover { color: var(--ic-accent); background: transparent; }
	.facts { margin: 0; display: flex; flex-wrap: wrap; gap: 0.35rem; font: var(--ic-fs-label) / 1.3 var(--font-mono); color: var(--ic-text-2); }
	.facts .num { color: var(--ic-text-1); }
	.sep { color: var(--ic-edge); }
	.owner { margin: 0; font: var(--ic-fs-prose) / 1.3 var(--font-display); color: var(--ic-meta); overflow-wrap: anywhere; }
	.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.3rem; }
	.chip.folder { color: var(--ic-text-2); text-transform: none; letter-spacing: 0.02em; }
	.chip.tag { color: var(--ic-text-2); text-transform: none; letter-spacing: 0.02em; border-color: var(--ic-line); }
	.row-actions { grid-area: actions; display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.row-actions .open { flex: 1 1 auto; }
	.row-actions button[aria-expanded='true'] { border-color: var(--ic-accent); }
	.manage { grid-area: manage; display: grid; gap: 0.6rem; padding-top: 0.6rem; border-top: 1px solid var(--ic-line); min-width: 0; }
	.tools, .pair { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	form, .field { display: grid; gap: 0.35rem; min-width: 0; }
	label { display: grid; gap: 0.25rem; font: var(--ic-fs-label) / 1.3 var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--ic-text-2); min-width: 0; }
	input, select { width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; padding: 0 0.5rem; text-transform: none; letter-spacing: 0; }
	.keep, .remove { display: grid; gap: 0.35rem; padding: 0.5rem; border: 1px solid var(--ic-line); border-radius: var(--ic-radius); }
	.remove { border-color: color-mix(in srgb, var(--ic-fail) 45%, transparent); }
	.ask { margin: 0; font: 600 var(--ic-fs-ui) / 1.3 var(--font-display); color: var(--ic-text-1); }
	.note { margin: 0; }
	.kept { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; font: var(--ic-fs-prose) / 1.45 var(--font-display); color: var(--ic-text-2); }
	.refusal { margin: 0; padding-left: 0.5rem; border-left: var(--ic-rail) solid var(--ic-warn); }
</style>
