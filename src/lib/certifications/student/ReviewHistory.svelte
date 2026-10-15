<script lang="ts">
	/**
	 * Every past hand-in of one part with its review (ledger 0391): the
	 * submission's date and state as a readout with a tone, what was handed in
	 * (files as downloads through the evidence route, links, the YouTube video
	 * embedded), and the review: decision as a readout with tone, the feedback
	 * VERBATIM, the reviewer's name and the date. Every review is kept and is
	 * visible to the student, per the spec.
	 */
	import { CERT_API } from '$lib/certifications/nav';
	import { formatCertDateTime } from '$lib/certifications/status';
	import type { CertSubmissionJson } from '$lib/certifications/types';

	let { submissions }: { submissions: CertSubmissionJson[] } = $props();

	/** The nocookie embed, WITHOUT autoplay: a past hand-in plays when pressed, never when the page opens. */
	const embedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&playsinline=1&modestbranding=1`;

	const stateWords = (s: CertSubmissionJson) =>
		s.state === 'pending' ? 'Waiting for review' : s.state === 'passed' ? 'Passed' : 'Not passed';
	const tone = (s: CertSubmissionJson) => (s.state === 'pending' ? 'is-warn' : s.state === 'passed' ? 'is-ok' : 'is-bad');
	const glyph = (s: CertSubmissionJson) => (s.state === 'pending' ? '…' : s.state === 'passed' ? '✓' : '✕');
</script>

{#if submissions.length > 0}
	<h4 class="cert-section-h">Hand-ins and reviews</h4>
	<ol class="cert-reviews" data-testid="cert-review-history">
		{#each submissions as s (s.id)}
			<li class="cert-review" data-testid="cert-review" data-state={s.state}>
				<div class="cert-review-head">
					<span class="cert-readout {tone(s)}"><span aria-hidden="true">{glyph(s)}</span> {stateWords(s)}</span>
					<span class="cert-review-when">{s.in_person ? 'Watched in person' : 'Handed in'} {formatCertDateTime(s.submitted_at)}</span>
				</div>
				{#if !s.in_person}
					<div class="cert-review-evidence">
						{#if s.evidence.text}<p class="cert-review-text">{s.evidence.text}</p>{/if}
						{#if s.evidence.files.length > 0}
							<ul class="cert-review-files">
								{#each s.evidence.files as f (f.path)}
									<li><a class="cert-review-file" href={CERT_API.evidence(f.path)} download>{f.name} <span class="cert-help">(download)</span></a></li>
								{/each}
							</ul>
						{/if}
						{#if s.evidence.links.length > 0}
							<ul class="cert-review-files">
								{#each s.evidence.links as link (link)}
									<li><a class="cert-review-file" href={link} rel="noopener noreferrer">{link}</a></li>
								{/each}
							</ul>
						{/if}
						{#if s.evidence.youtube_id}
							<div class="cert-review-video">
								<iframe
									src={embedUrl(s.evidence.youtube_id)}
									title="Your submitted video"
									loading="lazy"
									referrerpolicy="no-referrer"
									allow="encrypted-media; picture-in-picture; fullscreen"
									allowfullscreen
								></iframe>
							</div>
						{/if}
					</div>
				{/if}
				{#if s.review}
					<div class="cert-review-decision" data-testid="cert-review-decision" data-decision={s.review.decision}>
						<span class="cert-readout {s.review.decision === 'pass' ? 'is-ok' : 'is-bad'}">
							<span aria-hidden="true">{s.review.decision === 'pass' ? '✓' : '✕'}</span> {s.review.decision === 'pass' ? 'Pass' : 'Fail'}
						</span>
						<span class="cert-review-who">{s.review.reviewer_name ?? 'A certifier'}, {formatCertDateTime(s.review.reviewed_at)}</span>
						{#if s.review.feedback}<p class="cert-review-feedback" data-testid="cert-review-feedback">{s.review.feedback}</p>{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ol>
{/if}

<style>
	.cert-reviews {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
	}
	.cert-review {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: 0.7rem 0.9rem;
		margin: 0 0 0.6rem;
	}
	.cert-review-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
	}
	.cert-review-when,
	.cert-review-who {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		letter-spacing: 0.04em;
		color: var(--text-2);
	}
	.cert-review-evidence {
		margin-top: 0.5rem;
	}
	.cert-review-text {
		margin: 0 0 0.5rem;
		white-space: pre-wrap;
		line-height: 1.45;
	}
	.cert-review-files {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cert-review-file {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		overflow-wrap: anywhere;
	}
	.cert-review-video {
		aspect-ratio: 16 / 9;
		max-width: 40rem;
		margin: 0.4rem 0 0;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		overflow: hidden;
	}
	.cert-review-video iframe {
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
	}
	.cert-review-decision {
		margin-top: 0.6rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--hairline);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
	}
	.cert-review-feedback {
		flex-basis: 100%;
		margin: 0.25rem 0 0;
		white-space: pre-wrap;
		line-height: 1.5;
	}
</style>
