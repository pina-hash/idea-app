<script lang="ts">
	import { untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import {
		buildMappingRows,
		eatingPassPurchases,
		EMAIL_PATTERNS,
		loadLoggedRefunds,
		mappingIssues,
		patternEmail,
		previewRows,
		pullFlags,
		REFUND_NOTE,
		unresolvedContractors,
		type ImportBatchRow,
		type ImportProfile,
		type ImportResultRow,
		type MappingRow,
		type ReconcileResponse,
		type SavedMappingRow
	} from '$lib/coin-desk/migrate';

	/**
	 * The legacy Sheets migration wizard: five sequential steps (Pull, Map,
	 * Preview, Commit, Verify), resumable across sittings via the mapping
	 * draft table and the batch row. Every write is a migration 0084 RPC; the
	 * transport for the PULL step is injected (`pull`) because it is a server
	 * fetch (the published CSVs + the coin-ledger egress), so the dev harness
	 * can answer it from a fixture -- the ReviewConsole injected-transport
	 * convention.
	 */
	let {
		supabase,
		profiles = [],
		initialBatch = null,
		initialMappings = [],
		pull,
		configured = true
	}: {
		supabase: SupabaseClient;
		profiles?: ImportProfile[];
		initialBatch?: ImportBatchRow | null;
		initialMappings?: SavedMappingRow[];
		pull: () => Promise<
			{ ok: true; batch: ImportBatchRow; warnings: string[] } | { ok: false; error: string }
		>;
		configured?: boolean;
	} = $props();

	const STEPS = [
		{ n: 1, label: 'Pull' },
		{ n: 2, label: 'Map' },
		{ n: 3, label: 'Preview' },
		{ n: 4, label: 'Commit' },
		{ n: 5, label: 'Verify' }
	];

	// untrack: the load's values are the STARTING point (the students-page
	// convention); the wizard owns batch/rows/step from that moment on.
	let batch = $state<ImportBatchRow | null>(untrack(() => initialBatch));
	let rows = $state<MappingRow[]>(
		untrack(() => (initialBatch ? buildMappingRows(initialBatch.raw, initialMappings, profiles) : []))
	);
	let step = $state(untrack(() => (initialBatch ? (initialBatch.committed_at ? 5 : 2) : 1)));

	// -- Step 1: pull ------------------------------------------------------
	let pulling = $state(false);
	let pullError = $state('');
	let warnings = $state<string[]>([]);

	// -- Step 2: map -------------------------------------------------------
	let activePattern = $state('');
	let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	// -- Step 4: commit ----------------------------------------------------
	let committing = $state(false);
	let commitError = $state('');
	let commitResult = $state<{ results: ImportResultRow[]; transactions: number; contracts: number; claims: number } | null>(
		untrack(() =>
			initialBatch?.report
				? {
						results: initialBatch.report.results ?? [],
						transactions: initialBatch.report.transactions,
						contracts: initialBatch.report.contracts,
						claims: initialBatch.report.claims
					}
				: null
		)
	);
	let rollbackArmed = $state(false);
	let rollingBack = $state(false);
	let rollbackNotice = $state('');

	// -- Step 5: verify ----------------------------------------------------
	interface RefundRow {
		name: string;
		email: string;
		amount: number;
		logged: boolean;
		busy: boolean;
		balance: number | null;
	}
	let verifyLoading = $state(false);
	let verifyError = $state('');
	let reconcile = $state<ReconcileResponse | null>(null);
	let refunds = $state<RefundRow[]>([]);

	const counts = $derived(
		batch
			? {
					students: batch.raw.summary.length,
					transactions: batch.raw.transactions.length,
					contracts: batch.raw.contracts.length
				}
			: null
	);
	const issues = $derived(mappingIssues(rows));
	const preview = $derived(batch ? previewRows(batch.raw, rows) : []);
	const badDiffs = $derived(preview.filter((r) => r.diff !== 0));
	const contractorGaps = $derived(batch ? unresolvedContractors(batch.raw, rows) : []);
	const flags = $derived(batch ? pullFlags(batch.raw) : null);
	const committed = $derived(!!batch?.committed_at);
	const previewOk = $derived(
		!badDiffs.length && !contractorGaps.length && !(flags?.unknownTypes.length ?? 0)
	);
	const mainRows = $derived(rows.filter((r) => r.section.trim().toLowerCase() !== 'external'));
	const externalRows = $derived(rows.filter((r) => r.section.trim().toLowerCase() === 'external'));
	const mappedCount = $derived(rows.filter((r) => r.email.trim() !== '').length);

	function stepAllowed(n: number): boolean {
		if (n === 1) return true;
		if (n === 2 || n === 3) return !!batch;
		if (n === 4) return !!batch && issues.ok;
		return committed;
	}

	function goTo(n: number) {
		if (!stepAllowed(n)) return;
		step = n;
		if (n === 5) void openVerify();
	}

	// The name keys 0084 stores in report.mappings: lower(btrim(name)).
	const sqlKey = (name: string) => name.trim().toLowerCase();

	function mappingPayload(): { legacy_name: string; email: string | null; status: string }[] {
		return rows.map((r) => ({
			legacy_name: r.legacy_name,
			email: r.email.trim().toLowerCase() || null,
			status: r.status
		}));
	}

	function scheduleAutosave() {
		saveState = 'saving';
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void saveDraft(), 600);
	}

	async function saveDraft() {
		const { error } = await supabase.rpc('coin_admin_save_import_mappings', {
			p_mappings: mappingPayload()
		});
		saveState = error ? 'error' : 'saved';
	}

	async function runPull() {
		pulling = true;
		pullError = '';
		const res = await pull();
		pulling = false;
		if (!res.ok) {
			pullError = res.error;
			return;
		}
		batch = res.batch;
		warnings = res.warnings;
		commitResult = null;
		rollbackNotice = '';
		rows = buildMappingRows(res.batch.raw, initialMappings, profiles);
		// Persist the prefill (profile matches included) so the draft survives
		// even if this sitting ends here.
		scheduleAutosave();
		step = 2;
	}

	function applyPattern(id: string) {
		activePattern = id;
		for (const r of rows) {
			if (r.status !== 'unmapped' && r.status !== 'pattern') continue;
			if (r.partial) continue;
			const email = patternEmail(id, r.legacy_name);
			if (email) {
				r.email = email;
				r.status = 'pattern';
			}
		}
		scheduleAutosave();
	}

	function editEmail(r: MappingRow, value: string) {
		r.email = value;
		if (r.status !== 'external') {
			r.status = value.trim() ? 'hand' : 'unmapped';
		}
		scheduleAutosave();
	}

	function toggleExternal(r: MappingRow, external: boolean) {
		r.status = external ? 'external' : r.email.trim() ? 'hand' : 'unmapped';
		scheduleAutosave();
	}

	const STATUS_LABELS: Record<string, string> = {
		unmapped: 'unmapped',
		profile: 'profile match',
		pattern: 'pattern guess',
		hand: 'hand-edited',
		external: 'external'
	};

	function refusalMessage(r: Record<string, unknown>): string {
		const reason = String(r.reason ?? 'refused');
		switch (reason) {
			case 'batch_already_committed':
				return 'This batch is already committed. Roll it back first if it needs to be re-run.';
			case 'another_batch_committed':
				return `Another batch (${String(r.batch_id ?? '').slice(0, 8)}...) is already committed. Roll that one back before committing this pull.`;
			case 'unmapped_name':
				return `Unmapped names: ${(r.names as string[] | undefined)?.join(', ') ?? '?'}. Finish the Map step.`;
			case 'duplicate_email':
				return `Two names map to ${r.email}: ${(r.names as string[] | undefined)?.join(', ') ?? '?'}.`;
			case 'invalid_email':
				return `"${r.email}" (for ${r.name}) is not a valid email.`;
			case 'unknown_type':
				return `The pull contains transaction types the import does not know: ${JSON.stringify(r.types)}.`;
			case 'bad_amount':
			case 'bad_date':
			case 'bad_summary_row':
			case 'bad_contract':
				return `The pull has malformed rows (${reason}): ${JSON.stringify(r.rows)}.`;
			case 'not_committed':
				return 'This batch is not committed.';
			default:
				return `Refused: ${reason}.`;
		}
	}

	async function submitCommit() {
		if (!batch) return;
		committing = true;
		commitError = '';
		const { data, error } = await supabase.rpc('coin_admin_import_legacy', {
			p_batch_id: batch.id,
			p_mappings: mappingPayload()
		});
		committing = false;
		if (error) {
			commitError = error.message;
			return;
		}
		const r = data as Record<string, unknown> & { results?: ImportResultRow[] };
		if (!r.ok) {
			commitError = refusalMessage(r);
			return;
		}
		commitResult = {
			results: r.results ?? [],
			transactions: Number(r.transactions ?? 0),
			contracts: Number(r.contracts ?? 0),
			claims: Number(r.claims ?? 0)
		};
		batch = {
			...batch,
			committed_at: new Date().toISOString(),
			report: {
				mappings: Object.fromEntries(
					rows.filter((x) => x.email.trim()).map((x) => [sqlKey(x.legacy_name), x.email.trim().toLowerCase()])
				),
				students: rows.filter((x) => x.inSummary).length,
				transactions: commitResult.transactions,
				contracts: commitResult.contracts,
				claims: commitResult.claims,
				results: commitResult.results
			}
		};
	}

	async function runRollback() {
		if (!batch) return;
		rollingBack = true;
		commitError = '';
		const { data, error } = await supabase.rpc('coin_admin_rollback_import', {
			p_batch_id: batch.id
		});
		rollingBack = false;
		rollbackArmed = false;
		if (error) {
			commitError = error.message;
			return;
		}
		const r = data as Record<string, unknown>;
		if (!r.ok) {
			commitError = refusalMessage(r);
			return;
		}
		rollbackNotice = `Rolled back: ${r.transactions_deleted} transactions, ${r.contracts_deleted} contracts (${r.claims_deleted} claims), ${r.students_deleted} directory rows removed. The batch can be committed again.`;
		batch = { ...batch, committed_at: null, committed_by: null, report: null };
		commitResult = null;
		reconcile = null;
		refunds = [];
		step = 4;
	}

	function refundCandidates(): { name: string; email: string; amount: number }[] {
		if (!batch) return [];
		const mappings =
			batch.report?.mappings ??
			Object.fromEntries(
				rows.filter((x) => x.email.trim()).map((x) => [sqlKey(x.legacy_name), x.email.trim().toLowerCase()])
			);
		return eatingPassPurchases(batch.raw).map((p) => ({
			name: p.name,
			email: mappings[sqlKey(p.name)] ?? '',
			amount: p.amount
		}));
	}

	async function openVerify() {
		if (!batch || !committed) return;
		verifyLoading = true;
		verifyError = '';
		const { data, error } = await supabase.rpc('coin_admin_import_reconcile', {
			p_batch_id: batch.id
		});
		if (error) {
			verifyLoading = false;
			verifyError = error.message;
			return;
		}
		const r = data as ReconcileResponse;
		if (!r.ok) {
			verifyLoading = false;
			verifyError = refusalMessage(r as unknown as Record<string, unknown>);
			return;
		}
		reconcile = r;
		const candidates = refundCandidates();
		const logged = await loadLoggedRefunds(
			supabase,
			candidates.map((c) => c.email).filter(Boolean)
		);
		refunds = candidates.map((c) => ({
			...c,
			logged: logged.has(c.email),
			busy: false,
			balance: null
		}));
		verifyLoading = false;
	}

	async function logRefund(r: RefundRow) {
		r.busy = true;
		verifyError = '';
		const { data, error } = await supabase.rpc('coin_admin_adjust_balance', {
			p_email: r.email,
			p_amount: r.amount,
			p_note: REFUND_NOTE
		});
		r.busy = false;
		if (error) {
			verifyError = error.message;
			return;
		}
		const resp = data as { ok: boolean; reason?: string; balance?: number };
		if (!resp.ok) {
			verifyError = `Refund refused: ${resp.reason ?? 'unknown'}.`;
			return;
		}
		r.logged = true;
		r.balance = resp.balance ?? null;
	}

	$effect(() => {
		// Resuming straight onto a committed batch lands on Verify; run it once
		// the component is up. Tracked on nothing but the initial condition.
		if (step === 5 && committed && !reconcile && !verifyLoading && !verifyError) {
			void openVerify();
		}
	});

	function when(iso: string | null | undefined): string {
		if (!iso) return '';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}
</script>

{#if !configured}
	<section class="card">
		<h2>Legacy Sheets migration</h2>
		<p class="note">
			Migration 0084 is not applied yet. Apply <code>0084_coin_legacy_import.sql</code> in the
			Supabase SQL editor (after 0083) and reload; nothing here can run before it.
		</p>
	</section>
{:else}
	<section class="card">
		<h2>Legacy Sheets migration</h2>
		<p class="note">
			Brings the old Google Sheets ledger (students, transaction history, contract postings) into
			this economy: name-keyed data mapped to emails, reconciled to zero before anything is written,
			reversible afterwards. The old Sheets system itself is not touched or deactivated.
		</p>

		<div class="stepper" role="tablist" aria-label="Migration steps">
			{#each STEPS as s (s.n)}
				<button
					class="step-chip"
					class:current={step === s.n}
					class:done={s.n < step || (s.n === 4 && committed) || (s.n === 5 && committed && step > 5)}
					disabled={!stepAllowed(s.n)}
					onclick={() => goTo(s.n)}
				>
					<span class="step-n">{s.n}</span>
					{s.label}
				</button>
			{/each}
		</div>

		{#if step === 1}
			<h3>1 &middot; Pull the legacy data</h3>
			<p class="note">
				Fetches the two published summary/transaction CSVs and the ledger's contracts server-side,
				and stores the whole snapshot as an import batch. Nothing is written to any balance.
			</p>
			{#if batch}
				<p class="feedback notice">
					A pull from {when(batch.pulled_at)} already exists
					({counts?.students} students, {counts?.transactions} transactions, {counts?.contracts}
					contracts{batch.committed_at ? '; committed ' + when(batch.committed_at) : ''}).
					{#if !batch.committed_at}Continue with it from the Map step, or pull fresh data below.{/if}
				</p>
			{/if}
			{#if pullError}<p class="feedback error">{pullError}</p>{/if}
			{#each warnings as w (w)}<p class="feedback warn">{w}</p>{/each}
			<div class="actions-row">
				<button class="btn" disabled={pulling || committed} onclick={runPull}>
					{pulling ? 'Pulling...' : batch ? 'Pull fresh data' : 'Pull the legacy ledger'}
				</button>
				{#if batch && !committed}
					<button class="btn secondary" onclick={() => goTo(2)}>Continue with this pull</button>
				{/if}
				{#if committed}
					<button class="btn secondary" onclick={() => goTo(5)}>Go to Verify</button>
				{/if}
			</div>
			<p class="note archive-note">
				The committed archive under <code>docs/coin-economy/archive/</code> was generated from the
				same sources on 2026-08-11. If this live pull differs from it (the sheet gained rows since),
				refresh that archive in the repo so the committed record matches what was migrated.
			</p>
		{:else if step === 2 && batch}
			<h3>2 &middot; Map names to emails</h3>
			<p class="note">
				Every legacy name needs an email. Profile matches are prefilled; a pattern fills the rest
				at once; anything can be hand-edited. The draft autosaves, so this survives multiple
				sittings.
			</p>
			<div class="map-toolbar">
				<span class="map-count">{mappedCount} of {rows.length} mapped</span>
				<span class="save-state" class:err={saveState === 'error'}>
					{saveState === 'saving'
						? 'Saving draft...'
						: saveState === 'saved'
							? 'Draft saved'
							: saveState === 'error'
								? 'Draft save failed'
								: ''}
				</span>
			</div>
			<div class="pattern-strip">
				<span class="pattern-label">Fill unmapped rows with a pattern (at @boscotech.net):</span>
				{#each EMAIL_PATTERNS as p (p.id)}
					<button
						class="pattern-chip"
						class:active={activePattern === p.id}
						onclick={() => applyPattern(p.id)}
					>
						{p.label}
					</button>
				{/each}
			</div>

			{#snippet mappingTable(list: MappingRow[], externalGroup: boolean)}
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Legacy name</th>
								<th>Section</th>
								<th>Email</th>
								<th>Status</th>
								{#if externalGroup}<th>External</th>{/if}
							</tr>
						</thead>
						<tbody>
							{#each list as r (r.legacy_name)}
								<tr>
									<td class="name-cell">{r.legacy_name}</td>
									<td class="mono dim">{r.section || (r.inSummary ? '' : 'log only')}</td>
									<td>
										<input
											type="email"
											value={r.email}
											placeholder={r.status === 'external' ? 'anyone@example.com' : 'student@boscotech.net'}
											oninput={(e) => editEmail(r, (e.currentTarget as HTMLInputElement).value)}
										/>
									</td>
									<td><span class="chip chip-{r.status}">{STATUS_LABELS[r.status]}</span></td>
									{#if externalGroup}
										<td>
											<input
												type="checkbox"
												checked={r.status === 'external'}
												onchange={(e) =>
													toggleExternal(r, (e.currentTarget as HTMLInputElement).checked)}
											/>
										</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/snippet}

			{@render mappingTable(mainRows, false)}
			{#if externalRows.length}
				<h4 class="group-head">External rows ({externalRows.length})</h4>
				<p class="note">
					Not Bosco Tech students: the domain rule is relaxed to any valid email, decided per row
					with the checkbox.
				</p>
				{@render mappingTable(externalRows, true)}
			{/if}

			{#if !issues.ok}
				<div class="feedback error block">
					{#if issues.unmapped.length}
						<div>{issues.unmapped.length} unmapped: {issues.unmapped.slice(0, 6).join('; ')}{issues.unmapped.length > 6 ? '...' : ''}</div>
					{/if}
					{#if issues.invalidEmails.length}
						<div>Not valid emails: {issues.invalidEmails.join('; ')}</div>
					{/if}
					{#if issues.wrongDomain.length}
						<div>
							Must be @boscotech.net (or mark the row external): {issues.wrongDomain.join('; ')}
						</div>
					{/if}
					{#each issues.duplicates as d (d.email)}
						<div>Duplicate email {d.email}: {d.names.join(' and ')}</div>
					{/each}
				</div>
			{/if}
			<div class="actions-row">
				<button class="btn secondary" onclick={() => goTo(1)}>Back</button>
				<button class="btn" disabled={!issues.ok} onclick={() => goTo(3)}>Continue to preview</button>
			</div>
		{:else if step === 3 && batch}
			<h3>3 &middot; Preview the reconciliation</h3>
			<p class="note">
				Expected balance (Awarded - Fines - Spent - Paid Out) against the sum of the parsed
				transactions under this mapping. Every row must agree at 0 before anything commits.
			</p>
			{#if badDiffs.length}
				<p class="feedback error">
					{badDiffs.length} row{badDiffs.length === 1 ? '' : 's'} do not reconcile; commit is
					blocked.
				</p>
			{:else}
				<p class="feedback notice">
					All {preview.length} students reconcile at 0 diff.
					{#if batch.raw.contracts.length}All contractor names resolve.{/if}
				</p>
			{/if}
			{#if contractorGaps.length}
				<p class="feedback error">
					Contract contractors with no valid mapping: {contractorGaps.join('; ')}. Commit is
					blocked.
				</p>
			{/if}
			{#if flags?.unknownTypes.length}
				<p class="feedback error">
					Unknown transaction types in the pull: {flags.unknownTypes.join(', ')}. Commit is
					blocked.
				</p>
			{/if}
			<div class="table-wrap">
				<table>
					<thead>
						<tr><th>Student</th><th>Email</th><th class="num">Txns</th><th class="num">Expected</th><th class="num">Computed</th><th class="num">Diff</th></tr>
					</thead>
					<tbody>
						{#each preview as r (r.name)}
							<tr class:bad-row={r.diff !== 0}>
								<td class="name-cell">{r.name}</td>
								<td class="mono dim">{r.email}</td>
								<td class="num mono">{r.transactions}</td>
								<td class="num mono">{r.expected}i&cent;</td>
								<td class="num mono">{r.computed}i&cent;</td>
								<td class="num mono" class:diff-bad={r.diff !== 0}>{r.diff === 0 ? '0' : (r.diff > 0 ? '+' : '') + r.diff}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if flags}
				<h4 class="group-head">Flags (informational, nothing here blocks)</h4>
				<ul class="flag-list">
					<li>
						<strong>Eating pass purchasers ({flags.eatingPasses.length}):</strong>
						{#each flags.eatingPasses as p, i (p.row)}{i > 0 ? '; ' : ''}{p.name} ({p.amount}i&cent;, "{p.reason}"){/each}
						{#if !flags.eatingPasses.length}none{/if}
						. Refund-only after commit (docs v3 item 9); the Verify step guides those refunds.
					</li>
					<li>
						<strong>External rows ({flags.externalNames.length}):</strong>
						{flags.externalNames.join('; ') || 'none'}
					</li>
					<li>
						<strong>Names in transactions but not the summary:</strong>
						{flags.transactionOnlyNames.join('; ') || 'none'}
					</li>
					<li>
						<strong>Summary rows with no transactions:</strong>
						{flags.summaryOnlyCount} (import as a zero balance)
					</li>
					{#if !batch.raw.contracts_available}
						<li>
							<strong>Contracts:</strong> the ledger could not be reached at pull time, so this
							batch imports zero contracts.
						</li>
					{/if}
				</ul>
			{/if}
			<div class="actions-row">
				<button class="btn secondary" onclick={() => goTo(2)}>Back to mapping</button>
				<button class="btn" disabled={!previewOk} onclick={() => goTo(4)}>Continue to commit</button>
			</div>
		{:else if step === 4 && batch}
			<h3>4 &middot; Commit the import</h3>
			{#if !committed}
				<p class="note">
					One call, one transaction: {counts?.students} students into the directory,
					{counts?.transactions} historical transactions under the retired legacy categories,
					{counts?.contracts} contracts in their terminal states. Nothing partial can land; a
					refusal names exactly what is wrong.
				</p>
				{#if commitError}<p class="feedback error">{commitError}</p>{/if}
				<div class="actions-row">
					<button class="btn secondary" onclick={() => goTo(3)}>Back to preview</button>
					<button class="btn" disabled={committing || !previewOk} onclick={submitCommit}>
						{committing ? 'Committing...' : 'Commit the import'}
					</button>
				</div>
				{#if rollbackNotice}<p class="feedback notice">{rollbackNotice}</p>{/if}
			{:else}
				<p class="feedback notice">
					Committed {when(batch.committed_at)}{batch.committed_by ? ' by ' + batch.committed_by : ''}:
					{commitResult?.transactions ?? batch.report?.transactions} transactions,
					{commitResult?.contracts ?? batch.report?.contracts} contracts
					({commitResult?.claims ?? batch.report?.claims} claims).
				</p>
				{#if commitError}<p class="feedback error">{commitError}</p>{/if}
				{#if commitResult?.results?.length}
					<div class="rows result-rows">
						{#each commitResult.results as r (r.email)}
							<div class="row">
								<div class="who"><span class="email">{r.name}</span></div>
								<div class="meta"><span class="since">{r.email} &middot; {r.transactions} transaction{r.transactions === 1 ? '' : 's'}</span></div>
								<div class="actions">
									<span class:txn-neg={r.amount < 0} class:txn-pos={r.amount >= 0}>
										{r.amount > 0 ? '+' : ''}{r.amount}i&cent;
									</span>
								</div>
							</div>
						{/each}
					</div>
				{/if}
				<div class="actions-row">
					<button class="btn" onclick={() => goTo(5)}>Continue to verify</button>
				</div>
				<div class="danger-zone">
					<h4>Roll back this import</h4>
					<p class="note">
						Removes exactly what this batch wrote (its transactions, contracts and claims, and
						directory rows) and nothing else; anything logged since (refunds included) stays. The
						batch can then be re-committed.
					</p>
					{#if !rollbackArmed}
						<button class="btn secondary danger" onclick={() => (rollbackArmed = true)}>
							Roll back...
						</button>
					{:else}
						<div class="actions-row">
							<button class="btn danger-solid" disabled={rollingBack} onclick={runRollback}>
								{rollingBack ? 'Rolling back...' : 'Yes, remove everything this batch imported'}
							</button>
							<button class="btn secondary" onclick={() => (rollbackArmed = false)}>Cancel</button>
						</div>
					{/if}
				</div>
			{/if}
		{:else if step === 5 && batch}
			<h3>5 &middot; Verify against the live ledger</h3>
			{#if verifyError}<p class="feedback error">{verifyError}</p>{/if}
			{#if verifyLoading}
				<p class="note">Reconciling against the live tables...</p>
			{:else if reconcile?.ok}
				{#if reconcile.all_zero}
					<p class="feedback notice big-ok">
						&#10003; Reconciled: every student's imported history sums exactly to the sheet's
						expectation ({reconcile.totals?.students} students, 0 mismatches).
					</p>
				{:else}
					<p class="feedback error">
						{reconcile.totals?.mismatches} student{reconcile.totals?.mismatches === 1 ? '' : 's'}
						do not reconcile. Investigate below, or roll the import back from the Commit step.
					</p>
				{/if}
				{#if reconcile.totals}
					<div class="totals-strip">
						<span><strong>{reconcile.totals.live_circulation}i&cent;</strong> in circulation</span>
						<span><strong>{reconcile.totals.live_debt}i&cent;</strong> outstanding debt</span>
						<span><strong>{reconcile.totals.batch_transactions}</strong> imported transactions</span>
						<span><strong>{reconcile.totals.batch_contracts}</strong> contracts ({reconcile.totals.batch_claims} claims)</span>
						<span><strong>{reconcile.totals.live_transactions}</strong> live ledger rows for these students</span>
					</div>
					<p class="note">
						Circulation and debt are the students' FULL live balances (any activity since the
						import included), the numbers to eyeball against the old page's stat strip; the
						per-student check below is scoped to exactly what this batch imported.
					</p>
				{/if}
				<div class="table-wrap">
					<table>
						<thead>
							<tr><th>Student</th><th>Email</th><th class="num">Expected</th><th class="num">Imported</th><th class="num">Diff</th><th class="num">Live balance</th></tr>
						</thead>
						<tbody>
							{#each reconcile.rows ?? [] as r (r.email)}
								<tr class:bad-row={r.diff !== 0}>
									<td class="name-cell">{r.name}</td>
									<td class="mono dim">{r.email}</td>
									<td class="num mono">{r.expected}i&cent;</td>
									<td class="num mono">{r.actual}i&cent;</td>
									<td class="num mono" class:diff-bad={r.diff !== 0}>{r.diff === 0 ? '0' : (r.diff > 0 ? '+' : '') + r.diff}</td>
									<td class="num mono">{r.live_balance}i&cent;</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="refund-panel">
					<h4>Legacy eating pass refunds</h4>
					<p class="note">
						Refund-only, per docs v3 item 9: each old Basic/Executive pass purchase is credited
						back at exactly what was paid; the new 150i&cent; pass is never auto-granted. Each
						refund is an ordinary balance correction with the reason pre-filled.
					</p>
					{#if !refunds.length}
						<p class="note">No eating pass purchases in this batch.</p>
					{/if}
					{#each refunds as r (r.email + r.amount)}
						<div class="row">
							<div class="who"><span class="email">{r.name}</span></div>
							<div class="meta">
								<span class="since">{r.email}</span>
								{#if r.logged && r.balance !== null}
									<span class="since">refunded &middot; new balance {r.balance}i&cent;</span>
								{:else if r.logged}
									<span class="since">already refunded</span>
								{/if}
							</div>
							<div class="actions">
								<button class="btn secondary" disabled={r.logged || r.busy} onclick={() => logRefund(r)}>
									{r.logged ? 'Refunded' : r.busy ? 'Logging...' : `Refund +${r.amount}i¢`}
								</button>
							</div>
						</div>
					{/each}
				</div>
				<div class="actions-row">
					<button class="btn secondary" onclick={() => goTo(4)}>Back to commit</button>
					<button class="btn secondary" onclick={() => void openVerify()}>Re-run verification</button>
				</div>
			{/if}
		{/if}
	</section>
{/if}

<style>
	h2 {
		margin-top: 0;
	}
	h3 {
		margin: 1rem 0 0.4rem;
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	code {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85em;
		color: var(--cyan);
	}
	.stepper {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin: 0.8rem 0 0.4rem;
	}
	.step-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.3rem 0.75rem 0.3rem 0.35rem;
		cursor: pointer;
	}
	.step-chip:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.step-chip .step-n {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.3rem;
		height: 1.3rem;
		border-radius: 50%;
		border: 1px solid var(--line);
		font-size: 0.68rem;
	}
	.step-chip.current {
		color: var(--green);
		border-color: var(--green);
	}
	.step-chip.current .step-n {
		border-color: var(--green);
	}
	.step-chip.done {
		color: var(--gold);
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.45rem 0.7rem;
		border-radius: 5px;
		margin: 0.6rem 0;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.warn {
		color: var(--gold);
		border: 1px solid var(--line);
	}
	.feedback.notice {
		color: var(--green);
		border: 1px solid var(--line);
	}
	.feedback.block div {
		margin: 0.15rem 0;
	}
	.big-ok {
		font-size: 0.9rem;
	}
	.actions-row {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 0.8rem 0 0.2rem;
	}
	.archive-note {
		margin-top: 1rem;
		border-top: 1px solid var(--line);
		padding-top: 0.7rem;
	}
	.map-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: 0.6rem;
	}
	.map-count {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--cyan);
	}
	.save-state {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--dim);
	}
	.save-state.err {
		color: var(--amber);
	}
	.pattern-strip {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		flex-wrap: wrap;
		margin: 0.5rem 0 0.7rem;
	}
	.pattern-label {
		font-size: 0.8rem;
		color: var(--dim);
	}
	.pattern-chip {
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.25rem 0.55rem;
		cursor: pointer;
	}
	.pattern-chip.active {
		border-color: var(--cyan);
		color: var(--cyan);
	}
	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--line);
		border-radius: 6px;
		margin: 0.5rem 0;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	th {
		text-align: left;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		font-weight: 400;
		color: var(--dim);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.45rem 0.6rem;
		border-bottom: 1px solid var(--line);
	}
	td {
		padding: 0.35rem 0.6rem;
		border-bottom: 1px solid var(--line);
		vertical-align: middle;
	}
	tbody tr:last-child td {
		border-bottom: none;
	}
	.name-cell {
		font-weight: 700;
		color: var(--white);
		white-space: nowrap;
	}
	.mono {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
	}
	.dim {
		color: var(--dim);
	}
	.num {
		text-align: right;
	}
	td input[type='email'] {
		width: 100%;
		min-width: 14rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		padding: 0.3rem 0.45rem;
	}
	.chip {
		display: inline-block;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.12rem 0.5rem;
		color: var(--dim);
		white-space: nowrap;
	}
	.chip-profile {
		color: var(--green);
		border-color: var(--green);
	}
	.chip-pattern {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.chip-hand {
		color: var(--gold);
		border-color: var(--gold);
	}
	.chip-external {
		color: var(--violet);
		border-color: var(--violet);
	}
	.group-head {
		margin: 1rem 0 0.2rem;
		color: var(--white);
	}
	.bad-row td {
		background: color-mix(in srgb, var(--amber) 8%, transparent);
	}
	.diff-bad {
		color: var(--amber);
		font-weight: 700;
	}
	.flag-list {
		margin: 0.4rem 0 0;
		padding-left: 1.1rem;
		font-size: 0.85rem;
		color: var(--dim);
	}
	.flag-list li {
		margin: 0.25rem 0;
	}
	.flag-list strong {
		color: var(--white);
		font-weight: 700;
	}
	.rows {
		display: flex;
		flex-direction: column;
		margin: 0.6rem 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--line);
	}
	.row:last-child {
		border-bottom: none;
	}
	.who {
		min-width: 12rem;
	}
	.email {
		font-weight: 700;
		color: var(--white);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.since {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--dim);
	}
	.actions {
		margin-left: auto;
	}
	.txn-neg {
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
	}
	.txn-pos {
		color: var(--green);
		font-family: 'Share Tech Mono', monospace;
	}
	.totals-strip {
		display: flex;
		gap: 1.2rem;
		flex-wrap: wrap;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--dim);
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.55rem 0.8rem;
		margin: 0.6rem 0 0.3rem;
	}
	.totals-strip strong {
		color: var(--green);
		font-weight: 400;
	}
	.danger-zone {
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.7rem 0.9rem;
		margin-top: 1.2rem;
	}
	.danger-zone h4 {
		margin: 0 0 0.2rem;
		color: var(--crimson, #ff3355);
	}
	.btn.danger {
		border-color: var(--crimson, #ff3355);
		color: var(--crimson, #ff3355);
	}
	.btn.danger-solid {
		background: var(--crimson, #ff3355);
		border-color: var(--crimson, #ff3355);
		color: var(--bg0);
	}
	.refund-panel {
		border: 1px solid var(--gold);
		border-radius: 6px;
		padding: 0.7rem 0.9rem;
		margin-top: 1rem;
	}
	.refund-panel h4 {
		margin: 0 0 0.2rem;
		color: var(--gold);
	}
</style>
