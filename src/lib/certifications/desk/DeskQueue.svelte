<script lang="ts">
	/**
	 * THE TOP OF THE DESK: the review queue, oldest first, then the pending
	 * seat requests. A row is a person, their certification, the part, how
	 * long it has waited in words, and one key: Review to the submission, or
	 * Open to the sittings page where a request is approved or declined. The
	 * student's address rides on the Review link (`?student=`) because the
	 * review load reads the submission through that student's view.
	 */
	import { CERT_PATHS, deskReviewHref, deskStudentHref } from '$lib/certifications/nav';
	import { formatCertDateTime } from '$lib/certifications/status';
	import type { DeskJson } from '$lib/certifications/types';
	import { partWord, personWords, waitedSentence } from './desk';

	let { desk }: { desk: DeskJson | null } = $props();

	const queue = $derived([...(desk?.queue ?? [])].sort((a, b) => b.waited_seconds - a.waited_seconds));
	const requests = $derived(desk?.requests ?? []);
</script>

<section class="cert-panel" id="queue" data-testid="cert-desk-queue">
	<h2>Review queue</h2>
	{#if queue.length === 0}
		<p class="dk-empty" data-testid="cert-desk-queue-empty">Nothing is waiting for review.</p>
	{:else}
		<ol class="cert-well">
			{#each queue as row (row.submission_id)}
				<li class="dk-row" data-testid="cert-queue-row" data-part={row.part}>
					<div class="dk-row-main">
						<a class="dk-row-name tap-reach-44" href={deskStudentHref(row.student.email)}>{personWords(row.student)}</a>
						<span class="dk-row-meta">{row.certification.code} {row.certification.name}</span>
						<span class="cert-readout"><span aria-hidden="true">{row.in_person ? '•' : '>'}</span>{partWord(row.part)}{row.in_person ? ', in person' : ''}</span>
						<span class="dk-row-meta" data-testid="cert-queue-waited">{waitedSentence(row.waited_seconds)}</span>
					</div>
					<div class="cert-actions">
						<a class="btn cert-btn" href="{deskReviewHref(row.submission_id)}?student={encodeURIComponent(row.student.email)}" data-testid="cert-queue-review">Review</a>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<section class="cert-panel" id="requests" data-testid="cert-desk-requests">
	<h2>Sitting requests</h2>
	{#if requests.length === 0}
		<p class="dk-empty" data-testid="cert-desk-requests-empty">No sitting requests are waiting.</p>
	{:else}
		<ol class="cert-well">
			{#each requests as row (row.seat_id)}
				<li class="dk-row" data-testid="cert-request-row">
					<div class="dk-row-main">
						<a class="dk-row-name tap-reach-44" href={deskStudentHref(row.student.email)}>{personWords(row.student)}</a>
						<span class="dk-row-meta">{row.certification.code} {row.certification.name}</span>
						<span class="dk-row-meta">requested {formatCertDateTime(row.requested_at)}</span>
						{#if row.note}<span class="dk-row-note">{row.note}</span>{/if}
					</div>
					<div class="cert-actions">
						<a class="btn cert-btn secondary" href="{CERT_PATHS.deskSittings}#requests" data-testid="cert-request-open">Open</a>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>
