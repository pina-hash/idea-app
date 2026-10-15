<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import { coins } from '$lib/coin-format';
	import type { CoinCategory } from '$lib/coin-desk';
	import BalanceAdminPanel from './BalanceAdminPanel.svelte';
	import CoinExport from './CoinExport.svelte';
	import DebtPaymentPanel from './DebtPaymentPanel.svelte';
	import DeskHistory from './DeskHistory.svelte';
	import SpoolPanel from './SpoolPanel.svelte';
	import StudentCoinTools from './StudentCoinTools.svelte';
	import StudentStats from './StudentStats.svelte';
	import { callV2, num, V2_UNAVAILABLE } from './v2';
	import { rosterStudentLabel, type ClassRoster, type ClassRosterStudent, type CoinClass } from './log';
	import {
		editAmount,
		reverseRow,
		undoEdit,
		type StudentLookup,
		type StudentStats as StudentStatsShape
	} from './student-view';

	/**
	 * THE STUDENTS AREA (IDEA Coin V2 session two): ONE STUDENT, END TO END.
	 *
	 * Pick a student from one of your classes (each class's roster is
	 * coin_fine_roster, the fine screen's own read) or, as a full coin admin,
	 * type any address. Then:
	 *
	 *   (a) the telemetry (coin_student_stats): balance over time, weekly
	 *       earning and spending, totals by category, every fine, award and
	 *       purchase;
	 *   (b) the history (coin_admin_lookup, folded since 0250) with Undo, and
	 *       for a full coin admin a click-to-edit amount (`can_edit`);
	 *   (c) the export, for this student, one class, or (full only) the whole
	 *       economy;
	 *   (d) a full coin admin's tools: the balance adjustment, standing and a
	 *       purchase paid in coins, a debt paid in coins, a bought 3D print
	 *       spool, and the Student Auditor switch.
	 *
	 * SECTION COIN STAFF GET (a), (b) without editing, and (c) for a student or
	 * a class. Every control a tier does not get is ABSENT, not disabled, and
	 * the database refuses the call for that tier regardless (decision 68).
	 *
	 * The pre-V2 coin sections, their roster editor and the roster import are
	 * gone (0251): a class's roster is IDEA Classroom's enrollment.
	 */
	let {
		supabase,
		scope,
		classes = [],
		categories = [],
		categoryKinds = {},
		initialEmail = ''
	}: {
		supabase: SupabaseClient;
		scope: 'full' | 'section';
		/** The caller's classes: the layout's `coinStaff.sections`. */
		classes?: CoinClass[];
		/** Every category, for the student tools' purchase list. */
		categories?: CoinCategory[];
		/** category id -> kind, for the history rows. */
		categoryKinds?: Record<string, string>;
		/** Opens this student on mount (`/coin-desk/students?student=...`). */
		initialEmail?: string;
	} = $props();

	const full = $derived(scope === 'full');

	// --- the class list and its roster -----------------------------------------
	let classId = $state(untrack(() => classes[0]?.id ?? ''));
	let roster = $state<ClassRosterStudent[]>([]);
	let rosterBusy = $state(false);
	let rosterError = $state('');
	let filter = $state('');
	let rosterToken = 0;

	async function loadRoster(id: string) {
		roster = [];
		rosterError = '';
		if (!id) return;
		const token = ++rosterToken;
		rosterBusy = true;
		const r = await callV2<ClassRoster>(supabase, 'coin_fine_roster', { p_section_id: id });
		if (token !== rosterToken) return;
		rosterBusy = false;
		if (r.kind === 'missing') rosterError = V2_UNAVAILABLE;
		else if (r.kind === 'error') rosterError = r.message;
		else roster = r.data?.students ?? [];
	}

	const shownRoster = $derived.by(() => {
		const t = filter.trim().toLowerCase();
		if (!t) return roster;
		return roster.filter(
			(s) => s.email.toLowerCase().includes(t) || rosterStudentLabel(s).toLowerCase().includes(t)
		);
	});

	// --- the student on screen ---------------------------------------------------
	let emailInput = $state('');
	let selected = $state<string | null>(null);
	let busy = $state(false);
	let stats = $state<StudentStatsShape | null>(null);
	let statsState = $state<'ok' | 'missing' | 'error' | null>(null);
	let statsMessage = $state('');
	let lookup = $state<StudentLookup | null>(null);
	let lookupError = $state('');
	let backgroundUrl = $state<string | null>(null);
	let openToken = 0;

	async function open(email: string, refresh = false) {
		const target = email.trim().toLowerCase();
		if (!target || !target.includes('@')) return;
		const token = ++openToken;
		selected = target;
		busy = true;
		if (!refresh) {
			stats = null;
			statsState = null;
			lookup = null;
			backgroundUrl = null;
		}
		lookupError = '';
		const [s, l] = await Promise.all([
			callV2<StudentStatsShape>(supabase, 'coin_student_stats', { p_email: target }),
			callV2<StudentLookup>(supabase, 'coin_admin_lookup', { p_email: target })
		]);
		if (token !== openToken) return;
		busy = false;
		if (s.kind === 'ok') {
			stats = s.data;
			statsState = 'ok';
			void loadBackground(s.data?.background?.photo_path ?? null, token);
		} else {
			stats = null;
			statsState = s.kind;
			statsMessage = s.kind === 'error' ? s.message : V2_UNAVAILABLE;
		}
		if (l.kind === 'ok') lookup = l.data;
		else {
			lookup = null;
			lookupError = l.kind === 'error' ? l.message : V2_UNAVAILABLE;
		}
	}

	/** The approved background's signed link; a failure draws no picture. */
	async function loadBackground(path: string | null, token: number) {
		if (!path) {
			backgroundUrl = null;
			return;
		}
		try {
			const r = await supabase.storage.from('coin-uploads').createSignedUrl(path, 600);
			if (token === openToken) backgroundUrl = r.data?.signedUrl ?? null;
		} catch {
			if (token === openToken) backgroundUrl = null;
		}
	}

	function refresh() {
		if (selected) return open(selected, true);
	}

	const studentName = $derived(
		stats?.name || lookup?.name || roster.find((s) => s.email === selected)?.display_name || selected || ''
	);

	// --- the Student Auditor list (full only) ------------------------------------
	let auditors = $state<Set<string> | null>(null);
	let auditorBusy = $state(false);
	let auditorError = $state('');
	let auditorState = $state<'ok' | 'missing' | 'error' | null>(null);

	async function loadAuditors() {
		const r = await callV2<{ email: string }[]>(supabase, 'coin_auditor_list');
		if (r.kind === 'ok') {
			auditors = new Set((r.data ?? []).map((a) => a.email.toLowerCase()));
			auditorState = 'ok';
		} else {
			auditorState = r.kind;
			auditorError = r.kind === 'error' ? r.message : V2_UNAVAILABLE;
		}
	}

	async function setAuditor(on: boolean) {
		if (!selected || auditorBusy) return;
		auditorBusy = true;
		auditorError = '';
		const r = await callV2<{ ok: boolean; reason?: string; auditor?: boolean }>(supabase, 'coin_auditor_set', {
			p_email: selected,
			p_on: on
		});
		auditorBusy = false;
		if (r.kind !== 'ok') {
			auditorError = r.kind === 'error' ? r.message : V2_UNAVAILABLE;
			return;
		}
		if (!r.data?.ok) {
			auditorError = 'That is not a student email.';
			return;
		}
		await loadAuditors();
	}

	const isAuditor = $derived(!!selected && !!auditors?.has(selected));

	onMount(() => {
		if (classId) void loadRoster(classId);
		if (full) void loadAuditors();
		if (initialEmail) void open(initialEmail);
	});
</script>

<ClassSplit hasDetail={!!selected} navWidth="list" detailWidth="roomy" scroll="page" narrow="stack-nav-first">
	{#snippet nav()}
		<div class="pane" data-testid="cd-students-nav">
			<label class="cdx-field">
				<span>Class</span>
				<select
					class="cdx-select"
					data-testid="cd-students-class"
					bind:value={classId}
					onchange={() => loadRoster(classId)}
				>
					{#if !classes.length}<option value="">No classes</option>{/if}
					{#each classes as c (c.id)}
						<option value={c.id}>{c.label}</option>
					{/each}
				</select>
			</label>
			{#if roster.length > 8}
				<label class="cdx-field">
					<span>Find on this roster</span>
					<input class="cdx-input" type="search" bind:value={filter} placeholder="Name or email" />
				</label>
			{/if}

			{#if rosterError}
				<p class="cdx-feedback error">{rosterError}</p>
			{:else if rosterBusy}
				<p class="cdx-note">Loading the roster…</p>
			{:else if !classes.length}
				<p class="cdx-note">You have no classes in the coin economy yet.</p>
			{:else if !roster.length}
				<p class="cdx-note">
					Nobody is on this class's coin roster. A roster comes from IDEA Classroom, and only a class
					with the coin economy on has one.
				</p>
			{:else}
				<ul class="roster" data-testid="cd-students-roster">
					{#each shownRoster as s (s.email)}
						<li>
							<button
								type="button"
								class="roster-row"
								class:on={selected === s.email}
								aria-current={selected === s.email ? 'true' : undefined}
								title={s.email}
								onclick={() => open(s.email)}
							>
								<span class="name">{rosterStudentLabel(s)}</span>
								{#if s.balance !== undefined}
									<span class="bal" class:neg={num(s.balance) < 0}>{coins(num(s.balance))}</span>
								{/if}
							</button>
						</li>
					{/each}
					{#if !shownRoster.length}<li class="cdx-note">Nobody on this roster matches.</li>{/if}
				</ul>
			{/if}

			{#if full}
				<div class="by-email">
					<label class="cdx-field">
						<span>Or any student by email</span>
						<input
							class="cdx-input"
							type="email"
							placeholder="student@boscotech.net"
							data-testid="cd-students-email"
							bind:value={emailInput}
							onkeydown={(e) => {
								if (e.key === 'Enter') void open(emailInput);
							}}
						/>
					</label>
					<button
						type="button"
						class="btn secondary"
						data-testid="cd-students-lookup"
						aria-disabled={!emailInput.includes('@')}
						onclick={() => open(emailInput)}
					>
						Look up
					</button>
				</div>
			{/if}
		</div>
	{/snippet}

	<div class="pane detail" data-testid="cd-student-detail">
		{#if selected}
			<header class="who">
				<h2>{studentName}</h2>
				{#if studentName !== selected}<span class="email">{selected}</span>{/if}
				{#if busy}<span class="cdx-note">Loading…</span>{/if}
			</header>

			<section class="block" aria-label="Telemetry">
				{#if statsState === 'ok' && stats}
					<StudentStats {stats} {backgroundUrl} />
				{:else if statsState === 'missing' || statsState === 'error'}
					<p class="cdx-feedback error" data-testid="cd-stats-unavailable">{statsMessage}</p>
				{/if}
			</section>

			<section class="block" aria-labelledby="cd-history-head">
				<h3 id="cd-history-head">History</h3>
				{#if lookupError}
					<p class="cdx-feedback error">{lookupError}</p>
				{:else if lookup}
					<DeskHistory
						transactions={lookup.recent_transactions}
						kinds={categoryKinds}
						reverse={(id) => reverseRow(supabase, id)}
						edit={lookup.can_edit === true
							? (id, amount, note) => editAmount(supabase, id, amount, note)
							: undefined}
						undoEdit={lookup.can_edit === true ? (id) => undoEdit(supabase, id) : undefined}
						onReversed={refresh}
					/>
				{/if}
			</section>

			{#if full && lookup}
				<section class="block tools" aria-labelledby="cd-tools-head" data-testid="cd-full-tools">
					<h3 id="cd-tools-head">Full coin admin tools</h3>
					<div class="cdx-disc">
						<Disclosure label="Standing and a purchase paid in coins" collapseWhen={true} testId="cd-tools">
							<StudentCoinTools
								{supabase}
								email={lookup.email}
								balance={lookup.balance}
								wageTier={lookup.wage_tier}
								eatingPassActive={lookup.eating_pass_active}
								eatingPassStrikes={lookup.eating_pass_strikes}
								noShopToday={lookup.no_shop_today}
								{categories}
								onChanged={refresh}
							/>
						</Disclosure>
					</div>
					{#if num(lookup.balance) < 0}
						<div class="cdx-disc">
							<Disclosure
								label="Pay off debt (balance {coins(num(lookup.balance))})"
								collapseWhen={true}
								testId="cd-debt"
							>
								<DebtPaymentPanel
									{supabase}
									email={lookup.email}
									balance={lookup.balance}
									onLogged={refresh}
								/>
							</Disclosure>
						</div>
					{/if}
					<div class="cdx-disc">
						<Disclosure label="Adjust the balance" collapseWhen={true} testId="cd-adjust-disc">
							<BalanceAdminPanel {supabase} email={lookup.email} onChanged={refresh} />
						</Disclosure>
					</div>
					<div class="cdx-disc">
						<Disclosure label="3D print spool" collapseWhen={true} testId="cd-spool-disc">
							<SpoolPanel {supabase} email={lookup.email} grams={lookup.spool_grams} onChanged={refresh} />
						</Disclosure>
					</div>
					<div class="auditor" data-testid="cd-auditor">
						<span class="auditor-label">Student Auditor</span>
						{#if auditorState === 'ok'}
							<button
								type="button"
								class="btn secondary cdx-small"
								role="switch"
								aria-checked={isAuditor}
								class:on={isAuditor}
								data-testid="cd-auditor-toggle"
								aria-disabled={auditorBusy}
								onclick={() => setAuditor(!isAuditor)}
							>
								{isAuditor ? 'Auditor: on' : 'Auditor: off'}
							</button>
							<span class="cdx-note">
								An auditor may check the coins on hand a classmate reports, never their own.
							</span>
						{:else if auditorState}
							<span class="cdx-note">{auditorError}</span>
						{/if}
					</div>
					{#if auditorError && auditorState === 'ok'}
						<p class="cdx-feedback error">{auditorError}</p>
					{/if}
				</section>
			{/if}
		{/if}
	</div>
</ClassSplit>

<section class="card export-card" aria-labelledby="cd-export-head">
	<h2 id="cd-export-head">Export</h2>
	<CoinExport
		{supabase}
		student={selected ? { email: selected, label: studentName } : null}
		{classes}
		economy={full}
	/>
</section>

<style>
	.pane {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;
	}
	.roster {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.roster-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		min-height: 44px;
		padding: 0.35rem 0.6rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		color: var(--white);
		font-family: var(--font-display);
		font-size: 0.98rem;
		text-align: left;
		cursor: pointer;
	}
	.roster-row:hover {
		border-color: var(--line);
	}
	.roster-row.on {
		border-color: var(--green);
		background: var(--bg2);
	}
	.roster-row:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}
	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bal {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--green);
	}
	.bal.neg {
		color: var(--amber);
	}
	.by-email {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--line);
	}
	.who {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.who h2 {
		margin: 0;
	}
	.email {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, var(--dim));
		overflow-wrap: anywhere;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--line);
	}
	h3 {
		margin: 0;
		font-size: 1rem;
	}
	.auditor {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.auditor-label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--text-2, var(--dim));
	}
	.export-card {
		margin-top: 1rem;
	}
	.export-card h2 {
		margin-top: 0;
	}
</style>
