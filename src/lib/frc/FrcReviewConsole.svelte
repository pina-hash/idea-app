<script lang="ts">
	import FrcReviewQueue from '$lib/frc/FrcReviewQueue.svelte';
	import { mdmUnitById } from '$lib/frc/mdm-content';
	import type { ReviewQueueRow } from '$lib/frc/gate-submissions';

	/**
	 * The FRC gate-review console: the whole /frc/review screen, so the route
	 * and the dev harness mount the IDENTICAL thing. State in via props, intent
	 * out via callbacks (the route wires them to approveSubmission /
	 * requestRevision; the harness answers in memory).
	 *
	 * This is the REVIEWER-tier surface (0167): the route only renders it for a
	 * caller passing canReviewFrc, and every action re-checks frc_can_review()
	 * server-side regardless. It mounts the same FrcReviewQueue the admin
	 * dashboard mounts -- one queue component, two rooms -- inside a dark panel,
	 * because the queue is styled for the dark IDEA theme and this console sits
	 * in the light FRC room (the same wrap the dev harness already uses).
	 */
	let {
		queueReady,
		rows,
		busyKey = '',
		error = '',
		onApprove,
		onRequestRevision
	}: {
		queueReady: boolean;
		rows: ReviewQueueRow[];
		busyKey?: string;
		error?: string;
		onApprove: (userId: string, unitId: string) => void;
		onRequestRevision: (userId: string, unitId: string, feedback: string) => void;
	} = $props();

	const items = $derived(
		rows.map((r) => {
			const unit = mdmUnitById(r.unitId);
			return {
				userId: r.userId,
				unitId: r.unitId,
				unitLabel: unit ? `${unit.id} · ${unit.title}` : r.unitId,
				studentName: r.studentName ?? 'Unknown student',
				studentEmail: r.studentEmail,
				link: r.link,
				notes: r.notes,
				submittedAt: r.submittedAt
			};
		})
	);
</script>

<nav class="crumb" aria-label="Breadcrumb">
	<a href="/frc">FRC Training</a>
	<span aria-hidden="true">/</span>
	<span class="here">Gate review</span>
</nav>

<section class="head">
	<span class="frc-eyebrow">Reviewer tools</span>
	<h1>Gate review</h1>
	<p class="lead">
		Modeling-gate submissions awaiting review (MDM-4 through MDM-8). Approving a submission
		records the unit as complete for that student; requesting a revision sends your feedback back
		without touching completion.
	</p>
</section>

{#if !queueReady}
	<p class="frr-note" role="status">
		The review queue backend is not available yet. Apply 0167_frc_reviewer_tier.sql in the
		Supabase SQL editor; until then, submissions can still be reviewed from the admin dashboard.
	</p>
{:else}
	<div class="frr-queue">
		<FrcReviewQueue {items} {busyKey} {onApprove} {onRequestRevision} />
	</div>
{/if}

{#if error}
	<p class="frr-error" role="alert">{error}</p>
{/if}

<style>
	.crumb {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--frc-gray, #9a989a);
		margin-bottom: 1.2rem;
	}
	.crumb a {
		color: var(--frc-blue, #0066b3);
		text-decoration: none;
	}
	.crumb a:hover {
		text-decoration: underline;
	}
	.head {
		margin-bottom: 1.4rem;
	}
	.head h1 {
		margin: 0.15rem 0 0.4rem;
		font-style: italic;
		color: var(--frc-ink, #231f20);
	}
	.lead {
		margin: 0;
		max-width: 62ch;
		line-height: 1.55;
		color: var(--frc-ink, #231f20);
	}
	.frr-note {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--frc-blue-deep, #004f8a);
		background: var(--frc-blue-tint, rgba(0, 102, 179, 0.08));
		border: 1px solid var(--frc-blue-line, rgba(0, 102, 179, 0.35));
		border-radius: 6px;
		padding: 0.7rem 0.9rem;
		max-width: 62ch;
	}
	/* Dark panel so the dashboard-themed FrcReviewQueue is readable inside the
	   light FRC room (the same wrap the dev harness uses). */
	.frr-queue {
		padding: 0.8rem 1rem 1rem;
		background: var(--bg1, #050f07);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 8px;
	}
	.frr-error {
		margin: 0.6rem 0 0;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--frc-red, #ed1c24);
	}
</style>
