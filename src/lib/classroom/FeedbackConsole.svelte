<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import type { FeedbackRow, FeedbackStatus } from '$lib/classroom/classroom';

	/**
	 * The admin feedback queue: everything sent from a classroom page, with the
	 * page context it was sent from, who sent it, when, and a three-step status.
	 *
	 * Presentation + callbacks only (the DecalReviewQueue / ReviewConsole
	 * convention), so /dev/classroom drives the identical component against an
	 * in-memory store. The gate is the DATABASE's: app_feedback_admin_list and
	 * app_feedback_set_status both open with is_admin(), so the route's 404 is
	 * convenience and the RPCs are the boundary.
	 */
	let {
		ready = true,
		rows,
		setStatus
	}: {
		ready?: boolean;
		rows: FeedbackRow[];
		setStatus: (id: string, status: FeedbackStatus) => Promise<{ ok: boolean; message?: string }>;
	} = $props();

	const STATUSES: { id: FeedbackStatus; label: string }[] = [
		{ id: 'new', label: 'New' },
		{ id: 'seen', label: 'Seen' },
		{ id: 'resolved', label: 'Resolved' }
	];

	let filter = $state<'all' | FeedbackStatus>('new');
	let busyId = $state<string | null>(null);
	let error = $state<string | null>(null);
	/** Optimistic status, so a click lands before the parent reloads. */
	let moved = $state<Record<string, FeedbackStatus>>({});

	function statusOf(row: FeedbackRow) {
		return moved[row.id] ?? row.status;
	}

	// New first is the working order: the queue exists to be worked through,
	// and a resolved note is history.
	const visible = $derived(
		filter === 'all' ? rows : rows.filter((r) => statusOf(r) === filter)
	);
	const counts = $derived({
		new: rows.filter((r) => statusOf(r) === 'new').length,
		seen: rows.filter((r) => statusOf(r) === 'seen').length,
		resolved: rows.filter((r) => statusOf(r) === 'resolved').length
	});

	function whenLabel(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function pageOf(row: FeedbackRow): string {
		const meta = row.meta ?? {};
		const parts: string[] = [];
		if (row.context) parts.push(row.context);
		if (typeof meta.section === 'string') parts.push(meta.section);
		if (typeof meta.tab === 'string') parts.push(meta.tab);
		if (typeof meta.kind === 'string') parts.push(meta.kind);
		return parts.join(' · ') || 'classroom';
	}

	async function move(row: FeedbackRow, status: FeedbackStatus) {
		if (busyId) return;
		busyId = row.id;
		error = null;
		const res = await setStatus(row.id, status);
		busyId = null;
		if (!res.ok) {
			error = res.message ?? 'Could not update that.';
			return;
		}
		moved = { ...moved, [row.id]: status };
	}
</script>

<svelte:head>
	<title>Classroom feedback // IDEA</title>
</svelte:head>

<!--
	NO MASTHEAD HERE. Every /classroom page renders inside the persistent shell
	(src/routes/classroom/+layout.svelte), which owns the logo, the section
	switcher and the breadcrumb trail back up.
-->
<main class="fb-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Classroom</div>
		<h1>Feedback</h1>
		<p class="lead">
			Everything sent from the Feedback button on a classroom page, with the page it came from.
		</p>
	</section>

	{#if !ready}
		<section class="card">
			<p class="feedback error">
				The feedback queue is not available yet -- migration 0085 does not appear to be applied.
			</p>
		</section>
	{:else}
		{#if error}
			<p class="feedback error">{error}</p>
		{/if}

		<div class="filters" role="tablist" aria-label="Status filter">
			{#each [{ id: 'new' as const, label: `New (${counts.new})` }, { id: 'seen' as const, label: `Seen (${counts.seen})` }, { id: 'resolved' as const, label: `Resolved (${counts.resolved})` }, { id: 'all' as const, label: `All (${rows.length})` }] as f (f.id)}
				<button
					type="button"
					role="tab"
					class="filter"
					class:active={filter === f.id}
					aria-selected={filter === f.id}
					onclick={() => (filter = f.id)}
				>
					{f.label}
				</button>
			{/each}
		</div>

		{#if visible.length === 0}
			<section class="card">
				<p class="note">Nothing here.</p>
			</section>
		{:else}
			{#each visible as row (row.id)}
				<article class="card fb-row" class:resolved={statusOf(row) === 'resolved'}>
					<div class="fb-head">
						<span class="fb-kind">{row.kind}</span>
						<span class="fb-page">{pageOf(row)}</span>
						<span class="fb-when">{whenLabel(row.created_at)}</span>
						<span class="fb-status status-{statusOf(row)}">{statusOf(row)}</span>
					</div>
					<p class="fb-message">{row.message}</p>
					<div class="fb-foot">
						<span class="fb-who">
							{row.submitter_name || row.submitter_email || 'unknown'}
							{#if row.submitter_email}<span class="fb-email">{row.submitter_email}</span>{/if}
						</span>
						<span class="fb-actions">
							{#each STATUSES as s (s.id)}
								<button
									type="button"
									class="btn secondary tiny"
									disabled={busyId === row.id || statusOf(row) === s.id}
									onclick={() => move(row, s.id)}
								>
									{s.label}
								</button>
							{/each}
						</span>
					</div>
					{#if row.reviewed_by && statusOf(row) === row.status}
						<p class="fb-review">
							Last moved by {row.reviewed_by}{#if row.reviewed_at} on {whenLabel(row.reviewed_at)}{/if}
						</p>
					{/if}
				</article>
			{/each}
		{/if}
	{/if}

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	/* Spacing only: the look lives in classroom.css. */
	.feedback {
		margin: 0 0 0.8rem;
	}

	.fb-page {
		max-width: var(--cr-measure, var(--measure-form));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}
	.filters {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-bottom: var(--space-4);
	}
	.filter {
		appearance: none;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		color: var(--text-2);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		padding: 0.28rem 0.8rem;
		cursor: pointer;
	}
	.filter.active {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.fb-row {
		margin-bottom: 0.8rem;
	}
	.fb-row.resolved {
		opacity: 0.72;
	}
	.fb-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.fb-kind,
	.fb-status {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.02rem 0.5rem;
		color: var(--text-2);
	}
	.fb-status.status-new {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.fb-status.status-seen {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.fb-page {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--gold);
	}
	.fb-when {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.64rem;
		color: var(--text-2);
		margin-left: auto;
	}
	.fb-message {
		margin: 0 0 var(--space-2);
		white-space: pre-wrap;
		line-height: 1.55;
		font-size: 0.95rem;
	}
	.fb-foot {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.fb-who {
		display: flex;
		flex-direction: column;
		font-size: 0.82rem;
	}
	.fb-email {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--text-2);
	}
	.fb-actions {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.fb-review {
		margin: var(--space-2) 0 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--text-2);
	}
	.note {
		color: var(--text-2);
		font-size: 0.9rem;
		margin: 0;
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
	@media (max-width: 560px) {
		.fb-when,
		.fb-actions {
			margin-left: 0;
		}
	}
</style>
