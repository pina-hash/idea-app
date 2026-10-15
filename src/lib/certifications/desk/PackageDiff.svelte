<script lang="ts">
	/**
	 * The import diff: one row per changed path, before and after, as the
	 * import route's `diffPackages` spells them. A new code has every row
	 * with an empty Before.
	 */
	import { cellWords } from './desk';

	let { changes }: { changes: { path: string; before: unknown; after: unknown }[] } = $props();
	let showAll = $state(false);
	const LIMIT = 60;
	const shown = $derived(showAll ? changes : changes.slice(0, LIMIT));
</script>

<div class="dk-diff" data-testid="cert-package-diff" data-changes={changes.length}>
	{#if changes.length === 0}
		<p class="dk-empty" data-testid="cert-package-diff-none">Nothing changes: the package matches the current revision.</p>
	{:else}
		<p class="dk-row-meta">{changes.length} change{changes.length === 1 ? '' : 's'}.</p>
		<div class="dk-table-wrap">
			<table class="dk-table cert-well">
				<thead><tr><th>Path</th><th>Before</th><th>After</th></tr></thead>
				<tbody>
					{#each shown as c (c.path)}
						<tr data-testid="cert-package-change">
							<td class="dk-mono">{c.path}</td>
							<td class="dk-diff-cell">{c.before === undefined ? '' : cellWords(c.before)}</td>
							<td class="dk-diff-cell">{c.after === undefined ? '' : cellWords(c.after)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if changes.length > LIMIT && !showAll}
			<button type="button" class="btn cert-btn secondary" onclick={() => (showAll = true)}>Show all {changes.length} changes</button>
		{/if}
	{/if}
</div>
