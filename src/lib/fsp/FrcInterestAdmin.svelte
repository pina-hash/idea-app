<script lang="ts">
	import type { FrcInterestRow } from '$lib/fsp/frc-interest';

	/**
	 * Teacher-only roster table for the FRC interest form, factored out of
	 * /fsp/frc-interest/admin so the dev harness can mount the exact same
	 * component against sample rows. Presentational + sortable only (no
	 * edit/delete for v1); sorting is local state over the `rows` prop.
	 */

	let { rows, ready }: { rows: FrcInterestRow[]; ready: boolean } = $props();

	type SortDir = 'asc' | 'desc';
	let sortDir = $state<SortDir>('desc');

	const sortedRows = $derived(
		[...rows].sort((a, b) => {
			const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
			return sortDir === 'asc' ? diff : -diff;
		})
	);

	function toggleSort() {
		sortDir = sortDir === 'desc' ? 'asc' : 'desc';
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<div class="admin-root">
	<header class="bar">
		<h1>FRC Team 5669 — Interest Submissions</h1>
		<span class="count">{rows.length} response{rows.length === 1 ? '' : 's'}</span>
	</header>

	{#if !ready}
		<p class="note">
			Apply migrations <code>0046_fsp_frc_interest.sql</code> and
			<code>0047_fsp_frc_interest_parent_email.sql</code> in the Supabase SQL editor to enable this
			roster.
		</p>
	{:else if rows.length === 0}
		<p class="note">No submissions yet.</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Email</th>
						<th>Phone</th>
						<th>Parent/guardian email</th>
						<th>Interest areas</th>
						<th>Prior experience</th>
						<th>
							<button class="sort-btn" onclick={toggleSort}>
								Submitted {sortDir === 'desc' ? '↓' : '↑'}
							</button>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedRows as row (row.id)}
						<tr>
							<td>{row.fullName}</td>
							<td><a href={`mailto:${row.email}`}>{row.email}</a></td>
							<td>{row.phone || '—'}</td>
							<td>
								{#if row.parentEmail}
									<a href={`mailto:${row.parentEmail}`}>{row.parentEmail}</a>
								{:else}
									—
								{/if}
							</td>
							<td>
								{#if row.interestAreas.length}
									<div class="tags">
										{#each row.interestAreas as area (area)}
											<span class="tag">{area}</span>
										{/each}
									</div>
								{:else}
									—
								{/if}
							</td>
							<td class="prior">{row.priorExperience || '—'}</td>
							<td class="date">{formatDate(row.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.admin-root {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		background: #0a0a0a;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', system-ui, sans-serif;
		padding: 1.5rem 1.25rem 3rem;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.6rem 1rem;
		margin-bottom: 1.2rem;
	}
	h1 {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--green, #00ff41);
		text-shadow: 0 0 14px rgba(0, 255, 65, 0.4);
		margin: 0;
	}
	.count {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		color: var(--cyan, #00f0ff);
	}
	.note {
		color: #a9c9ad;
		font-size: 0.95rem;
	}
	.note code {
		font-family: 'Share Tech Mono', monospace;
		color: var(--gold, #c8ff00);
	}
	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.25));
		border-radius: 10px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
		min-width: 720px;
	}
	th,
	td {
		text-align: left;
		padding: 0.65rem 0.8rem;
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.12));
		vertical-align: top;
	}
	thead th {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #6fae77;
		background: #0e130e;
		white-space: nowrap;
	}
	tbody tr:hover {
		background: rgba(0, 255, 65, 0.04);
	}
	.sort-btn {
		font: inherit;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #6fae77;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}
	.sort-btn:hover {
		color: var(--green, #00ff41);
	}
	a {
		color: var(--green, #00ff41);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.25));
		color: #a9c9ad;
		white-space: nowrap;
	}
	.prior {
		max-width: 260px;
		white-space: pre-wrap;
	}
	.date {
		white-space: nowrap;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		color: #a9c9ad;
	}
</style>
