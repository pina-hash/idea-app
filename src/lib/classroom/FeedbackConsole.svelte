<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import type { FeedbackRow, FeedbackStatus } from '$lib/feedback/feedback';
	import {
		EMPTY_FEEDBACK_FILTER,
		facetValues,
		feedbackExportName,
		feedbackJson,
		feedbackMarkdown,
		filterFeedback,
		rowBuild,
		rowErrorId,
		rowPath,
		rowRole,
		rowRoute,
		rowSection,
		rowStatusCode,
		rowViewport,
		type FeedbackFilter
	} from '$lib/feedback/console';

	/**
	 * The admin feedback queue: everything sent from anywhere in the portal,
	 * with the context it was captured with, who sent it, when, and a three-step
	 * status.
	 *
	 * SITE-WIDE SINCE THE SHELL STARTED CARRYING THE AFFORDANCE. It used to read
	 * only `app = 'classroom'`, which was right when the classroom was the only
	 * place with a Feedback button. Now every route has one, so a queue that
	 * filtered to one app would silently hide most of what arrives.
	 *
	 * FILTER FIRST, EXPORT SECOND. The export buttons act on what is on screen,
	 * never on the whole load: what leaves is the ten reports that matter rather
	 * than the semester. The markdown bundle is sized to paste into a chat and
	 * SAYS SO when the budget cut anything -- a silent truncation reads as "that
	 * is all of them".
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
		setStatus,
		now = () => Date.now()
	}: {
		ready?: boolean;
		rows: FeedbackRow[];
		setStatus: (id: string, status: FeedbackStatus) => Promise<{ ok: boolean; message?: string }>;
		/** Injectable clock, so a harness can pin the export stamp. */
		now?: () => number;
	} = $props();

	const STATUSES: { id: FeedbackStatus; label: string }[] = [
		{ id: 'new', label: 'New' },
		{ id: 'seen', label: 'Seen' },
		{ id: 'resolved', label: 'Resolved' }
	];

	let filter = $state<FeedbackFilter>({ ...EMPTY_FEEDBACK_FILTER, status: 'new' });
	let busyId = $state<string | null>(null);
	let error = $state<string | null>(null);
	/** Optimistic status, so a click lands before the parent reloads. */
	let moved = $state<Record<string, FeedbackStatus>>({});

	function statusOf(row: FeedbackRow) {
		return moved[row.id] ?? row.status;
	}

	// New first is the working order: the queue exists to be worked through,
	// and a resolved note is history.
	const visible = $derived(filterFeedback(rows, filter, statusOf));
	const counts = $derived({
		new: rows.filter((r) => statusOf(r) === 'new').length,
		seen: rows.filter((r) => statusOf(r) === 'seen').length,
		resolved: rows.filter((r) => statusOf(r) === 'resolved').length
	});
	const roles = $derived(facetValues(rows, rowRole));
	const sections = $derived(facetValues(rows, rowSection));

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

	let exportNote = $state<string | null>(null);

	/**
	 * The download. `<a download>` on a blob URL, revoked after the click: a
	 * server round trip would only re-derive rows the console already holds.
	 */
	function download(name: string, text: string, mime: string) {
		if (typeof document === 'undefined') return;
		const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	function exportMarkdown() {
		const stamp = new Date(now()).toISOString();
		// VISIBLE ROWS, NOT `rows`: filtering happens before export.
		const bundle = feedbackMarkdown(visible, { filter, generatedAt: stamp });
		download(feedbackExportName('md', stamp.slice(0, 19)), bundle.text, 'text/markdown');
		exportNote =
			bundle.dropped > 0
				? `Exported ${bundle.included} of ${visible.length} filtered reports as markdown. ${bundle.dropped} did not fit the pasteable budget and are named at the end of the file.`
				: `Exported ${bundle.included} filtered report${bundle.included === 1 ? '' : 's'} as markdown.`;
	}

	function exportJson() {
		const stamp = new Date(now()).toISOString();
		const text = feedbackJson(visible, { filter, generatedAt: stamp });
		download(feedbackExportName('json', stamp.slice(0, 19)), text, 'application/json');
		exportNote = `Exported ${visible.length} filtered report${visible.length === 1 ? '' : 's'} as JSON.`;
	}

	function clearFilter() {
		filter = { ...EMPTY_FEEDBACK_FILTER };
		exportNote = null;
	}
</script>

<svelte:head>
	<title>Feedback // IDEA</title>
</svelte:head>

<!--
	NO MASTHEAD HERE. Every /classroom page renders inside the persistent shell
	(src/routes/classroom/+layout.svelte), which owns the logo, the section
	switcher and the breadcrumb trail back up.
-->
<main class="fb-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Admin</div>
		<h1>Feedback</h1>
		<p class="lead">
			Everything sent from the Report a problem control, anywhere in the portal, with the route,
			role, section and build it was captured with.
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
					class="fbc-control filter"
					class:active={filter.status === f.id}
					aria-selected={filter.status === f.id}
					onclick={() => (filter = { ...filter, status: f.id })}
				>
					{f.label}
				</button>
			{/each}
		</div>

		<section class="card facets">
			<div class="facet">
				<label class="facet-label" for="fbc-route">Route</label>
				<input
					id="fbc-route"
					class="fbc-control fbc-input"
					type="search"
					placeholder="/notebook"
					bind:value={filter.route}
				/>
			</div>
			<div class="facet">
				<label class="facet-label" for="fbc-role">Role</label>
				<select id="fbc-role" class="fbc-control fbc-input" bind:value={filter.role}>
					<option value="">Any role</option>
					{#each roles as r (r)}<option value={r}>{r}</option>{/each}
				</select>
			</div>
			<div class="facet">
				<label class="facet-label" for="fbc-section">Section</label>
				<select id="fbc-section" class="fbc-control fbc-input" bind:value={filter.section}>
					<option value="">Any section</option>
					{#each sections as sec (sec)}<option value={sec}>{sec}</option>{/each}
				</select>
			</div>
			<div class="facet">
				<label class="facet-label" for="fbc-from">From</label>
				<input id="fbc-from" class="fbc-control fbc-input" type="date" bind:value={filter.from} />
			</div>
			<div class="facet">
				<label class="facet-label" for="fbc-to">To</label>
				<input id="fbc-to" class="fbc-control fbc-input" type="date" bind:value={filter.to} />
			</div>
			<div class="facet facet-actions">
				<button type="button" class="fbc-control btn secondary" onclick={clearFilter}>
					Clear filters
				</button>
			</div>
		</section>

		<div class="export-row">
			<span class="export-count">
				{visible.length} of {rows.length} shown
			</span>
			<button
				type="button"
				class="fbc-control btn secondary"
				disabled={visible.length === 0}
				onclick={exportMarkdown}
			>
				Export markdown
			</button>
			<button
				type="button"
				class="fbc-control btn secondary"
				disabled={visible.length === 0}
				onclick={exportJson}
			>
				Export JSON
			</button>
		</div>
		{#if exportNote}
			<p class="note export-note" aria-live="polite">{exportNote}</p>
		{/if}

		{#if visible.length === 0}
			<section class="card">
				<p class="note">Nothing matches those filters.</p>
			</section>
		{:else}
			{#each visible as row (row.id)}
				<article class="card fb-row" class:resolved={statusOf(row) === 'resolved'}>
					<div class="fb-head">
						<span class="fb-kind">{row.kind}</span>
						<span class="fb-page">{rowRoute(row)}</span>
						<span class="fb-when">{whenLabel(row.created_at)}</span>
						<span class="fb-status status-{statusOf(row)}">{statusOf(row)}</span>
					</div>
					<p class="fb-message">{row.message}</p>
					<ul class="fb-context">
						{#if rowPath(row)}<li>path {rowPath(row)}</li>{/if}
						{#if rowRole(row)}<li>role {rowRole(row)}</li>{/if}
						{#if rowSection(row)}<li>section {rowSection(row)}</li>{/if}
						{#if rowViewport(row)}<li>viewport {rowViewport(row)}</li>{/if}
						{#if rowStatusCode(row) !== null}<li>http {rowStatusCode(row)}</li>{/if}
						{#if rowErrorId(row)}<li>error id {rowErrorId(row)}</li>{/if}
					</ul>
					{#if rowBuild(row)}
						<!-- THE VALUE NEVER TRAVELS WITHOUT WHAT IT MEANS. Neither
						     available identifier is a hash of the built artifact, and a
						     bare hex string in this position gets read as one. -->
						<p class="fb-build">
							<span class="fb-build-value">{rowBuild(row)?.value}</span>
							<span class="fb-build-means">{rowBuild(row)?.means}</span>
						</p>
					{/if}
					<div class="fb-foot">
						<span class="fb-who">
							{row.submitter_name || row.submitter_email || 'unknown'}
							{#if row.submitter_email}<span class="fb-email">{row.submitter_email}</span>{/if}
						</span>
						<span class="fb-actions">
							{#each STATUSES as s (s.id)}
								<button
									type="button"
									class="fbc-control btn secondary"
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

	/*
		THE TAP-TARGET FLOOR, IN ONE PLACE. Every interactive control on this page
		carries `.fbc-control`, so the status buttons (which measured 22.9px, under
		even the 24px absolute floor) and everything standing beside them are one
		rule rather than several that can drift apart. One compliant control next
		to a non-compliant one reads as a broken row, which is why the filter
		pills, the facet inputs and the export buttons are in the same set.
		Nothing here sits inside a locked density contract, so there is nothing to
		trade against.
	*/
	.fbc-control {
		min-height: 44px;
		min-width: 44px;
	}

	.filters {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-bottom: var(--space-3);
	}
	.filter {
		appearance: none;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		padding: 0 0.9rem;
		cursor: pointer;
	}
	.filter.active {
		color: var(--green);
		border-color: var(--line-strong);
	}

	.facets {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		align-items: end;
		margin-bottom: var(--space-3);
	}
	.facet {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		/* An item's automatic minimum is its min-content, so without this a date
		   input pushes the row wider than the page. */
		min-width: 0;
		flex: 1 1 9rem;
	}
	.facet-actions {
		flex: 0 0 auto;
		justify-content: flex-end;
	}
	.facet-label {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.fbc-input {
		width: 100%;
		box-sizing: border-box;
		padding: 0 0.6rem;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.88rem;
	}
	.fbc-input:focus-visible {
		outline: 1px solid var(--green);
		outline-offset: 1px;
	}

	.export-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: var(--space-3);
	}
	.export-count {
		flex: 1;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.export-note {
		margin: 0 0 var(--space-3);
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
		font-family: var(--font-mono);
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
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--gold);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.fb-when {
		font-family: var(--font-mono);
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
	.fb-context {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.8rem;
		list-style: none;
		margin: 0 0 var(--space-2);
		padding: 0;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--text-2);
	}
	.fb-build {
		margin: 0 0 var(--space-2);
		font-size: 0.62rem;
		color: var(--text-2);
	}
	.fb-build-value {
		font-family: var(--font-mono);
		color: var(--cyan);
		margin-right: 0.5rem;
	}
	.fb-build-means {
		font-family: var(--font-display);
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
		font-family: var(--font-mono);
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
		font-family: var(--font-mono);
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
