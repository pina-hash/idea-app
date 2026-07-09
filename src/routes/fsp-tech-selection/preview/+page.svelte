<script lang="ts">
	import '$lib/fsp/fsp-theme.css';
	import { FSP_TECHS } from '$lib/fsp/techs';

	/**
	 * /fsp-tech-selection/preview — STATIC, no-auth demo of the live tracking
	 * sheet for staff (e.g. Mr. Garza). It touches NO real data and NEVER calls
	 * the Apps Script endpoint. This is a Google Sheets-style mockup ported to a
	 * Svelte page; swap the sample rows / layout below for the exact standalone
	 * HTML mockup when it is ready (same visual fidelity, no backend).
	 */

	interface Row {
		ts: string;
		last: string;
		first: string;
		id: string;
		/** Map of tech id -> rank (1-4). Missing = unranked. */
		ranks: Record<string, number>;
	}

	// Sample data only — illustrative, not real students.
	const rows: Row[] = [
		{ ts: '6/16 09:02', last: 'Alvarez', first: 'Mateo', id: '20301', ranks: { CSEE: 1, IDEA: 2, MAT: 3, ACE: 4 } },
		{ ts: '6/16 09:05', last: 'Nguyen', first: 'Kayla', id: '20488', ranks: { BMET: 1, CSEE: 2, IDEA: 3, MSET: 4 } },
		{ ts: '6/16 09:07', last: 'Okafor', first: 'David', id: '', ranks: { MSET: 1, MAT: 2, ACE: 3, CSEE: 4 } },
		{ ts: '6/16 09:11', last: 'Ramirez', first: 'Sofia', id: '20512', ranks: { IDEA: 1, ACE: 2, BMET: 3, MAT: 4 } },
		{ ts: '6/16 09:14', last: 'Chen', first: 'Lucas', id: '20377', ranks: { CSEE: 1, MAT: 2, MSET: 3, IDEA: 4 } },
		{ ts: '6/16 09:19', last: 'Delgado', first: 'Isabella', id: '20455', ranks: { ACE: 1, IDEA: 2, CSEE: 3, BMET: 4 } },
		{ ts: '6/16 09:23', last: 'Patel', first: 'Aarav', id: '20390', ranks: { BMET: 1, IDEA: 2, MSET: 3, MAT: 4 } },
		{ ts: '6/17 08:58', last: 'Johnson', first: 'Maya', id: '20501', ranks: { MAT: 1, ACE: 2, MSET: 3, CSEE: 4 } },
		{ ts: '6/17 09:04', last: 'Kowalski', first: 'Adam', id: '', ranks: { MSET: 1, CSEE: 2, IDEA: 3, ACE: 4 } },
		{ ts: '6/17 09:12', last: 'Torres', first: 'Elena', id: '20467', ranks: { IDEA: 1, BMET: 2, MAT: 3, MSET: 4 } }
	];

	// Tally of 1st-choice picks per tech, for the summary strip.
	const firstChoiceTally = FSP_TECHS.map((t) => ({
		tech: t,
		count: rows.filter((r) => r.ranks[t.id] === 1).length
	}));
</script>

<svelte:head>
	<title>Bosco Tech — Tech Selection (staff preview)</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="fsp-root">
	<div class="preview-wrap">
		<div class="banner">
			<strong>Preview only.</strong> Sample data for staff. This page never touches live student
			data.
		</div>

		<!-- Google Sheets-style app frame -->
		<div class="sheet-app">
			<div class="app-bar">
				<span class="doc-icon">▦</span>
				<div class="doc-titles">
					<div class="doc-name">FSP Tech Selection — Live Tracker</div>
					<div class="doc-menu">
						<span>File</span><span>Edit</span><span>View</span><span>Insert</span><span>Format</span
						><span>Data</span><span>Tools</span>
					</div>
				</div>
				<button class="share-btn" type="button" disabled>🔒 Share</button>
			</div>

			<div class="toolbar">
				<span class="tb-btn">↶</span><span class="tb-btn">↷</span><span class="tb-sep"></span>
				<span class="tb-btn">100%</span><span class="tb-sep"></span>
				<span class="tb-btn bold">B</span><span class="tb-btn ital">I</span><span class="tb-sep"
				></span>
				<span class="tb-btn">Filter ▾</span><span class="tb-btn">Sort ▾</span>
				<span class="tb-live">● Live</span>
			</div>

			<div class="grid-scroll">
				<table class="sheet">
					<thead>
						<tr class="col-letters">
							<th class="rownum"></th>
							<th>A</th><th>B</th><th>C</th><th>D</th>
							{#each FSP_TECHS as t (t.id)}<th>{String.fromCharCode(69 + FSP_TECHS.indexOf(t))}</th>{/each}
						</tr>
						<tr class="head-row">
							<th class="rownum">1</th>
							<th class="sortable">Timestamp <span class="arrows">▲▼</span></th>
							<th class="sortable">Last Name <span class="arrows">▲▼</span></th>
							<th class="sortable">First Name <span class="arrows">▲▼</span></th>
							<th class="sortable">Student ID <span class="arrows">▲▼</span></th>
							{#each FSP_TECHS as t (t.id)}
								<th class="tech-col sortable" style="--tc:{t.color}">
									<span class="tech-swatch"></span>{t.label} <span class="arrows">▲▼</span>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each rows as r, i (r.last + r.first + i)}
							<tr>
								<td class="rownum">{i + 2}</td>
								<td class="mono">{r.ts}</td>
								<td>{r.last}</td>
								<td>{r.first}</td>
								<td class="mono">{r.id || '—'}</td>
								{#each FSP_TECHS as t (t.id)}
									{@const rank = r.ranks[t.id]}
									<td class="tech-cell" style="--tc:{t.color}" class:filled={!!rank}>
										{rank ?? ''}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="tabs">
				<span class="tab active">Responses</span>
				<span class="tab">Summary</span>
				<span class="tab plus">＋</span>
			</div>
		</div>

		<div class="summary">
			<h2>1st-choice tally (sample)</h2>
			<div class="tally">
				{#each firstChoiceTally as row (row.tech.id)}
					<div class="tally-row">
						<span class="tally-swatch" style="background:{row.tech.color}"></span>
						<span class="tally-label">{row.tech.label}</span>
						<span class="tally-bar-wrap">
							<span
								class="tally-bar"
								style="width:{(row.count / rows.length) * 100}%; background:{row.tech.color}"
							></span>
						</span>
						<span class="tally-count">{row.count}</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.preview-wrap {
		max-width: 1000px;
		margin: 0 auto;
		padding: 1.25rem 1rem 4rem;
	}
	.banner {
		background: color-mix(in srgb, var(--fsp-gold) 22%, #fff);
		border: 1px solid var(--fsp-gold);
		border-radius: 8px;
		padding: 0.6rem 0.9rem;
		font-size: 0.9rem;
		color: var(--fsp-ink);
		margin-bottom: 1rem;
	}

	.sheet-app {
		border: 1px solid var(--fsp-line);
		border-radius: 10px;
		overflow: hidden;
		background: #fff;
		box-shadow: 0 6px 24px rgba(10, 37, 64, 0.08);
	}
	.app-bar {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.6rem 0.9rem;
		background: #fff;
		border-bottom: 1px solid var(--fsp-line);
	}
	.doc-icon {
		color: #188038;
		font-size: 1.4rem;
	}
	.doc-name {
		font-size: 1rem;
		font-weight: 600;
		color: var(--fsp-ink);
	}
	.doc-menu {
		display: flex;
		gap: 0.8rem;
		font-size: 0.78rem;
		color: var(--fsp-muted);
		margin-top: 0.1rem;
	}
	.share-btn {
		margin-left: auto;
		background: #0b57d0;
		color: #fff;
		border: none;
		border-radius: 999px;
		padding: 0.5rem 1.1rem;
		font: inherit;
		font-weight: 600;
		font-size: 0.85rem;
		opacity: 0.9;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.9rem;
		background: #f0f4f9;
		border-bottom: 1px solid var(--fsp-line);
		font-size: 0.82rem;
		color: var(--fsp-ink);
	}
	.tb-btn {
		padding: 0.15rem 0.45rem;
		border-radius: 5px;
		cursor: default;
	}
	.tb-btn.bold {
		font-weight: 800;
	}
	.tb-btn.ital {
		font-style: italic;
	}
	.tb-sep {
		width: 1px;
		height: 18px;
		background: var(--fsp-line);
		margin: 0 0.2rem;
	}
	.tb-live {
		margin-left: auto;
		color: #188038;
		font-weight: 700;
		font-size: 0.78rem;
	}

	.grid-scroll {
		overflow-x: auto;
	}
	.sheet {
		border-collapse: collapse;
		width: 100%;
		font-size: 0.85rem;
		white-space: nowrap;
	}
	.sheet th,
	.sheet td {
		border: 1px solid #e2e7ee;
		padding: 0.4rem 0.6rem;
		text-align: left;
	}
	.col-letters th {
		background: #f0f4f9;
		color: var(--fsp-muted);
		text-align: center;
		font-weight: 500;
		font-size: 0.72rem;
		padding: 0.15rem;
	}
	.head-row th {
		position: sticky;
		top: 0;
		background: #f6f9fc;
		color: var(--fsp-navy);
		font-weight: 700;
		z-index: 1;
	}
	.rownum {
		background: #f0f4f9;
		color: var(--fsp-muted);
		text-align: center;
		font-size: 0.72rem;
		font-weight: 500;
		width: 34px;
	}
	.sortable .arrows {
		color: #b7c1cd;
		font-size: 0.6rem;
		margin-left: 0.2rem;
	}
	.tech-col {
		text-align: center;
	}
	.tech-swatch {
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: 2px;
		background: var(--tc);
		margin-right: 0.35rem;
		vertical-align: middle;
	}
	.mono {
		font-variant-numeric: tabular-nums;
		color: var(--fsp-muted);
	}
	.tech-cell {
		text-align: center;
		font-weight: 700;
		color: var(--fsp-muted);
	}
	.tech-cell.filled {
		color: var(--fsp-ink);
		background: color-mix(in srgb, var(--tc) 16%, #fff);
	}
	tbody tr:hover td {
		background: #fafcff;
	}
	tbody tr:hover .tech-cell.filled {
		background: color-mix(in srgb, var(--tc) 24%, #fff);
	}

	.tabs {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.7rem;
		background: #f0f4f9;
		border-top: 1px solid var(--fsp-line);
		font-size: 0.8rem;
	}
	.tab {
		padding: 0.3rem 0.8rem;
		border-radius: 6px 6px 0 0;
		color: var(--fsp-muted);
	}
	.tab.active {
		background: #fff;
		color: #188038;
		font-weight: 700;
		box-shadow: 0 -2px 0 #188038 inset;
	}
	.tab.plus {
		color: var(--fsp-muted);
	}

	.summary {
		margin-top: 1.5rem;
		background: var(--fsp-surface);
		border: 1px solid var(--fsp-line);
		border-radius: 10px;
		padding: 1.1rem 1.2rem 1.3rem;
	}
	.summary h2 {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--fsp-navy);
		margin-bottom: 0.8rem;
	}
	.tally {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.tally-row {
		display: grid;
		grid-template-columns: 16px 60px 1fr 28px;
		align-items: center;
		gap: 0.6rem;
	}
	.tally-swatch {
		width: 14px;
		height: 14px;
		border-radius: 3px;
	}
	.tally-label {
		font-weight: 700;
		font-size: 0.85rem;
	}
	.tally-bar-wrap {
		background: var(--fsp-surface-2);
		border-radius: 999px;
		height: 12px;
		overflow: hidden;
	}
	.tally-bar {
		display: block;
		height: 100%;
		border-radius: 999px;
		min-width: 2px;
	}
	.tally-count {
		text-align: right;
		font-weight: 700;
		font-size: 0.85rem;
		color: var(--fsp-muted);
	}
</style>
