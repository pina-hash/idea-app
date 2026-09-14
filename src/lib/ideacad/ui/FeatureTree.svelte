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
	 * THE BODY'S STATIONS ARE CHILD ROWS AND THEY START COLLAPSED, which is what
	 * a tree does and is also a measured decision: expanded by default, four
	 * station rows pushed Materials and Standard Parts off the bottom of a 566.6px
	 * pane at 1440 -- two nodes 0145 PART 5 names, gone, with nothing on screen
	 * saying they were there. Collapsed, the eight named rows fit.
	 *
	 * A STATION ROW IS SELECTABLE AND NOT DELETABLE FROM HERE: add and remove live
	 * in the PropertyManager's own station table, which is where 0145 PART 5 puts
	 * them and where the 3-to-8 bound can be stated beside the control rather than
	 * inferred from a row that is missing an X.
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

	let open = $state(false);

	/** Every row that is ON SCREEN, in one list, so the arrow keys move through
	 *  exactly what is visible and a row added later cannot be reachable by mouse
	 *  and not by key. A collapsed body contributes no station rows at all --
	 *  hiding them in CSS would leave the arrows walking through boxes nobody
	 *  can see. */
	type Row = { id: string; label: string; kind: 'feature' | 'station' | 'node'; index?: number };
	const rows = $derived<Row[]>([
		...tree.features.flatMap((f): Row[] => [
			{ id: f.id, label: featureLabel(f.id), kind: 'feature' },
			...(f.type === 'revolve' && open
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
		else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
			/* The tree pattern's own expand and collapse. It answers only on the
			   row that HAS children, so it is never a key that silently does
			   nothing somewhere else in the list. */
			if (rows[at]?.id === 'body-revolve') {
				e.preventDefault();
				e.stopPropagation();
				open = e.key === 'ArrowRight';
			}
			return;
		}
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
	<h3 id="ft-label">FeatureManager</h3>
	<ul id="ft-list" role="tree" aria-labelledby="ft-label" onkeydown={key}>
		{#each rows as row, i (row.id)}
			{@const trouble = row.kind === 'station' ? [] : problemsFor(problems, row.id)}
			<li role="none" class:child={row.kind === 'station'}>
				{#if row.id === 'body-revolve'}
					<button
						class="twist"
						aria-expanded={open}
						aria-controls="ft-list"
						aria-label={open ? 'Hide the body stations' : 'Show the body stations'}
						onclick={() => (open = !open)}>{open ? '▾' : '▸'}</button
					>
				{/if}
				<button
					role="treeitem"
					aria-expanded={row.id === 'body-revolve' ? open : undefined}
					aria-selected={selected === row.id}
					aria-level={row.kind === 'station' ? 2 : 1}
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
					<span class="lock" aria-label="Name and deletion locked" title="Name and deletion locked">🔒</span>
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
	button.twist {
		flex: 0 0 auto;
		justify-content: center;
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
	/* THE LOCK GLYPH is ledger 0236's and has no counterpart in the room's
	   sheet, so it stays here. It carries no colour of its own -- the emoji
	   supplies its own, and `grayscale(1)` is what keeps it chrome rather than
	   a second hue in a panel that already spends green, amber and crimson. */
	.lock {
		flex: 0 0 auto;
		font-size: 12px;
		filter: grayscale(1);
		opacity: 0.7;
	}
</style>
