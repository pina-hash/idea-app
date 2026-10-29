<script lang="ts">
	/**
	 * THE SIGN-OFF QUEUE HARNESS (ledger 0436): the REAL `SignoffQueue` over a
	 * queue in `classroom_signoff_queue`'s own shape, three teams waiting. A
	 * decision is recorded in memory and the request leaves the queue, as the
	 * page's re-read does. `window.__signoffs` lists every decision made, with
	 * the results sent, for the browser pass.
	 */
	import { browser } from '$app/environment';
	import SignoffQueue from '$lib/classroom/SignoffQueue.svelte';
	import { parseSignoffQueue } from '$lib/classroom/signoffs';

	const item = (id: string, kind: string, text: string, extra: Record<string, unknown> = {}) => ({ id, kind, text, auto_ok: kind === 'auto' ? true : null, ...extra });
	const req = (id: string, team: string, members: string[], cp: Record<string, unknown>, items: unknown[], minutes: number, ownerOnly = false) => ({
		id,
		requested_at: new Date(Date.parse('2026-10-28T16:00:00Z') - minutes * 60_000).toISOString(),
		requested_by: members[0],
		owner_only: ownerOnly,
		section: { id: 's2', label: 'Block 2' },
		team: { id: `t-${id}`, name: team, members },
		checkpoint: cp,
		items
	});
	const PLAN = { key: 'plan', title: 'Plan', date: '2026-10-28', gate: null };
	const planItems = [
		item('owners', 'auto', 'Every task has an owner and a due date'),
		item('roles', 'auto', 'Every role has an owner'),
		item('balance', 'auto', 'The plan balances'),
		item('fields', 'auto', "Each role's requirement and sketch fields are complete"),
		item('interfaces', 'tap', 'The sketches meet at the named interfaces', { role: 'frame', owner: 'Ben' }),
		item('method', 'tap', 'The launch method is a flywheel or a catapult', { ownerOnly: true })
	];
	let raw = $state([
		req('r1', 'Team Torque', ['Ana', 'Ben', 'Cara', 'Dev'], PLAN, planItems, 14, true),
		req('r2', 'Team Arc', ['Eli', 'Fay', 'Gus'], PLAN, planItems, 9, true),
		req('r3', 'Team Volt', ['Hal', 'Ivy', 'Jay', 'Kai'], { key: 'design', title: 'Design', date: '2026-11-02', gate: 'No metal is cut before this sign-off.' }, [
			item('fields', 'auto', "The Design post's fields are complete", {
				auto_ok: false,
				missing: [
					{ block: 'u4d-rule-test', label: 'Rule test', who: 'Jay', kind: 'individual' },
					{ block: 'u4d-idea-sketch', label: 'Idea sketch', who: 'Jay', kind: 'individual' },
					{ block: 'drive-sketch', label: 'Drive sketch', who: 'Ivy', kind: 'role' }
				]
			}),
			item('aluminum', 'tap', 'The structure is aluminum, with wood only for a minor part'),
			item('process', 'tap', 'A process is named for every part'),
			item('bearings', 'tap', 'The team uses 6 or fewer 1/2 in hex bearings'),
			item('mount', 'tap', 'The drill or power tool is clamped or mounted to the launcher, never hand-held while firing', { role: 'drive', owner: 'Ivy' })
		], 3)
	]);
	const requests = $derived(parseSignoffQueue({ ok: true, requests: raw }) ?? []);
	const decisions: { id: string; approve: boolean; results: Record<string, boolean>; note?: string }[] = [];
	async function ondecide(id: string, results: Record<string, boolean>, approve: boolean) {
		decisions.push({ id, approve, results });
		raw = raw.filter((r) => r.id !== id);
		if (browser) (window as unknown as { __signoffs: unknown }).__signoffs = [...decisions];
		return { ok: true };
	}
</script>

<svelte:head><title>Sign-off queue harness</title></svelte:head>

<main class="cr-root cr-plate sqh">
	<SignoffQueue
		{requests}
		{ondecide}
		onoverride={async (r, results, note) => {
			decisions.push({ id: r.id, approve: true, results, note } as (typeof decisions)[number]);
			raw = raw.filter((x) => x.id !== r.id);
			if (browser) (window as unknown as { __signoffs: unknown }).__signoffs = [...decisions];
			return { ok: true };
		}}
		now={Date.parse('2026-10-28T16:00:00Z')}
	/>
</main>

<style>
	.sqh {
		max-width: 44rem;
		margin: 0 auto;
		padding: 0.75rem;
	}
</style>
