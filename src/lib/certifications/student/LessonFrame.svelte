<script lang="ts">
	/**
	 * An interactive HTML lesson inside the HTML assignment engine's frame
	 * (ledger 0391, DECISIONS D3): `HtmlAssignmentFrame` over the lesson route
	 * `/certifications/lesson/<id>`, which serves the bytes under `/hx/`'s own
	 * CSP and sandbox. READ-ONLY, with no answers controller: a lesson records
	 * nothing, so no write callback is handed down and the frame has no write
	 * to make (absence is the mechanism). "Mark lesson complete" is parent
	 * chrome, as Submit is on a worksheet, and calls `cert_lesson_complete`
	 * through the injected `rpc`.
	 *
	 * `cert_get`'s `lessons` carry no manifest, so the field map is built from
	 * an empty one: the frame keys nothing back to a block, which is exactly
	 * right for a document that stores no answer.
	 */
	import HtmlAssignmentFrame from '$lib/classroom/html-assignment/HtmlAssignmentFrame.svelte';
	import { htmlFieldToBlockId } from '$lib/classroom/html-assignment/mount';
	import { lessonDocumentHref } from '$lib/certifications/nav';
	import type { CertLessonRef, CertTrainingProgress, TrainingLessonItem } from '$lib/certifications/types';
	import { answerOf, type CertRpc } from './actions';
	import { trainingWords } from './kit';
	import CertNotice from './CertNotice.svelte';

	let {
		item,
		lesson,
		certId,
		manifest = null,
		progress = null,
		rpc = null,
		onreported = null,
		documentHref = lessonDocumentHref
	}: {
		item: TrainingLessonItem;
		lesson: CertLessonRef | null;
		certId: string;
		manifest?: unknown;
		progress?: CertTrainingProgress | null;
		rpc?: CertRpc | null;
		onreported?: ((trainingDone: boolean) => void) | null;
		/** Where a lesson's bytes come from; the real route by default, a dev stand-in on the harness. */
		documentHref?: (lessonId: string) => string;
	} = $props();

	const words = $derived(trainingWords(progress, 'lesson'));
	const fieldToBlockId = $derived(htmlFieldToBlockId(manifest ?? {}));

	let sending = $state(false);
	let refusal = $state<string | null>(null);
	let done = $state(false);

	async function complete() {
		if (!rpc || sending) return;
		sending = true;
		refusal = null;
		try {
			const answer = answerOf(await rpc('cert_lesson_complete', { p_cert: certId, p_slug: item.slug }));
			if (!answer.ok) refusal = answer.message;
			else {
				done = true;
				onreported?.(answer.data?.training_done === true);
			}
		} finally {
			sending = false;
		}
	}
</script>

<article class="cert-lesson" data-testid="cert-lesson" data-key={item.key} data-done={words.done || done ? 'yes' : 'no'}>
	<h3 class="cert-lesson-h">
		{item.title}
		<span class="cert-readout" class:is-ok={words.done || done} data-testid="cert-lesson-progress">
			{#if words.done || done}<span aria-hidden="true">✓</span> Done{:else}{words.word}{/if}
		</span>
	</h3>
	{#if lesson}
		<div class="cert-lesson-stage">
			<HtmlAssignmentFrame src={documentHref(lesson.id)} title={lesson.title} {fieldToBlockId} readOnly={true} values={{}} images={{}} />
		</div>
	{:else}
		<CertNotice tone="quiet" testId="cert-lesson-missing">This lesson is not in the kit yet. Ask your certifier about it.</CertNotice>
	{/if}
	{#if refusal}
		<CertNotice tone="bad" testId="cert-lesson-refusal">{refusal}</CertNotice>
	{/if}
	{#if rpc && lesson && !(words.done || done)}
		<div class="cert-actions">
			<button type="button" class="btn cert-btn" onclick={complete} aria-disabled={sending} data-testid="cert-lesson-complete">
				{sending ? 'Marking' : 'Mark lesson complete'}
			</button>
		</div>
	{/if}
</article>

<style>
	.cert-lesson {
		margin: 0 0 1.25rem;
	}
	.cert-lesson-h {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		margin: 0 0 0.6rem;
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
	}
	.cert-lesson-h::before {
		content: none;
	}
	.cert-lesson-stage {
		margin: 0 0 0.75rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		overflow: hidden;
	}
</style>
