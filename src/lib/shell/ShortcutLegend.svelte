<script lang="ts">
	/**
	 * EVERY KEY THIS SCREEN ANSWERS TO, read off the command registry.
	 *
	 * The rows are `shortcutLegend(env)`: the palette's own keys, the class page's,
	 * and on the grading console or the notebook review the console's table --
	 * which the registry reads from the SAME array the console dispatches from,
	 * so a key that stops working stops being listed here in the same edit.
	 * Grouped by where a key works, each group headed in words.
	 */
	import { keysFor, type CommandContext, type ShellCommand } from './commands';

	let { rows, platform = '' }: { rows: readonly ShellCommand[]; platform?: string } = $props();

	const GROUP_TITLES: Record<CommandContext, string> = {
		global: 'Anywhere in the classroom',
		class: 'On a class page',
		item: 'On an item',
		student: 'Grading a student',
		selection: 'Reviewing check-ins'
	};
	const ORDER: readonly CommandContext[] = ['global', 'class', 'item', 'student', 'selection'];

	const groups = $derived(
		ORDER.map((context) => ({ context, rows: rows.filter((r) => r.context === context) })).filter(
			(g) => g.rows.length > 0
		)
	);
</script>

<div class="sl-root" data-testid="shortcut-legend">
	{#each groups as g (g.context)}
		<section class="sl-group" data-context={g.context}>
			<h3 class="sl-title">{GROUP_TITLES[g.context]}</h3>
			<dl class="sl-list">
				{#each g.rows as r (r.id)}
					<div class="sl-row" data-command={r.id}>
						<dt><kbd>{keysFor(r.keys ?? '', platform)}</kbd></dt>
						<dd>{r.name}</dd>
					</div>
				{/each}
			</dl>
		</section>
	{/each}
</div>

<style>
	.sl-root {
		display: grid;
		gap: var(--space-4);
	}
	.sl-title {
		margin: 0 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 400;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.sl-list {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 2px;
		margin: 0;
	}
	.sl-row {
		display: grid;
		grid-template-columns: 6.5rem minmax(0, 1fr);
		align-items: center;
		gap: var(--space-3);
		min-height: 36px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-card);
	}
	.sl-row:nth-child(odd) {
		background: var(--surface-2);
	}
	.sl-row dt,
	.sl-row dd {
		margin: 0;
		min-width: 0;
	}
	.sl-row dd {
		color: var(--text-1);
	}
	kbd {
		display: inline-block;
		padding: 0.1rem 0.45rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		white-space: nowrap;
	}
</style>
