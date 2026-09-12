<script lang="ts">
	/**
	 * The FeatureManager: the six features in build order, the body's stations as
	 * child rows beneath the body, and the two read-only nodes.
	 *
	 * SELECTION IS A ROVING TABINDEX, NOT EIGHT TAB STOPS. A tree is one control
	 * in the tab order and the arrows move inside it, which is what a tree widget
	 * is; eight stops between the header and the viewport is a keyboard user
	 * pressing Tab eight times to leave a list they did not want to enter.
	 *
	 * A STATION ROW IS SELECTABLE AND NOT DELETABLE FROM HERE: add and remove live
	 * in the PropertyManager's own station table, which is where 0145 PART 5 puts
	 * them and where the 3-to-8 bound can be stated beside the control rather than
	 * inferred from a row that is missing an X.
	 *
	 * DOUBLE-CLICK AND ENTER OPEN EDIT FEATURE, a single click only selects
	 * (0145 PART 5). The two are different intentions and a single click that
	 * replaced the tree with a panel would take the tree away from somebody who
	 * was only looking.
	 */
	import type { BladeTree } from '../blade/tree';
	import type { BladeProblem } from '../blade/validate';
	import { FEATURE_DELETE_REFUSAL, FEATURE_RENAME_REFUSAL, featureLabel, problemsFor } from './feature-model';

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

	/** Every row in one list, so the arrow keys move through exactly what is on
	 *  screen and a row added later cannot be reachable by mouse and not by key. */
	type Row = { id: string; label: string; kind: 'feature' | 'station' | 'node'; index?: number };
	const rows = $derived<Row[]>([
		...tree.features.flatMap((f): Row[] => [
			{ id: f.id, label: featureLabel(f.id), kind: 'feature' },
			...(f.type === 'revolve'
				? f.stations.map((s, i) => ({
						id: `station-${i}`,
						label: `Station ${i + 1}  r ${s.r.toFixed(2)}  z ${s.z.toFixed(2)}`,
						kind: 'station' as const,
						index: i
					}))
				: [])
		]),
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
</script>

<div class="ft">
	<h3 id="ft-label">FeatureManager</h3>
	<ul role="tree" aria-labelledby="ft-label" onkeydown={key}>
		{#each rows as row, i (row.id)}
			{@const trouble = row.kind === 'station' ? [] : problemsFor(problems, row.id)}
			<li role="none" class:child={row.kind === 'station'}>
				<button
					role="treeitem"
					aria-selected={selected === row.id}
					aria-level={row.kind === 'station' ? 2 : 1}
					tabindex={i === at ? 0 : -1}
					class:active={selected === row.id}
					class:trouble={trouble.length > 0}
					data-row={row.kind}
					onclick={() => onselect(row.id)}
					ondblclick={() => onedit(row.id)}
				>
					<span class="name">{row.label}</span>
					{#if trouble.length}<span class="chip" title={trouble[0].message}>REBUILD</span>{/if}
					{#if row.id === 'standard-parts'}<span class="chip">UNVERIFIED</span>{/if}
				</button>
			</li>
		{/each}
	</ul>
	{#if !readOnly}
		<!-- The two verbs this tree does not offer, with their reasons, because a
		     row that is the only one in a console with nothing beside it reads as a
		     defect and one sentence is the difference. -->
		<p class="why">{FEATURE_DELETE_REFUSAL}</p>
		<p class="why">{FEATURE_RENAME_REFUSAL}</p>
	{/if}
</div>

<style>
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
		gap: 0.25rem;
		align-items: stretch;
	}
	li.child .name {
		padding-left: 1.1rem;
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.04em;
	}
	button {
		min-height: 44px;
		min-width: 44px;
		display: flex;
		flex: 1 1 auto;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		text-align: left;
		padding: 0.5rem;
		margin: 0.25rem 0;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font: inherit;
	}
	button.active {
		border-color: var(--green);
		background: var(--green-tint);
	}
	button.trouble {
		border-color: var(--crimson);
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
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		color: var(--copper);
	}
	button.trouble .chip {
		color: var(--crimson);
	}
	.why {
		margin: 0.5rem 0 0;
		font: 12px 'Share Tech Mono', monospace;
		line-height: 1.5;
		color: var(--text-2);
	}
	button:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: 2px;
	}
</style>
