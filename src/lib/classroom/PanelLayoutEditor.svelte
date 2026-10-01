<script lang="ts">
	import { sortDrag } from '$lib/classroom/sort-drag';
	import {
		anchorOf,
		editorOrder,
		movePanel,
		panelDef,
		panelsForRole,
		piecesOf,
		togglePanelHidden,
		withPanelOrder,
		type PanelLayout,
		type PanelPage,
		type PanelRole
	} from '$lib/classroom/panel-layout';

	/**
	 * ONE PAGE'S ARRANGEMENT, EDITED (ledger 0360, report R23, phase 1).
	 *
	 * A list of the page's sections in the order they render, each with three
	 * ways to move it -- a grip that drags or takes ArrowUp/ArrowDown (the class
	 * list's own `sortDrag`, so pointer, touch and keyboard are one path), and
	 * Move up / Move down for anyone who does not drag -- and a Show toggle.
	 * The page's anchor (the posts, the work) is a row too, so a section can be
	 * placed above or below it, but it has no grip, no toggle and no move: it
	 * says "Always shown" instead. A section that may move but not hide keeps
	 * its moves and says the same.
	 *
	 * A PANEL'S PIECES ARE LISTED UNDER IT, AND THEY ONLY SHOW AND HIDE (ledger
	 * 0360, R19 on R23). The class header holds the tools, the theme vote and
	 * a teacher's posting keys in its one key row, so they ride inside its row
	 * here too: each says where it is ("In the class header") and has a Show
	 * toggle, and none has a grip or a move, because it goes where the header
	 * goes. Dragging the header carries them with it.
	 *
	 * IT WRITES NOTHING ITSELF. Every change is `onchange(next)` with the
	 * normalized layout (`withPanelOrder`, `togglePanelHidden`), and null is the
	 * page as it ships; the settings panel hands that to the preference store,
	 * which is the only thing that knows where it is kept.
	 *
	 * Every target is 44px through the room's own `.btn.tiny`, and each is a
	 * worded key the plate already lights (`aria-pressed`), so nothing here is a
	 * new control shape. `aria-disabled`, never `disabled`, at the ends: a
	 * disabled control swallows the press that would let it explain itself.
	 */
	let {
		page,
		role,
		layout,
		onchange
	}: {
		page: PanelPage;
		role: PanelRole;
		layout: PanelLayout | null;
		onchange: (next: PanelLayout | null) => void;
	} = $props();

	const order = $derived(editorOrder(page, role, layout));
	const mine = $derived(new Set(panelsForRole(page, role).map((p) => p.id)));
	/** A row's pieces this role is offered, in the host's own order. */
	const piecesFor = (id: string) => piecesOf(page, id).filter((p) => mine.has(p.id));
	const anchor = $derived(anchorOf(page));
	const hidden = $derived(new Set(layout?.hidden ?? []));
	/** Said after every move, in words, for a screen reader that cannot see the row go. */
	let status = $state('');

	function move(id: string, to: number) {
		const next = movePanel(page, order, id, to);
		if (next.join() === order.join()) return;
		const label = panelDef(page, id)?.label ?? id;
		status = `${label} moved to ${next.indexOf(id) + 1} of ${next.length}.`;
		onchange(withPanelOrder(page, role, layout, next));
	}

	function toggle(id: string) {
		const label = panelDef(page, id)?.label ?? id;
		status = hidden.has(id) ? `${label} shown.` : `${label} hidden.`;
		onchange(togglePanelHidden(page, role, layout, id));
	}

	const drag = $derived({
		items: '[data-sort-item]',
		ondrop: (from: number, to: number) => {
			const id = order[from];
			if (id !== undefined) move(id, to);
		}
	});
</script>

<div class="pl" data-testid="panel-layout-editor-{page}">
	<ol class="pl-list" use:sortDrag={drag}>
		{#each order as id, i (id)}
			{@const def = panelDef(page, id)}
			{@const pieces = piecesFor(id)}
			{#if def}
				<li
					class="pl-row"
					class:is-hidden={hidden.has(id)}
					data-sort-item
					data-testid="panel-row"
					data-panel={id}
				>
					{#if id === anchor}
						<span class="pl-grip-space" aria-hidden="true"></span>
					{:else}
						<button
							type="button"
							class="btn secondary tiny pl-grip"
							data-sort-handle
							data-testid="panel-grip"
							aria-label="Drag {def.label}, or press the up and down arrow keys to move it"
						>
							<span class="pl-grip-glyph" aria-hidden="true">&#10495;</span>
							<span class="pl-grip-word" aria-hidden="true">Drag</span>
						</button>
					{/if}
					<span class="pl-name">
						<span class="pl-label">{def.label}</span>
						{#if hidden.has(id)}
							<span class="pl-chip" data-testid="panel-hidden-chip">Hidden</span>
						{:else if !def.hideable}
							<span class="pl-chip pl-chip-keep" data-testid="panel-always">Always shown</span>{#if def.keep}<span class="sr-only">{def.keep}</span>{/if}
						{/if}
					</span>
					{#if id !== anchor}
						<span class="pl-controls">
							<button
								type="button"
								class="btn secondary tiny"
								data-testid="panel-move-up"
								aria-disabled={i === 0}
								onclick={() => move(id, i - 1)}>Move up<span class="sr-only"> {def.label}</span></button
							>
							<button
								type="button"
								class="btn secondary tiny"
								data-testid="panel-move-down"
								aria-disabled={i === order.length - 1}
								onclick={() => move(id, i + 1)}>Move down<span class="sr-only"> {def.label}</span></button
							>
							{#if def.hideable}
								<button
									type="button"
									class="btn secondary tiny"
									aria-pressed={!hidden.has(id)}
									data-testid="panel-toggle"
									onclick={() => toggle(id)}>Show<span class="sr-only"> {def.label}</span></button
								>
							{/if}
						</span>
					{/if}
					{#if pieces.length}
						<ul class="pl-pieces" aria-label="In the {def.label.toLowerCase()}" data-testid="panel-pieces">
							{#each pieces as piece (piece.id)}
								<li class="pl-piece" class:is-hidden={hidden.has(piece.id)} data-testid="panel-piece" data-panel={piece.id}>
									<span class="pl-name">
										<span class="pl-label">{piece.label}</span>
										{#if hidden.has(piece.id)}
											<span class="pl-chip" data-testid="panel-hidden-chip">Hidden</span>
										{:else}
											<span class="pl-chip pl-chip-keep" data-testid="panel-within">In the {def.label.toLowerCase()}</span>
										{/if}
									</span>
									<span class="pl-controls">
										<button
											type="button"
											class="btn secondary tiny"
											aria-pressed={!hidden.has(piece.id)}
											data-testid="panel-toggle"
											onclick={() => toggle(piece.id)}>Show<span class="sr-only"> {piece.label}</span></button
										>
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/if}
		{/each}
	</ol>
	<div class="pl-foot">
		<button
			type="button"
			class="btn secondary tiny"
			data-testid="panel-reset"
			aria-disabled={layout === null}
			onclick={() => {
				if (layout === null) return;
				status = 'Back to the standard layout.';
				onchange(null);
			}}>Reset to default</button
		>
		<p class="sr-only" aria-live="polite" data-testid="panel-layout-status">{status}</p>
	</div>
</div>

<style>
	.pl {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	.pl-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-1);
	}
	/* One row per section: the grip, the name, the moves and the toggle,
	   wrapping (never clipping) in a phone's dialog. `min-height`, never a
	   height, so the 44px floor cannot round down. */
	.pl-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		min-height: 44px;
		min-width: 0;
		padding: var(--space-1) 0;
		border-bottom: 1px solid var(--hairline);
		background: var(--surface-1);
	}
	.pl-row:last-child {
		border-bottom: 0;
	}
	/* `sortDrag` paints transforms; the rows it shifts ease out of the way. */
	@media (prefers-reduced-motion: no-preference) {
		.pl-list:global(.is-sorting) .pl-row:not(:global(.is-dragging)) {
			transition: transform 160ms ease;
		}
	}
	.pl-grip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		cursor: grab;
	}
	.pl-grip-space {
		display: inline-block;
		width: 44px;
		flex: none;
	}
	.pl-name {
		flex: 1 1 8rem;
		min-width: 0;
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}
	.pl-label {
		color: var(--text-1);
		overflow-wrap: break-word;
	}
	.pl-row.is-hidden .pl-label {
		color: var(--text-2);
	}
	/* A recessed status tag, never a key: it is not pressable. The word is the
	   signal; the plate's tag list gives it the inset look where it is listed. */
	.pl-chip {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
	}
	.pl-controls {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	/* The pieces take their host row's full width on a line of their own,
	   stepped in past the grip so they read as inside it. */
	.pl-pieces {
		flex: 1 0 100%;
		list-style: none;
		margin: 0;
		padding: 0 0 0 calc(44px + var(--space-2));
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}
	.pl-piece {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		min-height: 44px;
		min-width: 0;
		border-top: 1px solid var(--hairline);
	}
	.pl-piece.is-hidden .pl-label {
		color: var(--text-2);
	}
	.pl-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
</style>
