<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import CoinDeskTool from '$lib/coin-desk/CoinDeskTool.svelte';
	import { createFakeLedger, listSections, SAMPLE_CATEGORIES } from './fake-ledger';

	/**
	 * Dev harness: mounts the real CoinDeskTool against an in-memory ledger
	 * (fake-ledger.ts) shaped like 0070's real enforcement, plus 0073's
	 * sections/bulk-log RPCs. Try:
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
	 */
	const supabase = createFakeLedger() as unknown as SupabaseClient;

	let migrationApplied = $state(true);
	let sectionsApplied = $state(true);
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
</div>

{#key migrationApplied}
	<CoinDeskTool
		categories={migrationApplied ? SAMPLE_CATEGORIES : []}
		{supabase}
		configured={migrationApplied}
		sections={sectionsApplied ? listSections() : []}
		sectionsConfigured={sectionsApplied}
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
