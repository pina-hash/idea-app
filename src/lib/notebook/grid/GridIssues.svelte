<script lang="ts">
	import { gridIssueLabel, type GridIssue } from './grid-issues';

	/**
	 * A GRID'S PROBLEMS, IN SENTENCES, UNDER THE GRID THEY BELONG TO.
	 *
	 * WHY THIS IS A LIST AND NOT A BETTER TOOLTIP. Ledger 0187's four refusals
	 * each carry a student-facing `message`; ledger 0192's cell renders the
	 * `code` (`#DIV/0!`) as the cell's whole content, with the message in a
	 * `title`. `CLAUDE.md`: a `title` tooltip is not discoverable and a phone
	 * cannot hover -- and the notebook is written on a phone as often as on a
	 * laptop. So a fifteen-year-old reading `#CYCLE!` in a cell has nowhere at
	 * all to find out what it means. This is where.
	 *
	 * IT IS `FoundryIssues.svelte`'S SHAPE AND ITS RULE. The sentence is the
	 * engine's, rendered VERBATIM -- nothing here shortens, re-tones or explains
	 * it, because a second, softer statement of a rule is the one that drifts
	 * from the rule. The LOCATION is a chip beside the sentence rather than a
	 * prefix onto it, which is `preflight.ts`'s `locationOf` rule: several of the
	 * engine's sentences already name their cells, and a renderer that prefixed
	 * every one of them would print the location twice.
	 *
	 * COLOUR IS NEVER THE ONLY SIGNAL. Each line carries the error's own CODE as
	 * a word in the chip -- the same mark the cell shows, so the two can be
	 * joined by eye -- and the whole-grid notice carries a word of its own. The
	 * tone is decoration over a legible mark in both cases.
	 *
	 * THE NOTICE AND THE ERRORS ARE DIFFERENT THINGS AND LOOK DIFFERENT. An
	 * empty grid is not a fault -- it is the ordinary first second of using one
	 * -- and rendering it in the error tone would teach a student to read a
	 * crimson row as normal, which costs the rows that are not.
	 */
	let {
		issues,
		label = 'Grid'
	}: {
		issues: GridIssue[];
		/** Names WHICH grid, for a surface that renders more than one. */
		label?: string;
	} = $props();
</script>

{#if issues.length}
	<!--
		`role="status"` AND NOT `role="alert"`. This region changes while a
		student is typing into the grid above it; an assertive live region would
		interrupt them on every keystroke that produced or cleared a refusal,
		which is the behaviour that makes people switch a screen reader's
		verbosity down and miss the thing that mattered.
	-->
	<div class="nb-grid-issues" role="status" aria-label={`${label} problems`} data-testid="grid-issues">
		<ul>
			{#each issues as issue, i (issue.ref ?? `grid-${i}`)}
				<li class:is-notice={issue.ref === null} data-testid={`grid-issue-${issue.ref ?? 'grid'}`}>
					<span class="chip">{gridIssueLabel(issue)}</span>
					<span class="sentence">{issue.message}</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	/*
		THE ROOM HOOK PATTERN, exactly as `GridView.svelte` beside it: every
		colour reads `var(--nb-*, <portal fallback>)`, so the notebook's plate
		points the name at its own corrected value and the shell renders
		byte-identically. `--nb-error` and `--nb-warn` are the CORRECTED tokens;
		the raw `--crimson` and `--amber` are what they exist to correct, and are
		the fallback only for a room that has no plate.
	*/
	.nb-grid-issues {
		border-top: 1px solid var(--hairline);
		padding: var(--space-2);
		font-size: 0.84rem;
		line-height: 1.5;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	li {
		/*
			A CHIP AND A SENTENCE, WRAPPING AS A UNIT AT 375px. `flex-wrap` puts
			the sentence on its own line when the chip and the first words cannot
			share one, rather than letting the sentence's min-content force the
			row wider than the phone -- the `min-width: 0` below is what makes
			that possible at all, since a flex child's automatic minimum is its
			min-content.
		*/
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
		color: var(--nb-error, var(--crimson));
	}
	li.is-notice {
		color: var(--nb-warn, var(--amber));
	}
	.chip {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		white-space: nowrap;
		border: 1px solid currentColor;
		border-radius: var(--radius-1, 4px);
		padding: 0 var(--space-1);
	}
	.sentence {
		flex: 1 1 14rem;
		min-width: 0;
		color: var(--text-1);
	}
</style>
