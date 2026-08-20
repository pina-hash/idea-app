<script lang="ts">
	import AiLevelBadge from '$lib/classroom/AiLevelBadge.svelte';
	import type { AiLevelLookupConfig } from '$lib/classroom/reference-spec';

	/**
	 * The AI level lookup (calc tool `aiLevelLookup`): pick a type of work, see
	 * what is permitted and what is not.
	 *
	 * THE BADGE IS THE ASSIGNMENT ENGINE'S OWN COMPONENT (AiLevelBadge), not a
	 * copy styled to match -- a student reading "AI COACH" here and on their
	 * assignment must be reading the same thing, and the only way to guarantee
	 * that is for it to be the same component.
	 *
	 * Display-only: the selection is local state and produces nothing.
	 */
	let { config }: { config: AiLevelLookupConfig } = $props();

	let index = $state(0);
	const entry = $derived(config.entries[index] ?? config.entries[0] ?? null);
</script>

<div class="lookup">
	<label class="picker">
		<span class="picker-label">Type of work</span>
		<select bind:value={index}>
			{#each config.entries as e, i (i)}
				<option value={i}>{e.workType}</option>
			{/each}
		</select>
	</label>

	{#if entry}
		<div class="detail">
			<div class="detail-head">
				<h4>{entry.workType}</h4>
				<AiLevelBadge level={entry.level} showBlurb />
			</div>
			<dl>
				<dt class="ok-term">Permitted</dt>
				<dd>{entry.permitted}</dd>
				<dt class="no-term">Not permitted</dt>
				<dd>{entry.notPermitted}</dd>
				{#if entry.example}
					<dt>Example</dt>
					<dd class="example">{entry.example}</dd>
				{/if}
			</dl>
		</div>
	{/if}
</div>

<style>
	.lookup {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.picker {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.picker-label {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	select {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
		min-height: 44px;
	}
	select:focus {
		outline: none;
		border-color: var(--line-strong);
	}
	.detail {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: 0.7rem 0.8rem;
		background: var(--surface-2);
	}
	.detail-head {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: var(--space-2);
	}
	h4 {
		margin: 0;
		font-size: 1rem;
	}
	dl {
		margin: 0;
		display: grid;
		grid-template-columns: minmax(6.5rem, auto) 1fr;
		gap: 0.35rem 0.8rem;
	}
	dt {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
		padding-top: 0.15rem;
	}
	.ok-term {
		color: var(--green);
	}
	.no-term {
		color: var(--amber);
	}
	dd {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.example {
		color: var(--text-2);
		font-style: italic;
	}
	@media (max-width: 480px) {
		dl {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}
		dd {
			margin-bottom: 0.4rem;
		}
	}
</style>
