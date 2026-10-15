<script lang="ts">
	/**
	 * The exam section of the kit (ledger 0391): the exam's configuration in
	 * words (topics, how many questions, the time limit), the lockdown
	 * sentence, and the seat: open windows as rows with a Sign up key, a
	 * Request a time form with a note, the booked or approved seat with its
	 * time and a Cancel, the released exam as one link ("Open my exam"), the
	 * cooldown sentence with its date, and past attempts as rows (date, then
	 * Passed or "Not passed: <topics>"; never a question, never a key).
	 *
	 * A seat control is offered only when `cert_seat_request` would take it
	 * (guided done or waived, no cooldown, no open seat, an open attempt), and
	 * otherwise the reason is said in words with no key under it.
	 */
	import { COOLDOWN_SENTENCE, EXAM_LOCKDOWN_SENTENCE, EXAM_RELEASE_WAITING_SENTENCE } from '$lib/certifications/copy';
	import { examHref } from '$lib/certifications/nav';
	import { partUnlocked } from '$lib/certifications/parts';
	import { cooldownActive, formatCertDate, formatCertDateTime, formatCertTime } from '$lib/certifications/status';
	import type { CertGetJson } from '$lib/certifications/types';
	import type { CertActionPost } from './actions';
	import { examAttemptWords, openableExam } from './kit';
	import CertNotice from './CertNotice.svelte';

	let { cert, post = null }: { cert: CertGetJson; post?: CertActionPost | null } = $props();

	const exam = $derived(cert.package.exam);
	const attempt = $derived(cert.my_attempt);
	const topicNames = $derived(Object.fromEntries((exam?.topics ?? []).map((t) => [t.id, t.name])));
	const seat = $derived(cert.seat ?? attempt?.seat ?? null);
	const cooldown = $derived(cert.cooldown_until ?? attempt?.cooldown_until ?? null);
	const inCooldown = $derived(cooldownActive(cooldown));
	const open = $derived(!!attempt && (attempt.state === 'active' || attempt.state === 'dormant'));
	const examCheck = $derived(attempt?.checks.find((c) => c.part === 'exam') ?? null);
	const examDone = $derived(examCheck?.state === 'done');
	const unlocked = $derived(!!attempt && partUnlocked(attempt.checks, 'exam'));
	const liveSeat = $derived(seat && (seat.state === 'requested' || seat.state === 'approved' || seat.state === 'booked') ? seat : null);
	const released = $derived(openableExam(attempt));
	const pastExams = $derived((attempt?.exams ?? []).filter((e) => e.state === 'submitted' || e.state === 'expired').slice().sort((a, b) => Date.parse(b.released_at) - Date.parse(a.released_at)));
	const sittings = $derived(cert.sittings.filter((s) => s.state === 'open'));

	const seatWhy = $derived.by((): string | null => {
		if (examDone) return null;
		if (!open) return 'Start this certification to ask for an exam seat.';
		if (!unlocked) return 'The exam unlocks once the guided project is checked off.';
		if (inCooldown) return COOLDOWN_SENTENCE(formatCertDate(cooldown));
		if (liveSeat) return null;
		return null;
	});
	const canAsk = $derived(open && unlocked && !inCooldown && !liveSeat && !examDone);

	let note = $state('');
	let sending = $state<string | null>(null);
	let refusal = $state<string | null>(null);
	let armedCancel = $state(false);

	async function send(action: 'requestSeat' | 'cancelSeat', fields: Record<string, string>, event: SubmitEvent, key: string) {
		if (!post) return;
		event.preventDefault();
		if (sending) return;
		sending = key;
		refusal = null;
		try {
			const answer = await post(action, fields);
			if (!answer.ok) refusal = answer.message;
			else {
				note = '';
				armedCancel = false;
			}
		} finally {
			sending = null;
		}
	}
	const seatWords = (s: NonNullable<typeof liveSeat>) =>
		s.state === 'requested'
			? 'Requested, waiting for a certifier to set a time'
			: s.state === 'approved'
				? `Approved for ${formatCertDateTime(s.scheduled_at)}`
				: `Signed up for ${formatCertDateTime(s.scheduled_at)}`;
</script>

<div class="cert-exam" data-testid="cert-exam">
	{#if exam}
		<dl class="cert-facts cert-exam-facts">
			<dt>Questions</dt>
			<dd>{exam.questions_per_exam} drawn fresh for each sitting, covering every topic</dd>
			<dt>Time limit</dt>
			<dd>{exam.time_limit_minutes} minutes</dd>
			<dt>To pass</dt>
			<dd>100%</dd>
			<dt>Topics</dt>
			<dd>
				<ul class="cert-exam-topics" data-testid="cert-exam-topics">
					{#each exam.topics as t (t.id)}
						<li><span class="cert-readout">{t.name}</span> <span class="cert-help">at least {t.minimum}</span></li>
					{/each}
				</ul>
			</dd>
		</dl>
	{/if}
	<p class="cert-help cert-exam-lockdown" data-testid="cert-exam-lockdown">{EXAM_LOCKDOWN_SENTENCE}</p>

	{#if refusal}
		<CertNotice tone="bad" testId="cert-exam-refusal">{refusal}</CertNotice>
	{/if}

	{#if examDone}
		<CertNotice tone="ok" title="Exam passed." testId="cert-exam-done">
			{#if examCheck?.checked_at}Checked off {formatCertDateTime(examCheck.checked_at)}.{/if}
		</CertNotice>
	{:else if released}
		{#if liveSeat && liveSeat.state !== 'requested'}
			<!-- The seat the exam was released against stays in words above the key:
			     a student reading "Open my exam" still sees which sitting this is. -->
			<div class="cert-exam-seat" data-testid="cert-exam-seat" data-state={liveSeat.state}>
				<span class="cert-readout is-ok"><span aria-hidden="true">✓</span> {seatWords(liveSeat)}</span>
			</div>
		{/if}
		<div class="cert-exam-open" data-testid="cert-exam-released">
			<p class="cert-exam-open-words">Your proctor has released your exam.</p>
			<a class="btn cert-btn cert-exam-open-key" href={examHref(cert.code, released.id)} data-testid="cert-exam-open-key">{released.state === 'in_progress' ? 'Continue my exam' : 'Open my exam'}</a>
		</div>
	{:else if inCooldown}
		<CertNotice tone="warn" title="Exam cooldown" testId="cert-exam-cooldown">{COOLDOWN_SENTENCE(formatCertDate(cooldown))}</CertNotice>
	{:else if liveSeat}
		<div class="cert-exam-seat" data-testid="cert-exam-seat" data-state={liveSeat.state}>
			<span class="cert-readout {liveSeat.state === 'requested' ? 'is-warn' : 'is-ok'}"><span aria-hidden="true">{liveSeat.state === 'requested' ? '…' : '✓'}</span> {seatWords(liveSeat)}</span>
			{#if liveSeat.decision_note}<p class="cert-help">{liveSeat.decision_note}</p>{/if}
			{#if liveSeat.state !== 'requested'}<p class="cert-help">{EXAM_RELEASE_WAITING_SENTENCE}</p>{/if}
			<form method="POST" action="?/cancelSeat" onsubmit={(e) => send('cancelSeat', { seat_id: liveSeat.id }, e, 'cancel')} class="cert-exam-form">
				<input type="hidden" name="seat_id" value={liveSeat.id} />
				{#if armedCancel}
					<span class="cert-help">This gives the seat up. You can ask for another afterwards.</span>
					<button type="submit" class="btn danger cert-btn" aria-disabled={sending === 'cancel'} data-testid="cert-seat-cancel-confirm">Yes, cancel my seat</button>
					<button type="button" class="btn secondary cert-btn" onclick={() => (armedCancel = false)}>Keep it</button>
				{:else}
					<button type="button" class="btn secondary cert-btn" onclick={() => (armedCancel = true)} data-testid="cert-seat-cancel">Cancel my seat</button>
				{/if}
			</form>
		</div>
	{:else if seatWhy}
		<p class="cert-help cert-exam-why" data-testid="cert-exam-why">{seatWhy}</p>
	{/if}

	{#if canAsk}
		<h4 class="cert-section-h">Open windows</h4>
		{#if sittings.length > 0}
			<ul class="cert-well cert-sittings" data-testid="cert-sittings">
				{#each sittings as s (s.id)}
					{@const full = s.seats_taken >= s.seat_limit}
					<li class="cert-sitting" data-testid="cert-sitting">
						<div class="cert-sitting-when">
							<span class="cert-sitting-date">{formatCertDate(s.starts_at)}</span>
							<span class="cert-help">{formatCertTime(s.starts_at)} to {formatCertTime(s.ends_at)}{#if s.location}, {s.location}{/if}</span>
							{#if s.note}<span class="cert-help">{s.note}</span>{/if}
						</div>
						<span class="cert-readout" class:is-bad={full}>{full ? 'Full' : `${s.seat_limit - s.seats_taken} of ${s.seat_limit} seats left`}</span>
						<form method="POST" action="?/requestSeat" onsubmit={(e) => send('requestSeat', { attempt_id: attempt?.id ?? '', sitting_id: s.id, note: '' }, e, s.id)} class="cert-exam-form">
							<input type="hidden" name="attempt_id" value={attempt?.id ?? ''} />
							<input type="hidden" name="sitting_id" value={s.id} />
							<button type="submit" class="btn cert-btn" aria-disabled={full || sending === s.id} data-testid="cert-sitting-signup">{sending === s.id ? 'Signing up' : 'Sign up'}</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="cert-help">No windows are posted right now. Request a time instead.</p>
		{/if}

		<h4 class="cert-section-h">Request a time</h4>
		<form method="POST" action="?/requestSeat" onsubmit={(e) => send('requestSeat', { attempt_id: attempt?.id ?? '', sitting_id: '', note }, e, 'request')} class="cert-exam-request" data-testid="cert-seat-request">
			<input type="hidden" name="attempt_id" value={attempt?.id ?? ''} />
			<label class="cert-field">
				<span>A note for your certifier (when you are free, which room)</span>
				<textarea name="note" class="plate-well" bind:value={note} maxlength="1000"></textarea>
			</label>
			<div class="cert-actions">
				<button type="submit" class="btn cert-btn" aria-disabled={sending === 'request'} data-testid="cert-seat-request-key">{sending === 'request' ? 'Sending' : 'Request a time'}</button>
			</div>
		</form>
	{/if}

	{#if pastExams.length > 0}
		<h4 class="cert-section-h">Past attempts</h4>
		<ul class="cert-well cert-exam-past" data-testid="cert-exam-past">
			{#each pastExams as e (e.id)}
				<li class="cert-exam-row" data-testid="cert-exam-attempt" data-passed={e.passed === true ? 'yes' : e.passed === false ? 'no' : 'none'}>
					<span class="cert-exam-date">{formatCertDateTime(e.submitted_at ?? e.released_at)}</span>
					<span class="cert-readout {e.passed === true ? 'is-ok' : e.passed === false ? 'is-bad' : ''}">
						<span aria-hidden="true">{e.passed === true ? '✓' : e.passed === false ? '✕' : '·'}</span> {examAttemptWords(e, topicNames)}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.cert-exam-facts {
		margin: 0 0 0.9rem;
	}
	.cert-exam-topics {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.75rem;
	}
	.cert-exam-lockdown {
		margin: 0 0 0.9rem;
	}
	.cert-exam-open {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		margin: 0 0 1rem;
	}
	.cert-exam-open-words {
		margin: 0;
		font-weight: 700;
	}
	.cert-exam-open-key {
		font-size: 0.95rem;
		padding-inline: 1.4rem;
	}
	.cert-exam-seat {
		display: grid;
		gap: 0.4rem;
		margin: 0 0 1rem;
		justify-items: start;
	}
	.cert-exam-seat .cert-help {
		margin: 0;
	}
	.cert-exam-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.6rem;
		align-items: center;
		margin: 0;
	}
	.cert-exam-why {
		margin: 0 0 1rem;
	}
	.cert-sitting {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.9rem;
		min-height: 44px;
		padding: 0.5rem 0;
	}
	.cert-sitting-when {
		display: grid;
		flex: 1 1 12rem;
		min-width: 0;
	}
	.cert-sitting-date {
		font-weight: 700;
	}
	.cert-exam-request {
		margin: 0 0 1rem;
	}
	.cert-exam-request textarea {
		width: 100%;
		min-height: 5rem;
	}
	.cert-exam-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
		min-height: 44px;
		padding: 0.4rem 0;
	}
	/* A past attempt's readout names every missed topic, so it wraps: the
	   shared readout is nowrap and pushed the page 65px wide at 375. */
	.cert-exam-row .cert-readout {
		white-space: normal;
		min-width: 0;
	}
	.cert-exam-date {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.btn[aria-disabled='true'] {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
