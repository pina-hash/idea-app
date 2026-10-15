<script lang="ts">
	/**
	 * ONE SUBMISSION, DECIDED (the spec's Review screen). Two columns at 1440:
	 * the evidence on the left (text, links, the embedded video, pictures,
	 * files, the self-inspection), the spec and its acceptance criteria on the
	 * right; under them the decision: Pass or Fail as lit-able keys, feedback
	 * (required on Fail, optional on Pass: `REVIEW_FEEDBACK_REQUIRED`), and ONE
	 * Send key held by `reviewCanSend`, the same predicate the submit handler
	 * asks, so a press never does nothing. After a decision the page shows the
	 * result and a way back to the desk.
	 */
	import MarkdownText from '$lib/classroom/MarkdownText.svelte';
	import { REVIEW_FEEDBACK_REQUIRED } from '$lib/certifications/copy';
	import { CERT_PATHS, deskStudentHref } from '$lib/certifications/nav';
	import { formatCertDate, formatCertDateTime } from '$lib/certifications/status';
	import type { CertEvidenceFile, CertSubmissionJson, CheckoutSpec, ProjectSpec, ReviewDecision } from '$lib/certifications/types';
	import { SUBMISSION_READOUTS, partWord, personWords, reviewBlockedBecause, reviewCanSend, type DeskFormResult } from './desk';
	import EvidenceView from './EvidenceView.svelte';
	import Readout from './Readout.svelte';

	let {
		submission,
		student,
		certification,
		spec = null,
		checkout = null,
		result = null,
		action = '?/decide',
		evidenceSrc = undefined
	}: {
		submission: CertSubmissionJson;
		student: { email: string; name: string | null };
		certification: { code: string; name: string };
		/** The guided or autonomous project spec of the revision, for the right column. */
		spec?: ProjectSpec | null;
		/** The checkout card, for a checkout submission. */
		checkout?: CheckoutSpec | null;
		result?: DeskFormResult | null;
		action?: string;
		/** A harness's stand-in for the evidence route. */
		evidenceSrc?: ((file: CertEvidenceFile) => string) | undefined;
	} = $props();

	let decision = $state<ReviewDecision | null>(null);
	let feedback = $state('');
	const canSend = $derived(reviewCanSend({ decision, feedback }));
	const heldBecause = $derived(reviewBlockedBecause({ decision, feedback }));
	const decided = $derived(submission.state !== 'pending' || result?.ok === true);

	function onsubmit(event: Event) {
		if (!reviewCanSend({ decision, feedback })) event.preventDefault();
	}
</script>

<div class="dk-review" data-testid="cert-review" data-part={submission.part}>
	<header class="cert-titlebar">
		<div>
			<p class="eyebrow cert-eyebrow">Review</p>
			<h1 class="cert-title plate-title">{partWord(submission.part)}</h1>
			<p class="dk-row-meta">
				<a href={deskStudentHref(student.email)} data-testid="cert-review-student">{personWords(student)}</a>, {certification.code} {certification.name}, submitted {formatCertDateTime(submission.submitted_at)}{#if submission.in_person}, recorded in person{/if}
			</p>
		</div>
		<Readout readout={SUBMISSION_READOUTS[submission.state]} testId="cert-review-state" />
	</header>

	<div class="dk-split">
		<section class="cert-panel" id="evidence" aria-labelledby="cert-review-evidence-h">
			<h2 id="cert-review-evidence-h">What was handed in</h2>
			<EvidenceView evidence={submission.evidence} selfInspection={submission.self_inspection} checkout={submission.part === 'checkout'} inPerson={submission.in_person} label="{partWord(submission.part)} evidence" srcOf={evidenceSrc} />
		</section>

		<aside class="cert-panel dk-split-sticky" id="spec" aria-labelledby="cert-review-spec-h" data-testid="cert-review-spec">
			<h2 id="cert-review-spec-h">{submission.part === 'checkout' ? 'Checkout card' : 'The spec'}</h2>
			{#if submission.part === 'checkout'}
				{#if checkout?.card}
					<div class="cert-prose"><MarkdownText body={checkout.card} /></div>
				{:else}
					<p class="dk-empty">This revision has no checkout card.</p>
				{/if}
			{:else if spec}
				{#if spec.objective}<p><strong>{spec.objective}</strong></p>{/if}
				{#if spec.spec}<div class="cert-prose"><MarkdownText body={spec.spec} /></div>{/if}
				{#if spec.acceptance.length}
					<h3 class="cert-section-h">Acceptance criteria</h3>
					<ul class="cert-checklist" data-testid="cert-review-acceptance">
						{#each spec.acceptance as line, i (i)}
							<li class="cert-check-row"><span class="cert-check-glyph" aria-hidden="true">{i + 1}</span><div>{line}</div><span></span></li>
						{/each}
					</ul>
				{/if}
				{#if spec.references.length}
					<h3 class="cert-section-h">References</h3>
					<ul class="cert-well">
						{#each spec.references as ref (ref.href)}
							<li class="dk-file-row"><span>{ref.label || ref.href}</span><a class="btn cert-btn secondary" href={ref.href} target="_blank" rel="noopener noreferrer">Open</a></li>
						{/each}
					</ul>
				{/if}
			{:else}
				<p class="dk-empty">This revision has no spec for this part.</p>
			{/if}
		</aside>
	</div>

	<section class="cert-panel" id="decision" aria-labelledby="cert-review-decision-h" data-testid="cert-review-decision">
		<h2 id="cert-review-decision-h">Decision</h2>
		{#if decided}
			{@const review = submission.review}
			<p class="cert-notice cert-notice-ok" role="status" data-testid="cert-review-done">
				<span class="cert-notice-glyph" aria-hidden="true">✓</span>
				<span>
					{#if review}
						{review.decision === 'pass' ? 'Passed' : 'Failed'} by {review.reviewer_name ?? 'a certifier'} on {formatCertDate(review.reviewed_at)}.{#if review.feedback} Feedback: {review.feedback}{/if}
					{:else}
						{result?.message ?? 'The decision was recorded and the student was told.'}
					{/if}
				</span>
			</p>
			<div class="cert-actions">
				<a class="btn cert-btn" href={CERT_PATHS.desk} data-testid="cert-review-back">Back to desk</a>
				<a class="btn cert-btn secondary" href={deskStudentHref(student.email)}>Open the student</a>
			</div>
		{:else}
			<form method="post" {action} {onsubmit} data-testid="cert-review-form">
				<div class="dk-choice" role="group" aria-label="Pass or fail">
					<button type="button" class="btn cert-btn {decision === 'pass' ? 'on' : 'secondary'}" aria-pressed={decision === 'pass'} data-testid="cert-review-pass" onclick={() => (decision = 'pass')}>Pass</button>
					<button type="button" class="btn cert-btn {decision === 'fail' ? 'on' : 'secondary'}" aria-pressed={decision === 'fail'} data-testid="cert-review-fail" onclick={() => (decision = 'fail')}>Fail</button>
				</div>
				<input type="hidden" name="decision" value={decision ?? ''} />
				<label class="cert-field">
					<span>Feedback{decision === 'fail' ? ' (required)' : decision === 'pass' ? ' (optional)' : ''}</span>
					<textarea name="feedback" rows="5" bind:value={feedback} data-testid="cert-review-feedback" placeholder="What was done well, and what to do differently next time."></textarea>
				</label>
				<p class="cert-help">{REVIEW_FEEDBACK_REQUIRED}</p>
				{#if result && !result.ok}
					<p class="cert-notice cert-notice-bad" role="alert" data-testid="cert-review-refusal">
						<span class="cert-notice-glyph" aria-hidden="true">!</span>
						<span>{result.message}</span>
					</p>
				{/if}
				<div class="cert-actions">
					<button type="submit" class="btn cert-btn" aria-disabled={canSend ? undefined : 'true'} data-testid="cert-review-send">Send decision</button>
					{#if heldBecause}<span class="dk-held" data-testid="cert-review-held">{heldBecause}</span>{/if}
				</div>
			</form>
		{/if}
	</section>
</div>
