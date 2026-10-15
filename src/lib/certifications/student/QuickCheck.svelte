<script lang="ts">
	/**
	 * A quick check (ledger 0391): one ungraded question after a training item,
	 * its options as 44px radio rows, instant feedback in a glyph and words
	 * with the explain text, and the result posted as `kind: 'quick'` telemetry
	 * through the injected `rpc`. It exists for retrieval practice, not
	 * scoring, so a wrong answer stays on screen with the right one named.
	 */
	import type { QuickCheck } from '$lib/certifications/types';
	import type { CertRpc } from './actions';

	let { check, certId, rpc = null }: { check: QuickCheck; certId: string; rpc?: CertRpc | null } = $props();

	const name = $props.id();
	let chosen = $state<number | null>(null);
	const correct = $derived(chosen !== null && chosen === check.answer);

	function choose(i: number) {
		if (chosen !== null) return;
		chosen = i;
		if (rpc) void rpc('cert_practice_record', { p_cert: certId, p_kind: 'quick', p_item_id: check.id, p_correct: i === check.answer });
	}
</script>

<fieldset class="cert-quick" data-testid="cert-quick-check" data-id={check.id} data-answered={chosen === null ? 'no' : correct ? 'right' : 'wrong'}>
	<legend class="cert-quick-legend"><span class="cert-readout">Quick check</span> {check.prompt}</legend>
	<ul class="cert-well cert-quick-options">
		{#each check.options as option, i (i)}
			<li>
				<label class="cert-choice" class:is-right={chosen !== null && i === check.answer} class:is-wrong={chosen === i && i !== check.answer}>
					<input type="radio" name={`quick-${name}`} value={i} checked={chosen === i} disabled={chosen !== null && chosen !== i} onchange={() => choose(i)} />
					<span class="cert-choice-word">{option}</span>
					{#if chosen !== null && i === check.answer}<span class="cert-choice-mark cert-tone-ok" aria-hidden="true">✓</span>{/if}
					{#if chosen === i && i !== check.answer}<span class="cert-choice-mark cert-tone-bad" aria-hidden="true">✕</span>{/if}
				</label>
			</li>
		{/each}
	</ul>
	{#if chosen !== null}
		<p class="cert-quick-feedback" class:cert-tone-ok={correct} class:cert-tone-bad={!correct} role="status" data-testid="cert-quick-feedback">
			<span aria-hidden="true">{correct ? '✓' : '✕'}</span>
			{correct ? 'Right.' : `Not quite. The answer is: ${check.options[check.answer]}.`}
			{#if check.explain}<span class="cert-quick-explain">{check.explain}</span>{/if}
		</p>
	{/if}
</fieldset>

<style>
	.cert-quick {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: 0.75rem 1rem 0.9rem;
		margin: 0 0 1.25rem;
		min-width: 0;
	}
	.cert-quick-legend {
		padding: 0 0.4rem;
		font-weight: 700;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.6rem;
		align-items: center;
	}
	.cert-quick-options {
		margin: 0.5rem 0 0;
	}
	.cert-choice {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-height: 44px;
		padding: 0.35rem 0;
		cursor: pointer;
	}
	.cert-choice input {
		width: 1.1rem;
		height: 1.1rem;
		flex: none;
		margin: 0;
		accent-color: var(--green);
	}
	.cert-choice-word {
		flex: 1 1 auto;
		min-width: 0;
	}
	.cert-choice-mark {
		font-family: var(--font-mono);
	}
	.is-right .cert-choice-word {
		color: var(--green);
		font-weight: 700;
	}
	.cert-quick-feedback {
		margin: 0.6rem 0 0;
		line-height: 1.45;
	}
	.cert-quick-explain {
		display: block;
		color: var(--text-1);
		margin-top: 0.2rem;
	}
</style>
