<script lang="ts">
	/**
	 * PUBLISHER APPLICATIONS, THE ADMIN'S HALF (report 6d076258, ledger 0360).
	 * Mounted only on /foundry/review/publishers, which 404s everyone but a
	 * site administrator; `is_admin()` inside every RPC is the boundary.
	 *
	 * ONE PRESS EACH WAY, as asked ("with the easy click of a button"). Approve
	 * writes the EXISTING trusted list through `foundry_trusted_grant`; decline
	 * starts the student's seven-day wait. The optional note goes to the
	 * student either way, so it is labelled as their reading.
	 *
	 * THE TRICK MARKS ARE THIS SURFACE'S AND NOBODY ELSE'S. Each answer was
	 * stored with a snapshot of its question, so a question edited since still
	 * shows what the student actually answered, the trick flag it had, whether
	 * the answer was a red flag, and the note on what to look for. A red flag is
	 * a word and a glyph (ForgeStatus), never a colour alone.
	 *
	 * THE NAME IS `foundryAuthorName` (display name when chosen, full name
	 * otherwise, never the address as a name). The address IS shown, on its own
	 * line, because approving names an account and this page is admin-only.
	 */
	import Disclosure from '$lib/Disclosure.svelte';

	import ForgeStatus from './ForgeStatus.svelte';
	import {
		PUBLISHER_NOTE_MAX,
		PUBLISHER_UNAVAILABLE_NOTE,
		publisherDay,
		publisherRefusalSentence,
		type FoundryPublisherApplication,
		type PublisherRead
	} from './publisher.ts';
	import { foundryAuthorName } from './surface.ts';
	import type { FoundryPublisherTransports } from './transports.ts';

	let {
		pending,
		decided,
		decide = undefined,
		onChanged = undefined
	}: {
		pending: PublisherRead<FoundryPublisherApplication[]>;
		decided: PublisherRead<FoundryPublisherApplication[]>;
		decide?: FoundryPublisherTransports['decide'];
		onChanged?: () => void;
	} = $props();

	/** Decisions this panel made, laid over the loaded lists until a reload replaces them. */
	let madeHere = $state<Record<string, 'approved' | 'declined'>>({});
	let notes = $state<Record<string, string>>({});
	let busy = $state<string | null>(null);
	let problems = $state<Record<string, string>>({});

	const pendingRows = $derived(
		pending.state === 'ready' ? pending.value.filter((a) => !(a.id in madeHere)) : []
	);
	const decidedRows = $derived.by(() => {
		const local =
			pending.state === 'ready'
				? pending.value
						.filter((a) => a.id in madeHere)
						.map((a) => ({ ...a, status: madeHere[a.id]! }))
				: [];
		const loaded = decided.state === 'ready' ? decided.value : [];
		return [...local, ...loaded.filter((a) => !(a.id in madeHere))];
	});

	function nameOf(a: FoundryPublisherApplication): string {
		return (
			foundryAuthorName({
				owner_display_name: a.applicant_display_name,
				owner_full_name: a.applicant_full_name
			}) ?? 'No name on the account'
		);
	}

	async function choose(a: FoundryPublisherApplication, decision: 'approve' | 'decline') {
		if (!decide || busy) return;
		busy = a.id;
		problems = { ...problems, [a.id]: '' };
		try {
			const note = (notes[a.id] ?? '').trim() || null;
			const r = await decide(a.id, decision, note);
			if (!r.ok) {
				problems = {
					...problems,
					[a.id]:
						r.reason === 'unavailable'
							? PUBLISHER_UNAVAILABLE_NOTE
							: r.reason
								? publisherRefusalSentence(r.reason)
								: (r.message ?? publisherRefusalSentence(null))
				};
				return;
			}
			madeHere = { ...madeHere, [a.id]: decision === 'approve' ? 'approved' : 'declined' };
			onChanged?.();
		} catch (err) {
			problems = {
				...problems,
				[a.id]: err instanceof Error ? err.message : publisherRefusalSentence(null)
			};
		} finally {
			busy = null;
		}
	}
</script>

{#snippet answersOf(a: FoundryPublisherApplication)}
	<ol class="fdy-pa-answers">
		{#each a.answers as ans (ans.question_id)}
			<li class="fdy-pa-answer" class:is-flagged={ans.flagged}>
				<p class="fdy-pa-prompt">
					{ans.prompt}
					{#if ans.is_trick}<span class="fdy-pa-tag">Trick question</span>{/if}
				</p>
				<p class="fdy-pa-said">
					<span class="fdy-pa-said-text">{ans.answer}</span>
					{#if ans.flagged}
						<ForgeStatus tone="refused" word="Red flag" />
					{/if}
				</p>
				{#if ans.reviewer_note}
					<p class="fdy-pa-look">
						<span class="fdy-pa-label">What to look for</span>
						{ans.reviewer_note}
					</p>
				{/if}
			</li>
		{/each}
	</ol>
{/snippet}

<section class="fdy-block fdy-pa" data-testid="foundry-publisher-applications">
	<header class="fdy-pa-head">
		<h2>Publisher applications</h2>
		<span class="fdy-pa-count">{pendingRows.length} waiting</span>
	</header>

	{#if pending.state === 'unavailable'}
		<p class="fdy-pa-note">{PUBLISHER_UNAVAILABLE_NOTE}</p>
	{:else if pending.state === 'failed'}
		<p class="fdy-pa-problem" role="status">{pending.message}</p>
	{:else if pendingRows.length === 0}
		<p class="fdy-pa-note">Nobody is waiting. A student applies from My apps.</p>
	{:else}
		<ul class="fdy-pa-list">
			{#each pendingRows as a (a.id)}
				<li class="fdy-pa-card" data-testid="foundry-publisher-application">
					<div class="fdy-pa-who">
						<span class="fdy-pa-name">{nameOf(a)}</span>
						<span class="fdy-pa-email">{a.applicant_email}</span>
						<span class="fdy-pa-when">Sent {publisherDay(a.submitted_at)}</span>
						{#if a.flagged_count > 0}
							<ForgeStatus
								tone="refused"
								word={a.flagged_count === 1 ? '1 red flag' : `${a.flagged_count} red flags`}
							/>
						{:else}
							<ForgeStatus tone="quiet" word="No red flags" />
						{/if}
						{#if a.trusted_now}
							<ForgeStatus tone="ok" word="Already trusted" />
						{/if}
					</div>

					{@render answersOf(a)}

					{#if decide}
						<label class="fdy-pa-note-field">
							<span>A note the student reads (optional)</span>
							<input
								type="text"
								maxlength={PUBLISHER_NOTE_MAX}
								value={notes[a.id] ?? ''}
								oninput={(e) => (notes = { ...notes, [a.id]: e.currentTarget.value })}
							/>
						</label>
						<div class="fdy-pa-do">
							<button
								type="button"
								class="btn tap-44"
								data-testid="foundry-publisher-approve"
								disabled={busy === a.id}
								onclick={() => choose(a, 'approve')}
							>
								Approve
							</button>
							<button
								type="button"
								class="btn tap-44"
								data-testid="foundry-publisher-decline"
								disabled={busy === a.id}
								onclick={() => choose(a, 'decline')}
							>
								Decline
							</button>
						</div>
					{/if}
					{#if problems[a.id]}
						<p class="fdy-pa-problem" role="status">{problems[a.id]}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if decided.state === 'ready' || decidedRows.length > 0}
		<Disclosure
			label="Decided ({decidedRows.length})"
			heading={3}
			collapseWhen={true}
			scope="foundry-publisher-decided"
			testId="foundry-publisher-decided"
		>
			{#if decidedRows.length === 0}
				<p class="fdy-pa-note">Nothing has been decided yet.</p>
			{:else}
				<ul class="fdy-pa-list">
					{#each decidedRows as a (a.id)}
						<li class="fdy-pa-card is-decided">
							<div class="fdy-pa-who">
								<span class="fdy-pa-name">{nameOf(a)}</span>
								<span class="fdy-pa-email">{a.applicant_email}</span>
								{#if a.status === 'approved'}
									<ForgeStatus tone="ok" word="Approved" />
								{:else}
									<ForgeStatus tone="refused" word="Declined" />
								{/if}
								{#if a.decided_at}
									<span class="fdy-pa-when">{publisherDay(a.decided_at)}</span>
								{/if}
							</div>
							{#if a.decision_note}
								<p class="fdy-pa-look">
									<span class="fdy-pa-label">Note to the student</span>
									{a.decision_note}
								</p>
							{/if}
							{@render answersOf(a)}
						</li>
					{/each}
				</ul>
			{/if}
		</Disclosure>
	{/if}
</section>

<style>
	.fdy-pa {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		min-width: 0;
	}

	.fdy-pa-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.75rem;
	}

	.fdy-pa-head h2 {
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-1);
	}

	.fdy-pa-count,
	.fdy-pa-when,
	.fdy-pa-email {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}

	.fdy-pa-note {
		margin: 0;
		color: var(--text-2);
	}

	.fdy-pa-list {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* A card INSIDE the panel, so its edge is decoration (`--hairline`): the
	   panel's own edge is the load-bearing one. */
	.fdy-pa-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.85rem 1rem;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
		min-width: 0;
	}

	.fdy-pa-who {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.85rem;
	}

	.fdy-pa-name {
		font-family: var(--font-display);
		font-size: 1.1rem;
		color: var(--text-1);
	}

	.fdy-pa-email {
		overflow-wrap: anywhere;
	}

	.fdy-pa-answers {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
		padding-left: 1.4rem;
	}

	.fdy-pa-answer {
		color: var(--text-1);
	}

	.fdy-pa-prompt,
	.fdy-pa-said,
	.fdy-pa-look {
		margin: 0;
	}

	.fdy-pa-prompt {
		color: var(--text-2);
	}

	.fdy-pa-tag {
		display: inline-block;
		margin-left: 0.4rem;
		padding: 0 0.4rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-chip, 2px);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--text-2);
		white-space: nowrap;
	}

	.fdy-pa-said {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.6rem;
	}

	.fdy-pa-said-text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	/* A flagged answer is marked by its ForgeStatus chip, a word and a glyph;
	   this edge only groups the answer with it, so it is decoration and
	   `--crimson` stays for errors. */
	.fdy-pa-answer.is-flagged .fdy-pa-said-text {
		padding-left: 0.5rem;
		border-left: 3px solid var(--hairline);
	}

	.fdy-pa-look {
		font-size: 0.92rem;
		color: var(--text-2);
	}

	.fdy-pa-label {
		margin-right: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.fdy-pa-note-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.fdy-pa-note-field span {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.fdy-pa-note-field input {
		min-height: 44px;
		padding: 0 0.65rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-1, 4px);
		background: var(--surface-1);
		color: var(--text-1);
		font: inherit;
	}

	.fdy-pa-note-field input:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	.fdy-pa-do {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.fdy-pa-problem {
		margin: 0;
		color: var(--text-1);
		padding-left: 0.6rem;
		border-left: 3px solid var(--crimson);
	}
</style>
