<script lang="ts">
	/**
	 * A STUDENT APPLIES TO BECOME A TRUSTED PUBLISHER (report 6d076258, ledger
	 * 0360). `/foundry/apply` mounts this; the route owns the read and the one
	 * write.
	 *
	 * WHAT IT SAYS BEFORE ANYTHING IS ASKED: what trusted means (your apps go
	 * live when you submit them, and are still read afterwards), who reads the
	 * answers (the site administrators, by name), and that every question needs
	 * an answer. A student should know what they are asking for and who will see
	 * what they write before they write it.
	 *
	 * THE QUESTIONS ARE THE DATABASE'S AND ONLY THEIR WORDS ARRIVE. Whether one
	 * is a trick, which answers are red flags and the note to the reviewer are
	 * never in this payload (`foundry_publisher_status` does not project them),
	 * so nothing on this page can mark a question as special.
	 *
	 * ONE PREDICATE DRIVES THE BUTTON AND THE HANDLER (`publisherCanSend`), and
	 * the button is `aria-disabled`, never `disabled`, so pressing it early says
	 * which question still needs an answer. While the send is in flight it is
	 * genuinely `disabled`, the house split between an explanation and a busy
	 * state.
	 *
	 * NO DRAFT MIRROR, AND THAT IS A DECISION: the answers are a few sentences
	 * each and the page is one sitting. Recorded as open in the history entry.
	 */
	import ForgeStatus from './ForgeStatus.svelte';
	import {
		PUBLISHER_ANSWER_MAX,
		PUBLISHER_UNAVAILABLE_NOTE,
		publisherAnswersPayload,
		publisherCanSend,
		publisherDay,
		publisherLength,
		publisherRefusalSentence,
		publisherStanding,
		type FoundryPublisherStatus,
		type PublisherRead
	} from './publisher.ts';
	import type { FoundryPublisherTransports } from './transports.ts';

	let {
		read,
		apply = undefined,
		now,
		onApplied = undefined
	}: {
		read: PublisherRead<FoundryPublisherStatus>;
		apply?: FoundryPublisherTransports['apply'];
		/** Threaded from the route; a component reading its own clock disagrees with its load. */
		now: Date;
		onApplied?: () => void;
	} = $props();

	let answers = $state<Record<string, string>>({});
	let sending = $state(false);
	let problem = $state<string | null>(null);
	let problemFor = $state<string | null>(null);
	/** A send that landed, so the page reads "waiting" before any reload. */
	let sentAt = $state<string | null>(null);

	const status = $derived(read.state === 'ready' ? read.value : null);
	const questions = $derived(status?.questions ?? []);
	const standing = $derived(status ? publisherStanding(status, now) : null);
	const verdict = $derived(publisherCanSend(questions, answers));
	const showForm = $derived(
		!!status && sentAt === null && (standing === 'open' || standing === 'declined')
	);

	function focusQuestion(id: string | undefined | null) {
		if (!id || typeof document === 'undefined') return;
		const el = document.querySelector<HTMLElement>(`[data-question="${id}"] :is(input, textarea)`);
		el?.focus();
	}

	async function send() {
		if (sending) return;
		if (!verdict.ok) {
			problem = publisherRefusalSentence(verdict.reason);
			problemFor = verdict.questionId ?? null;
			focusQuestion(verdict.questionId);
			return;
		}
		if (!apply) return;
		sending = true;
		problem = null;
		problemFor = null;
		try {
			const r = await apply(publisherAnswersPayload(questions, answers));
			if (r.ok) {
				sentAt = r.submittedAt ?? now.toISOString();
				onApplied?.();
				return;
			}
			problem =
				r.reason === 'unavailable'
					? PUBLISHER_UNAVAILABLE_NOTE
					: r.reason
						? publisherRefusalSentence(r.reason, { until: r.until, limit: r.limit })
						: (r.message ?? publisherRefusalSentence(null));
			problemFor = r.questionId ?? null;
			focusQuestion(r.questionId);
		} catch (err) {
			problem = err instanceof Error ? err.message : publisherRefusalSentence(null);
		} finally {
			sending = false;
		}
	}
</script>

<section class="fdy-block fdy-apply" data-testid="foundry-publisher-apply">
	<h2>Apply to publish without waiting for review</h2>
	<p class="fdy-apply-lead">
		A trusted publisher's apps go live the moment they submit them, without waiting in the review
		queue. They still show up for the site administrators to read afterwards, and trust can be
		taken away. The site administrators read your answers, with your name and school address
		beside them.
	</p>

	{#if read.state === 'unavailable'}
		<p class="fdy-apply-note" data-testid="foundry-publisher-unavailable">
			{PUBLISHER_UNAVAILABLE_NOTE}
		</p>
	{:else if read.state === 'failed'}
		<p class="fdy-apply-problem" role="status">{read.message}</p>
	{:else if sentAt !== null || standing === 'pending'}
		<p class="fdy-apply-state" data-testid="foundry-publisher-state" data-standing="pending">
			<ForgeStatus tone="waiting" word="Waiting for a decision" />
			<span>
				Sent {publisherDay(sentAt ?? status?.application?.submitted_at)}. You will see the answer
				here, and on My apps.
			</span>
		</p>
	{:else if standing === 'trusted'}
		<p class="fdy-apply-state" data-testid="foundry-publisher-state" data-standing="trusted">
			<ForgeStatus tone="ok" word="Trusted publisher" />
			<span>Your apps already go live as soon as you submit them.</span>
		</p>
	{:else if standing === 'not_eligible'}
		<p class="fdy-apply-state" data-testid="foundry-publisher-state" data-standing="not_eligible">
			{publisherRefusalSentence('not_eligible')}
		</p>
	{:else if standing === 'cooldown'}
		<div class="fdy-apply-state" data-testid="foundry-publisher-state" data-standing="cooldown">
			<ForgeStatus tone="refused" word="Declined" />
			<span>{publisherRefusalSentence('cooldown', { until: status?.cooldown_until })}</span>
		</div>
		{#if status?.application?.decision_note}
			<p class="fdy-apply-decision">
				<span class="fdy-apply-label">What the reviewer said</span>
				<span class="fdy-apply-text">{status.application.decision_note}</span>
			</p>
		{/if}
	{/if}

	{#if showForm && status}
		{#if standing === 'declined'}
			<div class="fdy-apply-state" data-standing="declined">
				<ForgeStatus tone="refused" word="Last one declined" />
				<span>You can apply again now.</span>
			</div>
			{#if status.application?.decision_note}
				<p class="fdy-apply-decision">
					<span class="fdy-apply-label">What the reviewer said last time</span>
					<span class="fdy-apply-text">{status.application.decision_note}</span>
				</p>
			{/if}
		{/if}

		{#if questions.length === 0}
			<p class="fdy-apply-note">{publisherRefusalSentence('no_questions')}</p>
		{:else}
			<form
				class="fdy-apply-form"
				onsubmit={(e) => {
					e.preventDefault();
					void send();
				}}
			>
				{#each questions as q, i (q.id)}
					<fieldset
						class="fdy-apply-q"
						class:has-problem={problemFor === q.id}
						data-question={q.id}
					>
						<legend>
							<span class="fdy-apply-qn">{i + 1}.</span>
							{q.prompt}
						</legend>
						{#if q.kind === 'choice'}
							<div class="fdy-apply-choices">
								{#each q.choices as choice (choice)}
									<label class="fdy-apply-choice tap-44">
										<input
											type="radio"
											name="q-{q.id}"
											value={choice}
											checked={answers[q.id] === choice}
											onchange={() => (answers = { ...answers, [q.id]: choice })}
										/>
										<span>{choice}</span>
									</label>
								{/each}
							</div>
						{:else}
							<label class="fdy-apply-text-field">
								<span class="fdy-apply-sr">Your answer to question {i + 1}</span>
								<textarea
									rows="3"
									maxlength={PUBLISHER_ANSWER_MAX}
									value={answers[q.id] ?? ''}
									oninput={(e) => (answers = { ...answers, [q.id]: e.currentTarget.value })}
								></textarea>
							</label>
							<span class="fdy-apply-count">
								{publisherLength(answers[q.id] ?? '')} of {PUBLISHER_ANSWER_MAX} characters
							</span>
						{/if}
					</fieldset>
				{/each}

				{#if apply}
					<div class="fdy-apply-do">
						<button
							type="submit"
							class="btn tap-44"
							data-testid="foundry-publisher-send"
							aria-disabled={!verdict.ok ? 'true' : undefined}
							disabled={sending}
						>
							{sending ? 'Sending' : 'Send my application'}
						</button>
						{#if !verdict.ok && !problem}
							<span class="fdy-apply-hint">{publisherRefusalSentence(verdict.reason)}</span>
						{/if}
					</div>
				{/if}
			</form>
		{/if}
	{/if}

	{#if problem}
		<p class="fdy-apply-problem" role="status" data-testid="foundry-publisher-problem">{problem}</p>
	{/if}
</section>

<style>
	.fdy-apply {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 1.25rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		min-width: 0;
	}

	.fdy-apply h2 {
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-1);
	}

	.fdy-apply-lead,
	.fdy-apply-note,
	.fdy-apply-hint,
	.fdy-apply-count {
		margin: 0;
		color: var(--text-2);
	}

	.fdy-apply-count,
	.fdy-apply-hint {
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	.fdy-apply-state {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		margin: 0;
		color: var(--text-1);
	}

	.fdy-apply-decision {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin: 0;
		padding: 0.6rem 0.75rem;
		background: var(--surface-2);
		border-left: 3px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
	}

	.fdy-apply-label {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.fdy-apply-text {
		color: var(--text-1);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.fdy-apply-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}

	.fdy-apply-q {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0.85rem 1rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
		background: var(--surface-2);
		min-width: 0;
	}

	.fdy-apply-q.has-problem {
		border-color: var(--crimson);
	}

	.fdy-apply-q legend {
		padding: 0 0.25rem;
		color: var(--text-1);
		font-size: 1.02rem;
	}

	.fdy-apply-qn {
		font-family: var(--font-mono);
		color: var(--text-2);
	}

	.fdy-apply-choices {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.fdy-apply-choice {
		gap: 0.6rem;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm, 4px);
		color: var(--text-1);
		cursor: pointer;
	}

	.fdy-apply-choice input {
		width: 1.1rem;
		height: 1.1rem;
		flex: none;
		accent-color: var(--green);
	}

	.fdy-apply-choice:has(input:focus-visible) {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	.fdy-apply-text-field {
		display: flex;
		flex-direction: column;
	}

	.fdy-apply-text-field textarea {
		min-height: 4.5rem;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-1, 4px);
		background: var(--surface-1);
		color: var(--text-1);
		font: inherit;
		resize: vertical;
	}

	.fdy-apply-text-field textarea:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	/* The label is for assistive tech: the legend above already says what the
	   box is for, in words, to everyone. */
	.fdy-apply-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.fdy-apply-do {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
	}

	.fdy-apply-problem {
		margin: 0;
		color: var(--text-1);
		padding-left: 0.6rem;
		border-left: 3px solid var(--crimson);
	}
</style>
