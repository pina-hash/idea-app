<script lang="ts">
	/**
	 * /fsp-tech-selection/preview — STATIC, no-auth demo of the live tracking
	 * sheet for staff (e.g. Mr. Garza). It touches NO real data and NEVER calls
	 * the Apps Script endpoint. Ported as-is from the standalone HTML mockup
	 * (Google Sheets look: header bar, toolbar, frozen sort-arrow header row,
	 * conditional-formatting-style tech-color cells, tabs, legend), adapted only
	 * enough to become a Svelte page. This page intentionally uses its own
	 * self-contained styling (Google Sans, Sheets palette), not the fsp-theme
	 * navy/gold tokens used by the live tool at /fsp-tech-selection: the mockup
	 * IS the demo, its look is the point.
	 */

	interface TechColor {
		bg: string;
		fg: string;
	}

	const TECH_COLORS: Record<string, TechColor> = {
		ACE: { bg: '#FF8C00', fg: '#ffffff' },
		BMET: { bg: '#8B5CF6', fg: '#ffffff' },
		CSEE: { bg: '#1E90FF', fg: '#ffffff' },
		IDEA: { bg: '#00FF41', fg: '#0a1f0f' },
		MAT: { bg: '#FFE600', fg: '#3a3200' },
		MSET: { bg: '#FF2E2E', fg: '#ffffff' }
	};

	interface Row {
		last: string;
		first: string;
		studentId: string;
		email: string;
		/** 1 to 4 entries, 1st choice first. Fewer than 4 is a valid, saved partial ranking. */
		choices: string[];
		updated: string;
	}

	// Sample data only — illustrative placeholders, not real students. A couple
	// of rows are deliberately partial (still considering their options), so the
	// Complete? column below shows both states, matching what staff will see live.
	const rows: Row[] = [
		{ last: 'Alvarado', first: 'Marcus', studentId: '24-1103', email: 'malvarado26@boscotech.net', choices: ['IDEA', 'MSET', 'ACE', 'BMET'], updated: '10:14 AM' },
		{ last: 'Bautista', first: 'Ryan', studentId: '24-1117', email: 'rbautista26@boscotech.net', choices: ['MSET', 'MAT', 'IDEA', 'CSEE'], updated: '10:22 AM' },
		{ last: 'Chen', first: 'Nathaniel', studentId: '24-1129', email: 'nchen26@boscotech.net', choices: ['BMET', 'IDEA', 'CSEE', 'ACE'], updated: '10:31 AM' },
		{ last: 'Dominguez', first: 'Isaac', studentId: '24-1134', email: 'idominguez26@boscotech.net', choices: ['ACE', 'IDEA', 'MSET', 'MAT'], updated: '10:33 AM' },
		{ last: 'Esparza', first: 'Diego', studentId: '24-1140', email: 'desparza26@boscotech.net', choices: ['IDEA', 'ACE'], updated: '10:40 AM' },
		{ last: 'Franco', first: 'Owen', studentId: '24-1152', email: 'ofranco26@boscotech.net', choices: ['CSEE', 'MSET', 'MAT', 'IDEA'], updated: '10:47 AM' },
		{ last: 'Guerrero', first: 'Liam', studentId: '24-1159', email: 'lguerrero26@boscotech.net', choices: ['MSET'], updated: '10:52 AM' },
		{ last: 'Huerta', first: 'Adrian', studentId: '24-1166', email: 'ahuerta26@boscotech.net', choices: ['IDEA', 'BMET', 'MSET', 'MAT'], updated: '11:01 AM' },
		{ last: 'Ibarra', first: 'Xavier', studentId: '24-1171', email: 'xibarra26@boscotech.net', choices: ['MAT', 'CSEE', 'IDEA'], updated: '11:05 AM' },
		{ last: 'Juarez', first: 'Sebastian', studentId: '24-1180', email: 'sjuarez26@boscotech.net', choices: ['ACE', 'MSET', 'BMET', 'IDEA'], updated: '11:12 AM' }
	];
</script>

<svelte:head>
	<title>FSP Tech Selections 2026 - Sheet Demo</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="demo-banner">
	<strong>Demo only.</strong> Names and student IDs below are placeholder data to show layout, color
	coding, and sorting. No real freshman data is in this file.
</div>

<div class="sheets-header">
	<div class="sheets-logo">
		<svg viewBox="0 0 48 48">
			<path
				fill="#0F9D58"
				d="M28.8 4H9.6C7.6 4 6 5.6 6 7.6v32.8C6 42.4 7.6 44 9.6 44h28.8c2 0 3.6-1.6 3.6-3.6V15.2z"
			/>
			<path fill="#87CEAC" d="M28.8 4v9.6c0 1.7 1.4 3.1 3.1 3.1H42z" opacity="0.7" />
			<path fill="#fff" d="M14 22h20v2H14zm0 5h20v2H14zm0 5h20v2H14zm0 5h12v2H14z" />
		</svg>
	</div>
	<div>
		<div class="doc-title">FSP Tech Selections - 2026</div>
		<div class="doc-sub">Selections sheet &middot; live via Apps Script &middot; last edit a few seconds ago</div>
	</div>
</div>

<div class="toolbar">
	<div class="toolbar-btn">File</div>
	<div class="toolbar-btn">Edit</div>
	<div class="toolbar-btn">View</div>
	<div class="toolbar-btn">Insert</div>
	<div class="toolbar-btn">Format</div>
	<div class="toolbar-btn">Data</div>
	<div class="toolbar-sep"></div>
	<div class="toolbar-btn">&#9662; Filter view</div>
	<div class="toolbar-btn">&#8862; Conditional formatting</div>
	<div class="filter-status"><span class="dot"></span> Live &middot; 6 responses today</div>
</div>

<div class="sheet-wrap">
	<table>
		<thead>
			<tr>
				<th class="colhead rowlabel"></th>
				<th class="colhead">A</th>
				<th class="colhead">B</th>
				<th class="colhead">C</th>
				<th class="colhead">D</th>
				<th class="colhead">E</th>
				<th class="colhead">F</th>
				<th class="colhead">G</th>
				<th class="colhead">H</th>
				<th class="colhead">I</th>
				<th class="colhead">J</th>
			</tr>
			<tr class="headerrow">
				<th class="rowlabel">1</th>
				<th>Last Name<span class="sort-arrows">&#9650;&#9660;</span></th>
				<th>First Name<span class="sort-arrows">&#9650;&#9660;</span></th>
				<th>Student ID (unverified)<span class="sort-arrows">&#9650;&#9660;</span></th>
				<th>Email<span class="sort-arrows">&#9650;&#9660;</span></th>
				<th>Choice 1<span class="sort-arrows">&#9650;&#9660;</span></th>
				<th>Choice 2<span class="sort-arrows">&#9650;&#9660;</span></th>
				<th>Choice 3<span class="sort-arrows">&#9650;&#9660;</span></th>
				<th>Choice 4<span class="sort-arrows">&#9650;&#9660;</span></th>
				<th>Complete?<span class="sort-arrows">&#9650;&#9660;</span></th>
				<th>Updated At<span class="sort-arrows">&#9650;&#9660;</span></th>
			</tr>
		</thead>
		<tbody>
			{#each rows as r, i (r.email)}
				{@const complete = r.choices.length >= 4}
				<tr>
					<td class="rowlabel">{i + 2}</td>
					<td>{r.last}</td>
					<td>{r.first}</td>
					<td class="studentid-cell">{r.studentId}</td>
					<td>{r.email}</td>
					{#each [0, 1, 2, 3] as slot (slot)}
						{@const choice = r.choices[slot]}
						{@const c = choice ? TECH_COLORS[choice] : undefined}
						{#if c}
							<td class="col-choice" style="background:{c.bg}; color:{c.fg}">{choice}</td>
						{:else}
							<td class="col-choice-empty"></td>
						{/if}
					{/each}
					<td class="complete-cell">
						{#if complete}
							<span class="complete-pill complete-yes">&#10003; Complete</span>
						{:else}
							<span class="complete-pill complete-no">&#10007; {r.choices.length} of 4</span>
						{/if}
					</td>
					<td class="updated-cell">{r.updated}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<div class="legend">
	<span class="legend-title">Tech color key</span>
	<span class="legend-item"><span class="legend-swatch" style="background:#FF8C00"></span>ACE</span>
	<span class="legend-item"><span class="legend-swatch" style="background:#8B5CF6"></span>BMET</span>
	<span class="legend-item"><span class="legend-swatch" style="background:#1E90FF"></span>CSEE</span>
	<span class="legend-item"><span class="legend-swatch" style="background:#00FF41"></span>IDEA</span>
	<span class="legend-item"><span class="legend-swatch" style="background:#FFE600"></span>MAT</span>
	<span class="legend-item"><span class="legend-swatch" style="background:#FF2E2E"></span>MSET</span>
</div>

<div class="tab-bar">
	<div class="tab active">Selections</div>
	<div class="tab">Roster (pending)</div>
	<div class="tab">Summary</div>
</div>

<div class="footer-note">
	<strong>How this behaves live:</strong> each row is one student, matched by email. Resubmitting updates
	that student's existing row instead of adding a duplicate. The header row stays frozen while scrolling.
	Filter arrows let staff sort or filter by any column, for example last name alphabetically, or all
	students with IDEA as Choice 1, on the fly during FSP. Cell color is driven by <code>Conditional formatting</code>
	keyed to each tech name, so the pattern holds no matter how the sheet gets sorted. A student can save a
	partial ranking (as few as 1 pick) and come back to add more, so the <code>Complete?</code> column flags who
	still needs a nudge before FSP wraps up. Student ID is unverified until it is matched against the master
	roster, once that's available it will pull instead of relying on what the student typed.
</div>

<style>
	/* body margin and box-sizing are already zeroed/reset globally in app.css. */

	.demo-banner,
	.sheets-header,
	.toolbar,
	.sheet-wrap,
	table,
	.legend,
	.footer-note,
	.tab-bar {
		font-family: 'Google Sans', Arial, sans-serif;
		color: #202124;
	}

	.demo-banner {
		background: #fef7e0;
		border-bottom: 1px solid #f9e8b0;
		color: #614a19;
		font-size: 13px;
		padding: 8px 16px;
		text-align: center;
	}
	.demo-banner strong {
		font-weight: 600;
	}

	.sheets-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px 4px 16px;
		border-bottom: 1px solid #e0e0e0;
		background: #fff;
	}
	.sheets-logo {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.sheets-logo svg {
		width: 32px;
		height: 32px;
	}
	.doc-title {
		font-size: 18px;
		font-weight: 400;
	}
	.doc-sub {
		font-size: 12px;
		color: #5f6368;
		margin-top: -2px;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 16px;
		background: #fff;
		border-bottom: 1px solid #e0e0e0;
		font-size: 12px;
		color: #444;
	}
	.toolbar-btn {
		padding: 5px 10px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		gap: 4px;
		cursor: default;
		user-select: none;
	}
	.toolbar-btn:hover {
		background: #f1f3f4;
	}
	.toolbar-sep {
		width: 1px;
		height: 20px;
		background: #e0e0e0;
		margin: 0 6px;
	}

	.filter-status {
		margin-left: auto;
		font-size: 12px;
		color: #1a73e8;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.filter-status .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #1a73e8;
	}

	.sheet-wrap {
		overflow-x: auto;
		background: #fff;
	}

	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 13px;
		table-layout: fixed;
	}

	.colhead {
		background: #f8f9fa;
		color: #5f6368;
		font-weight: 400;
		text-align: center;
		border: 1px solid #e0e0e0;
		padding: 2px 4px;
		position: sticky;
		top: 0;
		font-size: 11px;
		height: 20px;
	}

	th.rowlabel,
	td.rowlabel {
		background: #f8f9fa;
		color: #5f6368;
		text-align: center;
		border: 1px solid #e0e0e0;
		font-size: 11px;
		width: 34px;
		min-width: 34px;
	}

	thead tr.headerrow th {
		background: #f1f5f9;
		border: 1px solid #d7dbe0;
		padding: 8px 10px;
		text-align: left;
		font-weight: 600;
		color: #1a1a2e;
		white-space: nowrap;
		position: relative;
	}

	thead tr.headerrow th .sort-arrows {
		float: right;
		color: #9aa0a6;
		font-size: 10px;
		cursor: default;
	}

	tbody td {
		border: 1px solid #e6e6e6;
		padding: 7px 10px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	tbody tr:hover td {
		background-color: #f8fafd;
	}

	.col-choice {
		text-align: center;
		font-weight: 600;
		border-radius: 0;
	}
	.col-choice-empty {
		background: #fafafa;
	}

	/* Complete? column: standard Sheets-style conditional-formatting green/red,
	   matching how this would render in the real tracking sheet. This preview
	   page intentionally uses its own Sheets palette throughout (see the header
	   comment), distinct from the live tool's navy/gold-only indicator, which
	   avoids red for an incomplete ranking since that's expected mid-program,
	   not an error, for a student actively using the tool. Here, staff are
	   scanning a roster to see who still needs a nudge, so a red flag is the
	   right signal. */
	.complete-cell {
		text-align: center;
	}
	.complete-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
	}
	.complete-yes {
		background: #e6f4ea;
		color: #188038;
	}
	.complete-no {
		background: #fce8e6;
		color: #c5221f;
	}

	.updated-cell {
		color: #5f6368;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}

	.studentid-cell {
		font-variant-numeric: tabular-nums;
		color: #3c4043;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		padding: 14px 16px;
		background: #fff;
		border-top: 1px solid #e0e0e0;
		font-size: 12px;
		align-items: center;
	}
	.legend-title {
		font-weight: 600;
		color: #3c4043;
		margin-right: 4px;
	}
	.legend-item {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.legend-swatch {
		width: 14px;
		height: 14px;
		border-radius: 3px;
	}

	.footer-note {
		padding: 14px 16px 28px 16px;
		background: #f8f9fa;
		font-size: 12px;
		color: #5f6368;
		line-height: 1.6;
	}
	.footer-note :global(code) {
		background: #eef0f2;
		padding: 1px 5px;
		border-radius: 3px;
		font-size: 11px;
	}

	.tab-bar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 16px;
		background: #f8f9fa;
		border-top: 1px solid #e0e0e0;
		font-size: 12px;
	}
	.tab {
		padding: 6px 14px;
		border-radius: 4px 4px 0 0;
		color: #5f6368;
		cursor: default;
	}
	.tab.active {
		background: #fff;
		color: #188038;
		font-weight: 600;
		border: 1px solid #e0e0e0;
		border-bottom: 2px solid #188038;
	}
</style>
