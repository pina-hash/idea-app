<script lang="ts">
	import {
		FOLDER_COLORS,
		FOLDER_COLOR_LABELS,
		FOLDER_NAME_MAX,
		foldersInOrder,
		type FolderColor,
		type FolderResult,
		type NotebookFolder
	} from '$lib/notebook-folders';

	/**
	 * Create, rename, recolour and delete folders.
	 *
	 * PRESENTATION PLUS CALLBACKS (the FolderRail / ReviewConsole convention):
	 * every write is an injected transport, so the real page points them at
	 * 0088's RPCs while the dev harness answers in memory. Nothing here decides
	 * whether a write is allowed -- notebook_upsert_folder and
	 * notebook_delete_folder resolve the caller from auth.uid() and are the
	 * only door in.
	 *
	 * A DUPLICATE NAME IS SHOWN NEXT TO THE FIELD, not in an error banner. It
	 * is the one failure ordinary use reaches, which is why 0088 returns it as
	 * a structured refusal rather than raising: the student typed a name they
	 * already have, and the answer belongs where they typed it.
	 *
	 * DELETE SAYS WHAT IT COSTS AND WHAT IT DOES NOT. Two-step confirm (the
	 * gauntlet-room-delete / SectionManager convention), and the confirm names
	 * the number of entries about to be unfiled -- because "delete folder" next
	 * to a count of your own work reads like it might take the work with it,
	 * and it does not. The entries move to Unfiled; 0088 does the unfiling in
	 * the same transaction as the delete.
	 */

	let {
		folders,
		counts,
		busy = false,
		onSave,
		onDelete,
		onClose
	}: {
		folders: NotebookFolder[];
		/** Entry count per folder id, for the delete warning. */
		counts: Map<string, number>;
		busy?: boolean;
		onSave: (input: {
			id: string | null;
			name: string;
			color: FolderColor | null;
		}) => Promise<FolderResult>;
		onDelete: (id: string) => Promise<FolderResult>;
		onClose: () => void;
	} = $props();

	const ordered = $derived(foldersInOrder(folders));

	/** null id = the create row; a set id = editing that folder in place. */
	let editing = $state<string | null>(null);
	let draftName = $state('');
	let draftColor = $state<FolderColor | null>(null);
	let fieldError = $state<string | null>(null);
	let confirming = $state<string | null>(null);
	let notice = $state<string | null>(null);

	function startCreate() {
		editing = null;
		draftName = '';
		draftColor = null;
		fieldError = null;
		confirming = null;
	}

	function startEdit(folder: NotebookFolder) {
		editing = folder.id;
		draftName = folder.name;
		draftColor = folder.color;
		fieldError = null;
		confirming = null;
	}

	async function save() {
		const name = draftName.trim();
		if (!name || busy) return;
		fieldError = null;
		notice = null;
		const result = await onSave({ id: editing, name, color: draftColor });
		if (!result.ok) {
			fieldError = result.error;
			return;
		}
		notice = editing ? 'Folder updated.' : `Created “${name}”.`;
		startCreate();
	}

	async function remove(folder: NotebookFolder) {
		if (busy) return;
		if (confirming !== folder.id) {
			confirming = folder.id;
			return;
		}
		fieldError = null;
		notice = null;
		// Read the count BEFORE the delete: afterwards the folder is gone from
		// `counts` and this reads 0, which would silently drop the "and your
		// entries are safe" half of the message at the one moment it matters.
		const moved = counts.get(folder.id) ?? 0;
		const result = await onDelete(folder.id);
		confirming = null;
		if (!result.ok) {
			fieldError = result.error;
			return;
		}
		if (editing === folder.id) startCreate();
		notice = moved
			? `Deleted “${folder.name}”. ${moved === 1 ? 'Its entry is' : `Its ${moved} entries are`} now unfiled.`
			: `Deleted “${folder.name}”.`;
	}
</script>

<div class="manager" data-testid="folder-manager">
	<header>
		<h3>Folders</h3>
		<button type="button" class="close" onclick={onClose} aria-label="Close folders">Done</button>
	</header>

	<p class="note">
		Folders are your own way of sorting your notebook. Your instructor can see which folder an
		entry is in, so name them the way you would label a binder.
	</p>

	{#if notice}
		<p class="feedback ok" role="status">{notice}</p>
	{/if}

	{#if ordered.length}
		<ul class="list">
			{#each ordered as folder (folder.id)}
				<li class="row" class:editing={editing === folder.id}>
					<span
						class="dot"
						style="--dot: var(--nb-folder-{folder.color ?? 'none'})"
						aria-hidden="true"
					></span>
					<span class="row-name">{folder.name}</span>
					<span class="row-count">{counts.get(folder.id) ?? 0}</span>
					<span class="row-actions">
						<button type="button" onclick={() => startEdit(folder)} disabled={busy}>Edit</button>
						<button
							type="button"
							class="danger"
							data-testid="delete-folder"
							onclick={() => remove(folder)}
							disabled={busy}
						>
							{confirming === folder.id ? 'Confirm delete' : 'Delete'}
						</button>
					</span>
					{#if confirming === folder.id}
						{@const n = counts.get(folder.id) ?? 0}
						<p class="confirm" data-testid="delete-confirm">
							{#if n}
								Deleting this folder moves {n === 1 ? 'its 1 entry' : `its ${n} entries`} to
								Unfiled. Nothing is deleted except the folder itself.
							{:else}
								This folder is empty. Delete it?
							{/if}
							<button type="button" class="link" onclick={() => (confirming = null)}>Cancel</button>
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<form
		class="editor"
		onsubmit={(e) => {
			e.preventDefault();
			void save();
		}}
	>
		<span class="editor-title">{editing ? 'Rename this folder' : 'New folder'}</span>

		<!-- Both captions were screen-reader-only. The name field at least had a
		     placeholder; the colour row was a line of bare swatches whose only
		     description was a tooltip, so what it was for was invisible to
		     anyone not hovering it -- and it is a row of colours, which is the
		     one thing a label cannot be left to. -->
		<label class="field">
			<span class="field-label">Name</span>
			<input
				type="text"
				bind:value={draftName}
				maxlength={FOLDER_NAME_MAX}
				placeholder="e.g. Gearbox build"
				disabled={busy}
				data-testid="folder-name"
			/>
		</label>

		<fieldset class="colors">
			<legend class="field-label">Colour <span class="optional">(optional)</span></legend>
			<button
				type="button"
				class="swatch none"
				class:selected={draftColor === null}
				aria-pressed={draftColor === null}
				title="No colour"
				onclick={() => (draftColor = null)}
			>
				<span class="sr-only">No colour</span>
			</button>
			{#each FOLDER_COLORS as color (color)}
				<button
					type="button"
					class="swatch"
					class:selected={draftColor === color}
					aria-pressed={draftColor === color}
					style="--dot: var(--nb-folder-{color})"
					title={FOLDER_COLOR_LABELS[color]}
					onclick={() => (draftColor = color)}
				>
					<span class="sr-only">{FOLDER_COLOR_LABELS[color]}</span>
				</button>
			{/each}
		</fieldset>

		{#if fieldError}
			<p class="feedback error" role="alert" data-testid="folder-error">{fieldError}</p>
		{/if}

		<div class="editor-actions">
			<button class="btn" type="submit" disabled={busy || !draftName.trim()}>
				{editing ? 'Save changes' : 'Create folder'}
			</button>
			{#if editing}
				<button type="button" class="link" onclick={startCreate} disabled={busy}>Cancel</button>
			{/if}
		</div>
	</form>
</div>

<style>
	.manager {
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-card);
		background: var(--surface-1);
		padding: var(--space-4) var(--space-4) var(--space-4);
		margin-bottom: var(--space-4);
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-4);
	}
	h3 {
		margin: 0 0 var(--space-1);
		font-size: 1.02rem;
	}
	.close {
		border: none;
		background: none;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--nb-accent-ink);
		cursor: pointer;
		padding: 0;
	}
	.note {
		margin: 0 0 var(--space-4);
		font-size: 0.83rem;
		color: var(--text-3);
	}
	.feedback {
		font-size: 0.82rem;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-control);
		margin: 0 0 var(--space-3);
	}
	.feedback.error {
		color: var(--nb-error);
		border: 1px solid color-mix(in srgb, var(--nb-error) 40%, transparent);
		background: color-mix(in srgb, var(--nb-error) 5%, transparent);
	}
	.feedback.ok {
		color: var(--nb-ok);
		border: 1px solid color-mix(in srgb, var(--nb-ok) 35%, transparent);
		background: color-mix(in srgb, var(--nb-ok) 5%, transparent);
	}

	.list {
		list-style: none;
		margin: 0 0 var(--space-4);
		padding: 0;
		display: grid;
		gap: var(--space-1);
	}
	.row {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-1);
		border-bottom: 1px solid var(--hairline);
		font-size: 0.9rem;
	}
	.row.editing {
		background: var(--nb-accent-wash);
	}
	.dot {
		width: 0.6em;
		height: 0.6em;
		border-radius: 50%;
		background: var(--dot, var(--nb-folder-none));
	}
	.row-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-count {
		font-variant-numeric: tabular-nums;
		font-size: 0.76rem;
		color: var(--text-3);
	}
	.row-actions {
		display: flex;
		gap: var(--space-2);
	}
	.row-actions button {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 0.76rem;
		font-weight: 600;
		color: var(--text-2);
		cursor: pointer;
	}
	.row-actions button:hover:not(:disabled) {
		color: var(--text-1);
	}
	.row-actions .danger {
		color: var(--nb-error);
	}
	.row-actions button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.confirm {
		grid-column: 1 / -1;
		margin: var(--space-1) 0 var(--space-1);
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		margin-left: var(--space-2);
		font: inherit;
		font-size: inherit;
		color: var(--nb-accent-ink);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	.editor {
		border-top: 1px solid var(--hairline);
		padding-top: var(--space-4);
	}
	.editor-title {
		display: block;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-3);
		margin-bottom: var(--space-2);
	}
	/* The shared .field class is a ROW flex; this one is a single input. */
	.editor .field {
		display: block;
		margin: 0 0 var(--space-2);
	}
	.editor input {
		width: 100%;
	}
	.colors {
		border: none;
		padding: 0;
		margin: 0 0 var(--space-3);
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.field-label {
		display: block;
		padding: 0;
		margin-bottom: var(--space-1);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	legend.field-label {
		/* A legend is not a flex item, so it needs to claim the whole first
		   line itself rather than sitting in the swatch run. */
		float: left;
		width: 100%;
		margin-bottom: var(--space-1);
	}
	.optional {
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
	}
	.swatch {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		border: 1px solid var(--nb-hairline-strong);
		background: var(--dot, transparent);
		cursor: pointer;
		padding: 0;
	}
	.swatch.none {
		background: repeating-linear-gradient(
			45deg,
			var(--surface-2) 0 4px,
			var(--hairline) 4px 8px
		);
	}
	.swatch.selected {
		box-shadow:
			0 0 0 2px var(--surface-1),
			0 0 0 4px var(--nb-accent);
	}
	.editor-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
