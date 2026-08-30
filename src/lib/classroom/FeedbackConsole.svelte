<script lang="ts">
	import VersionBadge from '$lib/VersionBadge.svelte';
	import { runBulk } from '$lib/classroom/classroom';
	import type { FeedbackRow, FeedbackStatus } from '$lib/feedback/feedback';
	import {
		EMPTY_FEEDBACK_FILTER,
		facetValues,
		feedbackBulkSummary,
		feedbackExportName,
		feedbackJson,
		feedbackMarkdown,
		filterFeedback,
		type FeedbackBulkOutcome,
		rowBuild,
		rowContact,
		rowDistinctPath,
		rowErrorId,
		rowIsAnonymous,
		rowRole,
		rowRoute,
		rowSection,
		rowStatusCode,
		rowUserAgentSummary,
		rowViewport,
		resolveSectionId,
		type ClassroomSectionInfo,
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
	 * AN ANONYMOUS REPORT IS VISIBLY ANONYMOUS. 0126 made an authorless row
	 * possible and this queue is the only place one is ever read, so the word is
	 * on the row rather than inferred from an empty name. What it carries
	 * INSTEAD of a name is a contact string the reporter typed, and that is
	 * rendered as exactly what it is: unverified text, never a name, never an
	 * address the console can vouch for. The reporter hash is not in this
	 * payload at all -- 0127 does not return it, deliberately -- so there is
	 * nothing here that could put it on a screen, in an export, or in a
	 * screenshot.
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
		classroomSections = [],
		setStatus,
		now = () => Date.now()
	}: {
		ready?: boolean;
		rows: FeedbackRow[];
		/** Live `classroom_sections` rows for every id these rows' `meta.section` names. */
		classroomSections?: ClassroomSectionInfo[];
		setStatus: (id: string, status: FeedbackStatus) => Promise<{ ok: boolean; message?: string }>;
		/** Injectable clock, so a harness can pin the export stamp. */
		now?: () => number;
	} = $props();

	const sectionMap = $derived(new Map(classroomSections.map((s) => [s.id, s])));

	/**
	 * EVERY META KEY THIS FILE ALREADY RENDERS BY NAME, so the generic reader
	 * below shows what nobody enumerated rather than repeating a field.
	 *
	 * `meta` IS FREE-FORM (feedback.ts says so): `captureMeta` in context.ts is
	 * the shell's one producer, but it is not the only one -- VANGUARD's in-game
	 * composer writes `surface` and `initials` straight into the same column,
	 * and there will be another surface after it. A FIXED LIST OF NAMES IS THE
	 * WRONG SHAPE for a free-form blob: the day this file was written to check,
	 * two keys (`surface`, `initials`) were already being stored and silently
	 * dropped on the floor, and `meta.error` -- which `captureMeta` itself has
	 * emitted for every error-boundary report since it existed -- was too. A
	 * queue that reads its OWN row rather than a list somebody once typed out
	 * cannot fall behind its own producers again.
	 *
	 * `at` is excluded on purpose rather than left to fall through: it is the
	 * same instant as `row.created_at`, already shown as "filed", and showing
	 * it a second time under its meta key would read as a second timestamp.
	 */
	const KNOWN_META_KEYS = new Set([
		'route',
		'path',
		'role',
		'section',
		'viewport',
		'userAgent',
		'at',
		'build',
		'status',
		'errorId'
	]);

	/** A meta value worth a line: a non-empty primitive. */
	function metaExtraText(value: unknown): string | null {
		if (typeof value === 'string') return value.trim() || null;
		if (typeof value === 'number' || typeof value === 'boolean') return String(value);
		// Objects and arrays get no generic rendering -- `build` is the one
		// object shape this file understands, and a stray "[object Object]"
		// for anything else is worse than omitting it.
		return null;
	}

	/**
	 * Whatever else is in the row's `meta`, key and value, sorted so the list is
	 * stable across renders. STUDENT-SUPPLIED TEXT (VANGUARD's `initials` among
	 * them) goes through the SAME escaping every other field on this card uses:
	 * plain Svelte text interpolation -- this component raw-renders nothing --
	 * so there is no second answer to add.
	 */
	function metaExtras(row: FeedbackRow): { key: string; value: string }[] {
		const meta = row.meta ?? {};
		const extras: { key: string; value: string }[] = [];
		for (const key of Object.keys(meta)) {
			if (KNOWN_META_KEYS.has(key)) continue;
			const text = metaExtraText(meta[key]);
			if (!text) continue;
			// A layout safety cap, not a content rule: nothing here promises a
			// future producer keeps its values short the way `initials` does.
			extras.push({ key, value: text.length > 200 ? `${text.slice(0, 200)}…` : text });
		}
		return extras.sort((a, b) => a.key.localeCompare(b.key));
	}

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

	// --- Bulk status ------------------------------------------------------
	//
	// THE SAME SELECTION PATTERN THE CLASS STREAM ALREADY USES: a checkbox per
	// row, a bar that appears only while something is checked, and `runBulk`
	// for the writes -- the shared implementation, so one refusal never
	// obscures whether the rest landed and a partial result leaves exactly the
	// refused ids selected for the retry.
	//
	// THERE IS NO BULK RPC AND THIS DOES NOT WANT ONE. `app_feedback_set_status`
	// takes a single id, so a batch is N independent writes that cannot be
	// atomic; the answer the constraint calls for is a PER-ITEM OUTCOME, which
	// is what `feedbackBulkSummary` reports.
	let selected = $state<Set<string>>(new Set());
	let bulkBusy = $state(false);
	let bulkNote = $state<string | null>(null);

	/**
	 * WHAT A BULK ACTION WOULD ACTUALLY TOUCH, and every count, label and write
	 * below reads it rather than `selected` itself.
	 *
	 * A BULK ACTION OVER ROWS NOBODY CAN SEE is the failure this queue is least
	 * able to report: the filters here are the working surface (filter first,
	 * then act), so ids checked under one filter are routinely off screen under
	 * the next. Intersecting with `visible` at the point of use means a hidden
	 * row can never be moved by a press, while narrowing a facet and widening
	 * it again does not silently throw the selection away.
	 */
	const selectedRows = $derived(visible.filter((r) => selected.has(r.id)));
	const allShownSelected = $derived(
		visible.length > 0 && visible.every((r) => selected.has(r.id))
	);

	function toggleSelected(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	function selectAllShown() {
		selected = new Set(visible.map((r) => r.id));
		bulkNote = null;
	}

	function clearSelection() {
		selected = new Set();
		bulkNote = null;
	}

	async function bulkMove(status: FeedbackStatus) {
		const batch = selectedRows;
		if (bulkBusy || batch.length === 0) return;
		bulkBusy = true;
		error = null;
		bulkNote = null;
		// THE BUSY FLAG CLEARS IN `finally`. `runBulk` is a `Promise.all`, so a
		// transport that THROWS rather than answering `{ok:false}` rejects the
		// whole batch -- and a busy flag left set disables every control in this
		// bar for the rest of the session, over a queue somebody is part-way
		// through moving.
		try {
			const outcome = await runBulk(
				batch.map((r) => r.id),
				(id) => setStatus(id, status)
			);
			const landed = new Set(outcome.succeededIds);
			// Optimistic, exactly as the single-row move is: what landed shows its
			// new status before the parent reloads.
			const next = { ...moved };
			for (const id of outcome.succeededIds) next[id] = status;
			moved = next;
			const outcomes: FeedbackBulkOutcome[] = batch.map((row) => ({
				row,
				ok: landed.has(row.id),
				message: landed.has(row.id) ? null : outcome.firstFailureMessage
			}));
			bulkNote = feedbackBulkSummary(status, outcomes);
			// Only what did NOT move stays checked, so pressing again retries the
			// rest rather than re-sending the ones already through.
			selected = new Set(outcome.failedIds);
		} catch (e) {
			// A THROW SAYS NOTHING ABOUT WHICH WRITES LANDED, so the selection is
			// left exactly as it was and the sentence says so rather than
			// implying none of them did.
			error = `${(e as Error).message || 'That batch failed.'} Some of the selected reports may already have moved -- reload before pressing again.`;
		} finally {
			bulkBusy = false;
		}
	}

	let exportNote = $state<string | null>(null);

	/**
	 * WHETHER THE NAMES LEAVE WITH THE BUNDLE, decided HERE rather than noticed
	 * afterwards. Included by default: knowing who to go and ask is most of what
	 * makes a report actionable, and a queue that quietly anonymised everything
	 * would be answering a question nobody asked. The bundle states which way
	 * this was set, so a bundle with no names cannot be read as a bundle from
	 * nobody.
	 */
	let includeSubmitter = $state(true);
	const identityNote = $derived(
		includeSubmitter
			? ''
			: ' Submitter names, addresses and anonymous contact strings were withheld.'
	);

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
		const bundle = feedbackMarkdown(visible, {
			filter,
			generatedAt: stamp,
			includeSubmitter,
			classroomSections: sectionMap
		});
		download(feedbackExportName('md', stamp.slice(0, 19)), bundle.text, 'text/markdown');
		const shape = bundle.grouped ? ' Grouped by route.' : '';
		exportNote =
			bundle.dropped > 0
				? `Exported ${bundle.included} of ${visible.length} filtered reports as markdown. ${bundle.dropped} did not fit the pasteable budget and are named at the end of the file.${shape}${identityNote}`
				: `Exported ${bundle.included} filtered report${bundle.included === 1 ? '' : 's'} as markdown.${shape}${identityNote}`;
	}

	function exportJson() {
		const stamp = new Date(now()).toISOString();
		const text = feedbackJson(visible, {
			filter,
			generatedAt: stamp,
			includeSubmitter,
			classroomSections: sectionMap
		});
		download(feedbackExportName('json', stamp.slice(0, 19)), text, 'application/json');
		exportNote = `Exported ${visible.length} filtered report${visible.length === 1 ? '' : 's'} as JSON.${identityNote}`;
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
			<!-- FILTER FIRST, THEN SELECT. It sits beside the count it acts on
			     rather than in the bulk bar below, because the bulk bar appears
			     only once something is checked and a select-all inside it would
			     be a control you can only reach after doing its job by hand. -->
			<button
				type="button"
				class="fbc-control btn secondary"
				disabled={visible.length === 0 || allShownSelected}
				data-testid="fbc-select-all"
				onclick={selectAllShown}
			>
				Select all shown
			</button>
			<label class="export-identity" for="fbc-identity">
				<input
					id="fbc-identity"
					class="fbc-control"
					type="checkbox"
					bind:checked={includeSubmitter}
				/>
				<!-- A contact string is the only thing on an anonymous row that can
				     name a person, so it travels with this decision rather than
				     beside it. -->
				<span>Include submitter names and contacts</span>
			</label>
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

		<!-- THE BULK BAR, on the class stream's own terms: it appears only while
		     something is checked, it sits above the list it acts on, and its
		     controls carry the 44px floor because a mis-hit here moves somebody
		     else's reports. -->
		{#if selectedRows.length > 0}
			<div class="bulk-bar" data-testid="fbc-bulk-bar">
				<span class="bulk-count" data-testid="fbc-bulk-count">
					{selectedRows.length} selected
				</span>
				{#each STATUSES as s (s.id)}
					<button
						type="button"
						class="fbc-control btn secondary"
						disabled={bulkBusy}
						data-testid="fbc-bulk-{s.id}"
						onclick={() => bulkMove(s.id)}
					>
						{s.label}
					</button>
				{/each}
				<button
					type="button"
					class="fbc-control btn secondary"
					disabled={bulkBusy}
					data-testid="fbc-bulk-clear"
					onclick={clearSelection}
				>
					Clear selection
				</button>
			</div>
		{/if}
		{#if bulkNote}
			<!-- NAMED, NOT COUNTED. A partial batch has to say which reports
			     moved, or the next press repeats the half that already did. -->
			<p class="note bulk-note" aria-live="polite" data-testid="fbc-bulk-note">{bulkNote}</p>
		{/if}

		{#if visible.length === 0}
			<section class="card">
				<p class="note">Nothing matches those filters.</p>
			</section>
		{:else}
			{#each visible as row (row.id)}
				<article class="card fb-row" class:resolved={statusOf(row) === 'resolved'}>
					<div class="fb-head">
						<input
							type="checkbox"
							class="fbc-control fb-select"
							checked={selected.has(row.id)}
							aria-label="Select the report from {rowRoute(row)}"
							data-testid="fbc-select-{row.id}"
							onchange={() => toggleSelected(row.id)}
						/>
						<span class="fb-kind">{row.kind}</span>
						<span class="fb-page">{rowRoute(row)}</span>
						<span class="fb-when">{whenLabel(row.created_at)}</span>
						<span class="fb-status status-{statusOf(row)}">{statusOf(row)}</span>
					</div>
					<p class="fb-message">{row.message}</p>
					<ul class="fb-context">
						{#if rowDistinctPath(row)}<li>path {rowDistinctPath(row)}</li>{/if}
						{#if rowRole(row)}<li>role {rowRole(row)}</li>{/if}
						{#if rowSection(row)}<li>section {resolveSectionId(rowSection(row), sectionMap)?.label}</li>{/if}
						{#if rowViewport(row)}<li>viewport {rowViewport(row)}</li>{/if}
						{#if rowUserAgentSummary(row)}<li>{rowUserAgentSummary(row)}</li>{/if}
						{#if rowStatusCode(row) !== null}<li>http {rowStatusCode(row)}</li>{/if}
						{#if rowErrorId(row)}<li>error id {rowErrorId(row)}</li>{/if}
						{#each metaExtras(row) as extra (extra.key)}<li>{extra.key} {extra.value}</li>{/each}
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
							{#if rowIsAnonymous(row)}
								<!-- THE WORD, not a colour and not a blank. -->
								<span class="fb-anon">Anonymous</span>
								{#if rowContact(row)}
									<span class="fb-contact">
										asked to be reached at "{rowContact(row)}"
									</span>
									<span class="fb-contact-warn">
										typed by the reporter, nothing verified it
									</span>
								{:else}
									<span class="fb-contact-warn">left no way to be reached</span>
								{/if}
							{:else}
								{row.submitter_name || row.submitter_email || 'unknown'}
								{#if row.submitter_email}<span class="fb-email">{row.submitter_email}</span>{/if}
							{/if}
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
		border: 1px solid var(--boundary);
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
		border: 1px solid var(--boundary);
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
	/* THE BULK BAR: a peer of the export row above it, appearing only while
	   something is checked, and sitting above the list it acts on. Its
	   controls carry `.fbc-control` like every other control on this page, so
	   the 44px floor is stated once rather than re-derived per bar. */
	.bulk-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
	}
	.bulk-count {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		margin-right: var(--space-1);
	}
	.bulk-note {
		margin: 0 0 var(--space-3);
	}
	/* The checkbox leads the row's head line; `flex: none` keeps it from being
	   stretched by the wrapping row around it. */
	.fb-select {
		flex: none;
	}
	.export-identity {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
		cursor: pointer;
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
	.fb-context li {
		/* A key nobody anticipated carries a value nobody bounded either: this
		   list renders whatever is in meta beyond the named fields above it. */
		overflow-wrap: anywhere;
		max-width: 100%;
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
	/* THE WORD CARRIES IT, not the colour: --text-2 is the same tone the row's
	   other metadata uses, so nothing here reads as a status. */
	.fb-anon {
		font-family: var(--font-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.fb-contact {
		font-size: 0.78rem;
		/* A reporter's own words, so they get the reading face the message has. */
		color: var(--text-1);
	}
	.fb-contact-warn {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--text-3);
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
