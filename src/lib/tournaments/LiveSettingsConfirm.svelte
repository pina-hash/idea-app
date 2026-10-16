<script lang="ts">
	/**
	 * THE CONFIRM FOR CHANGING A LIVE TOURNAMENT (ledger 0392, migration 0266).
	 * Presentation only: the parent asked `tournament_live_config_preview`,
	 * hands the answer in as `plan`, and owns the apply. Every line is the
	 * database's own answer turned into words by `liveEffectLines`, so what a
	 * person confirms is what the apply does; the apply refuses a preview that
	 * went stale, so a co-host's edit in between cannot be confirmed blind.
	 */
	import { liveEffectLines, type LivePlan } from './live-settings';

	let {
		plan,
		busy = false,
		error = '',
		onapply,
		oncancel
	}: {
		plan: LivePlan;
		busy?: boolean;
		error?: string;
		onapply: () => void;
		oncancel: () => void;
	} = $props();

	const lines = $derived(liveEffectLines(plan));
</script>

<div class="lsc" role="group" aria-labelledby="lsc-title" data-testid="live-settings-confirm">
	<p class="lsc-title" id="lsc-title">Change a live tournament</p>
	<ul class="lsc-lines">
		{#each lines as line, i (i)}<li>{line}</li>{/each}
	</ul>
	{#if error}<p class="lsc-error" role="alert" data-testid="live-settings-error">{error}</p>{/if}
	<div class="btn-row">
		<button
			type="button"
			class="btn"
			disabled={busy}
			data-action="live-settings-apply"
			onclick={onapply}>Apply to the live event</button
		>
		<button type="button" class="btn secondary" disabled={busy} data-action="live-settings-cancel" onclick={oncancel}
			>Cancel</button
		>
	</div>
</div>

<style>
	.lsc {
		max-width: var(--measure-form, 48rem);
		margin-top: 1rem;
		padding: 0.9rem 1rem;
		border: 1px solid var(--tnm-line-strong, var(--boundary));
		border-left: 3px solid var(--amber);
		border-radius: 6px;
		background: var(--tnm-panel-2, var(--bg2));
		color: var(--tnm-ink, var(--text-1));
	}
	.lsc-title {
		margin: 0 0 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.lsc-lines {
		margin: 0 0 0.8rem;
		padding-left: 1.2rem;
		line-height: 1.5;
	}
	.lsc-lines li + li {
		margin-top: 0.3rem;
	}
	.lsc-error {
		margin: 0 0 0.7rem;
		color: var(--amber);
	}
	.btn-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.btn-row .btn {
		min-height: 44px;
	}
</style>
