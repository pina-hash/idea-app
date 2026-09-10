<script lang="ts">
	import '$lib/gauntlet/viewport/viewport.css';
	import RankStateChip from '$lib/gauntlet/RankStateChip.svelte';
	import { RANK_STATES, rankStateOf, formatTime, type LeaderboardRow } from '$lib/gauntlet';

	/**
	 * Dev-only harness for what 0194 put on screen: the held state, on the board
	 * and on the result card.
	 *
	 * IT MOUNTS THE REAL COMPONENT AND RE-USES THE REAL PREDICATE. `RankStateChip`
	 * is the shipping component, `rankStateOf` is the shipping derivation and
	 * `RANK_STATES` is the shipping vocabulary -- nothing here restates a word, a
	 * hue or a rule. A harness that hand-rolled the chip would measure markup
	 * nobody ships.
	 *
	 * THE BOARD FIXTURE IS THE POINT, and it is four rows rather than one because
	 * every claim about the held state is a claim about how it sits BESIDE the
	 * ranked ones:
	 *
	 *   * The held row must carry a chip and the ranked rows must NOT. `ranked`
	 *     renders nothing, so "1 chip over 4 rows" is an exclusion with its own
	 *     positive control in the same measurement -- a chip on every row and a
	 *     chip on no row both fail it.
	 *   * The `#` column must never be blank. A held row shows the state's own
	 *     `rankCell` mark; a ranked row shows its number.
	 *   * The ranked rows must stay numbered 1, 2, 3 with the held row among
	 *     them. A held run seats nobody, and a board that renumbered around it
	 *     would look completely fine on screen.
	 *
	 * THE RESULT-CARD MOUNT IS THE BRANCH THAT NEVER RENDERED. Before 0194 a run
	 * that passed and did not rank matched neither branch of the rank sentence,
	 * so the card said nothing at all. The explaining form of the chip is what
	 * fills it, and it is here so its sentence can be read at both widths.
	 *
	 * WHAT IS DELIBERATELY NOT HERE: any number of seconds. The whole argument
	 * for a status rather than an explanation is that the student is told what
	 * happened without being handed the threshold, so a harness that printed the
	 * floor would be measuring a screen that breaks the rule it exists to check.
	 */

	// Shaped like real `gauntlet_leaderboard` rows, `rank_state` included, so the
	// derivation under test runs on the shape it runs on in production.
	const board: LeaderboardRow[] = [
		{
			challenge_id: 'c-1',
			user_id: 'u-ben',
			player: 'Ben Okafor',
			is_correct: true,
			score_metric: 187.004,
			rank: 1,
			created_at: '2026-09-08T15:04:00Z',
			rank_state: 'ranked'
		},
		{
			challenge_id: 'c-1',
			user_id: 'u-cleo',
			player: 'Cleo Nakamura',
			is_correct: true,
			score_metric: 204.51,
			rank: 2,
			created_at: '2026-09-08T15:22:00Z',
			rank_state: 'ranked'
		},
		{
			challenge_id: 'c-1',
			user_id: 'u-dev',
			player: 'Dev Mistry',
			is_correct: true,
			score_metric: 311.9,
			rank: 3,
			created_at: '2026-09-09T09:41:00Z',
			rank_state: 'ranked'
		},
		{
			challenge_id: 'c-1',
			user_id: 'u-ana',
			player: 'Ana Reyes',
			is_correct: true,
			score_metric: 4.312,
			rank: null,
			created_at: '2026-09-09T10:02:00Z',
			rank_state: 'pending_verification'
		}
	];

	const myUserId = 'u-ana';
</script>

<svelte:head><title>GAUNTLET rank state harness</title></svelte:head>

<div class="gt-root">
	<div class="gt-content">
		<main class="gauntlet harness">
			<h1>Rank state harness</h1>
			<p class="note">
				What a held run looks like on the board and on the result card. The held row is on the
				board, carries no place, and says so in a word as well as a colour.
			</p>

			<section class="mount" data-mount="board">
				<h2>The board, with one held run among three ranked ones</h2>
				<table class="board">
					<thead>
						<tr>
							<th class="rank-col">#</th>
							<th>Player</th>
							<th class="time-col">Time</th>
						</tr>
					</thead>
					<tbody>
						{#each board as row (row.user_id)}
							{@const state = rankStateOf(row)}
							<tr class:me={row.user_id === myUserId}>
								<td class="rank-col">{row.rank ?? RANK_STATES[state].rankCell}</td>
								<td>
									{row.player}{#if row.user_id === myUserId}<span class="you">you</span>{/if}
									<RankStateChip {state} />
								</td>
								<td class="time-col">{formatTime(row.score_metric)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>

			<section class="mount" data-mount="result-card">
				<h2>The result card branch that never rendered</h2>
				<p class="note">
					A run that PASSED and does not rank. Before 0194 this said nothing at all: the student
					read "Pass, verified" over a table they were missing from.
				</p>
				<RankStateChip state="pending_verification" explain />
			</section>

			<section class="mount" data-mount="ranked-renders-nothing">
				<h2>A ranked run renders no chip</h2>
				<p class="note">
					The state is passed in and the component declines to draw it: a row with a number in the
					`#` column has already said it is ranked, and a chip on every row is what makes the one
					that matters hard to see. Nothing should appear between these brackets:
					[<RankStateChip state="ranked" />]
				</p>
			</section>
		</main>
	</div>
</div>

<style>
	.harness {
		padding: 1.5rem 1rem 4rem;
	}
	.mount {
		margin-block: 2rem;
	}
	.note {
		max-width: 62ch;
		color: var(--white, #e8fff0);
	}
	.board {
		width: 100%;
		border-collapse: collapse;
		/* An overflow container of its own, per the responsive rule: a table may
		   be wider than the measure, the page body may not. */
		max-width: 100%;
	}
	.board th,
	.board td {
		text-align: left;
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid var(--line, #16242c);
		/* min-width 0 so a long player name cannot force the page wider than the
		   viewport through a cell's automatic minimum. */
		min-width: 0;
	}
	.board .rank-col,
	.board .time-col {
		font-family: var(--font-mono, monospace);
		white-space: nowrap;
	}
	.you {
		margin-left: 0.4rem;
		font-family: var(--font-mono, monospace);
		font-size: 0.7rem;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
	}
</style>
