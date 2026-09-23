<script lang="ts">
	import { flagReasonLabel, type NotebookFlagReason, type NotebookStatus } from '$lib/notebook';

	/**
	 * WHAT THE REVIEWER SAID ABOUT AN ENTRY, RENDERED ONCE (ledger 0297, package
	 * F4b). The student's card and the review panel each hand-wrote this callout
	 * -- the same border, wash, reason and comment in two files -- which is the
	 * "one entry frame" the rebuild plan owed (phase 4c-2). Both mount this now.
	 *
	 * TWO SHAPES, AND THE SECOND IS NEW. A FLAG is a reason plus an optional
	 * line, and asks for another photo. A NEXT STEP is the comment an approval
	 * carries (the approve queue's chips, written by `notebook_resolve_entry`):
	 * before this, a comment on an entry that was not flagged was stored and
	 * rendered nowhere, so the one specific next step research says produces
	 * growth would have reached no student.
	 *
	 * THE STATUS WORDS ARE NOT HERE, deliberately: the card shows the entry's
	 * own status and the review panel shows the grid's (on time, late), and
	 * which set a student should see is an open question for Mr. Pina (a
	 * student's set suppresses 'compliant', so it never says "Late"). This
	 * component renders what was said, and neither answer to that question.
	 */
	let {
		status,
		flagReason = null,
		comment = null,
		hint = null,
		testId = 'entry-verdict'
	}: {
		status: NotebookStatus;
		flagReason?: NotebookFlagReason | null;
		comment?: string | null;
		/** The line under a flag that says what to do; the student's card passes one. */
		hint?: string | null;
		testId?: string;
	} = $props();

	const flagged = $derived(status === 'flagged' && (!!flagReason || !!comment));
	// Compliant only: a resubmission awaiting review still carries the FLAG's
	// comment, which is not a next step anybody chose.
	const nextStep = $derived(status === 'compliant' && !!comment?.trim());
</script>

{#if flagged}
	<div class="ev-callout" data-testid={testId} data-kind="flag">
		{#if flagReason}<strong>{flagReasonLabel(flagReason)}.</strong>{/if}
		{#if comment}<span>{comment}</span>{/if}
		{#if hint}<span class="ev-hint">{hint}</span>{/if}
	</div>
{:else if nextStep}
	<div class="ev-callout next" data-testid={testId} data-kind="next-step">
		<strong>Next step</strong>
		<span>{comment}</span>
	</div>
{/if}

<style>
	.ev-callout {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		margin: 0 0 var(--space-3);
		border-left: 2px solid var(--nb-accent);
		background: var(--nb-accent-wash);
		border-radius: 0 var(--radius-control) var(--radius-control) 0;
		font-size: 0.88rem;
	}
	.ev-callout strong {
		color: var(--nb-accent-ink);
	}
	.ev-callout.next {
		border-left-color: var(--boundary);
	}
	.ev-hint {
		color: var(--text-2);
		font-size: 0.8rem;
	}
</style>
