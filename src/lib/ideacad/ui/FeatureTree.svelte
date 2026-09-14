<script lang="ts">
	/**
	 * The FeatureManager: the six features in build order and the two read-only
	 * nodes. Stations are parameters of Body Revolve and belong in its editor,
	 * not beside actual features in this tree.
	 *
	 * SELECTION IS A ROVING TABINDEX, NOT EIGHT TAB STOPS. A tree is one control
	 * in the tab order and the arrows move inside it, which is what a tree widget
	 * is; eight stops between the header and the viewport is a keyboard user
	 * pressing Tab eight times to leave a list they did not want to enter.
	 *
	 * SELECTION OPENS THE PARAMETERS. IdeaCAD is for rapidly developing an idea,
	 * so selecting a row and reaching its useful controls are one action.
	 */
	import type { BladeTree } from '../blade/tree';
	import type { BladeProblem } from '../blade/validate';
	import { featureLabel, problemsFor } from './feature-model';

	let {
		tree,
		problems = [],
		selected,
		onselect,
		onedit,
		readOnly = false
	}: {
		tree: BladeTree;
		problems?: BladeProblem[];
		selected: string;
		onselect: (id: string) => void;
		onedit: (id: string) => void;
		readOnly?: boolean;
	} = $props();

	type Row = { id: string; label: string; kind: 'feature' | 'node' };
	const rows = $derived<Row[]>([
		...tree.features.map((f): Row => ({ id: f.id, label: featureLabel(f.id), kind: 'feature' })),
		{ id: 'materials', label: featureLabel('materials'), kind: 'node' },
		{ id: 'standard-parts', label: featureLabel('standard-parts'), kind: 'node' }
	]);

	const at = $derived(Math.max(0, rows.findIndex((r) => r.id === selected)));

	function key(e: KeyboardEvent) {
		const last = rows.length - 1;
		let to = -1;
		if (e.key === 'ArrowDown') to = Math.min(last, at + 1);
		else if (e.key === 'ArrowUp') to = Math.max(0, at - 1);
		else if (e.key === 'Home') to = 0;
		else if (e.key === 'End') to = last;
		else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			onedit(rows[at].id);
			return;
		} else return;
		e.preventDefault();
		/* The arrows are the viewport's too, and it listens on its own element --
		   but a keystroke aimed at this tree bubbles to the console, where the
		   undo handler lives. Stopping it here keeps one keystroke to one job. */
		e.stopPropagation();
		onselect(rows[to].id);
	}

	function selectAndEdit(id: string) {
		onselect(id);
		onedit(id);
	}
</script>

<div class="ft">
	<h3 id="ft-label">{selected ? 'Features' : 'Select a feature'}</h3>
	<ul id="ft-list" role="tree" aria-labelledby="ft-label" onkeydown={key}>
		{#each rows as row, i (row.id)}
			{@const trouble = problemsFor(problems, row.id)}
			<li role="none">
				<button
					role="treeitem"
					aria-selected={selected === row.id}
					aria-level={1}
					tabindex={i === at ? 0 : -1}
					class:active={selected === row.id}
					class:trouble={trouble.length > 0}
					data-row={row.kind}
					onclick={() => selectAndEdit(row.id)}
					ondblclick={() => onedit(row.id)}
				>
					<span class="name">{row.label}</span>
					{#if trouble.length}<span class="chip" title={trouble[0].message}>REBUILD</span>{/if}
					{#if row.id === 'standard-parts'}<span class="chip">UNVERIFIED</span>{/if}
					{#if readOnly || row.id === 'standard-parts'}
						<span class="mode">VIEW</span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</div>

<style>
	/* LAYOUT ONLY; the skin is `../ideacad.css` under `.ic-root`. */
	.ft {
		display: block;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: stretch;
	}
	button {
		display: flex;
		flex: 1 1 auto;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		text-align: left;
	}
	.name {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chip {
		flex: 0 0 auto;
	}
	/* 0240'S EDITABLE-MODE CHIP replaced ledger 0236's padlock glyph, so the
	   `.lock` rule this conflicted with has no element left to style. */
	.mode {
		flex: 0 0 auto;
		padding: 0.15rem 0.3rem;
		border: 1px solid var(--hairline);
		border-radius: 2px;
		font: 10px / 1 var(--font-mono);
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
</style>
