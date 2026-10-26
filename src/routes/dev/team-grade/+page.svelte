<script lang="ts">
	/**
	 * THE TEAM GRADING HARNESS (ledger 0436, 0305): the REAL `TeamGrader` over
	 * one team in `classroom_team_grading`'s own shape. Save writes each
	 * member's grade in memory by the screen's own preview of the database's
	 * rule and re-reads, as the page does. `window.__teamGrades` lists every
	 * save with the arguments sent, for the browser pass.
	 */
	import { browser } from '$app/environment';
	import TeamGrader from '$lib/classroom/TeamGrader.svelte';
	import { parseTeamGrading, teamMemberPreview, type TeamGrading } from '$lib/classroom/team-grade';
	import { fixtureGrading } from './_fixture';

	let grading = $state<TeamGrading>(parseTeamGrading(fixtureGrading()).grading!);
	const saves: unknown[] = [];
	if (browser) (window as unknown as { __teamGrades: unknown[] }).__teamGrades = saves;

	async function save(
		args: { p_scores: Record<string, number>; p_member_scores: Record<string, Record<string, number>> },
		comment: string,
		ret: boolean
	) {
		saves.push({ ...args, comment, ret });
		const draft = { shared: args.p_scores, member: args.p_member_scores, comment };
		const at = new Date().toISOString();
		const members = grading.members.map((m) => {
			const scores: Record<string, number> = { ...(args.p_member_scores[m.email] ?? {}) };
			for (const [k, v] of Object.entries(args.p_scores)) {
				const role = grading.roleOf[k];
				if (!role || m.roles.includes(role)) scores[k] = v;
			}
			return { ...m, scores, comment, gradedAt: at, score: teamMemberPreview(grading, draft, m.email), state: ret ? 'returned' : m.state };
		});
		grading = { ...grading, members };
		return { ok: true, total: members.length, succeeded: members.length, refused: 0, results: [] };
	}
</script>

<svelte:head><title>Team grading harness</title></svelte:head>

<main class="harness">
	<TeamGrader {grading} onsave={save} next={{ href: '#', name: 'Team Volt' }} documentHref="#" />
</main>

<style>
	.harness {
		max-width: 52rem;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
