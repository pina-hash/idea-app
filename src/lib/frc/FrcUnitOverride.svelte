<script lang="ts">
	/**
	 * Teacher completion override: toggle a student's unit completion on/off.
	 * Presentation + interaction only, driven by props and one callback, so it
	 * is testable in the dev harness (in-memory) and used by the dashboard
	 * (wired to markUnitComplete / clearUnitComplete). Styled for the dark IDEA
	 * theme (the dashboard and /dev are dark contexts).
	 */
	type OverrideUnit = { id: string; n: number; title: string };
	let {
		units,
		completed,
		busyId = '',
		onToggle
	}: {
		units: OverrideUnit[];
		completed: string[];
		busyId?: string;
		onToggle: (unitId: string, next: boolean) => void;
	} = $props();

	const done = $derived(new Set(completed));
</script>

<div class="fuo">
	{#each units as u (u.id)}
		{@const isDone = done.has(u.id)}
		<button
			type="button"
			class="fuo-unit"
			class:done={isDone}
			disabled={busyId === u.id}
			aria-pressed={isDone}
			title={isDone ? 'Mark incomplete' : 'Mark complete'}
			onclick={() => onToggle(u.id, !isDone)}
		>
			<span class="fuo-box" aria-hidden="true">{#if isDone}&#10003;{/if}</span>
			<span class="fuo-n">{String(u.n).padStart(2, '0')}</span>
			<span class="fuo-title">{u.title}</span>
		</button>
	{/each}
</div>

<style>
	.fuo {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 0.35rem;
		padding: 0.6rem 0 0.2rem;
	}
	.fuo-unit {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-align: left;
		background: var(--bg2, #081209);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 4px;
		padding: 0.35rem 0.5rem;
		cursor: pointer;
		color: var(--dim, #4a7a52);
		transition: border-color 0.15s ease;
	}
	.fuo-unit:hover:not(:disabled) {
		border-color: var(--line-strong, rgba(0, 255, 65, 0.35));
	}
	.fuo-unit:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.fuo-box {
		flex-shrink: 0;
		width: 16px;
		height: 16px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 3px;
		font-size: 0.7rem;
		line-height: 1;
		color: var(--bg0, #020a04);
		background: transparent;
	}
	.fuo-unit.done {
		color: var(--white, #e8ffe8);
		border-color: var(--green, #00ff41);
	}
	.fuo-unit.done .fuo-box {
		background: var(--green, #00ff41);
		border-color: var(--green, #00ff41);
	}
	.fuo-n {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.66rem;
		color: var(--cyan, #00f0ff);
		flex-shrink: 0;
	}
	.fuo-title {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.66rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
