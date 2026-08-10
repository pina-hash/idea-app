<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import ContractsView from '$lib/contracts/ContractsView.svelte';
	import { createFakeLedger, SAMPLE_STUDENTS } from '../coin-desk/fake-ledger';

	/**
	 * Dev harness: mounts the real ContractsView against an in-memory ledger
	 * shaped like 0077's real enforcement (fake-ledger.ts, shared with
	 * /dev/coin-desk). A student-identity switcher stands in for a real
	 * session, since coin_contract_self_claim resolves the caller from
	 * current_user_email() with no email parameter at all -- there is
	 * genuinely nothing else for this harness to inject.
	 *
	 * Try:
	 *  - "healthy.student" (in eng1h-sophomore): claims "Rewire the LED
	 *    strip" (still has room -- watch it move into "Contracts you're on"),
	 *    can claim "Sophomore section supply restock" (their section), gets
	 *    the debt/pass-through of every other refusal shape below too
	 *  - "debt.student" (also in eng1h-sophomore): "Deep-clean and inventory
	 *    the fastener bins" shows as Full (already claimed by them, disabled
	 *    everywhere else it would show as an open slot)
	 *  - "pass.student" (NOT in eng1h-sophomore): try claiming "Sophomore
	 *    section supply restock" -- refused, wrong section
	 *  - Any identity: "Order more filament" and "Label the storage bins"
	 *    never appear under Open (cancelled / completed), and "Deep-clean and
	 *    inventory the fastener bins" shows Full once its one slot is taken
	 *  - Switch identity after claiming to see "Contracts you're on" is
	 *    genuinely per-student, not shared
	 *
	 * The REAL concurrency guarantee (two students racing the last open
	 * slot) is proven separately in tests/coin-contracts.test.ts against
	 * genuine concurrent Postgres connections -- this single-threaded JS mock
	 * has no interleaving point to meaningfully re-demonstrate that with.
	 */
	let currentEmail = $state(SAMPLE_STUDENTS[0].email);
	const supabase = createFakeLedger(() => currentEmail) as unknown as SupabaseClient;

	let migrationApplied = $state(true);
</script>

<div class="dev-toolbar">
	<label>
		Signed in as
		<select bind:value={currentEmail}>
			{#each SAMPLE_STUDENTS as s (s.email)}
				<option value={s.email}>{s.display_name || s.full_name} ({s.email})</option>
			{/each}
		</select>
	</label>
	<label>
		<input type="checkbox" bind:checked={migrationApplied} />
		Migration 0077 applied
	</label>
</div>

{#key currentEmail}
	<ContractsView {supabase} configured={migrationApplied} email={currentEmail} />
{/key}

<style>
	.dev-toolbar {
		position: fixed;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 20;
		display: flex;
		gap: 0.6rem;
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
	.dev-toolbar select {
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		padding: 0.15rem 0.3rem;
	}
</style>
