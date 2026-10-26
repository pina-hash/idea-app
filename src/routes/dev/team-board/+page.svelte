<script lang="ts">
	/**
	 * THE TEAM BOARD HARNESS (ledger 0436, 0306): the REAL `TeamBoard` over a
	 * board in `classroom_team_board`'s own shape, four teams in three classes.
	 */
	import TeamBoard from '$lib/classroom/TeamBoard.svelte';
	import { parseTeamBoard } from '$lib/classroom/team-board';
	import { fixtureBoard } from './_fixture';

	const board = parseTeamBoard(fixtureBoard())!;
</script>

<svelte:head><title>Team board harness</title></svelte:head>

<main class="harness">
	<TeamBoard {board} />
</main>

<style>
	.harness {
		padding: 1rem;
	}
</style>
