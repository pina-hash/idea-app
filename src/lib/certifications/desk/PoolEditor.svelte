<script lang="ts">
	/**
	 * THE EXAM POOL EDITOR, the one place an admin reads answer keys
	 * (`cert_exam_pool_get`). A table of questions with topic, type, prompt,
	 * options with keys, the answer per type, active; add and remove rows; Save
	 * pool posts the whole pool as JSON to `savePool`, which calls
	 * `cert_exam_pool_replace` (rows absent are deactivated, never deleted).
	 * The summary by topic and the 2x rule are said in words beside the key.
	 */
	import { QUESTION_TYPES, type ExamQuestion, type ExamTopic } from '$lib/certifications/types';
	import {
		ANSWER_HELP,
		QUESTION_TYPE_WORDS,
		answerToText,
		emptyQuestion,
		normalizePool,
		poolRuleWords,
		poolSummaryOf,
		textToAnswer,
		type DeskFormResult
	} from './desk';

	let {
		questions = $bindable(),
		topics,
		questionsPerExam,
		result = null,
		action = '?/savePool'
	}: {
		questions: ExamQuestion[];
		topics: ExamTopic[];
		questionsPerExam: number;
		result?: DeskFormResult | null;
		action?: string;
	} = $props();

	const summary = $derived(poolSummaryOf(questions));
	const payload = $derived(JSON.stringify(normalizePool(questions)));
	const shortTopics = $derived(topics.filter((t) => (summary.by_topic[t.id] ?? 0) < t.minimum));
	const enough = $derived(summary.total >= questionsPerExam * 2 && shortTopics.length === 0);

	/** The answer text per row, kept as typed so a half-typed key is not reparsed under the cursor. */
	// svelte-ignore state_referenced_locally
	let answerText = $state<string[]>(questions.map((q) => answerToText(q.type, q.answer)));

	function add() {
		questions = [...questions, emptyQuestion(topics[0]?.id ?? '')];
		answerText = [...answerText, 'a'];
	}
	function remove(i: number) {
		questions = questions.filter((_, j) => j !== i);
		answerText = answerText.filter((_, j) => j !== i);
	}
	function retype(i: number) {
		const q = questions[i];
		if (q.type === 'multiple_choice' || q.type === 'multiple_select') {
			if (!q.options?.length) q.options = [{ key: 'a', text: '' }, { key: 'b', text: '' }];
		} else {
			q.options = null;
		}
		answerText[i] = answerToText(q.type, q.type === 'short' ? { accept: [] } : q.type === 'numeric' ? { value: 0, tolerance: 0 } : q.type === 'multiple_select' ? [] : 'a');
		q.answer = textToAnswer(q.type, answerText[i]);
	}
	function setAnswer(i: number, text: string) {
		answerText[i] = text;
		questions[i].answer = textToAnswer(questions[i].type, text);
	}
	function addOption(i: number) {
		const q = questions[i];
		const used = new Set((q.options ?? []).map((o) => o.key));
		const next = 'abcdefgh'.split('').find((k) => !used.has(k));
		if (!next) return;
		q.options = [...(q.options ?? []), { key: next, text: '' }];
	}
	function removeOption(i: number, j: number) {
		const q = questions[i];
		q.options = (q.options ?? []).filter((_, k) => k !== j);
	}
</script>

<div class="dk-pool" data-testid="cert-pool">
	<p class="cert-help" data-testid="cert-pool-rule">{poolRuleWords(questionsPerExam)}</p>
	<div class="cert-readouts" data-testid="cert-pool-summary">
		<span class="cert-readout {enough ? 'is-ok' : 'is-warn'}"><span aria-hidden="true">{enough ? '✓' : '!'}</span>{summary.total} active question{summary.total === 1 ? '' : 's'} of {questionsPerExam * 2} needed</span>
		{#each topics as t (t.id)}
			{@const n = summary.by_topic[t.id] ?? 0}
			<span class="cert-readout {n < t.minimum ? 'is-warn' : ''}"><span aria-hidden="true">{n < t.minimum ? '!' : '✓'}</span>{t.name}: {n} of at least {t.minimum}</span>
		{/each}
	</div>

	<ol class="dk-items" data-testid="cert-pool-rows">
		{#each questions as q, i (i)}
			<li class="dk-item" data-testid="cert-pool-row" data-active={q.active ? 'yes' : 'no'}>
				<div class="dk-item-head">
					<span class="dk-item-title">Question {i + 1}{q.id ? '' : ' (new)'}</span>
					<div class="cert-actions">
						<label class="dk-switch"><input type="checkbox" bind:checked={q.active} /> Active</label>
						<button type="button" class="btn cert-btn secondary" onclick={() => remove(i)}>Remove</button>
					</div>
				</div>
				<div class="dk-fields">
					<label class="cert-field"><span>Topic</span>
						<select bind:value={q.topic}>
							{#each topics as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
							{#if !topics.some((t) => t.id === q.topic)}<option value={q.topic}>{q.topic} (not a topic of this revision)</option>{/if}
						</select>
					</label>
					<label class="cert-field"><span>Type</span>
						<select bind:value={q.type} onchange={() => retype(i)}>
							{#each QUESTION_TYPES as t (t)}<option value={t}>{QUESTION_TYPE_WORDS[t]}</option>{/each}
						</select>
					</label>
					<label class="cert-field dk-wide"><span>Prompt</span><textarea rows="2" bind:value={q.prompt}></textarea></label>
					{#if q.options}
						<div class="cert-field dk-wide">
							<span>Options</span>
							<ul class="dk-options">
								{#each q.options as opt, j (j)}
									<li class="dk-option">
										<input type="text" class="dk-option-key" bind:value={opt.key} maxlength="1" aria-label="Option key" />
										<input type="text" bind:value={opt.text} aria-label="Option text" />
										<button type="button" class="btn cert-btn secondary" onclick={() => removeOption(i, j)}>Remove</button>
									</li>
								{/each}
							</ul>
							<button type="button" class="btn cert-btn secondary" onclick={() => addOption(i)}>Add an option</button>
						</div>
					{/if}
					<label class="cert-field"><span>Answer key</span>
						<input type="text" value={answerText[i] ?? ''} oninput={(e) => setAnswer(i, (e.currentTarget as HTMLInputElement).value)} />
						<span class="cert-help">{ANSWER_HELP[q.type]}</span>
					</label>
					<label class="cert-field"><span>Explain (shown to nobody during the exam)</span><input type="text" bind:value={q.explain} /></label>
				</div>
			</li>
		{/each}
	</ol>
	<div class="cert-actions">
		<button type="button" class="btn cert-btn secondary" onclick={add} data-testid="cert-pool-add">Add a question</button>
	</div>

	<form method="post" {action} class="dk-pool-save">
		<input type="hidden" name="questions" value={payload} data-testid="cert-pool-payload" />
		<div class="cert-actions">
			<button type="submit" class="btn cert-btn" data-testid="cert-pool-save">Save pool</button>
			<span class="cert-help">Saving replaces the pool: a question removed here is kept but set inactive, never deleted, because a past exam may name it.</span>
		</div>
		{#if result}
			<p class="cert-notice {result.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-pool-result">
				<span class="cert-notice-glyph" aria-hidden="true">{result.ok ? '✓' : '!'}</span>
				<span>{result.message}</span>
			</p>
		{/if}
	</form>
</div>

<style>
	.dk-options {
		list-style: none;
		margin: 0 0 0.5rem;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	.dk-option {
		display: grid;
		grid-template-columns: 3rem minmax(0, 1fr) auto;
		gap: 0.4rem;
		align-items: center;
	}
	.dk-option input {
		min-height: 44px;
		font: inherit;
		color: var(--text-1);
		padding: 0.5rem 0.65rem;
		border-radius: var(--radius-control, 4px);
	}
	.dk-option-key {
		text-align: center;
		font-family: var(--font-mono);
	}
	.dk-pool-save {
		margin-top: 1rem;
		display: grid;
		gap: 0.5rem;
	}
</style>
