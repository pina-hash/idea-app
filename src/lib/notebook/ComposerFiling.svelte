<script lang="ts">
	import Disclosure from '$lib/Disclosure.svelte';
	import CheckInState from '$lib/notebook/CheckInState.svelte';
	import { sessionHasDraft, sessionMeta, type NotebookEntry, type NotebookSession } from '$lib/notebook';
	import { checkInClassLabel, type LogCheckInState } from '$lib/notebook/log';
	import type { NotebookFolder } from '$lib/notebook-folders';

	/**
	 * "FILED TO ..., CHANGE" (ledger 0298, R32): where the composer's next save
	 * goes, in one line under the box, and every filing choice behind it.
	 *
	 * THE COMPOSER FILES ITSELF. It starts on the check-in nearest today that the
	 * student has not turned anything in for (the auto-pick NotebookView has
	 * always run), on the class the notebook is scoped to or the student came
	 * from, and on the folder they filed in last. Nothing here has to be touched
	 * to save an entry; it is only where a student goes to put one somewhere
	 * else. So it is closed on arrival and remembers nothing, and the line says
	 * where the save goes while it is shut.
	 *
	 * PRESENTATION ONLY. The choices are NotebookView's own state, bound in and
	 * written back through `onChoose` / the bindings, so the save sequencing
	 * that reads them is unchanged and in one place.
	 */
	let {
		where,
		state = null,
		open,
		entries,
		draftsReady = true,
		selectedSession,
		selectedSectionId,
		onChoose,
		classes = [],
		scopeSectionId = null,
		title = $bindable(''),
		freeSectionChoice = $bindable(null),
		folderChoice = $bindable(null),
		foldersReady = true,
		folders = [],
		onFolderChange,
		onManageFolders,
		busy = false,
		locked = false
	}: {
		/** Where the next save goes, in words (`filedToWords`). */
		where: string;
		/** Where the student stands on the picked check-in; null for a free entry. */
		state?: LogCheckInState | null;
		/** The check-ins still outstanding, one per posting. */
		open: NotebookSession[];
		entries: NotebookEntry[];
		draftsReady?: boolean;
		/** The check-in the entry is filed to -- the picks before a draft
		 *  exists, the draft's own filing after -- and its class. */
		selectedSession: string | null;
		selectedSectionId: string | null;
		onChoose: (id: string | null, sectionId?: string | null) => void;
		classes?: { id: string; label: string }[];
		scopeSectionId?: string | null;
		title?: string;
		freeSectionChoice?: string | null;
		folderChoice?: string | null;
		foldersReady?: boolean;
		folders?: NotebookFolder[];
		onFolderChange?: () => void;
		onManageFolders?: () => void;
		busy?: boolean;
		/**
		 * THE COMPOSER ALREADY MADE A DRAFT, SO WHERE IT IS FILED IS SETTLED
		 * (ledger 0298 review). Every later save only adds to that draft, so a
		 * pick here would move the words on screen and nothing on the server;
		 * the check-in, class and folder are shown and cannot be changed, and
		 * the panel says so. The title stays editable: a free draft's title IS
		 * written on the next save.
		 */
		locked?: boolean;
	} = $props();

	function pickClassLabel(sectionId: string | null | undefined): string | null {
		return checkInClassLabel(sectionId, { scopeSectionId, classes });
	}
</script>

<div class="filing" data-testid="nb-filing">
	<Disclosure
		label="Filed to"
		collapseWhen={true}
		testId="nb-filing-toggle"
		showWord="Change"
		hideWord="Done"
	>
		{#snippet meta()}<span class="where" data-testid="nb-filed-to">{where}</span
			>{#if state}{' '}<CheckInState value={state} testId="nb-filed-state" />{/if}{/snippet}
		<div class="filing-panel">
			{#if locked}
				<p class="locked" role="status" data-testid="nb-filing-locked">
					This draft is already filed here. New entry starts one you can file somewhere else.
				</p>
			{/if}
			{#if open.length}
				<fieldset class="picker">
					<legend>Check-in</legend>
					<div class="quick-picks">
						<!-- Keyed on the PAIR, not the check-in id. One canonical
						     check-in posted to two of this student's classes arrives
						     as two postings sharing an id (0098), and they are
						     genuinely two picks, because the entry is filed under
						     one class or the other. -->
						{#each open as s (`${s.id}:${s.section_id}`)}
							{@const picked = selectedSession === s.id && selectedSectionId === s.section_id}
							<button
								type="button"
								class="pick"
								class:selected={picked}
								aria-pressed={picked}
								disabled={busy || locked}
								onclick={() => onChoose(s.id, s.section_id)}
							>
								<span class="pick-label">{s.session_label}</span>
								<span class="pick-meta">
									{#if pickClassLabel(s.section_id)}<span data-testid="pick-class"
											>{pickClassLabel(s.section_id)}</span
										>{' · '}{/if}{sessionMeta(s)}
									{#if draftsReady && sessionHasDraft(s, entries)}
										· <span data-testid="pick-draft">Draft in progress</span>
									{/if}
								</span>
							</button>
						{/each}
						<button
							type="button"
							class="pick free"
							class:selected={selectedSession === null}
							aria-pressed={selectedSession === null}
							disabled={busy || locked}
							onclick={() => onChoose(null)}
						>
							<span class="pick-label">Something else</span>
							<span class="pick-meta">Not for a check-in</span>
						</button>
					</div>
				</fieldset>
			{/if}

			{#if selectedSession === null}
				<label class="label-field">
					<span>Title <span class="optional">(optional)</span></span>
					<input
						type="text"
						bind:value={title}
						maxlength="200"
						placeholder="e.g. Gearbox sketches"
						disabled={busy}
						data-testid="new-entry-title"
					/>
				</label>
				<!-- WHICH CLASS IT IS FOR, on the whole notebook only: a class's own
				     tab files it to that class and asks nothing. -->
				{#if !scopeSectionId && classes.length > 0}
					<label class="label-field class-field">
						<span>Class</span>
						<select
							bind:value={freeSectionChoice}
							disabled={busy || locked}
							data-testid="new-entry-class"
						>
							{#each classes as c (c.id)}
								<option value={c.id}>{c.label}</option>
							{/each}
							<option value={null}>Not for a class</option>
						</select>
					</label>
				{/if}
			{/if}

			<!-- Filing is offered on BOTH tiers: which folder an entry lives in is
			     the student's own view of their notebook, and has nothing to do
			     with whether an instructor asked for the page. -->
			{#if foldersReady}
				<div class="folder-row">
					<label class="label-field folder-field">
						<span>Folder <span class="optional">(optional)</span></span>
						<select
							bind:value={folderChoice}
							disabled={busy || locked}
							data-testid="new-entry-folder"
							onchange={() => onFolderChange?.()}
						>
							<option value={null}>Unfiled</option>
							{#each folders as f (f.id)}
								<option value={f.id}>{f.name}</option>
							{/each}
						</select>
					</label>
					{#if onManageFolders}
						<button
							type="button"
							class="manage"
							data-testid="nb-filing-manage-folders"
							disabled={busy}
							onclick={() => onManageFolders?.()}>Manage folders</button
						>
					{/if}
				</div>
			{/if}
		</div>
	</Disclosure>
</div>

<style>
	.filing {
		min-width: 0;
		border-top: 1px solid var(--hairline);
		border-bottom: 1px solid var(--hairline);
	}
	/* THE LINE WRAPS RATHER THAN CLIPPING. The shared trigger ellipsises its
	   meta, which is right for a count; here the meta is WHERE the work goes
	   and the state of the check-in it answers, and a phone would cut the chip
	   off the end of the line. */
	.filing :global(.disc-meta) {
		white-space: normal;
		overflow: visible;
		text-overflow: clip;
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.5rem;
	}
	.where {
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.92rem;
		font-weight: 600;
		letter-spacing: 0;
		overflow-wrap: anywhere;
	}
	/* A state the student has to know, in the room's secondary ink. */
	.locked {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.filing-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-2) 0 var(--space-4);
	}
	.picker {
		border: none;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	.picker legend {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-2);
		padding: 0;
		margin-bottom: var(--space-2);
	}
	.quick-picks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(13rem, 100%), 1fr));
		gap: var(--space-2);
	}
	.pick {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		text-align: left;
		/* 44px: a student-facing control at every width. */
		min-height: 44px;
		box-sizing: border-box;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-2);
		color: var(--text-1);
		cursor: pointer;
		font: inherit;
	}
	.pick:hover:not(:disabled) {
		border-color: var(--nb-hairline-strong);
	}
	/* Locked once the composer's draft is filed (see `locked`): shown, never
	   offered as a press. The pressed pick keeps its gold, which is the
	   answer to "where is it filed". */
	.pick:disabled {
		cursor: default;
	}
	/* Gold is the active state -- the one thread back to the platform. */
	.pick.selected {
		border-color: var(--nb-accent);
		background: var(--nb-accent-wash);
	}
	.pick-label {
		font-weight: 600;
	}
	.pick-meta {
		font-size: 0.73rem;
		color: var(--text-3);
	}
	/* MUTED COPY ON AN ACTIVE FILL TAKES --text-2, NEVER --text-3, and it is a
	   measured rule: the selected wash lightens the ground out from under the
	   tertiary tier (3.63:1 and 3.55:1 on the retired plates), and --text-2
	   clears on every ground the wash can land on. Lowering the wash is the
	   rejected alternative -- at the 6% that would rescue --text-3 the row
	   stops reading as selected at all. */
	.pick.selected .pick-meta {
		color: var(--text-2);
	}
	.pick.free .pick-label {
		color: var(--nb-accent-ink);
	}
	/* A column, and deliberately NOT the shared `.field` class: that is a
	   key/value ROW (app.css) and forced a long label, and the document, past
	   the viewport before every notebook label overrode it back. */
	.label-field {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-1);
		min-width: 0;
		margin: 0;
	}
	.label-field .optional {
		color: var(--text-2);
		font-weight: 400;
	}
	.folder-row {
		display: flex;
		align-items: flex-end;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
	}
	.folder-field {
		flex: 1 1 14rem;
		max-width: 22rem;
	}
	.manage {
		min-height: 44px;
		padding: 0 var(--space-3);
		/* The outer edge of a control carries --boundary (CLAUDE.md). */
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-1);
		color: var(--nb-accent-ink);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}
	.manage:hover:not(:disabled) {
		border-color: var(--nb-accent-ink);
	}
	@media (max-width: 540px) {
		.quick-picks {
			grid-template-columns: 1fr;
		}
	}
</style>
