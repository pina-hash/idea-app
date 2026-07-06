<script lang="ts">
	/**
	 * Sequential phase stepper for a unit page (Brief -> Drill -> Quiz -> Apply).
	 * Presentation + one `onSelect` callback: a phase is `locked` when its index
	 * is past `unlockedThrough`, `current` when it matches `currentIndex`,
	 * otherwise `done` (unlocked and not the open phase — including a phase the
	 * student hasn't visited yet but that was unlocked in one jump, e.g. when a
	 * unit's gate was already cleared in a prior session). Locked steps are not
	 * clickable; the student can always click back to an unlocked phase to
	 * review it.
	 */
	interface Phase {
		key: string;
		label: string;
	}
	let {
		phases,
		currentIndex,
		unlockedThrough,
		onSelect
	}: {
		phases: Phase[];
		currentIndex: number;
		unlockedThrough: number;
		onSelect: (i: number) => void;
	} = $props();
</script>

<ol class="phase-stepper" aria-label="Unit phases">
	{#each phases as p, i (p.key)}
		{@const state = i > unlockedThrough ? 'locked' : i === currentIndex ? 'current' : 'done'}
		<li class="phase-step">
			<button
				type="button"
				class="phase-btn {state}"
				disabled={state === 'locked'}
				aria-current={state === 'current' ? 'step' : undefined}
				onclick={() => onSelect(i)}
			>
				<span class="phase-marker" aria-hidden="true">
					{#if state === 'done'}
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="12" cy="12" r="10" fill="#00ff41" />
							<path d="M7.5 12.5l3 3 6-6.5" stroke="#231f20" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					{:else if state === 'locked'}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="5" y="11" width="14" height="9" rx="1.5" />
							<path d="M8 11V7.5a4 4 0 018 0V11" />
						</svg>
					{:else}
						<span class="phase-num">{i + 1}</span>
					{/if}
				</span>
				<span class="phase-label">{p.label}</span>
			</button>
			{#if i < phases.length - 1}
				<span class="phase-sep {i < unlockedThrough ? 'done' : ''}" aria-hidden="true"></span>
			{/if}
		</li>
	{/each}
</ol>

<style>
	.phase-stepper {
		list-style: none;
		margin: 0 0 1.6rem;
		padding: 0;
		display: flex;
		align-items: center;
	}
	.phase-step {
		display: flex;
		align-items: center;
		flex: 1;
	}
	.phase-step:last-child {
		flex: 0 0 auto;
	}
	.phase-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: none;
		padding: 0.3rem 0.4rem;
		cursor: pointer;
		font-family: inherit;
	}
	.phase-btn:disabled {
		cursor: not-allowed;
	}
	.phase-marker {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		flex-shrink: 0;
		border-radius: 999px;
		border: 2px solid var(--frc-line, #dde1e8);
		color: var(--frc-gray, #9a989a);
	}
	.phase-marker svg {
		width: 15px;
		height: 15px;
	}
	.phase-num {
		font-weight: 700;
		font-size: 0.82rem;
	}
	.phase-label {
		font-weight: 700;
		font-size: 0.82rem;
		letter-spacing: 0.03em;
		color: var(--frc-gray, #9a989a);
		white-space: nowrap;
	}
	.phase-btn.current .phase-marker {
		border-color: var(--frc-blue, #0066b3);
		color: var(--frc-blue, #0066b3);
		box-shadow: 0 0 0 3px var(--frc-blue-tint, rgba(0, 102, 179, 0.12));
	}
	.phase-btn.current .phase-label {
		color: var(--frc-blue, #0066b3);
	}
	.phase-btn.done .phase-marker {
		border-color: var(--frc-achieve-line, rgba(0, 200, 60, 0.55));
	}
	.phase-btn.done .phase-label {
		color: var(--frc-ink, #231f20);
	}
	.phase-btn.done:hover .phase-label,
	.phase-btn.current:hover .phase-label {
		color: var(--frc-red, #ed1c24);
	}
	.phase-btn.locked .phase-label {
		color: var(--frc-gray, #9a989a);
	}
	.phase-sep {
		flex: 1;
		height: 2px;
		min-width: 0.75rem;
		background: var(--frc-line, #dde1e8);
		margin: 0 0.4rem;
	}
	.phase-sep.done {
		background: var(--frc-achieve-line, rgba(0, 200, 60, 0.55));
	}
	@media (max-width: 560px) {
		.phase-label {
			display: none;
		}
		.phase-sep {
			min-width: 0.4rem;
			margin: 0 0.15rem;
		}
	}
</style>
