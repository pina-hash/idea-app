<script lang="ts">
	import CheckInState from '$lib/notebook/CheckInState.svelte';
	import { sessionMeta } from '$lib/notebook';
	import type { LogCheckIn } from '$lib/notebook/log';

	/**
	 * THE NOTEBOOK'S PAGE HEAD: the title, who can see it, and what needs doing,
	 * each a control where it can be one. Factored out of NotebookView (ledger
	 * 0298), which mounts it inside its own `<header class="nb-head">`, so these
	 * two blocks are that header's flex items exactly as they were inline.
	 *
	 * THE CHECK-IN IS A CHIP, NOT THE FIRST QUESTION (R32). It carries a word and
	 * a tone (`CheckInState`) for where the student stands on the check-in the
	 * composer files to next, and pressing it files the next save there and puts
	 * the cursor in the box. When everything is turned in it says so, which is
	 * the one fact the composer's old "you are up to date" sentence carried.
	 *
	 * READ-ONLY MOUNTS ADDRESS THE READER, NOT THE AUTHOR: an instructor looking
	 * at a student's notebook is told whose it is and who may see it, never
	 * "only you".
	 */
	let {
		readOnly = false,
		configured = true,
		sessionsReady = true,
		draftsReady = true,
		checkIn = null,
		draftCount = 0,
		draftsPressed = false,
		sectionLabel = null,
		timelineHref = null,
		allClassesHref = null,
		canReview = false,
		reviewHref = null,
		onCheckIn,
		onDrafts
	}: {
		readOnly?: boolean;
		configured?: boolean;
		sessionsReady?: boolean;
		draftsReady?: boolean;
		checkIn?: LogCheckIn | null;
		draftCount?: number;
		draftsPressed?: boolean;
		sectionLabel?: string | null;
		timelineHref?: string | null;
		allClassesHref?: string | null;
		canReview?: boolean;
		reviewHref?: string | null;
		onCheckIn?: () => void;
		onDrafts?: () => void;
	} = $props();
</script>

<div class="head-title">
	<h1>{readOnly ? 'Notebook' : 'My notebook'}</h1>
	<p class="privacy" data-testid="nb-privacy">
		{readOnly
			? 'Only this student, their section instructor and the department chair can see this notebook.'
			: 'Only you, your section instructor and the department chair can see this notebook.'}
	</p>
</div>
<!--
	ACTIONABLE FIRST, IDENTITY LAST. The check-in and the drafts are what need
	doing; the class and the review link say where you are.
-->
<div class="head-status" data-testid="nb-status">
	{#if !readOnly && configured && sessionsReady && checkIn}
		{#if checkIn.kind === 'next'}
			<button
				type="button"
				class="chip chip-due"
				data-testid="nb-next-check-in"
				data-status={checkIn.state.status}
				onclick={() => onCheckIn?.()}
			>
				<span class="chip-key">Next check-in</span>
				<CheckInState value={checkIn.state} testId="nb-next-check-in-state" />
				<span class="chip-val">{checkIn.session.session_label}</span>
				<span class="chip-meta">{sessionMeta(checkIn.session)}</span>
			</button>
		{:else}
			<span class="chip chip-clear" data-testid="nb-check-ins-clear">
				<span class="chip-key">Check-ins</span>
				<CheckInState value={checkIn.state} testId="nb-check-ins-clear-state" />
			</span>
		{/if}
	{/if}
	{#if configured && draftsReady && draftCount > 0}
		<button
			type="button"
			class="chip chip-drafts"
			data-testid="nb-drafts-chip"
			aria-pressed={draftsPressed}
			onclick={() => onDrafts?.()}
		>
			<span class="chip-val">{draftCount === 1 ? '1 draft' : `${draftCount} drafts`}</span>
			<span class="chip-meta">{readOnly ? 'not turned in' : 'to turn in'}</span>
		</button>
	{/if}
	{#if sectionLabel}
		<span class="chip">{sectionLabel}</span>
	{/if}
	<!-- A class's tab reaches the whole notebook, carrying the class along
	     so a free entry written there still starts filed to it. -->
	{#if timelineHref}
		<a class="chip chip-link" href={timelineHref} data-testid="nb-timeline">Timeline &rsaquo;</a>
	{/if}
	{#if allClassesHref}
		<a class="chip chip-link" href={allClassesHref} data-testid="nb-all-classes">All classes &rsaquo;</a>
	{/if}
	{#if canReview && reviewHref}
		<a class="chip chip-link" href={reviewHref}>Section review &rsaquo;</a>
	{/if}
</div>

<style>
	.head-title {
		min-width: 0;
		flex: 1 1 20rem;
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0 var(--space-4);
	}
	h1 {
		margin: 0;
		font-size: 1.3rem;
	}
	/* One line, the room's secondary tier: it is the fact worth keeping from
	   the paragraph it replaces, and it is not the work. */
	.privacy {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-2);
		max-width: 40rem;
	}
	.head-status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		flex: 0 1 auto;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: 0.78rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		color: var(--text-2);
		/* Every chip in the head clears the floor, control or not: the two
		   that ARE controls sit beside the ones that are not, and a strip whose
		   members differ by 14px in height reads as two rows that failed to
		   line up (IDEA_INTERFACE_STANDARDS 10). */
		min-height: 44px;
		box-sizing: border-box;
	}
	.chip-link {
		color: var(--nb-accent-ink);
		border-color: color-mix(in srgb, var(--nb-accent) 45%, transparent);
		text-decoration: none;
	}
	.chip-link:hover {
		border-color: var(--nb-accent-ink);
		background: var(--nb-accent-wash);
		text-decoration: none;
	}
	/* THE ACTIONABLE CHIPS. A key, a state, a value and a meta word, so
	   "Next check-in  Not filed yet  Week 3  Unit 2, Sep 25" reads as a label
	   and its answers rather than as a sentence somebody has to parse. The
	   state carries the tone; the chip's own brass edge says it is a control. */
	.chip-due,
	.chip-drafts {
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
		background: var(--surface-1);
		text-align: left;
		flex-wrap: wrap;
	}
	.chip-due {
		border-color: var(--nb-accent);
		color: var(--text-1);
	}
	.chip-due:hover {
		background: var(--nb-accent-wash);
	}
	.chip-drafts {
		border-color: color-mix(in srgb, var(--nb-warn) 55%, transparent);
		color: var(--text-1);
	}
	.chip-drafts:hover,
	.chip-drafts[aria-pressed='true'] {
		background: color-mix(in srgb, var(--nb-warn) 10%, transparent);
		border-color: var(--nb-warn);
	}
	.chip-key {
		color: var(--nb-accent-ink);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.66rem;
	}
	.chip-val {
		font-weight: 600;
	}
	.chip-drafts .chip-val {
		color: var(--nb-warn);
	}
	/* MUTED COPY ON A CHIP TAKES --text-2, NEVER --text-3: the chip's own
	   hover fill is a wash over the card, which is the ground the tertiary
	   tier was never measured on. */
	.chip-meta {
		color: var(--text-2);
		font-weight: 400;
	}
</style>
