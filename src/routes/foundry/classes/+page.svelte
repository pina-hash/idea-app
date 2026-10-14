<script lang="ts">
	/**
	 * /foundry/classes -- close the Foundry for a class, and open it again.
	 *
	 * THE ROUTE OWNS THE LOAD AND THE TRANSPORT; the component owns the
	 * arrangement and the intent. `setOpen` is a plain RPC call made from the
	 * browser client, which is what the convention asks for: one RPC and three
	 * arguments is not work that needs a server route.
	 */
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	import FoundryClassAccess from '$lib/foundry/FoundryClassAccess.svelte';
	import FoundrySchedule from '$lib/foundry/FoundrySchedule.svelte';
	import FoundrySiteSwitch from '$lib/foundry/FoundrySiteSwitch.svelte';
	import { scheduleFromRpc, scheduleRefusalSentence } from '$lib/foundry/schedule';
	import { FOUNDRY_SITE_OPEN } from '$lib/foundry/access';

	let { data } = $props();

	/**
	 * THE WHOLE-FOUNDRY SWITCH (report c26026b0, ledger 0360), above the
	 * per-class control because it is the wider of the two. Markup-gated on
	 * `isAdmin` (from the root layout), and `foundry_set_site_open` re-checks
	 * `is_admin()` in its own body, which is the boundary.
	 *
	 * A DATABASE WITHOUT 0230 ANSWERS `PGRST202`, and the switch then says so in
	 * words instead of pretending to have turned anything off.
	 */
	const isAdmin = $derived(page.data.isAdmin === true);
	const site = $derived(data.foundryAccess?.site ?? FOUNDRY_SITE_OPEN);

	async function setSiteOpen(open: boolean, note: string | null) {
		const { error } = await data.supabase.rpc('foundry_set_site_open', {
			p_open: open,
			p_note: note
		});
		if (error) {
			if (error.code === 'PGRST202') {
				return {
					ok: false,
					message:
						'The switch is not on this site yet. It arrives with the next database update.'
				};
			}
			return { ok: false, message: error.message };
		}
		return { ok: true };
	}

	/**
	 * THE CLASS SCHEDULE (0237, report 84e293d4). Each write is one RPC straight
	 * from the browser client; the database re-checks that the caller manages the
	 * section in every function. A database before 0237 answers `PGRST202`, which
	 * `loadSchedule` turns into null and the panel says "not available yet".
	 */
	async function loadSchedule(sectionId: string) {
		const { data: r, error } = await data.supabase.rpc('foundry_class_schedule_get', {
			p_section_id: sectionId
		});
		if (error) return null;
		return scheduleFromRpc(r);
	}
	async function scheduleCall(fn: string, args: Record<string, unknown>) {
		const { data: r, error } = await data.supabase.rpc(fn, args);
		// The database's own sentence for a raise (not yours, not signed in).
		if (error) return { ok: false as const, message: error.message };
		const out = r as { ok?: boolean; reason?: string } | null;
		if (out?.ok) return { ok: true as const };
		return { ok: false as const, message: scheduleRefusalSentence(out?.reason) };
	}
</script>

<svelte:head><title>Foundry access for your classes</title></svelte:head>

<div class="fdy-classes-page">
	{#if isAdmin}
		<FoundrySiteSwitch {site} {setSiteOpen} onChanged={() => invalidateAll()} />
	{/if}
	<FoundryClassAccess
		sections={data.sections}
		setOpen={async (sectionId, open, note) => {
			const { error } = await data.supabase.rpc('foundry_set_section_open', {
				p_section_id: sectionId,
				p_open: open,
				p_note: note
			});
			// THE DATABASE'S OWN SENTENCE, VERBATIM. A refusal rewritten here
			// is a second vocabulary for the same rule.
			if (error) return { ok: false, message: error.message };
			return { ok: true };
		}}
	/>
	<FoundrySchedule
		sections={data.sections}
		load={loadSchedule}
		saveWeekly={(sectionId, enabled, weekly) =>
			scheduleCall('foundry_class_schedule_set', {
				p_section_id: sectionId,
				p_enabled: enabled,
				p_weekly: weekly
			})}
		saveDay={(sectionId, onDate, kind, windows, note) =>
			scheduleCall('foundry_class_schedule_day_set', {
				p_section_id: sectionId,
				p_on_date: onDate,
				p_kind: kind,
				p_windows: windows,
				p_note: note
			})}
		clearDay={(sectionId, onDate) =>
			scheduleCall('foundry_class_schedule_day_clear', {
				p_section_id: sectionId,
				p_on_date: onDate
			})}
	/>
</div>

<style>
	.fdy-classes-page {
		max-width: 60rem;
		margin: 1.5rem auto;
		padding: 0 var(--fg-gutter, 1rem);
	}
</style>
