<script lang="ts">
	import { runBulk } from '$lib/classroom/classroom';
	import Disclosure from '$lib/Disclosure.svelte';
	import { FEEDBACK_STATUSES, type FeedbackStatus } from './feedback';
	import { saveBytes, saveText } from './download';
	import {
		ARMORY_INCIDENT_WAVE_NOTE,
		ARMORY_REPORT_LINK_HELP,
		ARMORY_INCIDENT_ZIP_BUDGET,
		ARMORY_NO_PROJECT,
		EMPTY_ARMORY_INCIDENT_FILTER,
		INCIDENT_DAY_WINDOW,
		armoryExportDay,
		armoryMoveSummary,
		armoryWhen,
		armoryWho,
		buildIncidentZip,
		byteWords,
		distinctValues,
		filterArmoryIncidents,
		groupIncidents,
		incidentCountsByDay,
		incidentFileJson,
		incidentFileName,
		incidentKindWord,
		type ArmoryIncidentFilter,
		type ArmoryIncidentRow,
		deviceWithMachine
	} from './armory-reports';

	/**
	 * THE ARMORY APP'S INCIDENTS (website requests v0.3, item 4b): reports the
	 * app writes for itself when something goes wrong, grouped by kind and app
	 * version, with how many arrived on each of the last two weeks' school days.
	 *
	 * THE LIST NEVER CARRIES A REPORT. A report can be a megabyte, so the list
	 * read projects only its size; the full report is fetched at the moment it is
	 * downloaded, through `fetchReports`, on the admin's own client. ABSENCE
	 * REMOVES THE CONTROL: with no `fetchReports` there is no download, and with
	 * no `setStatus` there are no status keys.
	 *
	 * ONE FILE PER PRESS. A card downloads its own incident; a selection goes out
	 * as ONE zip, because a browser blocks a page that starts a dozen downloads
	 * from a single click.
	 *
	 * Incidents older than 90 days are deleted by the database (decision D4), so
	 * this list is the last 90 days and says so.
	 */
	let {
		rows,
		unavailable = null,
		setStatus,
		fetchReports,
		now = () => Date.now()
	}: {
		rows: ArmoryIncidentRow[];
		unavailable?: string | null;
		setStatus?: (id: string, status: FeedbackStatus) => Promise<{ ok: boolean; message?: string }>;
		/**
		 * The full reports for these ids, read when a download is pressed. An id
		 * missing from the answer is a report that could not be read, and the
		 * console says so rather than writing a file without it.
		 */
		fetchReports?: (ids: string[]) => Promise<Map<string, unknown>>;
		now?: () => number;
	} = $props();

	const STATUSES = FEEDBACK_STATUSES;
	const NOUN = { one: 'incident', many: 'incidents' };

	let filter = $state<ArmoryIncidentFilter>({ ...EMPTY_ARMORY_INCIDENT_FILTER, status: 'new' });
	let moved = $state<Record<string, FeedbackStatus>>({});
	let busy = $state(false);
	let downloading = $state(false);
	let error = $state<string | null>(null);
	let note = $state<string | null>(null);
	let selected = $state<Set<string>>(new Set());
	let includeSubmitter = $state(true);

	function statusOf(row: ArmoryIncidentRow): FeedbackStatus {
		return moved[row.id] ?? row.status;
	}

	const visible = $derived(filterArmoryIncidents(rows, filter, statusOf));
	const groups = $derived(groupIncidents(visible));
	const today = $derived(armoryExportDay(now()));
	const perDay = $derived(incidentCountsByDay(visible, today));
	const busiest = $derived(Math.max(1, ...perDay.map((d) => d.count)));
	const counts = $derived(
		Object.fromEntries(
			STATUSES.map((s) => [s.id, rows.filter((r) => statusOf(r) === s.id).length])
		) as Record<FeedbackStatus, number>
	);
	const kinds = $derived(distinctValues(rows, (r) => r.kind || null));
	const versions = $derived(distinctValues(rows, (r) => r.app_version || null));
	const people = $derived(distinctValues(rows, (r) => r.email || null));
	const nameOf = $derived(new Map(rows.map((r) => [r.email, armoryWho(r)])));
	const projects = $derived(
		[...new Map(rows.filter((r) => r.project_id).map((r) => [r.project_id as string, r.project_name || 'Unnamed project'])).entries()].sort(
			(a, b) => a[1].localeCompare(b[1])
		)
	);
	const anyWithoutProject = $derived(rows.some((r) => !r.project_id));

	const selectedRows = $derived(visible.filter((r) => selected.has(r.id)));
	const allShownSelected = $derived(visible.length > 0 && visible.every((r) => selected.has(r.id)));
	const zipRows = $derived(selectedRows.length > 0 ? selectedRows : visible);

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	async function move(ids: string[], status: FeedbackStatus) {
		if (!setStatus || busy || ids.length === 0) return;
		busy = true;
		error = null;
		note = null;
		try {
			const outcome = await runBulk(ids, (id) => setStatus(id, status));
			const next = { ...moved };
			for (const id of outcome.succeededIds) next[id] = status;
			moved = next;
			note = armoryMoveSummary(
				NOUN,
				status,
				outcome.succeededIds.length,
				outcome.failedIds.length,
				outcome.firstFailureMessage
			);
			selected = new Set(outcome.failedIds.filter((id) => selected.has(id)));
		} catch (e) {
			error = `${(e as Error).message || 'That move failed.'} Some incidents may already have moved; reload before pressing again.`;
		} finally {
			busy = false;
		}
	}

	async function downloadOne(row: ArmoryIncidentRow) {
		if (!fetchReports || downloading) return;
		downloading = true;
		error = null;
		try {
			const reports = await fetchReports([row.id]);
			if (!reports.has(row.id)) {
				error = 'That incident\'s full report could not be read, so nothing was downloaded. Reload and try again.';
				return;
			}
			saveText(incidentFileName(row), incidentFileJson(row, reports.get(row.id), { includeSubmitter }), 'application/json');
			note = `Downloaded ${incidentFileName(row)}.${includeSubmitter ? '' : ' The address and name were withheld.'}`;
		} catch (e) {
			error = `That download failed: ${(e as Error).message || 'unknown failure'}.`;
		} finally {
			downloading = false;
		}
	}

	async function downloadZip() {
		const list = zipRows;
		if (!fetchReports || downloading || list.length === 0) return;
		downloading = true;
		error = null;
		note = null;
		try {
			const reports = await fetchReports(list.map((r) => r.id));
			const zip = await buildIncidentZip(list, reports, { day: armoryExportDay(now()), includeSubmitter });
			if (zip.included === 0) {
				error = 'None of those reports could be read, so no zip was made. Reload and try again.';
				return;
			}
			saveBytes(zip.name, zip.bytes);
			const parts = [`Downloaded ${zip.included} ${zip.included === 1 ? 'incident' : 'incidents'} as ${zip.name}.`];
			if (zip.overBudget.length) {
				parts.push(
					`${zip.overBudget.length} did not fit: one zip carries at most ${Math.round(ARMORY_INCIDENT_ZIP_BUDGET / 1024 / 1024)} MB of reports. Select fewer and download again for the rest.`
				);
			}
			if (zip.notRead.length) {
				parts.push(`${zip.notRead.length} could not be read and are not in it.`);
			}
			if (!includeSubmitter) parts.push('Addresses and names were withheld.');
			note = parts.join(' ');
		} catch (e) {
			error = `That zip could not be built: ${(e as Error).message || 'unknown failure'}.`;
		} finally {
			downloading = false;
		}
	}

	function excerpt(text: string | null): string {
		const flat = (text ?? '').replace(/\s+/g, ' ').trim();
		return flat.length > 140 ? `${flat.slice(0, 137)}...` : flat;
	}
</script>

<main class="ai-page cr-instructor-surface" data-testid="armory-incident-console">
	<section class="hero">
		<div class="eyebrow">IDEA // Admin</div>
		<h1>Armory incidents</h1>
		<p class="lead">
			What the IDEA Armory app reported about itself when something went wrong, grouped by kind and
			app version. Incidents are kept for 90 days.
		</p>
		<p class="lead" data-testid="armory-report-link-help">{ARMORY_REPORT_LINK_HELP} {ARMORY_INCIDENT_WAVE_NOTE}</p>
	</section>

	{#if unavailable}
		<section class="card">
			<p class="ai-note" data-testid="armory-unavailable">{unavailable}</p>
		</section>
	{:else}
		{#if error}
			<p class="ai-error" role="alert">{error}</p>
		{/if}

		<!-- A ROW OF FILTER KEYS, each pressed or not: a group of aria-pressed
		     buttons, not tabs, because nothing here is a tab panel and the keys
		     are reached with Tab like any other button. -->
		<div class="ai-tabs" role="group" aria-label="Status filter">
			{#each [...STATUSES.map((s) => ({ id: s.id, label: `${s.label} (${counts[s.id]})` })), { id: 'all' as const, label: `All (${rows.length})` }] as f (f.id)}
				<button
					type="button"
					class="ai-control ai-tab"
					class:active={filter.status === f.id}
					aria-pressed={filter.status === f.id}
					data-testid="ai-status-{f.id}"
					onclick={() => (filter = { ...filter, status: f.id })}
				>
					{f.label}
				</button>
			{/each}
		</div>

		<section class="card ai-facets">
			<div class="ai-facet">
				<label class="ai-label" for="ai-person">Person</label>
				<select id="ai-person" class="ai-control ai-input" bind:value={filter.person} data-testid="ai-person">
					<option value="">Anyone</option>
					{#each people as p (p)}<option value={p}>{nameOf.get(p) ?? p}</option>{/each}
				</select>
			</div>
			<div class="ai-facet">
				<label class="ai-label" for="ai-project">Project</label>
				<select id="ai-project" class="ai-control ai-input" bind:value={filter.project} data-testid="ai-project">
					<option value="">Any project</option>
					{#each projects as [id, name] (id)}<option value={id}>{name}</option>{/each}
					{#if anyWithoutProject}<option value={ARMORY_NO_PROJECT}>No project</option>{/if}
				</select>
			</div>
			<div class="ai-facet">
				<label class="ai-label" for="ai-kind">Kind</label>
				<select id="ai-kind" class="ai-control ai-input" bind:value={filter.kind}>
					<option value="">Any kind</option>
					{#each kinds as k (k)}<option value={k}>{incidentKindWord(k)}</option>{/each}
				</select>
			</div>
			<div class="ai-facet">
				<label class="ai-label" for="ai-version">App version</label>
				<select id="ai-version" class="ai-control ai-input" bind:value={filter.version}>
					<option value="">Any version</option>
					{#each versions as v (v)}<option value={v}>{v}</option>{/each}
				</select>
			</div>
		</section>

		<section class="card ai-days" data-testid="ai-per-day">
			<Disclosure label="Per day" heading={2}>
				<table class="ai-day-table">
					<caption class="ai-caption">
						Incidents shown, by school day, for the last {INCIDENT_DAY_WINDOW} days.
					</caption>
					<thead>
						<tr><th scope="col">Day</th><th scope="col">Incidents</th></tr>
					</thead>
					<tbody>
						{#each perDay as d (d.day)}
							<tr data-testid="ai-day-row">
								<th scope="row" class="ai-day">{d.day}</th>
								<td class="ai-day-count">
									<span class="ai-day-n">{d.count}</span>
									<span class="ai-day-bar" aria-hidden="true" style="width: {Math.round((d.count / busiest) * 100)}%"></span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</Disclosure>
		</section>

		<div class="ai-bar">
			<span class="ai-count" data-testid="ai-count">{visible.length} of {rows.length} shown</span>
			<button
				type="button"
				class="ai-control btn secondary"
				disabled={visible.length === 0 || allShownSelected}
				data-testid="ai-select-all"
				onclick={() => (selected = new Set(visible.map((r) => r.id)))}
			>
				Select all shown
			</button>
			<label class="ai-identity">
				<input class="ai-control" type="checkbox" bind:checked={includeSubmitter} />
				<span>Include submitter names</span>
			</label>
			{#if fetchReports}
				<button
					type="button"
					class="ai-control btn secondary"
					disabled={zipRows.length === 0 || downloading}
					data-testid="ai-zip"
					onclick={downloadZip}
				>
					{downloading
						? 'Preparing...'
						: `Download ${zipRows.length} ${selectedRows.length > 0 ? 'selected' : 'shown'} as zip`}
				</button>
			{/if}
		</div>

		{#if setStatus && selectedRows.length > 0}
			<div class="ai-bulk" data-testid="ai-bulk-bar">
				<span class="ai-count">{selectedRows.length} selected</span>
				{#each STATUSES as s (s.id)}
					<button
						type="button"
						class="ai-control btn secondary"
						disabled={busy}
						onclick={() => move(selectedRows.map((r) => r.id), s.id)}
					>
						{s.label}
					</button>
				{/each}
				<button type="button" class="ai-control btn secondary" disabled={busy} onclick={() => (selected = new Set())}>
					Clear selection
				</button>
			</div>
		{/if}
		{#if note}
			<p class="ai-note ai-done" aria-live="polite" data-testid="ai-note">{note}</p>
		{/if}

		{#if groups.length === 0}
			<section class="card">
				<p class="ai-note">
					{rows.length === 0 ? 'No incidents in the last 90 days.' : 'Nothing matches those filters.'}
				</p>
			</section>
		{:else}
			<!-- The heading id is the group's POSITION, never its key: two keys
			     can fold to one id once their punctuation is replaced (a kind
			     "crash" at version "0.3.0" and "crash_0" at "3.0"), and a
			     duplicated id makes aria-labelledby name the wrong heading. -->
			{#each groups as group, gi (group.key)}
				<section class="ai-group" aria-labelledby="ai-group-{gi}" data-testid="ai-group">
					<h2 class="ai-group-title" id="ai-group-{gi}">
						{incidentKindWord(group.kind)}, version {group.version || 'unknown'} ({group.rows.length})
					</h2>
					{#each group.rows as row (row.id)}
						<article class="card ai-row" class:ai-resolved={statusOf(row) === 'resolved'} data-testid="ai-row">
							<div class="ai-head">
								<input
									type="checkbox"
									class="ai-control ai-select"
									checked={selected.has(row.id)}
									aria-label="Select the incident from {armoryWho(row)}"
									onchange={() => toggle(row.id)}
								/>
								<span class="ai-chip">{incidentKindWord(row.kind)}</span>
								<span class="ai-version">version {row.app_version || 'unknown'}</span>
								<span class="ai-when">{armoryWhen(row.created_at)}</span>
								<span class="ai-chip ai-status-{statusOf(row)}">{statusOf(row)}</span>
							</div>
							<p class="ai-summary">{row.summary}</p>
							<p class="ai-meta">
								From {armoryWho(row)}{#if row.device_name || row.machine_id}, on <span data-testid="armory-report-device">{deviceWithMachine(row.device_name, row.machine_id)}</span>{/if}.
								{row.project_id ? `Project: ${row.project_name || 'Unnamed project'}.` : 'No project.'}
								Report {byteWords(row.report_bytes)}.
							</p>
							{#if row.feedback_body}
								<p class="ai-linked">
									<span class="ai-linked-label">Their note</span>
									<span class="ai-linked-text">{excerpt(row.feedback_body)}</span>
								</p>
							{/if}
							<div class="ai-actions">
								{#if fetchReports}
									<button
										type="button"
										class="ai-control btn secondary"
										disabled={downloading}
										data-testid="ai-download"
										onclick={() => downloadOne(row)}
									>
										Download .json
									</button>
								{/if}
								{#if setStatus}
									{#each STATUSES as s (s.id)}
										<button
											type="button"
											class="ai-control btn secondary"
											disabled={busy || statusOf(row) === s.id}
											onclick={() => move([row.id], s.id)}
										>
											{s.label}
										</button>
									{/each}
								{/if}
							</div>
							{#if row.reviewed_by && statusOf(row) === row.status}
								<p class="ai-meta">
									Last moved by {row.reviewed_by}{#if armoryWhen(row.reviewed_at)} on {armoryWhen(row.reviewed_at)}{/if}
								</p>
							{/if}
						</article>
					{/each}
				</section>
			{/each}
		{/if}
	{/if}
</main>

<style>
	.ai-page {
		max-width: var(--cr-measure, var(--measure-form));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
		min-width: 0;
	}
	.ai-control {
		min-height: 44px;
		min-width: 44px;
	}
	.ai-tabs,
	.ai-bar,
	.ai-bulk,
	.ai-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: var(--space-3, 0.75rem);
	}
	.ai-actions {
		margin: var(--space-2, 0.5rem) 0 0;
	}
	.ai-tab {
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
	.ai-tab.active {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.ai-facets {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3, 0.75rem);
		margin-bottom: var(--space-3, 0.75rem);
	}
	.ai-facet {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		flex: 1 1 9rem;
	}
	.ai-label {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.ai-input {
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
	.ai-days {
		margin-bottom: var(--space-3, 0.75rem);
	}
	.ai-day-table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}
	.ai-caption {
		caption-side: top;
		text-align: left;
		padding: 0 0 var(--space-1, 0.25rem);
		color: var(--text-2);
		font-size: 0.68rem;
	}
	.ai-day-table th,
	.ai-day-table td {
		text-align: left;
		padding: 0.15rem 0.5rem 0.15rem 0;
		color: var(--text-1);
		font-weight: 400;
	}
	.ai-day-table thead th {
		color: var(--text-2);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.ai-day {
		white-space: nowrap;
		width: 1%;
	}
	.ai-day-count {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.ai-day-n {
		min-width: 2ch;
		text-align: right;
	}
	/* Decoration beside the number, never instead of it: the count is text. */
	.ai-day-bar {
		display: inline-block;
		height: 0.5rem;
		max-width: 12rem;
		background: var(--boundary);
		border-radius: 2px;
	}
	.ai-count {
		flex: 1;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.ai-bulk {
		padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 6px);
	}
	.ai-identity {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
		cursor: pointer;
	}
	.ai-note {
		color: var(--text-2);
		font-size: 0.9rem;
		margin: 0;
	}
	.ai-done {
		margin: 0 0 var(--space-3, 0.75rem);
	}
	.ai-error {
		margin: 0 0 0.8rem;
		padding: var(--space-2, 0.5rem) 0.65rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--amber);
		border: 1px solid var(--amber);
		border-radius: var(--radius-card, 6px);
	}
	.ai-group {
		margin-bottom: var(--space-3, 0.75rem);
	}
	.ai-group-title {
		margin: var(--space-3, 0.75rem) 0 var(--space-2, 0.5rem);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 400;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.ai-group-title::before {
		content: none;
	}
	.ai-row {
		margin-bottom: 0.8rem;
		min-width: 0;
	}
	.ai-resolved {
		opacity: 0.72;
	}
	.ai-head {
		display: flex;
		align-items: center;
		gap: var(--space-2, 0.5rem);
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.ai-select {
		flex: none;
	}
	.ai-chip {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.02rem 0.5rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.ai-status-new,
	.ai-status-seen {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.ai-status-spam {
		color: var(--amber);
		border-color: var(--amber);
	}
	.ai-version {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.ai-when {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-2);
		margin-left: auto;
	}
	.ai-summary {
		margin: 0 0 var(--space-2, 0.5rem);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		line-height: 1.55;
		font-size: 0.95rem;
	}
	.ai-meta {
		margin: 0 0 var(--space-1, 0.25rem);
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.ai-linked {
		display: flex;
		flex-direction: column;
		margin: 0 0 var(--space-2, 0.5rem);
		padding-left: var(--space-2, 0.5rem);
		border-left: 2px solid var(--hairline);
	}
	.ai-linked-label {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.ai-linked-text {
		font-size: 0.88rem;
		overflow-wrap: anywhere;
	}
	@media (max-width: 560px) {
		.ai-when {
			margin-left: 0;
		}
	}
</style>
