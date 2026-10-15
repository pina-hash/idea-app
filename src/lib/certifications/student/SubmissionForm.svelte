<script lang="ts">
	/**
	 * THE HAND-IN FORM (ledger 0391): one input per evidence item by kind
	 * (photo and file take the uploader, text a textarea, link a URL, youtube a
	 * YouTube URL normalized to an id), every required item required, every
	 * self-inspection box ticked, and a Submit key that is `aria-disabled`
	 * until all of that holds and says why (`submitProblems` in `./kit.ts` is
	 * the one predicate the key and the handler both read, so a press that
	 * does nothing cannot happen). It posts the `submit` action with the
	 * evidence and the self-inspection as JSON; the refusal renders here,
	 * verbatim, and a landed hand-in says so.
	 *
	 * The form still carries `method="POST" action="?/submit"`, so with
	 * scripting off the hidden fields reach the same action.
	 */
	import type { CertEvidenceFile, EvidenceItem, SubmissionPart } from '$lib/certifications/types';
	import type { CertActionPost } from './actions';
	import type { EvidenceUploader as Uploader } from './evidence-upload';
	import { buildEvidence, buildSelfInspection, emptyEvidenceValue, submitProblems, youtubeIdOf, type EvidenceValue } from './kit';
	import CertNotice from './CertNotice.svelte';
	import EvidenceUploader from './EvidenceUploader.svelte';

	let {
		attemptId,
		part,
		evidence,
		selfInspection,
		upload = null,
		post = null,
		onsubmitted = null
	}: {
		attemptId: string;
		part: SubmissionPart;
		evidence: EvidenceItem[];
		selfInspection: string[];
		upload?: Uploader | null;
		post?: CertActionPost | null;
		onsubmitted?: (() => void) | null;
	} = $props();

	const formId = $props.id();
	let values = $state<Record<number, EvidenceValue>>({});
	let checked = $state<boolean[]>([]);
	let sending = $state(false);
	let refusal = $state<string | null>(null);
	let landed = $state(false);
	let showProblems = $state(false);

	const valueAt = (i: number): EvidenceValue => values[i] ?? emptyEvidenceValue();
	function setText(i: number, text: string) {
		values = { ...values, [i]: { ...valueAt(i), text } };
	}
	function setFiles(i: number, files: CertEvidenceFile[]) {
		values = { ...values, [i]: { ...valueAt(i), files } };
	}
	function tick(i: number, on: boolean) {
		const next = selfInspection.map((_, k) => !!checked[k]);
		next[i] = on;
		checked = next;
	}

	const problems = $derived(submitProblems(evidence, values, selfInspection, checked));
	const complete = $derived(problems.length === 0);
	const built = $derived(buildEvidence(evidence, values));
	const inspection = $derived(buildSelfInspection(selfInspection, checked));

	async function onsubmit(event: SubmitEvent) {
		if (!complete) {
			event.preventDefault();
			showProblems = true;
			return;
		}
		if (!post) return; // the native post reaches the same action
		event.preventDefault();
		if (sending) return;
		sending = true;
		refusal = null;
		try {
			const answer = await post('submit', {
				attempt_id: attemptId,
				part,
				evidence: JSON.stringify(built),
				self_inspection: JSON.stringify(inspection)
			});
			if (!answer.ok) refusal = answer.message;
			else {
				landed = true;
				onsubmitted?.();
			}
		} finally {
			sending = false;
		}
	}
</script>

<form method="POST" action="?/submit" class="cert-submission" onsubmit={onsubmit} data-testid="cert-submission-form" data-part={part} data-complete={complete ? 'yes' : 'no'}>
	<input type="hidden" name="attempt_id" value={attemptId} />
	<input type="hidden" name="part" value={part} />
	<input type="hidden" name="evidence" value={JSON.stringify(built)} />
	<input type="hidden" name="self_inspection" value={JSON.stringify(inspection)} />

	{#if landed}
		<CertNotice tone="ok" title="Handed in." testId="cert-submission-landed">Your certifier has it. You will hear back here and by email.</CertNotice>
	{/if}

	<h4 class="cert-section-h">Evidence</h4>
	{#each evidence as item, i (i)}
		{@const v = valueAt(i)}
		<div class="cert-field cert-evidence-item" data-testid="cert-evidence-item" data-kind={item.kind} data-required={item.required ? 'yes' : 'no'}>
			{#if item.kind === 'photo' || item.kind === 'file'}
				<span id={`ev-${formId}-${i}`}>{item.label}{#if !item.required} <span class="cert-help">(optional)</span>{/if}</span>
				<EvidenceUploader label={item.label} kind={item.kind} files={v.files} {upload} onchange={(files) => setFiles(i, files)} />
			{:else if item.kind === 'text'}
				<label for={`ev-${formId}-${i}`}>{item.label}{#if !item.required} <span class="cert-help">(optional)</span>{/if}</label>
				<textarea id={`ev-${formId}-${i}`} class="plate-well" value={v.text} oninput={(e) => setText(i, (e.currentTarget as HTMLTextAreaElement).value)} maxlength="20000" data-testid="cert-evidence-text"></textarea>
			{:else if item.kind === 'link'}
				<label for={`ev-${formId}-${i}`}>{item.label}{#if !item.required} <span class="cert-help">(optional)</span>{/if}</label>
				<input id={`ev-${formId}-${i}`} class="plate-well" type="url" inputmode="url" placeholder="https://" value={v.text} oninput={(e) => setText(i, (e.currentTarget as HTMLInputElement).value)} data-testid="cert-evidence-link" />
			{:else}
				<label for={`ev-${formId}-${i}`}>{item.label}{#if !item.required} <span class="cert-help">(optional)</span>{/if}</label>
				<input id={`ev-${formId}-${i}`} class="plate-well" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=" value={v.text} oninput={(e) => setText(i, (e.currentTarget as HTMLInputElement).value)} data-testid="cert-evidence-youtube" />
				{#if v.text.trim()}
					{@const id = youtubeIdOf(v.text)}
					<span class="cert-help" data-testid="cert-evidence-youtube-check">{id ? `YouTube video ${id}. Upload it as unlisted, never private.` : 'That is not a YouTube link yet.'}</span>
				{/if}
			{/if}
		</div>
	{/each}

	{#if selfInspection.length > 0}
		<h4 class="cert-section-h">Self-inspection</h4>
		<ul class="cert-well cert-inspection" data-testid="cert-self-inspection">
			{#each selfInspection as line, i (i)}
				<li>
					<label class="cert-choice">
						<input type="checkbox" checked={!!checked[i]} onchange={(e) => tick(i, (e.currentTarget as HTMLInputElement).checked)} data-testid="cert-inspection-box" />
						<span class="cert-choice-word">{line}</span>
					</label>
				</li>
			{/each}
		</ul>
	{/if}

	{#if refusal}
		<CertNotice tone="bad" testId="cert-submission-refusal">{refusal}</CertNotice>
	{/if}

	<div class="cert-actions cert-submission-actions">
		<button type="submit" class="btn cert-btn" aria-disabled={!complete || sending} aria-describedby={`why-${formId}`} data-testid="cert-submit" data-complete={complete ? 'yes' : 'no'}>
			{sending ? 'Handing in' : 'Submit for review'}
		</button>
		<ul class="cert-submission-why" id={`why-${formId}`} data-testid="cert-submit-problems" aria-live="polite">
			{#if !complete}
				{#each problems as p, i (i)}
					<li class="cert-help" class:cert-tone-bad={showProblems}>{p}</li>
				{/each}
			{:else}
				<li class="cert-help cert-tone-ok">Everything is in. Submit when you are ready.</li>
			{/if}
		</ul>
	</div>
</form>

<style>
	.cert-submission {
		margin: 0.75rem 0 0;
	}
	.cert-evidence-item textarea,
	.cert-evidence-item input[type='url'] {
		width: 100%;
	}
	.cert-inspection {
		margin-bottom: 0.9rem;
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
		line-height: 1.4;
	}
	.cert-submission-actions {
		align-items: flex-start;
	}
	.cert-submission-why {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.15rem;
		flex: 1 1 14rem;
		min-width: 0;
	}
	.btn[aria-disabled='true'] {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
