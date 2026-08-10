<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import SectionManager from './SectionManager.svelte';
	import RolesManager from './RolesManager.svelte';
	import ContractsManager from './ContractsManager.svelte';
	import PayoutManager from './PayoutManager.svelte';
	import {
		EXTRA_CREDIT_GRADING_CATEGORIES,
		KIND_LABELS,
		KIND_ORDER,
		payRaisePreview,
		perfectScorePreview,
		priceHint,
		propertyDamagePreview,
		sanitizeSearchTerm,
		studentLabel,
		threeDPrintingPreview,
		type CoinCategory,
		type StudentSuggestion
	} from '$lib/coin-desk';
	import {
		isBulkEligible,
		sectionDisplayName,
		type BulkLogResponse,
		type CoinSectionRow
	} from './sections';
	import type { CoinRoleDefinition } from './roles';

	/**
	 * The real interactive tool, factored out of /coin-desk so a dev harness
	 * can mount the SAME component against a fake in-memory ledger (the
	 * FspTechSelection / FrcInterestForm convention) -- everything below is
	 * presentation + RPC calls, no admin-gating logic (that stays server-side
	 * in +page.server.ts, which is the real boundary regardless of what this
	 * component renders).
	 */
	let {
		categories,
		supabase,
		configured = true,
		sections: initialSections = [],
		sectionsConfigured = true,
		roleDefinitions = [],
		rolesConfigured = true,
		contractsConfigured = true
	}: {
		categories: CoinCategory[];
		supabase: SupabaseClient;
		configured?: boolean;
		sections?: CoinSectionRow[];
		sectionsConfigured?: boolean;
		roleDefinitions?: CoinRoleDefinition[];
		rolesConfigured?: boolean;
		contractsConfigured?: boolean;
	} = $props();

	// Owned here (not just passed through) so SectionManager's mutations --
	// bound two-way -- are immediately visible to the bulk-log section picker
	// below, with no separate refetch wiring between the two.
	let sections = $state<CoinSectionRow[]>(initialSections);

	// ---------------------------------------------------------------------
	// Student lookup (coin_admin_lookup, reused as-is -- same RPC /admin uses)
	// ---------------------------------------------------------------------
	interface CoinTxn {
		id: string;
		category_id: string;
		category_name: string;
		amount: number;
		quantity: number | null;
		note: string | null;
		actor_email: string;
		created_at: string;
	}
	interface CoinLookup {
		email: string;
		balance: number;
		wage_tier: number;
		eating_pass_active: boolean;
		eating_pass_strikes: number;
		recent_transactions: CoinTxn[];
	}

	let studentEmail = $state('');
	let lookupBusy = $state(false);
	let lookupError = $state('');
	let lookup = $state<CoinLookup | null>(null);

	/**
	 * `refresh` distinguishes a user-initiated lookup (a fresh search, which
	 * should clear any leftover entry-form feedback from a previous student)
	 * from the silent re-lookup submitEntry() runs on ITS OWN student right
	 * after a successful write. That refresh must NOT clear entryNotice --
	 * it would wipe the success message the instant it appears, which is
	 * exactly what happened before this was a parameter (found in browser
	 * verification: the balance/history updated correctly but the "Logged…"
	 * confirmation flashed and vanished on the same tick).
	 */
	async function runLookup(refresh = false) {
		const target = studentEmail.trim().toLowerCase();
		if (!target) return;
		showSuggestions = false;
		lookupError = '';
		if (!refresh) entryNotice = '';
		lookupBusy = true;
		const resp = await supabase.rpc('coin_admin_lookup', { p_email: target });
		lookupBusy = false;
		if (resp.error) {
			lookupError = resp.error.message;
			lookup = null;
			return;
		}
		lookup = resp.data as CoinLookup;
		studentEmail = target;
	}

	// ---------------------------------------------------------------------
	// Name-based typeahead, degrading gracefully to plain email entry --
	// profiles rows only exist for students who have actually signed in, so
	// this is a shortcut when it finds someone, never a requirement to find
	// them: the email field above works standalone regardless of matches.
	// ---------------------------------------------------------------------
	let suggestions = $state<StudentSuggestion[]>([]);
	let searching = $state(false);
	let showSuggestions = $state(false);
	let searchToken = 0;
	let debounceHandle: ReturnType<typeof setTimeout> | undefined;

	function onEmailInput() {
		showSuggestions = true;
		clearTimeout(debounceHandle);
		const term = sanitizeSearchTerm(studentEmail);
		if (term.length < 2) {
			suggestions = [];
			searching = false;
			return;
		}
		debounceHandle = setTimeout(() => runSearch(term), 300);
	}

	async function runSearch(term: string) {
		const token = ++searchToken;
		searching = true;
		const res = await supabase
			.from('profiles')
			.select('id, email, full_name, display_name')
			.eq('role', 'student')
			.or(`display_name.ilike.%${term}%,full_name.ilike.%${term}%,email.ilike.%${term}%`)
			.order('display_name', { ascending: true, nullsFirst: false })
			.limit(8);
		if (token !== searchToken) return; // a newer keystroke already fired
		searching = false;
		suggestions = (res.data ?? []) as StudentSuggestion[];
	}

	function pickSuggestion(s: StudentSuggestion) {
		studentEmail = s.email;
		showSuggestions = false;
		suggestions = [];
		runLookup();
	}

	// ---------------------------------------------------------------------
	// Logging a transaction. Every write below is a call to an EXISTING 0070
	// RPC -- coin_log_transaction for flat/range/per_unit/variable
	// categories, one of the five dedicated RPCs otherwise (see coin-desk.ts)
	// -- never a direct table write, because there is no other write path:
	// coin_transactions grants clients select only, and every rule (debt,
	// caps, Eating Pass strikes, Extra Credit's allowlist) lives inside those
	// functions, not a trigger.
	// ---------------------------------------------------------------------
	let selectedCategoryId = $state('');
	const category = $derived(categories.find((c) => c.id === selectedCategoryId) ?? null);

	let rangeAmount = $state('');
	let quantityInput = $state('');
	let variableAmount = $state('');
	let pointsInput = $state(''); // perfect score + extra credit
	let gradingCategory = $state('');
	let costDollarsInput = $state('');
	let gramsInput = $state('');
	let hoursInput = $state('');
	let overnight = $state(false);
	let noteText = $state('');

	function resetEntryFields() {
		selectedCategoryId = '';
		rangeAmount = '';
		quantityInput = '';
		variableAmount = '';
		pointsInput = '';
		gradingCategory = '';
		costDollarsInput = '';
		gramsInput = '';
		hoursInput = '';
		overnight = false;
		noteText = '';
	}

	function onCategoryChange() {
		rangeAmount = '';
		quantityInput = '';
		variableAmount = '';
		pointsInput = '';
		gradingCategory = '';
		costDollarsInput = '';
		gramsInput = '';
		hoursInput = '';
		overnight = false;
		entryError = '';
		entryNotice = '';
		bulkError = '';
		bulkResponse = null;
	}

	// ---------------------------------------------------------------------
	// Target: a single student (the flow above) or a whole section at once.
	// Bulk mode reuses the SAME category select and the SAME flat/range/
	// variable field blocks below -- it is scoped to exactly those three
	// pricing models (see sections.ts / 0073's coin_bulk_log_section), which
	// is exactly the subset those blocks already render, so no separate
	// field markup is needed.
	// ---------------------------------------------------------------------
	let logMode = $state<'student' | 'section'>('student');
	let selectedSectionId = $state('');

	const categoryOptions = $derived(logMode === 'section' ? categories.filter(isBulkEligible) : categories);

	function setMode(mode: 'student' | 'section') {
		if (logMode === mode) return;
		logMode = mode;
		selectedCategoryId = '';
		selectedSectionId = '';
		onCategoryChange();
	}

	function num(v: string): number {
		return Number(v);
	}

	const noteRequired = $derived(
		!!category &&
			(category.id === 'property_damage_careless' ||
				(category.pricing_model === 'variable' && category.id !== 'extra_credit'))
	);

	const canSubmit = $derived.by(() => {
		if (!lookup || !category || entryBusy) return false;
		if (category.id === 'perfect_score_graded_work') {
			return Number.isFinite(num(pointsInput)) && num(pointsInput) > 0;
		}
		if (category.id === 'pay_raise') return true;
		if (category.id === 'property_damage_careless') {
			return (
				Number.isFinite(num(costDollarsInput)) && num(costDollarsInput) >= 0 && !!noteText.trim()
			);
		}
		if (category.id === 'three_d_printing') {
			return (
				Number.isFinite(num(gramsInput)) &&
				num(gramsInput) >= 0 &&
				Number.isFinite(num(hoursInput)) &&
				num(hoursInput) >= 0
			);
		}
		if (category.id === 'extra_credit') {
			return Number.isFinite(num(pointsInput)) && num(pointsInput) > 0 && !!gradingCategory;
		}
		if (category.pricing_model === 'flat') return true;
		if (category.pricing_model === 'range') {
			const v = num(rangeAmount);
			return Number.isFinite(v) && v >= (category.min_amount ?? 0) && v <= (category.max_amount ?? 0);
		}
		if (category.pricing_model === 'per_unit') {
			return Number.isFinite(num(quantityInput)) && num(quantityInput) > 0;
		}
		if (category.pricing_model === 'variable') {
			const v = num(variableAmount);
			if (!Number.isFinite(v) || v === 0) return false;
			if (category.kind !== 'adjustment' && v <= 0) return false;
			return !!noteText.trim();
		}
		return false;
	});

	const canSubmitBulk = $derived.by(() => {
		if (!category || !selectedSectionId || bulkBusy || !isBulkEligible(category)) return false;
		if (category.pricing_model === 'flat') return true;
		if (category.pricing_model === 'range') {
			const v = num(rangeAmount);
			return Number.isFinite(v) && v >= (category.min_amount ?? 0) && v <= (category.max_amount ?? 0);
		}
		if (category.pricing_model === 'variable') {
			const v = num(variableAmount);
			if (!Number.isFinite(v) || v === 0) return false;
			if (category.kind !== 'adjustment' && v <= 0) return false;
			return !!noteText.trim();
		}
		return false;
	});

	let entryBusy = $state(false);
	let entryError = $state('');
	let entryNotice = $state('');

	let bulkBusy = $state(false);
	let bulkError = $state('');
	let bulkResponse = $state<BulkLogResponse | null>(null);

	function noteOrNull(): string | null {
		return noteText.trim() || null;
	}

	function reasonMessage(r: {
		reason?: string;
		balance?: number;
		cap_period?: string;
		used_points?: number;
		cap_points?: number;
		remaining_points?: number;
		message?: string;
	}): string {
		switch (r.reason) {
			case 'debt':
				return `Blocked: balance is negative (${r.balance}i¢) -- purchases are locked until it clears.`;
			case 'cap_reached':
				return `Blocked: already logged the max for this ${r.cap_period === 'day' ? 'day' : 'calendar month'}.`;
			case 'pass_already_active':
				return 'Blocked: this student already holds an active Eating Pass.';
			case 'cap_exceeded':
				return `Blocked: Extra Credit cap reached (${r.used_points}/${r.cap_points}pt used this semester, ${r.remaining_points}pt remaining).`;
			case 'error':
				return r.message ? `Error: ${r.message}` : 'An unexpected error occurred.';
			default:
				return r.reason ? `Refused: ${r.reason}` : 'Refused by the server.';
		}
	}

	async function submitEntry() {
		if (!category || !lookup) return;
		entryError = '';
		entryNotice = '';
		entryBusy = true;
		const email = lookup.email;

		let resp: { data: unknown; error: { message: string } | null };
		if (category.id === 'perfect_score_graded_work') {
			resp = await supabase.rpc('coin_log_perfect_score', {
				p_email: email,
				p_points: Math.round(num(pointsInput)),
				p_note: noteOrNull()
			});
		} else if (category.id === 'pay_raise') {
			resp = await supabase.rpc('coin_log_pay_raise', { p_email: email, p_note: noteOrNull() });
		} else if (category.id === 'property_damage_careless') {
			resp = await supabase.rpc('coin_log_property_damage_careless', {
				p_email: email,
				p_cost_dollars: num(costDollarsInput),
				p_note: noteText.trim()
			});
		} else if (category.id === 'three_d_printing') {
			resp = await supabase.rpc('coin_log_three_d_printing', {
				p_email: email,
				p_grams: num(gramsInput),
				p_hours: num(hoursInput),
				p_overnight: overnight,
				p_note: noteOrNull()
			});
		} else if (category.id === 'extra_credit') {
			resp = await supabase.rpc('coin_log_extra_credit', {
				p_email: email,
				p_points: Math.round(num(pointsInput)),
				p_grading_category: gradingCategory,
				p_note: noteOrNull()
			});
		} else {
			resp = await supabase.rpc('coin_log_transaction', {
				p_email: email,
				p_category_id: category.id,
				p_amount:
					category.pricing_model === 'range'
						? Math.round(num(rangeAmount))
						: category.pricing_model === 'variable'
							? Math.round(num(variableAmount))
							: null,
				p_quantity: category.pricing_model === 'per_unit' ? num(quantityInput) : null,
				p_note: noteOrNull()
			});
		}

		entryBusy = false;
		if (resp.error) {
			entryError = resp.error.message;
			return;
		}
		const r = resp.data as { ok: boolean; balance?: number; [k: string]: unknown };
		if (!r.ok) {
			entryError = reasonMessage(r);
			return;
		}
		entryNotice = successMessage(category, r);
		resetEntryFields();
		await runLookup(true);
	}

	function successMessage(cat: CoinCategory, r: Record<string, unknown>): string {
		const balance = typeof r.balance === 'number' ? r.balance : undefined;
		if (cat.id === 'pay_raise') {
			return `Wage tier raised ${r.previous_tier} -> ${r.new_tier} for ${r.cost}i¢. New balance: ${balance}i¢.`;
		}
		if (cat.id === 'extra_credit') {
			return `Logged ${r.points}pt (${r.cost}i¢). ${r.used_points}/${r.cap_points}pt used this semester. New balance: ${balance}i¢.`;
		}
		if (cat.id === 'three_d_printing') {
			return `Logged ${r.amount}i¢ (material ${r.material_ic}i¢ + time ${r.time_ic}i¢). New balance: ${balance}i¢.`;
		}
		if (cat.id === 'property_damage_careless') {
			return `Logged ${r.amount}i¢ (${r.base}i¢ base + ${r.exchange}i¢ repair cost). New balance: ${balance}i¢.`;
		}
		const amt = typeof r.amount === 'number' ? r.amount : null;
		const strikeNote = r.strike === true ? ' -- flagged as an Eating Pass strike.' : '';
		return `Logged "${cat.name}" for ${amt !== null ? `${amt > 0 ? '+' : ''}${amt}i¢` : 'the entered amount'}. New balance: ${balance}i¢.${strikeNote}`;
	}

	/**
	 * Logs the current category against every student in the selected
	 * section, in ONE round trip to coin_bulk_log_section (0073) -- not a
	 * client-side loop over coin_log_transaction. See that migration's header
	 * for why: one atomic server-side transaction, one structured per-student
	 * results array, so a debt-lockout refusal on one student never obscures
	 * whether the rest of the section succeeded.
	 */
	async function submitBulk() {
		if (!category || !selectedSectionId) return;
		bulkError = '';
		bulkResponse = null;
		bulkBusy = true;
		const resp = await supabase.rpc('coin_bulk_log_section', {
			p_section_id: selectedSectionId,
			p_category_id: category.id,
			p_amount:
				category.pricing_model === 'range'
					? Math.round(num(rangeAmount))
					: category.pricing_model === 'variable'
						? Math.round(num(variableAmount))
						: null,
			p_note: noteOrNull()
		});
		bulkBusy = false;
		if (resp.error) {
			bulkError = resp.error.message;
			return;
		}
		bulkResponse = resp.data as BulkLogResponse;
		rangeAmount = '';
		variableAmount = '';
		noteText = '';
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}
</script>

<svelte:head>
	<title>Coin Desk // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/admin">Site Admins</a>
		<a class="btn secondary" href="/dashboard">Dashboard</a>
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>

<main class="coin-desk-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Coin Desk</div>
		<h1>Coin entry</h1>
		<p class="lead">
			The day-to-day tool for logging fines, awards, and purchases against the real Supabase coin
			ledger (migration 0070) -- a new tool at a new route. It does not touch
			<strong>/coin-entry</strong>, the Sheets-backed leaderboard, or any
			<strong>/api/coin-ledger/*</strong> route; those keep working exactly as they always have.
			Works identically for any admin -- there is no owner-only step here.
		</p>
	</section>

	{#if !configured}
		<section class="card">
			<p class="feedback error">
				Migration 0070 does not appear to be applied yet -- the category list came back empty.
				Apply it in the Supabase SQL editor, then reload this page.
			</p>
		</section>
	{/if}

	<SectionManager {supabase} bind:sections configured={sectionsConfigured} />

	<RolesManager {supabase} {roleDefinitions} {sections} configured={rolesConfigured} />

	<ContractsManager {supabase} {sections} configured={contractsConfigured} />

	<PayoutManager {supabase} {configured} />

	<section class="card">
		<h2>Find a student</h2>
		<p class="note">
			A balance can exist for an email that has never signed in, so a plain email always works.
			Typing a name searches signed-in students for a shortcut -- if nobody matches, that just
			means they have not signed in yet; enter their email directly.
		</p>
		{#if lookupError}<p class="feedback error">{lookupError}</p>{/if}
		<div class="add-row search-row">
			<div class="search-wrap">
				<input
					type="email"
					placeholder="Student name or student@boscotech.net"
					autocomplete="off"
					bind:value={studentEmail}
					oninput={onEmailInput}
					onfocus={() => (showSuggestions = true)}
					onblur={() => setTimeout(() => (showSuggestions = false), 150)}
					onkeydown={(e) => {
						if (e.key === 'Enter') runLookup();
						if (e.key === 'Escape') showSuggestions = false;
					}}
				/>
				{#if showSuggestions && studentEmail.trim().length >= 2}
					<div class="suggestions">
						{#if searching}
							<div class="suggestion-empty">Searching&hellip;</div>
						{:else if suggestions.length}
							{#each suggestions as s (s.id)}
								<button type="button" class="suggestion" onmousedown={() => pickSuggestion(s)}>
									<span class="suggestion-name">{studentLabel(s)}</span>
									<span class="suggestion-email">{s.email}</span>
								</button>
							{/each}
						{:else}
							<div class="suggestion-empty">
								No signed-in students match. They may not have logged in yet -- you can still log
								against their email directly.
							</div>
						{/if}
					</div>
				{/if}
			</div>
			<button
				class="btn secondary"
				disabled={lookupBusy || !studentEmail.trim()}
				onclick={() => runLookup()}
			>
				Look up
			</button>
		</div>
	</section>

	{#if lookup}
		<section class="card">
			<h2>Student summary</h2>
			<div class="coin-summary">
				<div class="coin-balance" class:negative={lookup.balance < 0}>{lookup.balance}i¢</div>
				<div class="coin-meta">
					<span>{lookup.email}</span>
					<span>wage tier {lookup.wage_tier}</span>
					<span>
						eating pass:
						{lookup.eating_pass_active
							? `active (${lookup.eating_pass_strikes} strike${lookup.eating_pass_strikes === 1 ? '' : 's'})`
							: 'none'}
					</span>
				</div>
			</div>

			{#if lookup.recent_transactions.length}
				<div class="rows coin-rows">
					{#each lookup.recent_transactions as t (t.id)}
						<div class="row">
							<div class="who">
								<span class="email">{t.category_name}</span>
							</div>
							<div class="meta">
								{#if t.note}<span class="note-text">{t.note}</span>{/if}
								<span class="since">by {t.actor_email} &middot; {when(t.created_at)}</span>
							</div>
							<div class="actions">
								<span class:txn-neg={t.amount < 0} class:txn-pos={t.amount > 0}>
									{t.amount > 0 ? '+' : ''}{t.amount}i¢
								</span>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="note">No transactions logged yet for this email.</p>
			{/if}
		</section>
	{/if}

	{#snippet amountFields(cat: CoinCategory)}
		{#if cat.pricing_model === 'flat'}
			<p class="preview">Fixed amount: {cat.amount}i¢</p>
		{:else if cat.pricing_model === 'range'}
			<div class="field-row">
				<label for="range-input">
					Amount ({cat.min_amount}-{cat.max_amount}i¢)
				</label>
				<input
					id="range-input"
					type="number"
					min={cat.min_amount}
					max={cat.max_amount}
					step="1"
					bind:value={rangeAmount}
				/>
			</div>
		{:else if cat.pricing_model === 'variable'}
			<div class="field-row">
				<label for="var-input">
					{cat.kind === 'adjustment' ? 'Adjustment amount (+/-)' : 'Amount (i¢)'}
				</label>
				<input id="var-input" type="number" step="1" bind:value={variableAmount} />
			</div>
		{/if}
	{/snippet}

	<section class="card">
		<h2>Log a transaction</h2>

		<div class="mode-toggle">
			<button type="button" class:active={logMode === 'student'} onclick={() => setMode('student')}>
				Single student
			</button>
			<button type="button" class:active={logMode === 'section'} onclick={() => setMode('section')}>
				Section
			</button>
		</div>

		{#if logMode === 'student'}
			{#if !lookup}
				<p class="note">Look up a student above first.</p>
			{:else}
				{#if entryError}<p class="feedback error">{entryError}</p>{/if}
				{#if entryNotice}<p class="feedback notice">{entryNotice}</p>{/if}

				<div class="field-row">
					<label for="category-select">Category</label>
					<select id="category-select" bind:value={selectedCategoryId} onchange={onCategoryChange}>
						<option value="" disabled selected>Choose a category&hellip;</option>
						{#each KIND_ORDER as kind (kind)}
							{@const inKind = categoryOptions.filter((c) => c.kind === kind)}
							{#if inKind.length}
								<optgroup label={KIND_LABELS[kind]}>
									{#each inKind as c (c.id)}
										<option value={c.id}>{c.name} &mdash; {priceHint(c)}</option>
									{/each}
								</optgroup>
							{/if}
						{/each}
					</select>
				</div>

				{#if category}
					{#if category.notes}
						<p class="note category-note">{category.notes}</p>
					{/if}

					{#if category.id === 'perfect_score_graded_work'}
						<div class="field-row">
							<label for="points-input">Points the work was worth</label>
							<input id="points-input" type="number" min="1" step="1" bind:value={pointsInput} />
						</div>
						{#if pointsInput}
							<p class="preview">Preview: {perfectScorePreview(num(pointsInput))}i¢</p>
						{/if}
					{:else if category.id === 'pay_raise'}
						<p class="preview">
							Current tier {lookup.wage_tier}. This purchase raises it to {lookup.wage_tier + 1} for
							{payRaisePreview(lookup.wage_tier)}i¢ (the server re-checks the tier and the exact
							cost at submit time).
						</p>
					{:else if category.id === 'property_damage_careless'}
						<div class="field-row">
							<label for="cost-input">Repair/replacement cost ($)</label>
							<input
								id="cost-input"
								type="number"
								min="0"
								step="0.01"
								bind:value={costDollarsInput}
							/>
						</div>
						{#if costDollarsInput}
							<p class="preview">Preview: {propertyDamagePreview(num(costDollarsInput))}i¢</p>
						{/if}
					{:else if category.id === 'three_d_printing'}
						<div class="field-row">
							<label for="grams-input">Grams (slicer's reported weight)</label>
							<input id="grams-input" type="number" min="0" step="1" bind:value={gramsInput} />
						</div>
						<div class="field-row">
							<label for="hours-input">Print time (hours)</label>
							<input id="hours-input" type="number" min="0" step="0.1" bind:value={hoursInput} />
						</div>
						<label class="checkbox-row">
							<input type="checkbox" bind:checked={overnight} />
							Printed overnight (no time charge)
						</label>
						{#if gramsInput || hoursInput}
							{@const preview = threeDPrintingPreview(num(gramsInput), num(hoursInput), overnight)}
							<p class="preview">
								Preview: {preview.total}i¢ (material {preview.material}i¢ + time {preview.time}i¢)
							</p>
						{/if}
					{:else if category.id === 'extra_credit'}
						<div class="field-row">
							<label for="ec-points-input">Points</label>
							<input id="ec-points-input" type="number" min="1" step="1" bind:value={pointsInput} />
						</div>
						<div class="field-row">
							<label for="ec-category-select">Grading category</label>
							<select id="ec-category-select" bind:value={gradingCategory}>
								<option value="" disabled selected>Choose&hellip;</option>
								{#each EXTRA_CREDIT_GRADING_CATEGORIES as g (g.id)}
									<option value={g.id}>{g.label}</option>
								{/each}
							</select>
						</div>
						{#if pointsInput}
							<p class="preview">Preview: {Math.round(num(pointsInput) * (category.amount ?? 0))}i¢</p>
						{/if}
					{:else if category.pricing_model === 'per_unit'}
						<div class="field-row">
							<label for="qty-input">Quantity ({category.unit_label})</label>
							<input id="qty-input" type="number" min="0" step="any" bind:value={quantityInput} />
						</div>
						{#if quantityInput}
							<p class="preview">
								Preview: {Math.round(num(quantityInput) * (category.amount ?? 0))}i¢
							</p>
						{/if}
					{:else}
						{@render amountFields(category)}
					{/if}

					<div class="field-row">
						<label for="note-input">
							Note{noteRequired ? ' (required)' : ' (optional)'}
						</label>
						<input id="note-input" type="text" maxlength="500" bind:value={noteText} />
					</div>

					<div class="btn-row">
						<button class="btn" disabled={!canSubmit} onclick={submitEntry}>
							{entryBusy ? 'Logging…' : 'Log transaction'}
						</button>
					</div>
				{/if}
			{/if}
		{:else if !sectionsConfigured}
			<p class="feedback error">
				Migration 0073 does not appear to be applied yet -- sections are unavailable.
			</p>
		{:else}
			<p class="note">
				Logs the SAME category and amount against every student in the section, in one server-side
				call -- scoped to flat, range, and uniform-amount variable categories (Weekly Wage and
				similar). Extra Credit, 3D Printing, and the other per-student categories need real
				per-student input and are not bulk-loggable yet.
			</p>
			{#if bulkError}<p class="feedback error">{bulkError}</p>{/if}

			<div class="field-row">
				<label for="section-select">Section</label>
				<select id="section-select" bind:value={selectedSectionId}>
					<option value="" disabled selected>Choose a section&hellip;</option>
					{#each sections.filter((s) => s.active) as s (s.id)}
						<option value={s.id}>
							{sectionDisplayName(s)} ({s.student_count} student{s.student_count === 1 ? '' : 's'})
						</option>
					{/each}
				</select>
				{#if !sections.some((s) => s.active)}
					<p class="note">No active sections yet -- add one above.</p>
				{/if}
			</div>

			<div class="field-row">
				<label for="bulk-category-select">Category</label>
				<select id="bulk-category-select" bind:value={selectedCategoryId} onchange={onCategoryChange}>
					<option value="" disabled selected>Choose a category&hellip;</option>
					{#each KIND_ORDER as kind (kind)}
						{@const inKind = categoryOptions.filter((c) => c.kind === kind)}
						{#if inKind.length}
							<optgroup label={KIND_LABELS[kind]}>
								{#each inKind as c (c.id)}
									<option value={c.id}>{c.name} &mdash; {priceHint(c)}</option>
								{/each}
							</optgroup>
						{/if}
					{/each}
				</select>
			</div>

			{#if category}
				{#if category.notes}
					<p class="note category-note">{category.notes}</p>
				{/if}

				{@render amountFields(category)}

				<div class="field-row">
					<label for="bulk-note-input">
						Note{noteRequired ? ' (required)' : ' (optional)'}
					</label>
					<input id="bulk-note-input" type="text" maxlength="500" bind:value={noteText} />
				</div>

				<div class="btn-row">
					<button class="btn" disabled={!canSubmitBulk} onclick={submitBulk}>
						{bulkBusy ? 'Logging…' : 'Log to section'}
					</button>
				</div>
			{/if}

			{#if bulkResponse}
				<p class="feedback notice">
					Logged against {bulkResponse.total} student{bulkResponse.total === 1 ? '' : 's'}:
					{bulkResponse.succeeded} succeeded, {bulkResponse.refused} refused.
				</p>
				<div class="rows bulk-rows">
					{#each bulkResponse.results as r (r.email)}
						<div class="row">
							<div class="who">
								<span class="email">{r.email}</span>
							</div>
							<div class="actions">
								{#if r.ok}
									<span class="txn-pos">
										{typeof r.amount === 'number'
											? `${r.amount > 0 ? '+' : ''}${r.amount}i¢`
											: 'logged'}
									</span>
								{:else}
									<span class="txn-neg">{reasonMessage(r)}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</section>

	<footer class="page-footer">
		<VersionBadge app="coins" />
	</footer>
</main>

<style>
	.coin-desk-page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.coin-desk-page > .card {
		margin-bottom: 1.1rem;
	}
	.coin-desk-page h2 {
		margin-top: 0;
	}
	.lead strong {
		color: var(--white);
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.45rem 0.7rem;
		border-radius: 5px;
		margin-bottom: 0.8rem;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.notice {
		color: var(--green);
		border: 1px solid var(--line);
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.category-note {
		margin: 0.4rem 0 0.8rem;
	}
	.add-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.add-row input {
		flex: 1;
		min-width: 12rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.4rem 0.55rem;
	}
	.search-row {
		align-items: flex-start;
	}
	.search-wrap {
		position: relative;
		flex: 1;
		min-width: 12rem;
	}
	.search-wrap input {
		width: 100%;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.4rem 0.55rem;
	}
	.suggestions {
		position: absolute;
		top: calc(100% + 0.3rem);
		left: 0;
		right: 0;
		z-index: 5;
		background: var(--bg1);
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
		max-height: 16rem;
		overflow-y: auto;
	}
	.suggestion {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.05rem;
		width: 100%;
		background: none;
		border: none;
		border-bottom: 1px solid var(--line);
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		text-align: left;
		padding: 0.45rem 0.65rem;
		cursor: pointer;
	}
	.suggestion:last-child {
		border-bottom: none;
	}
	.suggestion:hover {
		background: var(--bg2);
	}
	.suggestion-name {
		font-weight: 600;
		color: var(--white);
	}
	.suggestion-email {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--cyan);
	}
	.suggestion-empty {
		padding: 0.6rem 0.65rem;
		color: var(--dim);
		font-size: 0.82rem;
	}
	.coin-summary {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		flex-wrap: wrap;
		margin: 0.2rem 0 0.8rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
	}
	.coin-balance {
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.4rem;
		color: var(--green);
	}
	.coin-balance.negative {
		color: var(--amber);
	}
	.coin-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	.coin-rows {
		margin-top: 0.2rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line);
	}
	.row:last-child {
		border-bottom: none;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 14rem;
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
	.note-text {
		font-size: 0.85rem;
		color: var(--dim);
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
	.field-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.8rem;
	}
	.field-row label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}
	.field-row input,
	.field-row select {
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.45rem 0.6rem;
	}
	.field-row input:focus,
	.field-row select:focus {
		outline: 2px solid var(--cyan);
		outline-offset: 1px;
	}
	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: 'Rajdhani', sans-serif;
		color: var(--white);
		margin-bottom: 0.8rem;
		cursor: pointer;
	}
	.mode-toggle {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}
	.mode-toggle button {
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.mode-toggle button.active {
		color: var(--bg0);
		background: var(--green);
		border-color: var(--green);
	}
	.bulk-rows {
		margin-top: 0.6rem;
	}
	.preview {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		color: var(--cyan);
		margin: -0.3rem 0 0.8rem;
	}
	.btn-row {
		display: flex;
		gap: 0.85rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
	}
	.page-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
</style>
