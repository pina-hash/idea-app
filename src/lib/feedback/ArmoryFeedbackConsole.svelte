<script lang="ts">
	import { runBulk } from '$lib/classroom/classroom';
	import Disclosure from '$lib/Disclosure.svelte';
	import { FEEDBACK_STATUSES, type FeedbackStatus } from './feedback';
	import { saveText } from './download';
	import {
		ARMORY_REPORT_LINK_HELP,
		EMPTY_ARMORY_FEEDBACK_FILTER,
		armoryExportDay,
		armoryFeedbackExportName,
		armoryFeedbackKindWord,
		armoryFeedbackMarkdown,
		armoryMoveSummary,
		armoryWhen,
		armoryWho,
		distinctValues,
		filterArmoryFeedback,
		type ArmoryFeedbackFilter,
		type ArmoryFeedbackRow
	} from './armory-reports';

	/**
	 * THE ARMORY APP'S NOTES (website requests v0.3, item 4): what people sent
	 * from inside the IDEA Armory Windows app, newest first, with a status.
	 *
	 * PRESENTATION + TRANSPORTS ONLY, the site console's convention: the page
	 * owns the load and hands in `setStatus`, and `/dev/feedback` mounts the
	 * identical component against an in-memory store. ABSENCE REMOVES THE
	 * CONTROL: with no `setStatus` there are no status keys and no bulk bar.
	 *
	 * EVERY STRING HERE IS SOMEBODY ELSE'S TEXT and is interpolated as plain
	 * text, never raw-rendered: the body, the device name and the whole context
	 * object, which is shown as JSON inside a `<pre>`.
	 */
	let {
		rows,
		unavailable = null,
		setStatus,
		screenshotUrl,
		now = () => Date.now()
	}: {
		rows: ArmoryFeedbackRow[];
		/** Why there is nothing to show (the database is not updated, or the read failed). */
		unavailable?: string | null;
		setStatus?: (id: string, status: FeedbackStatus) => Promise<{ ok: boolean; message?: string }>;
		/** 0235: a short-lived link to a note's screenshot, on the admin's own client. Absent, the note says one is attached. */
		screenshotUrl?: (path: string) => Promise<string | null>;
		now?: () => number;
	} = $props();

	const STATUSES = FEEDBACK_STATUSES;
	const NOUN = { one: 'note', many: 'notes' };

	let filter = $state<ArmoryFeedbackFilter>({ ...EMPTY_ARMORY_FEEDBACK_FILTER, status: 'new' });
	let moved = $state<Record<string, FeedbackStatus>>({});
	let busy = $state(false);
	let error = $state<string | null>(null);
	let note = $state<string | null>(null);
	let shotError = $state<Record<string, string>>({});

	async function openShot(row: ArmoryFeedbackRow) {
		if (!screenshotUrl || !row.screenshot_path) return;
		// Opened first, inside the click, so a popup blocker lets it through; filled once the link is signed.
		const tab = window.open('about:blank', '_blank');
		const url = await screenshotUrl(row.screenshot_path).catch(() => null);
		if (url && tab) tab.location.href = url;
		else {
			tab?.close();
			shotError = { ...shotError, [row.id]: 'The screenshot could not be opened. Try again in a minute.' };
		}
	}
	let selected = $state<Set<string>>(new Set());
	let includeSubmitter = $state(true);

	function statusOf(row: ArmoryFeedbackRow): FeedbackStatus {
		return moved[row.id] ?? row.status;
	}

	const visible = $derived(filterArmoryFeedback(rows, filter, statusOf));
	const counts = $derived(
		Object.fromEntries(
			STATUSES.map((s) => [s.id, rows.filter((r) => statusOf(r) === s.id).length])
		) as Record<FeedbackStatus, number>
	);
	const kinds = $derived(distinctValues(rows, (r) => r.kind || null));
	const versions = $derived(distinctValues(rows, (r) => r.app_version || null));
	const people = $derived(distinctValues(rows, (r) => r.email || null));
	const nameOf = $derived(new Map(rows.map((r) => [r.email, armoryWho(r)])));

	/** What an action would touch: only rows on screen (the site console's rule). */
	const selectedRows = $derived(visible.filter((r) => selected.has(r.id)));
	const allShownSelected = $derived(visible.length > 0 && visible.every((r) => selected.has(r.id)));
	/** The export takes the selection, or everything shown when nothing is selected. */
	const exportRows = $derived(selectedRows.length > 0 ? selectedRows : visible);

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
			// Only what did not move stays selected, so pressing again retries the rest.
			selected = new Set(outcome.failedIds.filter((id) => selected.has(id)));
		} catch (e) {
			error = `${(e as Error).message || 'That move failed.'} Some notes may already have moved; reload before pressing again.`;
		} finally {
			busy = false;
		}
	}

	function exportMarkdown() {
		const list = exportRows;
		if (list.length === 0) return;
		const stamp = new Date(now()).toISOString();
		const text = armoryFeedbackMarkdown(list, { generatedAt: stamp, includeSubmitter });
		saveText(armoryFeedbackExportName(armoryExportDay(now())), text, 'text/markdown');
		note = `Exported ${list.length} ${list.length === 1 ? 'note' : 'notes'} as Markdown.${includeSubmitter ? '' : ' Names and addresses were withheld.'}`;
	}

	function contextText(row: ArmoryFeedbackRow): string {
		return JSON.stringify(row.context ?? {}, null, 2);
	}
</script>

<main class="af-page cr-instructor-surface" data-testid="armory-feedback-console">
	<section class="hero">
		<div class="eyebrow">IDEA // Admin</div>
		<h1>Armory app feedback</h1>
		<p class="lead">
			Notes sent from inside the IDEA Armory app, newest first, with the app version and the
			computer they came from.
		</p>
		<p class="lead" data-testid="armory-report-link-help">{ARMORY_REPORT_LINK_HELP}</p>
	</section>

	{#if unavailable}
		<section class="card">
			<p class="af-note" data-testid="armory-unavailable">{unavailable}</p>
		</section>
	{:else}
		{#if error}
			<p class="af-error" role="alert">{error}</p>
		{/if}

		<!-- A ROW OF FILTER KEYS, each pressed or not: a group of aria-pressed
		     buttons, not tabs, because nothing here is a tab panel and the keys
		     are reached with Tab like any other button. -->
		<div class="af-tabs" role="group" aria-label="Status filter">
			{#each [...STATUSES.map((s) => ({ id: s.id, label: `${s.label} (${counts[s.id]})` })), { id: 'all' as const, label: `All (${rows.length})` }] as f (f.id)}
				<button
					type="button"
					class="af-control af-tab"
					class:active={filter.status === f.id}
					aria-pressed={filter.status === f.id}
					data-testid="af-status-{f.id}"
					onclick={() => (filter = { ...filter, status: f.id })}
				>
					{f.label}
				</button>
			{/each}
		</div>

		<section class="card af-facets">
			<div class="af-facet">
				<label class="af-label" for="af-kind">Kind</label>
				<select id="af-kind" class="af-control af-input" bind:value={filter.kind}>
					<option value="">Any kind</option>
					{#each kinds as k (k)}<option value={k}>{armoryFeedbackKindWord(k)}</option>{/each}
				</select>
			</div>
			<div class="af-facet">
				<label class="af-label" for="af-version">App version</label>
				<select id="af-version" class="af-control af-input" bind:value={filter.version}>
					<option value="">Any version</option>
					{#each versions as v (v)}<option value={v}>{v}</option>{/each}
				</select>
			</div>
			<div class="af-facet">
				<label class="af-label" for="af-person">Person</label>
				<select id="af-person" class="af-control af-input" bind:value={filter.person}>
					<option value="">Anyone</option>
					{#each people as p (p)}<option value={p}>{nameOf.get(p) ?? p}</option>{/each}
				</select>
			</div>
		</section>

		<div class="af-bar">
			<span class="af-count" data-testid="af-count">{visible.length} of {rows.length} shown</span>
			<button
				type="button"
				class="af-control btn secondary"
				disabled={visible.length === 0 || allShownSelected}
				data-testid="af-select-all"
				onclick={() => (selected = new Set(visible.map((r) => r.id)))}
			>
				Select all shown
			</button>
			<label class="af-identity">
				<input class="af-control" type="checkbox" bind:checked={includeSubmitter} />
				<span>Include submitter names</span>
			</label>
			<button
				type="button"
				class="af-control btn secondary"
				disabled={exportRows.length === 0}
				data-testid="af-export"
				onclick={exportMarkdown}
			>
				{selectedRows.length > 0
					? `Export ${selectedRows.length} selected`
					: `Export ${visible.length} shown`} as Markdown
			</button>
		</div>

		{#if setStatus && selectedRows.length > 0}
			<div class="af-bulk" data-testid="af-bulk-bar">
				<span class="af-count">{selectedRows.length} selected</span>
				{#each STATUSES as s (s.id)}
					<button
						type="button"
						class="af-control btn secondary"
						disabled={busy}
						data-testid="af-bulk-{s.id}"
						onclick={() => move(selectedRows.map((r) => r.id), s.id)}
					>
						{s.label}
					</button>
				{/each}
				<button
					type="button"
					class="af-control btn secondary"
					disabled={busy}
					onclick={() => (selected = new Set())}
				>
					Clear selection
				</button>
			</div>
		{/if}
		{#if note}
			<p class="af-note af-done" aria-live="polite" data-testid="af-note">{note}</p>
		{/if}

		{#if visible.length === 0}
			<section class="card">
				<p class="af-note">
					{rows.length === 0 ? 'Nothing has been sent from the Armory app yet.' : 'Nothing matches those filters.'}
				</p>
			</section>
		{:else}
			{#each visible as row (row.id)}
				<article class="card af-row" class:af-resolved={statusOf(row) === 'resolved'} data-testid="af-row">
					<div class="af-head">
						<input
							type="checkbox"
							class="af-control af-select"
							checked={selected.has(row.id)}
							aria-label="Select the note from {armoryWho(row)}"
							onchange={() => toggle(row.id)}
						/>
						<span class="af-chip">{armoryFeedbackKindWord(row.kind)}</span>
						<span class="af-version">version {row.app_version || 'unknown'}</span>
						<span class="af-when">{armoryWhen(row.created_at)}</span>
						<span class="af-chip af-status-{statusOf(row)}">{statusOf(row)}</span>
					</div>
					{#if row.area}<p class="af-meta" data-testid="af-area">About: {row.area}</p>{/if}
					<p class="af-body">{row.body}</p>
					{#if row.tried}
						<p class="af-meta af-tried-label">What they tried</p>
						<p class="af-body" data-testid="af-tried">{row.tried}</p>
					{/if}
					{#if row.screenshot_path}
						<p class="af-meta" data-testid="af-screenshot">
							{#if screenshotUrl}
								<button type="button" class="af-control btn secondary" onclick={() => openShot(row)}>Open the screenshot</button>
							{:else}
								A screenshot of the app window is attached.
							{/if}
							{#if shotError[row.id]}<span class="af-error" role="alert"> {shotError[row.id]}</span>{/if}
						</p>
					{/if}
					<p class="af-meta">
						From {armoryWho(row)}{#if row.submitter_name && row.email}<span class="af-email"> {row.email}</span>{/if}{#if row.device_name}, on {row.device_name}{/if}
					</p>
					<div class="af-context">
						<Disclosure label="Context" collapseWhen={true}>
							<pre class="af-pre" data-testid="af-context">{contextText(row)}</pre>
						</Disclosure>
					</div>
					{#if setStatus}
						<div class="af-actions">
							{#each STATUSES as s (s.id)}
								<button
									type="button"
									class="af-control btn secondary"
									disabled={busy || statusOf(row) === s.id}
									onclick={() => move([row.id], s.id)}
								>
									{s.label}
								</button>
							{/each}
						</div>
					{/if}
					{#if row.reviewed_by && statusOf(row) === row.status}
						<p class="af-meta">
							Last moved by {row.reviewed_by}{#if armoryWhen(row.reviewed_at)} on {armoryWhen(row.reviewed_at)}{/if}
						</p>
					{/if}
				</article>
			{/each}
		{/if}
	{/if}
</main>

<style>
	.af-page {
		max-width: var(--cr-measure, var(--measure-form));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
		min-width: 0;
	}
	/* The tap-target floor, once for every control on the page. */
	.af-control {
		min-height: 44px;
		min-width: 44px;
	}
	.af-tabs,
	.af-bar,
	.af-bulk,
	.af-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: var(--space-3, 0.75rem);
	}
	.af-actions {
		margin: var(--space-2, 0.5rem) 0 0;
	}
	.af-tab {
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
	.af-tab.active {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.af-facets {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3, 0.75rem);
		margin-bottom: var(--space-3, 0.75rem);
	}
	.af-facet {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		flex: 1 1 9rem;
	}
	.af-label {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.af-input {
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
	.af-count {
		flex: 1;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.af-bulk {
		padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 6px);
	}
	.af-identity {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
		cursor: pointer;
	}
	.af-note {
		color: var(--text-2);
		font-size: 0.9rem;
		margin: 0;
	}
	.af-done {
		margin: 0 0 var(--space-3, 0.75rem);
	}
	.af-error {
		margin: 0 0 0.8rem;
		padding: var(--space-2, 0.5rem) 0.65rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--amber);
		border: 1px solid var(--amber);
		border-radius: var(--radius-card, 6px);
	}
	.af-row {
		margin-bottom: 0.8rem;
		min-width: 0;
	}
	.af-resolved {
		opacity: 0.72;
	}
	.af-head {
		display: flex;
		align-items: center;
		gap: var(--space-2, 0.5rem);
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.af-select {
		flex: none;
	}
	.af-chip {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.02rem 0.5rem;
		color: var(--text-2);
	}
	.af-status-new,
	.af-status-seen {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.af-status-spam {
		color: var(--amber);
		border-color: var(--amber);
	}
	.af-version {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.af-when {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-2);
		margin-left: auto;
	}
	.af-body {
		margin: 0 0 var(--space-2, 0.5rem);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		line-height: 1.55;
		font-size: 0.95rem;
	}
	.af-meta {
		margin: 0 0 var(--space-1, 0.25rem);
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.af-email {
		color: var(--text-2);
	}
	.af-context {
		min-width: 0;
	}
	/* THE CONTEXT SCROLLS INSIDE ITS OWN BOX, with its scrollbar showing, and
	   never pushes the page sideways on a phone. */
	.af-pre {
		margin: var(--space-1, 0.25rem) 0 0;
		max-height: 22rem;
		overflow: auto;
		padding: var(--space-2, 0.5rem);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.45;
		color: var(--text-1);
		white-space: pre;
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
	}
	@media (max-width: 560px) {
		.af-when {
			margin-left: 0;
		}
	}
</style>
