<script lang="ts">
	/**
	 * LOGS AND EXPORTS (the spec's last certifier screen): lit tab keys for
	 * Sync, Audit, Errors and Events, each a table of the rows the load
	 * fetched; and an Export panel: a kind over `EXPORT_KINDS`, from and to
	 * dates, and ONE link to `CERT_API.exportLogs` that downloads the ZIP
	 * (JSON plus CSV plus a README for a Claude chat).
	 */
	import { EXPORT_KINDS, type ExportKind } from '$lib/certifications/types';
	import { formatCertDateTime } from '$lib/certifications/status';
	import { EXPORT_README_SENTENCE, cellWords, daysAgo, exportQuery, rowColumns, type SyncLogRow } from './desk';

	let {
		sync,
		audit = null,
		errors = null,
		events = null,
		isAdmin = false,
		today
	}: {
		sync: SyncLogRow[];
		/** Null when the caller may not read it (a certifier) or it is not available. */
		audit?: Record<string, unknown>[] | null;
		errors?: Record<string, unknown>[] | null;
		events?: Record<string, unknown>[] | null;
		isAdmin?: boolean;
		/** YYYY-MM-DD in school time, from the load's one clock read. */
		today: string;
	} = $props();

	type Tab = 'sync' | 'audit' | 'errors' | 'events';
	const tabs: { id: Tab; word: string; adminOnly: boolean }[] = [
		{ id: 'sync', word: 'Sync', adminOnly: false },
		{ id: 'audit', word: 'Audit', adminOnly: true },
		{ id: 'errors', word: 'Errors', adminOnly: true },
		{ id: 'events', word: 'Events', adminOnly: false }
	];
	const offered = $derived(tabs.filter((t) => !t.adminOnly || isAdmin));
	let tab = $state<Tab>('sync');

	let kind = $state<ExportKind>('events');
	// svelte-ignore state_referenced_locally
	let from = $state(daysAgo(today, 7));
	// svelte-ignore state_referenced_locally
	let to = $state(today);
	const href = $derived(exportQuery(kind, from, to));

	const KIND_WORDS: Record<ExportKind, string> = {
		events: 'Events (every recorded event)',
		audit: 'Audit (writes with a reason, and award actions)',
		sync: 'Sync (every FRC mirror call)',
		errors: 'Errors (server failures)',
		attempts: 'Attempts',
		awards: 'Awards',
		exams: 'Exams (draws, scores, flags)',
		watch: 'Watch sessions',
		practice: 'Practice and quick checks',
		notifications: 'Notifications'
	};
</script>

<div class="dk-logs" data-testid="cert-logs">
	<div class="dk-tabkeys" role="group" aria-label="Logs">
		{#each offered as t (t.id)}
			<button type="button" class="btn cert-btn {tab === t.id ? 'on' : 'secondary'}" aria-pressed={tab === t.id} onclick={() => (tab = t.id)} data-testid="cert-logs-tab" data-tab={t.id}>{t.word}</button>
		{/each}
	</div>

	<section class="cert-panel" id="log" aria-labelledby="cert-logs-h" data-testid="cert-logs-table" data-tab={tab}>
		<h2 id="cert-logs-h">{tabs.find((t) => t.id === tab)?.word}</h2>
		{#if tab === 'sync'}
			{#if sync.length === 0}
				<p class="dk-empty" data-testid="cert-logs-empty">No mirror call has been logged yet.</p>
			{:else}
				<div class="dk-table-wrap">
					<table class="dk-table cert-well">
						<thead><tr><th>When</th><th>Trigger</th><th>Result</th><th>Catalog</th><th>Holders</th><th>Source revision</th><th>Error</th><th>Time</th></tr></thead>
						<tbody>
							{#each sync as row (row.id)}
								<tr data-testid="cert-sync-row" data-ok={row.ok ? 'yes' : 'no'}>
									<td class="dk-mono">{formatCertDateTime(row.at)}</td>
									<td>{row.trigger}</td>
									<td>
										{#if row.ok}<span class="cert-readout is-ok"><span aria-hidden="true">✓</span>Sent</span>{:else}<span class="cert-readout is-bad"><span aria-hidden="true">x</span>Failed{row.http_status ? ` (${row.http_status})` : ''}</span>{/if}
									</td>
									<td class="dk-mono">{row.catalog_count}</td>
									<td class="dk-mono">{row.holder_count}</td>
									<td class="dk-mono">{row.source_revision ?? ''}</td>
									<td class="dk-cell-wrap">{row.error ?? ''}</td>
									<td class="dk-mono">{row.duration_ms} ms</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{:else}
			{@const rows = tab === 'audit' ? audit : tab === 'errors' ? errors : events}
			{#if rows === null}
				<p class="dk-empty" data-testid="cert-logs-unavailable">This log is not available to you here. An admin reads it, and the export below carries it.</p>
			{:else if rows.length === 0}
				<p class="dk-empty" data-testid="cert-logs-empty">Nothing in the last seven days.</p>
			{:else}
				{@const columns = rowColumns(rows)}
				<div class="dk-table-wrap">
					<table class="dk-table cert-well">
						<thead><tr>{#each columns as c (c)}<th>{c}</th>{/each}</tr></thead>
						<tbody>
							{#each rows as row, i (i)}
								<tr data-testid="cert-log-row">
									{#each columns as c (c)}<td class="dk-cell-wrap {c === 'at' || c === 'id' ? 'dk-mono' : ''}">{c === 'at' && typeof row[c] === 'string' ? formatCertDateTime(row[c] as string) : cellWords(row[c])}</td>{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="dk-row-meta">{rows.length} row{rows.length === 1 ? '' : 's'} in the last seven days.</p>
			{/if}
		{/if}
	</section>

	<section class="cert-panel" id="export" aria-labelledby="cert-logs-export-h" data-testid="cert-logs-export">
		<h2 id="cert-logs-export-h">Export</h2>
		<p class="cert-help">{EXPORT_README_SENTENCE}</p>
		<div class="dk-fields">
			<label class="cert-field"><span>What</span>
				<select bind:value={kind} data-testid="cert-export-kind">
					{#each EXPORT_KINDS as k (k)}
						<option value={k} disabled={!isAdmin && (k === 'audit' || k === 'errors')}>{KIND_WORDS[k]}{!isAdmin && (k === 'audit' || k === 'errors') ? ' (admin only)' : ''}</option>
					{/each}
				</select>
			</label>
			<label class="cert-field"><span>From</span><input type="date" bind:value={from} /></label>
			<label class="cert-field"><span>To</span><input type="date" bind:value={to} /></label>
		</div>
		<div class="cert-actions">
			<a class="btn cert-btn" {href} download data-testid="cert-export-download">Download JSON + CSV</a>
			<span class="dk-row-meta">{href}</span>
		</div>
	</section>
</div>
