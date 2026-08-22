<script lang="ts">
	import {
		foldersInOrder,
		type FolderSelection,
		type NotebookFolder
	} from '$lib/notebook-folders';

	/**
	 * The folder switcher: All, Unfiled, then the student's own folders, each
	 * with a live count.
	 *
	 * PRESENTATION ONLY (the Minimap / Garage convention): it holds no
	 * selection state and performs no write. The selection lives in
	 * NotebookView, so the feed and the rail can never disagree about what is
	 * being viewed, and every folder mutation goes through FolderManager.
	 *
	 * ALL AND UNFILED ARE SEPARATE ENTRIES on purpose. "Unfiled" is somewhere a
	 * student goes deliberately -- it is the pile still to sort -- and folding
	 * it into "no filter" would hide the one view that makes filing finishable.
	 * It is shown even at zero, so an empty pile reads as done rather than as
	 * missing.
	 *
	 * A COUNT IS OF EVERY ENTRY IN THE FOLDER, not of what the current search
	 * and filters leave. Numbers that moved as you typed would make the rail a
	 * second, competing readout of the result you are already looking at; this
	 * one answers "how much is in there", which is what you switch folders to
	 * find out.
	 */

	let {
		folders,
		counts,
		selection,
		onSelect,
		onManage
	}: {
		folders: NotebookFolder[];
		counts: Map<FolderSelection, number>;
		selection: FolderSelection;
		onSelect: (next: FolderSelection) => void;
		/** Opens the folder manager; omitted in read-only contexts. */
		onManage?: () => void;
	} = $props();

	const ordered = $derived(foldersInOrder(folders));
	const count = (key: FolderSelection) => counts.get(key) ?? 0;
</script>

<nav class="rail" aria-label="Folders">
	<ul>
		<li>
			<button
				type="button"
				class="tab"
				class:selected={selection === 'all'}
				aria-current={selection === 'all' ? 'true' : undefined}
				onclick={() => onSelect('all')}
			>
				<span class="dot none" aria-hidden="true"></span>
				<span class="name">All entries</span>
				<span class="count">{count('all')}</span>
			</button>
		</li>
		<li>
			<button
				type="button"
				class="tab"
				class:selected={selection === 'unfiled'}
				aria-current={selection === 'unfiled' ? 'true' : undefined}
				data-testid="folder-unfiled"
				onclick={() => onSelect('unfiled')}
			>
				<span class="dot none hollow" aria-hidden="true"></span>
				<span class="name">Unfiled</span>
				<span class="count">{count('unfiled')}</span>
			</button>
		</li>

		{#each ordered as folder (folder.id)}
			<li>
				<button
					type="button"
					class="tab"
					class:selected={selection === folder.id}
					aria-current={selection === folder.id ? 'true' : undefined}
					data-testid="folder-tab"
					onclick={() => onSelect(folder.id)}
				>
					<span
						class="dot"
						style="--dot: var(--nb-folder-{folder.color ?? 'none'})"
						aria-hidden="true"
					></span>
					<span class="name">{folder.name}</span>
					<span class="count">{count(folder.id)}</span>
				</button>
			</li>
		{/each}
	</ul>

	{#if onManage}
		<button type="button" class="manage" data-testid="manage-folders" onclick={onManage}>
			{folders.length ? 'Manage folders' : 'New folder'}
		</button>
	{/if}
</nav>

<style>
	/* A horizontal scrolling rail, not a sidebar: the notebook is a single
	   narrow reading column and phone-first, and a sidebar would either eat
	   that column or vanish at the width most of these students are on.

	   ABOVE THE SPLIT'S BREAKPOINT IT WRAPS INSTEAD, see the rule at the foot of
	   this block. The horizontal scroll is right for a full-width strip on a
	   phone, where vertical room is the scarce thing; inside a 26rem navigation
	   pane it was a scrollbar nested in a scrollbar, offering nothing the room
	   below it could not have given for free. */
	.rail {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0 0 var(--space-1);
		display: flex;
		gap: var(--space-2);
		overflow-x: auto;
		flex: 1 1 auto;
		min-width: 0;
		scrollbar-width: thin;
	}
	li {
		flex: 0 0 auto;
	}
	.tab {
		/* 31px measured. The notebook is the most student-facing surface there
		   is and these are how a student filters their own entries, so 44px is
		   the floor at every width (IDEA_INTERFACE_STANDARDS 10). Padding carries it. */
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		background: var(--surface-1);
		color: var(--text-2);
		font: inherit;
		font-size: 0.82rem;
		white-space: nowrap;
		cursor: pointer;
	}
	.tab:hover {
		border-color: var(--text-3);
		color: var(--text-1);
	}
	/* Gold is the active state here as everywhere else in this room. */
	.tab.selected {
		border-color: var(--nb-accent);
		background: var(--nb-accent-wash);
		color: var(--text-1);
		font-weight: 600;
	}
	/* One region, one scrollbar: in the pane there is vertical room, so the
	   chips take a second line rather than a bar of their own. `overflow: visible`
	   because `auto` on a wrapping flex row still reserves the bar's gutter. */
	@media (min-width: 1024px) {
		ul {
			flex-wrap: wrap;
			overflow-x: visible;
			row-gap: var(--space-2);
		}
	}
	.dot {
		width: 0.55em;
		height: 0.55em;
		border-radius: 50%;
		background: var(--dot, var(--nb-folder-none));
		flex: 0 0 auto;
	}
	/* Unfiled reads as an outline: a place, but not a colour of its own. */
	.dot.hollow {
		background: transparent;
		box-shadow: inset 0 0 0 1.5px var(--nb-folder-none);
	}
	.dot.none {
		--dot: var(--nb-folder-none);
	}
	.count {
		font-variant-numeric: tabular-nums;
		font-size: 0.74rem;
		color: var(--text-3);
	}
	.tab.selected .count {
		color: var(--nb-accent-ink);
	}
	.manage {
		/* 28px measured. 44px floor (IDEA_INTERFACE_STANDARDS 10); it sits at the end of the rail on
		   its own, so it can grow rather than reach. */
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		flex: 0 0 auto;
		border: none;
		background: none;
		padding: var(--space-1) 0;
		font: inherit;
		font-size: 0.78rem;
		color: var(--nb-accent-ink);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.manage:hover {
		color: var(--text-1);
	}
</style>
