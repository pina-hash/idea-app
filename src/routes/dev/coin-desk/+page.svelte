<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import CoinDeskTool from '$lib/coin-desk/CoinDeskTool.svelte';
	import { createFakeLedger, listSections, listRoleDefinitions, listCategories } from './fake-ledger';

	/**
	 * Dev harness: mounts the real CoinDeskTool against an in-memory ledger
	 * (fake-ledger.ts) shaped like 0070's real enforcement, plus 0073's
	 * sections/bulk-log RPCs, 0074's roles/ratio-cap RPCs, and 0077's
	 * contracts RPCs. Try:
	 *  - Contracts: five seeded contracts cover every status -- "Rewire the
	 *    LED strip" (open, one existing claimant, room for more), "Deep-clean
	 *    and inventory the fastener bins" (full), "Sophomore section supply
	 *    restock" (section-restricted to eng1h-sophomore), "Label the storage
	 *    bins" (completed, already paid), "Order more filament" (cancelled,
	 *    its one claim still visible as history). Post a new one, Complete a
	 *    contract with 3+ claimants to see the rounded even split, Cancel one
	 *    with a claim on it (no payout, claim stays), Reset a claimed-but-
	 *    open one back to zero claims. The REAL concurrency guarantee (two
	 *    students racing the last slot) is proven separately against genuine
	 *    Postgres connections in tests/coin-contracts.test.ts -- this mock
	 *    cannot meaningfully re-demonstrate that property, see its own header.
	 *  - "healthy.student" -> a clean lookup, log a flat fine or a range award
	 *  - "debt.student" -> negative balance; any purchase-kind category is
	 *    refused with the debt message until an award clears it
	 *  - "pass.student" -> an active Eating Pass with 1 strike already; log
	 *    Eating Violation twice more to watch it auto-revoke on strike 3, then
	 *    try Eating Pass again post-revoke (full price, no discount)
	 *  - Quality Desktop Background / Correct Answer in Class twice in a row
	 *    on any student -> the calendar-boundary cap refusal
	 *  - Extra Credit near/at the 21pt cap on "pass.student" (already at 15pt)
	 *  - Pay Raise on any student, then Weekly Wage -- watch the wage tier
	 *    change but the award amount stay flat (the documented gap)
	 *  - type a name with no match ("zzz") to see the graceful no-match note
	 *  - Sections: two seeded ("Engineering I Honors (Sophomore)" via a real
	 *    curriculum.ts id, and a custom "Period 3 Makeup Group") each holding
	 *    a couple of the sample students. Add/edit/archive a section, paste
	 *    emails to assign, remove a roster row, then switch "Log a
	 *    transaction" to Section mode and bulk-log Weekly Wage (flat) or
	 *    Above and Beyond (range) against one -- watch the per-student results
	 *    list, including a debt refusal for "debt.student" without blocking
	 *    the rest of the section
	 *  - Roles: a third seeded section, "Ratio Cap Demo (10 students)", holds
	 *    two PENDING Shop Steward applications. Shop Steward's ratio (3 per
	 *    ~25 students) computes a cap of exactly 1 for this 10-student
	 *    section. In the Roles card: Approve the first application ("one
	 *    under the cap" succeeds, 0 held < cap 1); Approve the second right
	 *    after and watch it get refused inline ("an application at exactly
	 *    the cap", 1 held >= cap 1) -- the application stays pending, nothing
	 *    is lost. Expand "Ratio Cap Demo" under Current holders by section,
	 *    revoke the first Shop Steward, then go back and Approve the still-
	 *    pending second application -- it now succeeds (revoking freed the
	 *    slot). Log an application of your own against any student already
	 *    assigned to a section (pick a role and watch its REAL question bank
	 *    load dynamically -- MC as radio options, written as free text, and
	 *    Quartermaster has none configured yet so it renders no fields at
	 *    all); try one with no section assigned to see the "assign one
	 *    first" refusal. Approving pre-fills an expiration from the role's
	 *    suggested duration (90 days here), always editable before or after
	 *    submitting. Set a holder's expiration to a past date under Current
	 *    holders ("expiration" -> pick a date -> save) and watch it read
	 *    "expired" immediately, with no reload or timer needed, and drop out
	 *    of both the ratio count and "Pay Weekly Role Stipend"'s payout;
	 *    re-applying and re-approving the same student for the same role
	 *    then succeeds again, auto-closing the lapsed row in the same step
	 *    (shown as "expired" there too, distinct from a manual "revoked").
	 *    Once at least one role holder exists, "Pay Weekly Role Stipend"
	 *    bulk-logs the 2i¢ award against exactly the ACTIVE current holders
	 *    (filterable by role/section), never the whole section and never an
	 *    expired or revoked one
	 *  - Payout (0079): "healthy.student" starts with a positive 42i¢ balance
	 *    -- it appears in the Payout list. Click "Pay" to zero it out (logged
	 *    as "Coin Payout"), or add a fresh fine/award against a candidate via
	 *    "Log a transaction" BEFORE clicking Pay All, then confirm the amount
	 *    actually paid matches the NEW balance, not the one the list showed
	 *    when it loaded -- the race the feature exists to close. Once every
	 *    balance clears, the list reads "No student currently has a positive
	 *    balance."
	 *  - Categories (0080): create a new flat/range/per_unit/variable
	 *    category in the Categories card -- it appears in the "Log a
	 *    transaction" dropdown immediately, no reload. Retire it and watch it
	 *    disappear from that dropdown while any transaction that already used
	 *    it (log one first, then retire) still shows its real name in the
	 *    student's history. The pricing-model select only ever offers the
	 *    four creatable shapes -- 'formula' is not an option, and the
	 *    boundary note above the form explains why.
	 */
	const supabase = createFakeLedger() as unknown as SupabaseClient;

	let migrationApplied = $state(true);
	let sectionsApplied = $state(true);
	let rolesApplied = $state(true);
	let contractsApplied = $state(true);
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

{#key migrationApplied}
	<CoinDeskTool
		categories={migrationApplied ? listCategories() : []}
		{supabase}
		configured={migrationApplied}
		sections={sectionsApplied ? listSections() : []}
		sectionsConfigured={sectionsApplied}
		roleDefinitions={rolesApplied ? listRoleDefinitions() : []}
		rolesConfigured={rolesApplied}
		contractsConfigured={contractsApplied}
	/>
{/key}

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
</style>
