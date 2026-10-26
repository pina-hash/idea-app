<script lang="ts">
	/**
	 * THE TEAM PLAN PAGE (ledger 0436). Reads `classroom_team_plan` on open, on
	 * the team's `team-doc` notice and the section's `teams` notice (a draw
	 * posted or a member moved), and when the tab comes back; it runs no
	 * interval. A manager picks a team from the class's current posted draw.
	 */
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import TeamPlan from '$lib/classroom/TeamPlan.svelte';
	import { parseTeamPlan, type TeamPlan as Plan, type TeamPlanWrites } from '$lib/classroom/team-plan';
	import { TEAM_DOC_WORDS, teamLiveKey } from '$lib/classroom/html-assignment/team-doc';
	import { classroomLiveFromContext, TEAM_NOTICE_JITTER_MS } from '$lib/classroom/live';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const supabase = data.supabase;
	const live = classroomLiveFromContext();

	let plan = $state<Plan | null>(null);
	let reason = $state<string | null>(null);
	let failed = $state(false);
	let loaded = $state(false);
	let teams = $state<{ id: string; name: string }[]>([]);

	async function read() {
		const { data: raw, error } = await supabase.rpc('classroom_team_plan', {
			p_section_id: data.sectionId,
			p_team_id: data.teamParam
		});
		loaded = true;
		if (error) {
			failed = true;
			return;
		}
		failed = false;
		const parsed = parseTeamPlan(raw);
		plan = parsed.plan;
		reason = parsed.reason;
	}

	let wait: ReturnType<typeof setTimeout> | null = null;
	function noticed() {
		if (wait) return;
		wait = setTimeout(() => {
			wait = null;
			void read();
		}, Math.random() * TEAM_NOTICE_JITTER_MS);
	}

	$effect(() => {
		void data.teamParam;
		untrack(() => void read());
	});
	$effect(() => {
		if (!data.manages) return;
		untrack(async () => {
			const { data: raw } = await supabase.rpc('classroom_section_teams', { p_section_id: data.sectionId });
			const list = (raw as { teams?: { id: string; name: string }[] } | null)?.teams ?? [];
			teams = list;
			if (!data.teamParam && list.length) void goto(`?team=${list[0].id}`, { replaceState: true, keepFocus: true });
		});
	});
	$effect(() => {
		if (!live) return;
		const off = untrack(() =>
			live.subscribe(data.sectionId, (topic) => {
				if (topic === 'teams') noticed();
			})
		);
		return off;
	});
	const teamKey = $derived(plan ? teamLiveKey(plan.team.id) : null);
	$effect(() => {
		const key = teamKey;
		if (!live || !key) return;
		return untrack(() =>
			live.subscribe(key, (topic) => {
				if (topic === 'team-doc') noticed();
			})
		);
	});
	$effect(() => {
		const back = () => {
			if (document.visibilityState === 'visible') void read();
		};
		document.addEventListener('visibilitychange', back);
		return () => {
			document.removeEventListener('visibilitychange', back);
			if (wait) clearTimeout(wait);
		};
	});

	const call = async (fn: string, args: Record<string, unknown>) => {
		const { data: out, error } = await supabase.rpc(fn, args);
		if (error) throw new Error(error.message);
		if (plan && live) live.announce(teamLiveKey(plan.team.id), 'team-doc');
		return out;
	};
	const writes: TeamPlanWrites = {
		setRole: (teamId, roleId, key) => call('classroom_team_plan_set_role', { p_team_id: teamId, p_role_id: roleId, p_member_key: key }),
		setOwner: (taskId, key) => call('classroom_team_task_set_owner', { p_task_id: taskId, p_member_key: key }),
		setDue: (taskId, dueOn) => call('classroom_team_task_set_due', { p_task_id: taskId, p_due_on: dueOn }),
		addTask: (teamId, title, key, dueOn) =>
			call('classroom_team_task_add', { p_team_id: teamId, p_title: title, p_member_key: key, p_due_on: dueOn, p_depends_on: null }),
		removeTask: (taskId) => call('classroom_team_task_remove', { p_task_id: taskId }),
		block: (taskId, why) => call('classroom_team_task_block', { p_task_id: taskId, p_reason: why }),
		depends: (taskId, on) => call('classroom_team_task_depends', { p_task_id: taskId, p_depends_on: on }),
		checkin: (teamId, ids) => call('classroom_team_checkin', { p_team_id: teamId, p_task_ids: ids }),
		request: (teamId, key) => call('classroom_signoff_request', { p_team_id: teamId, p_checkpoint_key: key })
	};
</script>

<svelte:head><title>Team plan · {data.sectionLabel}</title></svelte:head>

<div class="plan-page">
	{#if data.manages && teams.length}
		<nav class="card plan-teams" aria-label="Teams">
			{#each teams as t (t.id)}
				<a class="btn secondary" aria-current={plan?.team.id === t.id ? 'page' : undefined} class:on={plan?.team.id === t.id} href={`?team=${t.id}`}>{t.name}</a>
			{/each}
		</nav>
	{/if}
	{#if !loaded}
		<p class="card plan-wait">Opening your team plan.</p>
	{:else if failed}
		<p class="card plan-wait">The team plan could not be read. Reload the page to try again.</p>
	{:else if plan}
		<TeamPlan {plan} {writes} onchanged={() => void read()} itemHref={(id) => `/classroom/${data.sectionId}/item/${id}`} />
	{:else}
		<p class="card plan-wait" data-testid="team-plan-waiting">
			{reason === 'no_team'
				? TEAM_DOC_WORDS.noTeam
				: data.manages
					? 'No team draw is posted in this class. Draw and post teams on the People tab.'
					: 'Teams are drawn in class. Your team plan opens here the moment teams are posted.'}
		</p>
	{/if}
</div>

<style>
	.plan-page {
		display: grid;
		gap: 0.9rem;
		padding: 0.25rem 0 2rem;
		min-width: 0;
	}
	.plan-teams {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.6rem;
	}
	.plan-wait {
		padding: 1.1rem 1.2rem;
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--text-1, var(--white));
	}
</style>
