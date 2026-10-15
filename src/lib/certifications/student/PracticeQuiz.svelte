<script lang="ts">
	/**
	 * The practice quiz (ledger 0391): the kit's own question set, paraphrased
	 * from the exam topics and never the exam, one question at a time, ungraded,
	 * with a score at the end and every answer posted as `kind: 'practice'`
	 * telemetry. A student may run it as often as they like: Start over puts
	 * every question back.
	 */
	import type { PracticeQuestion } from '$lib/certifications/types';
	import type { CertRpc } from './actions';

	let { questions, certId, rpc = null }: { questions: PracticeQuestion[]; certId: string; rpc?: CertRpc | null } = $props();

	const name = $props.id();
	let index = $state(0);
	let chosen = $state<number | null>(null);
	let right = $state(0);
	let finished = $state(false);

	const question = $derived(questions[index] ?? null);
	const correct = $derived(question !== null && chosen !== null && chosen === question.answer);

	function choose(i: number) {
		if (!question || chosen !== null) return;
		chosen = i;
		const ok = i === question.answer;
		if (ok) right += 1;
		if (rpc) void rpc('cert_practice_record', { p_cert: certId, p_kind: 'practice', p_item_id: question.id, p_correct: ok });
	}
	function next() {
		if (index + 1 >= questions.length) {
			finished = true;
			return;
		}
		index += 1;
		chosen = null;
	}
	function restart() {
		index = 0;
		chosen = null;
		right = 0;
		finished = false;
	}
</script>

<div class="cert-practice" data-testid="cert-practice" data-finished={finished ? 'yes' : 'no'}>
	{#if questions.length === 0}
		<p class="cert-help">No practice questions yet.</p>
	{:else if finished}
		<div class="cert-practice-score" role="status" data-testid="cert-practice-score">
			<span class="cert-practice-figure">{right} of {questions.length}</span>
			<span class="cert-help">{right === questions.length ? 'Every one. The study guide has anything you want to check again.' : 'Ungraded. Read the explanations, then run it again.'}</span>
		</div>
		<div class="cert-actions">
			<button type="button" class="btn secondary cert-btn" onclick={restart} data-testid="cert-practice-restart">Start over</button>
		</div>
	{:else if question}
		<p class="cert-practice-count"><span class="cert-readout">Question {index + 1} of {questions.length}</span></p>
		<fieldset class="cert-practice-q">
			<legend class="cert-practice-prompt">{question.prompt}</legend>
			<ul class="cert-well cert-practice-options">
				{#each question.options as option, i (i)}
					<li>
						<label class="cert-choice" class:is-right={chosen !== null && i === question.answer} class:is-wrong={chosen === i && i !== question.answer}>
							<input type="radio" name={`practice-${name}`} value={i} checked={chosen === i} disabled={chosen !== null && chosen !== i} onchange={() => choose(i)} />
							<span class="cert-choice-word">{option}</span>
							{#if chosen !== null && i === question.answer}<span class="cert-tone-ok" aria-hidden="true">✓</span>{/if}
							{#if chosen === i && i !== question.answer}<span class="cert-tone-bad" aria-hidden="true">✕</span>{/if}
						</label>
					</li>
				{/each}
			</ul>
		</fieldset>
		{#if chosen !== null}
			<p class="cert-practice-feedback" class:cert-tone-ok={correct} class:cert-tone-bad={!correct} role="status" data-testid="cert-practice-feedback">
				<span aria-hidden="true">{correct ? '✓' : '✕'}</span>
				{correct ? 'Right.' : `Not quite. The answer is: ${question.options[question.answer]}.`}
				{#if question.explain}<span class="cert-practice-explain">{question.explain}</span>{/if}
			</p>
			<div class="cert-actions">
				<button type="button" class="btn cert-btn" onclick={next} data-testid="cert-practice-next">{index + 1 >= questions.length ? 'See my score' : 'Next question'}</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.cert-practice-count {
		margin: 0 0 0.5rem;
	}
	.cert-practice-q {
		border: 0;
		padding: 0;
		margin: 0 0 0.6rem;
		min-width: 0;
	}
	.cert-practice-prompt {
		padding: 0;
		font-weight: 700;
		font-size: 1.05rem;
		line-height: 1.4;
		margin-bottom: 0.5rem;
	}
	.cert-practice-options {
		margin: 0;
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
	.is-right .cert-choice-word {
		color: var(--green);
		font-weight: 700;
	}
	.cert-practice-feedback {
		margin: 0.5rem 0 0.75rem;
		line-height: 1.45;
	}
	.cert-practice-explain {
		display: block;
		color: var(--text-1);
		margin-top: 0.2rem;
	}
	.cert-practice-score {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 1rem;
		margin: 0 0 0.75rem;
	}
	.cert-practice-figure {
		font-family: var(--font-mono);
		font-size: 1.6rem;
		color: var(--green);
	}
</style>
