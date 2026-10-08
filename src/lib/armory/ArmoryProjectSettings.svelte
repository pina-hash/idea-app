<script lang="ts">
	/**
	 * THE PROJECT VIEW: rename, archive or restore, the storage it uses, and,
	 * for a site admin on an ARCHIVED project, Delete forever (Armory v0.3
	 * item 3). Every omitted transport removes its control, and a control that
	 * is absent for a reason says the reason.
	 *
	 * DELETE FOREVER NAMES ITS COST, IN REAL COUNTS, BEFORE THE BOX (CLAUDE.md,
	 * "A destructive action names what it costs"). The counts are
	 * `armory_purge_preview`'s, which knows what will actually be FREED: storage
	 * is shared across projects by content, so the summary's bytes include files
	 * another project also saved, and those are kept.
	 *
	 * TYPE THE NAME TO CONFIRM, AND ONE PREDICATE DECIDES (`purgeCanSend`, the
	 * `reviewCanSend` rule): the key is `aria-disabled` until the typed name
	 * matches, never `disabled`, so it can still explain itself, and the handler
	 * asks the same predicate and sends the same NFC value the RPC compares.
	 * The operation id is minted once, so a retry replays rather than failing on
	 * a project already gone. A preview that says the purge would be refused
	 * (another project's history names a version here) holds the key too, with
	 * the reason, before anybody types.
	 *
	 * THE PREVIEW IS READ WHENEVER DELETE FOREVER BECOMES OFFERED, not once at
	 * mount: archiving from this same view re-renders it without remounting it,
	 * and a mount-only read left the cost reading "Reading what it would
	 * remove…" for good. The read is the caller's transport, so its call sits
	 * inside `untrack` (CLAUDE.md, the injected-code trap).
	 */
	import { untrack } from 'svelte';
	import {
		purgeBlockedWords,
		purgeCanSend,
		purgeConfirmValue,
		purgeCostWords,
		type ArmoryPurgePreview,
		type PurgeAnswer
	} from './team';
	import { projectErrorWords, sizeWords, type ArmoryProjectSummary } from './view';

	type Outcome = { ok: true } | { ok: false; message: string };

	let {
		project,
		storage = null,
		isAdmin = false,
		rename = null,
		setArchived = null,
		purge = null,
		purgePreview = null,
		onpurged = null
	}: {
		project: ArmoryProjectSummary;
		storage?: { bytes: number; files: number } | null;
		isAdmin?: boolean;
		rename?: ((name: string) => Promise<Outcome>) | null;
		setArchived?: ((archived: boolean) => Promise<Outcome>) | null;
		purge?: ((confirmName: string, operation: string) => Promise<PurgeAnswer>) | null;
		purgePreview?: (() => Promise<ArmoryPurgePreview | null>) | null;
		/** The project is gone: the acknowledgement belongs on the page shown next. */
		onpurged?: ((name: string, storageProblem: string | null) => void) | null;
	} = $props();

	let busy = $state(false);

	// ---- Rename and archive (mentors; archive also site admins once 0233 is in) ----
	let newName = $state('');
	let armedRename = $state(false);
	let armedArchive = $state(false);
	let projectMessage = $state('');
	let projectBad = $state(false);

	async function doRename(event: SubmitEvent) {
		event.preventDefault();
		if (!rename || busy) return;
		const n = newName.trim();
		if (!n || n === project.name) {
			projectBad = true;
			projectMessage = 'Type the new name first.';
			return;
		}
		if (!armedRename) {
			armedRename = true;
			projectMessage = '';
			return;
		}
		busy = true;
		try {
			const r = await rename(n);
			projectBad = !r.ok;
			projectMessage = r.ok ? `Renamed. The folder on every computer becomes ${n} the next time it syncs.` : projectErrorWords(r.message);
			if (r.ok) newName = '';
			armedRename = false;
		} finally {
			busy = false;
		}
	}

	async function doArchive() {
		if (!setArchived || busy) return;
		const next = !project.archived;
		if (next && !armedArchive) {
			armedArchive = true;
			return;
		}
		busy = true;
		try {
			const r = await setArchived(next);
			projectBad = !r.ok;
			projectMessage = r.ok
				? next
					? 'Archived. Computers stop syncing it; nothing was deleted.'
					: 'Restored. Computers sync it again.'
				: projectErrorWords(r.message);
			armedArchive = false;
		} finally {
			busy = false;
		}
	}

	// ---- Delete forever (site admins, archived projects) ----
	const offered = $derived(!!purge && isAdmin && !!project.archived);
	let typed = $state('');
	let operation: string | null = null;
	let purgeMessage = $state('');
	let preview = $state<ArmoryPurgePreview | null>(null);
	let previewFailed = $state(false);
	const blocked = $derived(purgeBlockedWords(preview));
	const ready = $derived(purgeCanSend(typed, project.name, preview));

	$effect(() => {
		if (!offered) return;
		let stale = false;
		preview = null;
		previewFailed = false;
		const asked = untrack(() => purgePreview?.() ?? null);
		if (!asked) return;
		asked.then(
			(p) => {
				if (stale) return;
				preview = p;
				previewFailed = p === null;
			},
			() => {
				if (!stale) previewFailed = true;
			}
		);
		return () => {
			stale = true;
		};
	});

	async function doPurge() {
		if (!purge || busy) return;
		if (!purgeCanSend(typed, project.name, preview)) {
			purgeMessage = blocked ?? 'Type the project name exactly as it is shown, then press again.';
			return;
		}
		operation ??= crypto.randomUUID();
		busy = true;
		purgeMessage = '';
		try {
			const r = await purge(purgeConfirmValue(typed), operation);
			if (r.ok) onpurged?.(project.name, r.storageProblem);
			else purgeMessage = r.message;
		} finally {
			busy = false;
		}
	}
</script>

<section class="ar-view-panel" aria-labelledby="ar-project-h" data-testid="armory-project-settings">
	<h2 class="ar-visually-hidden" id="ar-project-h">Project</h2>
	<div class="ar-settings">
		<div class="ar-panel ar-setting" data-testid="armory-storage">
			<h3 class="section-label">Storage used</h3>
			{#if storage}
				<p class="ar-big">{sizeWords(storage.bytes)}</p>
				<p class="ar-message">
					{storage.files} stored {storage.files === 1 ? 'file' : 'files'}, counting every version and side version. Two versions with
					the same contents are stored once, across every project.
				</p>
			{:else}
				<p class="ar-message">Not known right now.</p>
			{/if}
		</div>

		{#if rename}
			<div class="ar-panel ar-setting">
				<h3 class="section-label">Name</h3>
				<form class="ar-form" onsubmit={doRename} data-testid="armory-rename">
					<label class="ar-field">
						<span>New name</span>
						<input class="plate-well" bind:value={newName} maxlength="100" autocomplete="off" placeholder={project.name} oninput={() => (armedRename = false)} />
					</label>
					<button class={`btn ar-btn ${armedRename ? 'danger' : 'secondary'}`} type="submit" aria-disabled={busy}>
						{armedRename ? `Rename to ${newName.trim()}?` : 'Rename'}
					</button>
				</form>
				{#if armedRename}
					<p class="ar-message bad" role="alert">Press again to rename it. The folder on every computer is renamed too.</p>
				{/if}
			</div>
		{/if}

		{#if setArchived}
			<div class="ar-panel ar-setting">
				<h3 class="section-label">{project.archived ? 'Archived' : 'Archive'}</h3>
				<div class="ar-row-actions">
					<button class={`btn ar-btn ${armedArchive ? 'danger' : 'secondary'}`} type="button" aria-disabled={busy} data-testid="armory-archive" onclick={doArchive}>
						{project.archived ? 'Restore project' : armedArchive ? `Archive ${project.name}?` : 'Archive project'}
					</button>
				</div>
				{#if armedArchive}
					<p class="ar-message bad" role="alert">Press again to archive it. Computers stop syncing it. Nothing is deleted, and it can be restored here.</p>
				{:else}
					<p class="ar-message">
						{project.archived
							? 'Computers do not sync it. Restoring it puts it back on every member’s computer.'
							: 'Archiving stops computers syncing it and keeps everything. It can be restored.'}
					</p>
				{/if}
			</div>
		{/if}

		{#if isAdmin && purge}
			<div class="ar-panel ar-setting ar-danger-zone" data-testid="armory-purge">
				<h3 class="section-label">Delete forever</h3>
				{#if !project.archived}
					<p class="ar-message" data-testid="armory-purge-not-archived">
						Delete forever is offered once the project is archived.{setArchived ? '' : ' A mentor archives it first.'}
					</p>
				{:else}
					<p class="ar-message ar-purge-cost" data-testid="armory-purge-cost">
						{#if preview}
							{purgeCostWords(preview, sizeWords)}
						{:else if previewFailed}
							Deletes the project's {project.files ?? 'every'} files{typeof project.removed === 'number' && project.removed > 0 ? ` (${project.removed} already removed)` : ''}, every version and side version, its member list and its activity. What it frees in storage could not be read right now. This cannot be undone.
						{:else}
							Reading what it would remove…
						{/if}
					</p>
					<label class="ar-field ar-purge-field">
						<span>Type the project name to confirm: {project.name}</span>
						<input class="plate-well" bind:value={typed} autocomplete="off" spellcheck="false" data-testid="armory-purge-name" />
					</label>
					<div class="ar-row-actions">
						<button
							class="btn danger ar-btn"
							type="button"
							aria-disabled={!ready || busy}
							data-testid="armory-purge-key"
							onclick={doPurge}
						>
							{busy ? 'Deleting…' : `Delete ${project.name} forever`}
						</button>
					</div>
					{#if blocked}
						<p class="ar-message bad" data-testid="armory-purge-blocked">{blocked}</p>
					{:else if !ready}
						<p class="ar-message">The key works once the name is typed exactly.</p>
					{/if}
					{#if purgeMessage}<p class="ar-message bad" role="alert" data-testid="armory-purge-message">{purgeMessage}</p>{/if}
				{/if}
			</div>
		{/if}
	</div>
	{#if projectMessage}<p class={`ar-message ${projectBad ? 'bad' : ''}`} role="status">{projectMessage}</p>{/if}
</section>
