<script lang="ts">
	/**
	 * GRADE BY TEAM (ledger 0436, 0305). The teams of every class this post is
	 * in that you teach, as keys; the picked team's screen under them. Save
	 * goes through `classroom_grade_team`, then the screen is read again so
	 * every total shown is the stored one.
	 */
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import TeamGrader from '$lib/classroom/TeamGrader.svelte';
	import { parseTeamGrading, type TeamGrading } from '$lib/classroom/team-grade';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	// svelte-ignore state_referenced_locally
	const supabase = data.supabase;

	type Section = { section_id: string; label: string; teams: { id: string; name: string }[] };
	const sections = $derived(
		(((data.teams as { sections?: Section[] } | null)?.sections ?? []) as Section[]).filter((s) => s.teams.length)
	);
	const all = $derived(sections.flatMap((s) => s.teams.map((t) => ({ ...t, section: s.section_id, label: s.label }))));
	const picked = $derived(
		all.find((t) => t.id === data.teamParam) ?? all.find((t) => t.section === data.sectionId) ?? all[0] ?? null
	);
	const next = $derived.by(() => {
		if (!picked) return null;
		const i = all.findIndex((t) => t.id === picked.id);
		const n = all[i + 1];
		return n ? { href: `?team=${n.id}`, name: sections.length > 1 ? `${n.name}, ${n.label}` : n.name } : null;
	});

	let grading = $state<TeamGrading | null>(null);
	let failed = $state(false);

	async function read(teamId: string) {
		const { data: raw, error } = await supabase.rpc('classroom_team_grading', { p_item_id: data.itemId, p_team_id: teamId });
		if (error) {
			failed = true;
			return;
		}
		failed = false;
		grading = parseTeamGrading(raw).grading;
	}
	$effect(() => {
		const id = picked?.id;
		if (!id) return;
		untrack(() => void read(id));
	});

	async function save(args: { p_scores: Record<string, number>; p_member_scores: Record<string, Record<string, number>> }, comment: string, ret: boolean) {
		if (!picked) return null;
		const { data: out, error } = await supabase.rpc('classroom_grade_team', {
			p_item_id: data.itemId,
			p_team_id: picked.id,
			...args,
			p_comment: comment.trim() || null,
			p_criterion_comments: {},
			p_return: ret
		});
		if (error) throw new Error(error.message);
		await read(picked.id);
		return out;
	}
</script>

<svelte:head><title>Grade by team · {data.itemTitle}</title></svelte:head>

<div class="tgp">
	<p class="tgp-back"><a href={`/classroom/${data.sectionId}/item/${data.itemId}`}>{data.itemTitle}</a></p>
	{#if !all.length}
		<p class="card tgp-note">No team draw is posted in a class you teach. Draw and post teams on the People tab.</p>
	{:else}
		<nav class="card tgp-teams" aria-label="Teams">
			{#each sections as s (s.section_id)}
				{#if sections.length > 1}<p class="tgp-label">{s.label}</p>{/if}
				<div class="tgp-keys">
					{#each s.teams as t (t.id)}
						<a
							class="btn secondary"
							href={`?team=${t.id}`}
							aria-current={picked?.id === t.id ? 'page' : undefined}
							onclick={(e) => {
								e.preventDefault();
								void goto(`?team=${t.id}`, { replaceState: true, keepFocus: true, noScroll: true });
							}}>{t.name}</a
						>
					{/each}
				</div>
			{/each}
		</nav>
		{#if failed}
			<p class="card tgp-note">This team could not be read. Reload the page to try again.</p>
		{:else if grading}
			<TeamGrader
				{grading}
				onsave={save}
				{next}
				documentHref={`/classroom/${grading.team.sectionId}/item/${data.itemId}`}
			/>
		{:else}
			<p class="card tgp-note">Reading the team.</p>
		{/if}
	{/if}
</div>

<style>
	.tgp {
		display: grid;
		gap: 0.8rem;
		padding: 0.25rem 0 2rem;
		min-width: 0;
		max-width: 52rem;
	}
	.tgp-back {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
	.tgp-back a {
		color: var(--cyan);
	}
	.tgp-note {
		margin: 0;
		padding: 1.1rem;
		font-family: var(--font-display);
		font-size: 1.05rem;
	}
	.tgp-teams {
		display: grid;
		gap: 0.4rem;
		padding: 0.6rem;
	}
	.tgp-label {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, var(--dim));
	}
	.tgp-keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.tgp-keys .btn {
		min-height: 44px;
	}
	.tgp-keys [aria-current='page'] {
		border-color: var(--green);
		color: var(--green);
	}
</style>
