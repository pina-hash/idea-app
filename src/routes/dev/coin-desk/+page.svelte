<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import CoinDeskNav from '$lib/coin-desk/CoinDeskNav.svelte';
	import LogView from '$lib/coin-desk/LogView.svelte';
	import SectionManager from '$lib/coin-desk/SectionManager.svelte';
	import BalanceAdminPanel from '$lib/coin-desk/BalanceAdminPanel.svelte';
	import ContractsManager from '$lib/coin-desk/ContractsManager.svelte';
	import RolesManager from '$lib/coin-desk/RolesManager.svelte';
	import CategoriesManager from '$lib/coin-desk/CategoriesManager.svelte';
	import PayoutManager from '$lib/coin-desk/PayoutManager.svelte';
	import type { CoinDeskAreaId } from '$lib/coin-desk/nav';
	import type { CoinCategory } from '$lib/coin-desk';
	import type { CoinSectionRow } from '$lib/coin-desk/sections';
	import {
		createFakeLedger,
		listSections,
		listRoleDefinitions,
		listCategories
	} from './fake-ledger';

	/**
	 * Dev harness: mirrors the /coin-desk ROUTE GROUP -- the same sub-nav
	 * (the real CoinDeskNav in its callback mode, since this harness has no
	 * router) driving the same real components per area, all against an
	 * in-memory ledger (fake-ledger.ts) shaped like 0070's real enforcement,
	 * plus 0073's sections/bulk-log RPCs, 0074/0076's roles RPCs, 0077's
	 * contracts RPCs, 0079's payout RPCs and 0080/0081's category + debt
	 * work. No auth, no live Supabase project.
	 *
	 * Per-area data is loaded HERE the way each route's own +page.server.ts
	 * loads it (Log gets active sections only; Students gets every section;
	 * Economy gets every loggable category, active or not), so the harness
	 * exercises the same per-route loading rule the real group uses instead
	 * of one shared blob.
	 *
	 * Things to try:
	 *  - LOG -- "healthy.student" -> a clean lookup, log a flat fine or a
	 *    range award; "debt.student" -> negative balance, so any
	 *    purchase-kind category is refused with the debt message until an
	 *    award clears it, AND a dedicated amber "Debt payment" card (0081)
	 *    appears under the summary pre-filled with the exact debt (8i¢),
	 *    editable, no cap -- pay less (panel stays), exactly (panel goes,
	 *    balance 0), or more (balance positive, panel goes).
	 *    "pass.student" -> an active Eating Pass with 1 strike already; log
	 *    Eating Violation twice more to watch it auto-revoke on strike 3,
	 *    then try Eating Pass again post-revoke (full price). Quality
	 *    Desktop Background / Correct Answer in Class twice in a row -> the
	 *    calendar-boundary cap refusal. Extra Credit near/at the 21pt cap on
	 *    "pass.student" (already at 15pt). Pay Raise then Weekly Wage --
	 *    watch the wage tier change but the award stay flat (the documented
	 *    gap). Type a name with no match ("zzz") for the graceful no-match
	 *    note. Switch to Section mode and bulk-log Weekly Wage (flat) or
	 *    Above and Beyond (range) -- watch the per-student results list,
	 *    including a debt refusal for "debt.student" that never blocks the
	 *    rest of the section.
	 *  - STUDENTS -- two seeded sections ("Engineering I Honors (Sophomore)"
	 *    via a real curriculum.ts id, and a custom "Period 3 Makeup Group"),
	 *    plus "Ratio Cap Demo (10 students)" for the roles area. Add/edit/
	 *    archive a section, paste emails to assign, remove a roster row.
	 *    Below it, the balance tool MOVED here from /admin: look any email
	 *    up (signed in or not) and apply a signed adjustment with a required
	 *    reason -- the same coin_admin_lookup / coin_admin_adjust_balance
	 *    RPCs, unchanged.
	 *  - CONTRACTS -- five seeded contracts cover every status: "Rewire the
	 *    LED strip" (open, one claimant, room for more), "Deep-clean and
	 *    inventory the fastener bins" (full), "Sophomore section supply
	 *    restock" (section-restricted), "Label the storage bins" (completed,
	 *    already paid), "Order more filament" (cancelled, its one claim
	 *    still visible as history). Post one, Complete a contract with 3+
	 *    claimants to see the rounded even split, Cancel one with a claim on
	 *    it (no payout, claim stays), Reset a claimed-but-open one. The REAL
	 *    concurrency guarantee (two students racing the last slot) is proven
	 *    separately against genuine Postgres connections in
	 *    tests/coin-contracts.test.ts -- this mock cannot re-demonstrate it.
	 *  - ROLES -- "Ratio Cap Demo (10 students)" holds two PENDING Shop
	 *    Steward applications, and Shop Steward's ratio (3 per ~25 students)
	 *    computes a cap of exactly 1 there. Approve the first (0 held < cap
	 *    1) and it succeeds; approve the second and watch it refused inline
	 *    (1 held >= cap 1) while staying pending. Expand that section under
	 *    "Current holders by section", revoke the first, then approve the
	 *    still-pending second -- it now succeeds. Log an application against
	 *    a student already in a section (pick a role and watch its REAL
	 *    question bank load: MC as radios, written as free text, and
	 *    Quartermaster deliberately has none). Approving pre-fills an
	 *    expiration from the role's suggested duration (90 days); set one to
	 *    a past date and it reads "expired" immediately, dropping out of the
	 *    ratio count and the stipend payout. "Pay Weekly Role Stipend"
	 *    bulk-logs 2i¢ against exactly the ACTIVE holders, never the section.
	 *  - ECONOMY -- create a flat/range/per_unit/variable category and it
	 *    appears in Log's dropdown on that route's next load; retire one and
	 *    it disappears there while any transaction that already used it
	 *    still shows its real name in history. The pricing-model select only
	 *    ever offers the four creatable shapes -- 'formula' is not an
	 *    option, and the boundary note above the form says why. Below it,
	 *    Payout (0079): "healthy.student" starts positive (42i¢) so appears
	 *    in the list; "Pay" zeroes it. The decisive check: log a fresh fine
	 *    against a candidate from LOG, come back WITHOUT reloading, and hit
	 *    "Pay All" -- the amount actually paid matches the NEW balance, not
	 *    the stale one the list is still showing.
	 *
	 * There was a sixth area, MIGRATE -- the legacy Sheets import wizard. That
	 * import ran once, reconciled, and the Sheets system it read from is
	 * retired, so the wizard is archived alongside it under
	 * docs/coin-economy/archive/legacy-system/ and this harness no longer
	 * mounts it. 0084's import RPCs stay live; they are SQL-editor operations
	 * now, with no page driving them.
	 */
	const supabase = createFakeLedger() as unknown as SupabaseClient;

	let migrationApplied = $state(true);
	let sectionsApplied = $state(true);
	let rolesApplied = $state(true);
	let contractsApplied = $state(true);

	let area = $state<CoinDeskAreaId>('log');

	// Mirrors each route's own load. Recomputed when the migration toggles
	// flip (the {#key} below remounts the area), the way a real navigation
	// re-runs that route's load.
	function categoriesFor(): CoinCategory[] {
		return migrationApplied ? listCategories() : [];
	}
	function allSections(): CoinSectionRow[] {
		return sectionsApplied ? listSections() : [];
	}
	function activeSections(): CoinSectionRow[] {
		return allSections().filter((s) => s.active);
	}

	// SectionManager / CategoriesManager both take a $bindable list; these are
	// where those writes land, exactly as on the real routes. Re-seeded from
	// the fake ledger whenever the area or a migration toggle changes -- the
	// way arriving at a real route re-runs that route's own load.
	let sectionsState = $state<CoinSectionRow[]>([]);
	let categoriesState = $state<CoinCategory[]>([]);

	$effect(() => {
		// Tracked: the area and the toggles. The reseed functions read plain
		// module state, so this cannot re-trigger itself.
		void area;
		void sectionsApplied;
		void migrationApplied;
		sectionsState = allSections();
		categoriesState = categoriesFor();
	});
</script>

<div class="dev-toolbar">
	<label>
		<input type="checkbox" bind:checked={migrationApplied} />
		Migration 0070 applied
	</label>
	<label>
		<input type="checkbox" bind:checked={sectionsApplied} />
		Migration 0073 (sections) applied
	</label>
	<label>
		<input type="checkbox" bind:checked={rolesApplied} />
		Migrations 0074/0076 (roles) applied
	</label>
	<label>
		<input type="checkbox" bind:checked={contractsApplied} />
		Migration 0077 (contracts) applied
	</label>
</div>

<main class="coin-desk-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Coin Desk (dev harness)</div>
		<h1>Coin desk</h1>
	</section>

	<CoinDeskNav active={area} onSelect={(next) => (area = next)} />

	{#key `${area}:${migrationApplied}:${sectionsApplied}:${rolesApplied}:${contractsApplied}`}
		{#if area === 'log'}
			<LogView
				categories={categoriesFor()}
				{supabase}
				configured={migrationApplied}
				sections={activeSections()}
				sectionsConfigured={sectionsApplied}
			/>
		{:else if area === 'students'}
			<SectionManager {supabase} bind:sections={sectionsState} configured={sectionsApplied} />
			<BalanceAdminPanel {supabase} />
		{:else if area === 'contracts'}
			<ContractsManager {supabase} sections={activeSections()} configured={contractsApplied} />
		{:else if area === 'roles'}
			<RolesManager
				{supabase}
				roleDefinitions={rolesApplied ? listRoleDefinitions() : []}
				sections={activeSections()}
				configured={rolesApplied}
			/>
		{:else}
			<CategoriesManager {supabase} bind:categories={categoriesState} configured={migrationApplied} />
			<PayoutManager {supabase} configured={migrationApplied} />
		{/if}
	{/key}
</main>

<style>
	.dev-toolbar {
		position: fixed;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 20;
		background: var(--bg1);
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--white);
	}
	.dev-toolbar label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
	}
	.coin-desk-page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.coin-desk-page > :global(.card) {
		margin-bottom: 1.1rem;
	}
	.coin-desk-page h2 {
		margin-top: 0;
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
</style>
