<script lang="ts">
	/**
	 * AN ORDERED LIST OF GALLERY SUBJECTS an admin builds by hand (ledger 0380):
	 * the members of a collection and the picks of the featured row. A picker
	 * that adds, and per row Move up, Move down and Remove, every one a worded
	 * 44px key. Reordering is by buttons, never by drag alone, so it works on a
	 * keyboard and on a phone.
	 *
	 * PURE PRESENTATION: it holds no copy of the list. The caller hands the list
	 * in and gets the next list back through `onchange`, so there is exactly one
	 * place a list lives and nothing here can drift from it.
	 */
	let {
		subjects,
		options,
		onchange,
		max = 60,
		testId = 'subject-list'
	}: {
		subjects: string[];
		/** Everything that can be added, with the words to show. */
		options: { subject: string; label: string }[];
		onchange: (next: string[]) => void;
		max?: number;
		testId?: string;
	} = $props();

	let choice = $state('');
	const labels = $derived(new Map(options.map((o) => [o.subject, o.label])));
	const addable = $derived(options.filter((o) => !subjects.includes(o.subject)));

	function add() {
		if (!choice || subjects.length >= max || subjects.includes(choice)) return;
		onchange([...subjects, choice]);
		choice = '';
	}
	function remove(i: number) {
		onchange(subjects.filter((_, k) => k !== i));
	}
	function move(i: number, by: -1 | 1) {
		const j = i + by;
		if (j < 0 || j >= subjects.length) return;
		const next = [...subjects];
		[next[i], next[j]] = [next[j], next[i]];
		onchange(next);
	}
</script>

<div class="fsl" data-testid={testId}>
	{#if subjects.length === 0}
		<p class="fsl-empty">Nothing added yet.</p>
	{:else}
		<ol class="fsl-list">
			{#each subjects as subject, i (subject)}
				<li class="fsl-row">
					<span class="fsl-name person-name" title={labels.get(subject) ?? subject}>
						{labels.get(subject) ?? 'A game that is no longer in the gallery'}
					</span>
					<span class="fsl-keys">
						<button type="button" class="btn tap-44" aria-disabled={i === 0} onclick={() => move(i, -1)}>Move up</button>
						<button type="button" class="btn tap-44" aria-disabled={i === subjects.length - 1} onclick={() => move(i, 1)}>Move down</button>
						<button type="button" class="btn tap-44" onclick={() => remove(i)}>Remove</button>
					</span>
				</li>
			{/each}
		</ol>
	{/if}
	<div class="fsl-add">
		<label class="fsl-add-label" for="{testId}-pick">Add a game</label>
		<select id="{testId}-pick" class="fsl-select cr-select" bind:value={choice} disabled={subjects.length >= max}>
			<option value="">Choose a game</option>
			{#each addable as o (o.subject)}
				<option value={o.subject}>{o.label}</option>
			{/each}
		</select>
		<button type="button" class="btn tap-44" aria-disabled={!choice || subjects.length >= max} onclick={add}>Add</button>
	</div>
	{#if subjects.length >= max}
		<p class="fsl-empty">That is the most this list holds ({max}).</p>
	{/if}
</div>

<style>
	.fsl {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
	}
	.fsl-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
	}
	.fsl-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2, 0.5rem);
		padding: var(--space-2, 0.5rem);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
	}
	.fsl-name {
		flex: 1 1 10rem;
		min-width: 0;
		color: var(--text-1);
	}
	.fsl-keys {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
	}
	.fsl-keys .btn[aria-disabled='true'],
	.fsl-add .btn[aria-disabled='true'] {
		color: var(--ice);
		border-color: var(--ice);
		cursor: not-allowed;
	}
	.fsl-add {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
	}
	.fsl-add-label {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.fsl-select {
		flex: 1 1 12rem;
		min-width: 0;
		min-height: 44px;
	}
	.fsl-empty {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
	}
</style>
