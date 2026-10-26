<script lang="ts">
	/**
	 * THE TEAM PLAN HARNESS (ledger 0436): the REAL `TeamPlan` over a fixture in
	 * `classroom_team_plan`'s own shape (`_fixture.ts`), with every write applied
	 * to the fixture in memory and the plan read again, as the page does.
	 * `window.__teamPlan` is a snapshot of the counts the browser pass reads.
	 */
	import { browser } from '$app/environment';
	import TeamPlan from '$lib/classroom/TeamPlan.svelte';
	import { parseTeamPlan, teamPlanSummary, type TeamPlanWrites } from '$lib/classroom/team-plan';
	import { fixturePlan } from './_fixture';

	let raw = $state(fixturePlan());
	const plan = $derived(parseTeamPlan(raw).plan!);
	const tasks = () => raw.tasks as Record<string, unknown>[];
	const ok = async () => ({ ok: true });
	const writes: TeamPlanWrites = {
		setRole: async (_t, roleId, key) => {
			for (const r of raw.roles as Record<string, unknown>[]) if (r.id === roleId) r.owner = key;
			return ok();
		},
		setOwner: async (id, key) => {
			for (const t of tasks()) if (t.id === id) t.owner = key;
			return ok();
		},
		setDue: async (id, due) => {
			for (const t of tasks()) if (t.id === id) t.due_on = due;
			return ok();
		},
		addTask: async (_t, title, key, due) => {
			tasks().push({ id: `new-${tasks().length}`, kind: 'team', title, owner: key, due_on: due, points: 0, on_it: [] });
			return ok();
		},
		removeTask: async (id) => {
			raw.tasks = tasks().filter((t) => t.id !== id);
			return ok();
		},
		block: async (id, why) => {
			for (const t of tasks()) if (t.id === id) t.blocked = why;
			return ok();
		},
		depends: async (id, on) => {
			for (const t of tasks()) if (t.id === id) t.depends_on = on;
			return ok();
		},
		request: async (_t, key) => {
			for (const c of raw.checkpoints as Record<string, unknown>[]) if (c.key === key) c.state = 'requested';
			return ok();
		},
		checkin: async (_t, ids) => {
			for (const t of tasks()) t.on_it = ids.includes(String(t.id)) ? ['k-ana'] : [];
			return ok();
		}
	};
	$effect(() => {
		if (!browser) return;
		const s = teamPlanSummary(plan);
		(window as unknown as { __teamPlan: unknown }).__teamPlan = { ...s, tasks: plan.tasks.length };
	});
</script>

<svelte:head><title>Team plan harness</title></svelte:head>

<main class="cr-root cr-plate tph">
	<TeamPlan {plan} {writes} onchanged={() => (raw = { ...raw })} itemHref={(id) => `#${id}`} />
</main>

<style>
	.tph {
		max-width: 80rem;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
