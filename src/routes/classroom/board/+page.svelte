<script lang="ts">
	/**
	 * THE TEAM BOARD PAGE (ledger 0436, 0306). Reads `classroom_team_board` on
	 * open, on any listed class's `teams` or `signoffs` notice (a draw posted,
	 * a member moved, a sign-off requested or decided), when the tab comes
	 * back, and on the poller's floor, which is what catches a teammate's saved
	 * answer: the board does not listen on every team's channel.
	 */
	import { untrack } from 'svelte';
	import TeamBoard from '$lib/classroom/TeamBoard.svelte';
	import { parseTeamBoard, type TeamBoard as Board } from '$lib/classroom/team-board';
	import { createClassroomLive, TEAM_NOTICE_JITTER_MS } from '$lib/classroom/live';
	import { startPoller } from '$lib/classroom/poll';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	// svelte-ignore state_referenced_locally
	const supabase = data.supabase;

	let board = $state<Board | null>(null);
	let failed = $state(false);

	async function read(): Promise<'failed' | void> {
		const { data: raw, error } = await supabase.rpc('classroom_team_board');
		if (error) {
			failed = true;
			return 'failed';
		}
		failed = false;
		board = parseTeamBoard(raw);
	}

	$effect(() => {
		const poller = untrack(() => startPoller({ intervalMs: 120_000, immediate: true, run: read }));
		const live = untrack(() => createClassroomLive(supabase));
		let wait: ReturnType<typeof setTimeout> | null = null;
		const offs = untrack(() =>
			data.sections.map((id) =>
				live.subscribe(id, (topic) => {
					if ((topic !== 'signoffs' && topic !== 'teams') || wait) return;
					wait = setTimeout(() => {
						wait = null;
						poller.runNow();
					}, Math.random() * TEAM_NOTICE_JITTER_MS);
				})
			)
		);
		return () => {
			poller.stop();
			for (const off of offs) off();
			if (wait) clearTimeout(wait);
		};
	});
</script>

<svelte:head><title>Team board</title></svelte:head>

<div class="tbp">
	<header class="tbp-head">
		<h1 class="tbp-title">Team board</h1>
		<a class="btn ghost" href="/classroom/signoffs">Sign-off queue</a>
		<a class="btn ghost" href="/classroom/board/machines">Machine week</a>
	</header>
	{#if failed && !board}
		<p class="card tbp-note">The board could not be read. It tries again on its own.</p>
	{:else if !board}
		<p class="card tbp-note">Reading every team.</p>
	{:else}
		<TeamBoard {board} />
	{/if}
</div>

<style>
	.tbp {
		display: grid;
		gap: 0.9rem;
		padding: 0.25rem 0 2rem;
		min-width: 0;
	}
	.tbp-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.tbp-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.6rem;
	}
	.tbp-note {
		margin: 0;
		padding: 1.1rem;
		font-family: var(--font-display);
		font-size: 1.05rem;
	}
</style>
