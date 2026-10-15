<script lang="ts">
	/**
	 * ONE STUDENT'S EVERY CERTIFICATION AND EVERY PART, for a certifier (the
	 * spec's Student view). The attempt json is the student's own page's
	 * shape with a certifier's exam detail added, so what the student sees and
	 * what the certifier sees cannot drift. Every attempt is a panel: the
	 * certification, its state in words, dates, the checklist, submissions
	 * with their reviews and evidence, exam sittings with the full result
	 * folded in a Disclosure, the open seat, the award with its serial.
	 *
	 * THE KEYS: Review per pending submission (to the review page, carrying the
	 * student's address), Award when every part is done or waived and nothing
	 * is awarded yet, Record checkout in person when the checkout is the next
	 * pending part, and Release exam on an approved or booked seat. Each is a
	 * form posting the page's own action; absence of a form result is the
	 * normal state. A refusal renders verbatim beside the form it answered.
	 */
	import Disclosure from '$lib/Disclosure.svelte';
	import { deskAwardHref, deskReviewHref } from '$lib/certifications/nav';
	import { allPartsDone, nextPart } from '$lib/certifications/parts';
	import { formatCertDate, formatCertDateTime } from '$lib/certifications/status';
	import type { CertAttemptJson, CertEvidenceFile } from '$lib/certifications/types';
	import {
		ATTEMPT_READOUTS,
		AWARD_READOUTS,
		SEAT_READOUTS,
		SUBMISSION_READOUTS,
		partWord,
		personWords,
		type DeskFormResult,
		type StudentViewJson
	} from './desk';
	import Checklist from './Checklist.svelte';
	import EvidenceView from './EvidenceView.svelte';
	import ExamResultView from './ExamResultView.svelte';
	import Readout from './Readout.svelte';

	let {
		view,
		callerEmail = null,
		inPersonResult = null,
		releaseResult = null,
		offerActions = true,
		evidenceSrc = undefined
	}: {
		view: StudentViewJson;
		callerEmail?: string | null;
		inPersonResult?: DeskFormResult | null;
		releaseResult?: DeskFormResult | null;
		/** False removes every write control (a harness, or a view of yourself). */
		offerActions?: boolean;
		/** A harness's stand-in for the evidence route. */
		evidenceSrc?: ((file: CertEvidenceFile) => string) | undefined;
	} = $props();

	const self = $derived(!!callerEmail && callerEmail.trim().toLowerCase() === view.email.trim().toLowerCase());
	const acts = $derived(offerActions && !self);
	const student = $derived({ email: view.email, name: view.name });

	const checkoutNext = (a: CertAttemptJson) =>
		a.parts.checkout && nextPart(a.checks) === 'checkout' && (a.state === 'active' || a.state === 'dormant');
	const awardReady = (a: CertAttemptJson) => !a.award && allPartsDone(a.checks) && (a.state === 'active' || a.state === 'dormant');
	const releaseReady = (a: CertAttemptJson) => !!a.seat && (a.seat.state === 'approved' || a.seat.state === 'booked');

	let decision = $state<Record<string, 'pass' | 'fail'>>({});
	let feedback = $state<Record<string, string>>({});
	const inPersonCanSend = (id: string) => decision[id] === 'pass' || (decision[id] === 'fail' && (feedback[id] ?? '').trim().length > 0);
</script>

<div class="dk-student" data-testid="cert-student-view">
	<header class="cert-titlebar">
		<div>
			<p class="eyebrow cert-eyebrow">Student</p>
			<h1 class="cert-title plate-title" data-testid="cert-student-name">{personWords(student)}</h1>
			<p class="dk-row-meta">{view.email}</p>
		</div>
		<div class="cert-readouts">
			<span class="cert-readout"><span aria-hidden="true">#</span>{view.attempts.length} attempt{view.attempts.length === 1 ? '' : 's'}</span>
			<span class="cert-readout is-ok"><span aria-hidden="true">✓</span>{view.awards.length} award{view.awards.length === 1 ? '' : 's'}</span>
		</div>
	</header>

	{#if view.attempts.length === 0}
		<p class="dk-empty" data-testid="cert-student-empty">This student has not started a certification.</p>
	{/if}

	{#each view.attempts as attempt (attempt.id)}
		<section class="cert-panel" id="attempt-{attempt.id}" data-testid="cert-attempt" data-state={attempt.state}>
			<div class="cert-titlebar">
				<h2 class="dk-attempt-title">
					<span class="dk-subbar-code">{attempt.certification.code}</span> {attempt.certification.name}
					<span class="dk-row-meta">Level {attempt.certification.level}, {attempt.certification.category}</span>
				</h2>
				<Readout readout={ATTEMPT_READOUTS[attempt.state]} testId="cert-attempt-state" />
			</div>
			<p class="dk-row-meta">
				Started {formatCertDate(attempt.started_at)}, last activity {formatCertDateTime(attempt.last_activity_at)}{#if attempt.finished_at}, finished {formatCertDate(attempt.finished_at)}{/if}{#if attempt.withdrawn_at}, withdrawn {formatCertDate(attempt.withdrawn_at)}{/if}{#if attempt.dormant_at}, dormant since {formatCertDate(attempt.dormant_at)}{/if}
			</p>

			<h3 class="cert-section-h">Checklist</h3>
			<Checklist checks={attempt.checks} />

			{#if attempt.award}
				<h3 class="cert-section-h">Award</h3>
				<p data-testid="cert-attempt-award">
					<span class="cert-serial">{attempt.award.serial}</span>
					<Readout readout={AWARD_READOUTS[attempt.award.status]} />
					<span class="dk-row-meta">awarded {formatCertDate(attempt.award.awarded_at)}{#if attempt.award.expires_at}, expires {formatCertDate(attempt.award.expires_at)}{/if}</span>
				</p>
			{/if}

			{#if attempt.cooldown_until}
				<p class="cert-notice cert-notice-quiet" data-testid="cert-attempt-cooldown">
					<span class="cert-notice-glyph" aria-hidden="true">i</span>
					<span>Exam cooldown until {formatCertDateTime(attempt.cooldown_until)}.</span>
				</p>
			{/if}

			{#if attempt.seat}
				<h3 class="cert-section-h">Exam seat</h3>
				<div class="dk-row" data-testid="cert-attempt-seat">
					<div class="dk-row-main">
						<Readout readout={SEAT_READOUTS[attempt.seat.state]} />
						<span class="dk-row-meta">requested {formatCertDateTime(attempt.seat.requested_at)}</span>
						{#if attempt.seat.scheduled_at}<span class="dk-row-meta">scheduled {formatCertDateTime(attempt.seat.scheduled_at)}</span>{/if}
						{#if attempt.seat.decision_note}<span class="dk-row-note">{attempt.seat.decision_note}</span>{/if}
					</div>
					{#if acts && releaseReady(attempt)}
						<form method="post" action="?/release" class="cert-actions" data-testid="cert-release-form">
							<input type="hidden" name="seat_id" value={attempt.seat.id} />
							<input type="hidden" name="attempt_id" value={attempt.id} />
							<button type="submit" class="btn cert-btn" data-testid="cert-release">Release exam</button>
						</form>
					{/if}
				</div>
				{#if releaseResult && releaseResult.data?.attempt_id === attempt.id}
					<p class="cert-notice {releaseResult.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-release-result">
						<span class="cert-notice-glyph" aria-hidden="true">{releaseResult.ok ? '✓' : '!'}</span>
						<span>{releaseResult.message}</span>
					</p>
				{/if}
			{/if}

			{#if attempt.submissions.length}
				<h3 class="cert-section-h">Submissions</h3>
				<ol class="cert-well">
					{#each attempt.submissions as sub (sub.id)}
						{@const r = SUBMISSION_READOUTS[sub.state]}
						<li class="dk-sub" data-testid="cert-submission" data-state={sub.state}>
							<div class="dk-row">
								<div class="dk-row-main">
									<strong>{partWord(sub.part)}</strong>
									<Readout readout={r} />
									<span class="dk-row-meta">submitted {formatCertDateTime(sub.submitted_at)}{#if sub.in_person} in person{/if}</span>
									{#if sub.review}
										<span class="dk-row-note">
											{sub.review.decision === 'pass' ? 'Passed' : 'Failed'} by {sub.review.reviewer_name ?? 'a certifier'} on {formatCertDate(sub.review.reviewed_at)}{#if sub.review.feedback}: {sub.review.feedback}{/if}
										</span>
									{/if}
								</div>
								{#if acts && sub.state === 'pending'}
									<div class="cert-actions">
										<a class="btn cert-btn" href="{deskReviewHref(sub.id)}?student={encodeURIComponent(view.email)}" data-testid="cert-student-review">Review</a>
									</div>
								{/if}
							</div>
							<Disclosure label="Evidence" scope="cert-sub-{sub.id}" collapseWhen={true}>
								<EvidenceView evidence={sub.evidence} selfInspection={sub.self_inspection} checkout={sub.part === 'checkout'} inPerson={sub.in_person} label="{partWord(sub.part)} evidence" srcOf={evidenceSrc} />
							</Disclosure>
						</li>
					{/each}
				</ol>
			{/if}

			{#if attempt.exams.length}
				<h3 class="cert-section-h">Exam sittings</h3>
				<ol class="cert-well">
					{#each attempt.exams as exam (exam.id)}
						<li class="dk-sub" data-testid="cert-exam">
							<div class="dk-row-main">
								<strong>{formatCertDate(exam.released_at)}</strong>
								{#if exam.passed === true}<span class="cert-readout is-ok"><span aria-hidden="true">✓</span>Passed</span>{:else if exam.passed === false}<span class="cert-readout is-bad"><span aria-hidden="true">x</span>Failed</span>{:else}<span class="cert-readout">{exam.state.replace('_', ' ')}</span>{/if}
								<span class="dk-row-meta">{exam.flags_count} flag{exam.flags_count === 1 ? '' : 's'}</span>
								{#if exam.missed_topics.length}<span class="dk-row-meta">missed: {exam.missed_topics.join(', ')}</span>{/if}
							</div>
							<Disclosure label="Full result" scope="cert-exam-{exam.id}" collapseWhen={true}>
								<ExamResultView {exam} />
							</Disclosure>
						</li>
					{/each}
				</ol>
			{/if}

			{#if acts && (awardReady(attempt) || checkoutNext(attempt))}
				<h3 class="cert-section-h">Next</h3>
				<div class="cert-actions">
					{#if awardReady(attempt)}
						<a class="btn cert-btn" href="{deskAwardHref(attempt.id)}?student={encodeURIComponent(view.email)}" data-testid="cert-student-award">Award</a>
					{/if}
					{#if checkoutNext(attempt)}
						<Disclosure label="Record checkout in person" scope={null} collapseWhen={true} testId="cert-in-person-toggle">
							<form method="post" action="?/inPerson" class="dk-in-person" data-testid="cert-in-person-form" onsubmit={(e) => { if (!inPersonCanSend(attempt.id)) e.preventDefault(); }}>
								<input type="hidden" name="attempt_id" value={attempt.id} />
								<p class="cert-help">You watched this student perform the checkout cold, start to finish, with no help.</p>
								<div class="dk-choice" role="group" aria-label="Decision">
									<button type="button" class="btn cert-btn {decision[attempt.id] === 'pass' ? 'on' : 'secondary'}" aria-pressed={decision[attempt.id] === 'pass'} onclick={() => (decision = { ...decision, [attempt.id]: 'pass' })}>Pass</button>
									<button type="button" class="btn cert-btn {decision[attempt.id] === 'fail' ? 'on' : 'secondary'}" aria-pressed={decision[attempt.id] === 'fail'} onclick={() => (decision = { ...decision, [attempt.id]: 'fail' })}>Fail</button>
								</div>
								<input type="hidden" name="decision" value={decision[attempt.id] ?? ''} />
								<label class="cert-field">
									<span>Feedback{decision[attempt.id] === 'fail' ? ' (required on a fail)' : ' (optional on a pass)'}</span>
									<textarea name="feedback" bind:value={feedback[attempt.id]} rows="4"></textarea>
								</label>
								<button type="submit" class="btn cert-btn" aria-disabled={inPersonCanSend(attempt.id) ? undefined : 'true'} data-testid="cert-in-person-send">Record checkout</button>
								{#if !inPersonCanSend(attempt.id)}<p class="dk-held">{decision[attempt.id] ? 'A fail needs written feedback before it can be recorded.' : 'Choose Pass or Fail first.'}</p>{/if}
								{#if inPersonResult && inPersonResult.data?.attempt_id === attempt.id}
									<p class="cert-notice {inPersonResult.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-in-person-result">
										<span class="cert-notice-glyph" aria-hidden="true">{inPersonResult.ok ? '✓' : '!'}</span>
										<span>{inPersonResult.message}</span>
									</p>
								{/if}
							</form>
						</Disclosure>
					{/if}
				</div>
			{/if}
		</section>
	{/each}

	{#if view.awards.length}
		<section class="cert-panel" id="awards" data-testid="cert-student-awards">
			<h2>Awards</h2>
			<ul class="cert-well">
				{#each view.awards as award (award.id)}
					<li class="dk-row">
						<div class="dk-row-main">
							<span class="cert-serial">{award.serial}</span>
							<span><strong>{award.code}</strong> {award.name}</span>
							<Readout readout={AWARD_READOUTS[award.status]} />
							<span class="dk-row-meta">awarded {formatCertDate(award.awarded_at)} by {award.awarded_by_name}{#if award.expires_at}, expires {formatCertDate(award.expires_at)}{/if}</span>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.dk-attempt-title {
		font-family: var(--font-display);
		font-size: 1.15rem;
		letter-spacing: 0;
		text-transform: none;
		color: var(--text-1);
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		align-items: baseline;
	}
	.dk-sub {
		padding: 0.5rem 0;
	}
	.dk-in-person {
		display: grid;
		gap: 0.5rem;
		min-width: min(100%, 28rem);
	}
</style>
