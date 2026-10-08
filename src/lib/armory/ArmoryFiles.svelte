<script lang="ts">
	/**
	 * THE FILES VIEW: every file with its own line ("Checked out by <name> on
	 * <computer>, since <time>" or "Available"), search, and the Checked out and
	 * Mine filters (contract C7).
	 *
	 * A BIG PROJECT ARRIVES FOLDED (Mr. Pina's report of 2026-10-07). Each
	 * top-level folder is a `$lib/Disclosure` that says what is inside it ("40
	 * files, 6 checked out") and, on a project of more than 40 live files,
	 * arrives closed; the choice is remembered per person and per folder. A
	 * search or a filter lists every match flat instead, folder beside name.
	 * Folded rows stay in the DOM (Disclosure hides, never removes), so a printed
	 * page still carries them.
	 *
	 * ONE LINE A FILE ABOVE 48rem OF VIEW: glyph, name (cut with an ellipsis, the
	 * whole name in `title`), the state sentence, and Force check in where it is
	 * offered. Two lines below that. Every row clears 44px.
	 */
	import { untrack } from 'svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import type { ForceCheckIn } from './force-check-in.svelte';
	import {
		checkoutCounts,
		FILE_FILTERS,
		fileState,
		filterFiles,
		folderTree,
		holderName,
		STATE_WORDS,
		stateDetail,
		VERBS,
		type ArmoryFile,
		type FileFilter,
		type FolderNode
	} from './view';

	/** A project with more live files than this arrives with its folders closed. */
	const FOLD_OVER = 40;

	let {
		projectId,
		projectName,
		files,
		sideCounts = {},
		seen,
		names,
		now,
		me,
		force = null,
		initialFilter = 'all',
		initialQuery = ''
	}: {
		projectId: string;
		projectName: string;
		files: ArmoryFile[];
		sideCounts?: Record<string, number>;
		seen: ReadonlyMap<string, number>;
		names: ReadonlyMap<string, string | null>;
		now: number;
		me: string;
		/** Absent: no Force check in on any row (a student, or no way to send it). */
		force?: ForceCheckIn | null;
		initialFilter?: FileFilter;
		initialQuery?: string;
	} = $props();

	let query = $state(untrack(() => initialQuery));
	let filter = $state<FileFilter>(untrack(() => initialFilter));

	const live = $derived(files.filter((f) => !f.deleted));
	const counts = $derived(checkoutCounts(live, me));
	const visible = $derived(filterFiles(live, filter, query, me));
	const flat = $derived(filter !== 'all' || query.trim() !== '');
	const tree = $derived(folderTree(visible));
	const removedCount = $derived(files.length - live.length);
	const folded = $derived(live.length > FOLD_OVER);

	function subtree(node: FolderNode): ArmoryFile[] {
		return [...node.files, ...node.folders.flatMap(subtree)];
	}
	function isOut(f: ArmoryFile): boolean {
		return !!f.lock && !f.lock.broken_at;
	}
</script>

{#snippet forceKey(file: ArmoryFile)}
	{#if force && file.lock && !file.lock.broken_at && file.lock.holder_email !== me}
		<button
			class={`btn ar-btn ar-row-key ${force.armed === file.id ? 'danger' : 'secondary'}`}
			type="button"
			aria-disabled={force.busy}
			data-testid="armory-take-back"
			onclick={() => force.press(file.id, file.name)}
		>
			{force.armed === file.id ? `${VERBS.takeBack} from ${holderName(file.lock.holder_email, names)}?` : VERBS.takeBack}
		</button>
	{/if}
{/snippet}

{#snippet forceWarning(file: ArmoryFile)}
	{#if force && force.armed === file.id && file.lock}
		<p class="ar-message bad ar-warn" role="alert" data-testid="armory-take-back-warning">
			Press again to force a check in. Anything {holderName(file.lock.holder_email, names)} has not saved on
			{file.lock.holder_device_name ?? 'their computer'} is kept as a side version when that computer next connects,
			and the file becomes available to everyone.
		</p>
	{/if}
{/snippet}

{#snippet fileRow(file: ArmoryFile, showFolder: boolean)}
	{@const state = fileState(file, now, seen)}
	{@const words = STATE_WORDS[state]}
	{@const detail = stateDetail(file, state, now, names)}
	<li class="ar-frow" data-testid="armory-file-row">
		<a
			class="ar-file"
			href={`/armory/${projectId}/file/${file.id}`}
			data-testid="armory-file"
			data-state={state}
			title={`${file.folder ? `${file.folder}/` : ''}${file.name}`}
		>
			<span class={`ar-file-glyph ar-tone-${words.tone}`} aria-hidden="true">{words.glyph}</span>
			<span class="ar-file-name">
				<span class="ar-file-name-text">{file.name}</span>
				{#if sideCounts[file.id]}
					<span class="ar-chip" data-testid="armory-side-chip">{sideCounts[file.id]} side {sideCounts[file.id] === 1 ? 'version' : 'versions'}</span>
				{/if}
			</span>
			<span class="ar-file-line" data-testid="armory-file-line">
				{#if showFolder && file.folder}<span class="ar-folder-inline">{file.folder}/</span>{/if}
				<span class={`ar-state ar-tone-${words.tone}`}>{words.label}</span>{detail}
			</span>
		</a>
		{@render forceKey(file)}
		{@render forceWarning(file)}
	</li>
{/snippet}

{#snippet nested(node: FolderNode)}
	{#each node.folders as child (child.path)}
		<li class="ar-subfolder">
			<div class="ar-folder-name"><span aria-hidden="true">▸</span>{child.name}</div>
			<ul class="ar-sublist">{@render nested(child)}</ul>
		</li>
	{/each}
	{#each node.files as file (file.id)}
		{@render fileRow(file, false)}
	{/each}
{/snippet}

<section class="ar-view-panel" aria-labelledby="ar-files-h" data-testid="armory-files">
	<h2 class="ar-visually-hidden" id="ar-files-h">Files</h2>
	{#if files.length === 0}
		<p class="ar-lead" data-testid="armory-empty">
			No files yet. Save a part into <code>C:\IDEA\Armory\{projectName}</code> on a connected computer and it
			appears here.
		</p>
	{:else}
		<div class="ar-toolbar">
			<label class="ar-field ar-search">
				<span>Search this project</span>
				<input class="plate-well" type="search" bind:value={query} placeholder="Part name or folder" data-testid="armory-search" />
			</label>
			<div class="ar-filters" role="group" aria-label="Show">
				{#each FILE_FILTERS as f (f.id)}
					<button
						class="btn secondary ar-btn ar-filter"
						type="button"
						aria-pressed={filter === f.id}
						data-testid={`armory-filter-${f.id}`}
						onclick={() => (filter = f.id)}
					>
						{f.label} ({f.id === 'all' ? counts.all : f.id === 'checked-out' ? counts.checkedOut : counts.mine})
					</button>
				{/each}
			</div>
		</div>
		<p class="ar-message ar-count" role="status">
			{#if flat}
				{visible.length} {visible.length === 1 ? 'file' : 'files'} shown.
			{:else}
				{counts.all} {counts.all === 1 ? 'file' : 'files'}{counts.checkedOut > 0 ? `, ${counts.checkedOut} checked out` : ''}{removedCount > 0
					? `. ${removedCount} removed (history kept)`
					: ''}.{folded ? ' Open a folder to see its files.' : ''}
			{/if}
		</p>
		{#if force?.message}<p class={`ar-message ${force.bad ? 'bad' : ''}`} role="status">{force.message}</p>{/if}
		{#if visible.length === 0}
			<p class="ar-message" data-testid="armory-no-match">
				{filter === 'mine' ? 'You have nothing checked out.' : filter === 'checked-out' ? 'Nothing is checked out.' : 'No file matches that.'}
			</p>
		{:else if flat}
			<ul class="ar-well ar-files" data-testid="armory-flat">
				{#each visible as file (file.id)}{@render fileRow(file, true)}{/each}
			</ul>
		{:else}
			<div class="ar-tree" data-testid="armory-tree">
				{#if tree.files.length > 0}
					<ul class="ar-well ar-files" data-testid="armory-root-files">
						{#each tree.files as file (file.id)}{@render fileRow(file, false)}{/each}
					</ul>
				{/if}
				{#each tree.folders as node (node.path)}
					{@const inside = subtree(node)}
					{@const out = inside.filter(isOut).length}
					<div class="ar-folder" data-testid="armory-folder" data-folder={node.path}>
						<Disclosure
							label={node.name}
							scope={`armory:${projectId}:folder:${node.path}`}
							collapseWhen={folded}
							testId="armory-folder-toggle"
						>
							{#snippet meta()}
								<span class="ar-folder-meta">
									{inside.length} {inside.length === 1 ? 'file' : 'files'}{out > 0 ? ` · ${out} checked out` : ''}
								</span>
							{/snippet}
							<ul class="ar-well ar-files">{@render nested(node)}</ul>
						</Disclosure>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</section>
