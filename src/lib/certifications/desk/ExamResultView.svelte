<script lang="ts">
	/**
	 * A certifier's view of one exam sitting: the score, every focus flag
	 * with its time, and per question the topic, whether it was correct and
	 * the answer given. NEVER a key: `cert_exam_result` and `cert_student_view`
	 * return none, and nothing here could draw one.
	 */
	import { formatCertDateTime, formatCertTime } from '$lib/certifications/status';
	import type { CertExamSummary } from '$lib/certifications/types';
	import { EXAM_READOUTS } from './desk';
	import Readout from './Readout.svelte';

	let { exam }: { exam: CertExamSummary } = $props();

	const answerWords = (a: unknown): string => {
		if (a == null) return 'no answer';
		if (Array.isArray(a)) return a.join(', ');
		return String(a);
	};
</script>

<div class="dk-exam" data-testid="cert-exam-result">
	<div class="cert-readouts">
		<Readout readout={EXAM_READOUTS[exam.state]} />
		{#if exam.passed === true}<span class="cert-readout is-ok"><span aria-hidden="true">✓</span>Passed</span>{/if}
		{#if exam.passed === false}<span class="cert-readout is-bad"><span aria-hidden="true">x</span>Failed</span>{/if}
		<span class="cert-readout {exam.flags_count > 0 ? 'is-warn' : ''}"><span aria-hidden="true">!</span>{exam.flags_count} flag{exam.flags_count === 1 ? '' : 's'}</span>
	</div>
	<p class="dk-row-meta">
		Released {formatCertDateTime(exam.released_at)}{#if exam.started_at}, started {formatCertTime(exam.started_at)}{/if}{#if exam.submitted_at}, submitted {formatCertTime(exam.submitted_at)}{/if}
	</p>
	{#if exam.missed_topics.length}
		<p>Missed topics: {exam.missed_topics.join(', ')}</p>
	{/if}
	{#if exam.detail}
		{#if exam.detail.score}
			<p>
				<strong>{exam.detail.score.correct} of {exam.detail.score.total}</strong> correct.
			</p>
		{/if}
		{#if exam.detail.flags.length}
			<h4 class="cert-section-h">Focus flags</h4>
			<ul class="cert-well" data-testid="cert-exam-flags">
				{#each exam.detail.flags as flag, i (i)}
					<li class="dk-file-row"><span>{flag.kind.replace('_', ' ')}</span><span class="dk-row-meta">{formatCertTime(flag.at)}</span></li>
				{/each}
			</ul>
		{/if}
		{#if exam.detail.per_question.length}
			<h4 class="cert-section-h">Questions</h4>
			<div class="dk-table-wrap">
				<table class="dk-table cert-well" data-testid="cert-exam-questions">
					<thead><tr><th>#</th><th>Topic</th><th>Prompt</th><th>Answer given</th><th>Result</th></tr></thead>
					<tbody>
						{#each exam.detail.per_question as q (q.index)}
							<tr>
								<td class="dk-mono">{q.index + 1}</td>
								<td>{q.topic}</td>
								<td class="dk-cell-wrap">{q.prompt}</td>
								<td class="dk-cell-wrap">{answerWords(q.answer_given)}</td>
								<td>
									{#if q.correct}<span class="cert-readout is-ok"><span aria-hidden="true">✓</span>Correct</span>{:else}<span class="cert-readout is-bad"><span aria-hidden="true">x</span>Wrong</span>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</div>
