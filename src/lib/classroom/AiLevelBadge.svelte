<script lang="ts">
	import { AI_LEVELS } from '$lib/classroom/assignment-spec';

	/**
	 * The AI-level badge (IDEA_AI_Use_Policy's four-level ladder).
	 *
	 * EXTRACTED so there is exactly ONE of these. The assignment engine's module
	 * header and the reference documents' AI-level lookup both mount it, which is
	 * what makes "a student sees an identical badge in both places" a property of
	 * the code rather than of two stylesheets that happen to agree today. Its
	 * markup and CSS are lifted verbatim from SpecRenderer's own `.chip.ai-chip`.
	 */
	let {
		level,
		showBlurb = false
	}: {
		level: number | null | undefined;
		/** Render the level's one-line meaning beside the badge. */
		showBlurb?: boolean;
	} = $props();

	const entry = $derived(level == null ? null : (AI_LEVELS[level] ?? null));
</script>

{#if entry}
	<span class="ai-badge-wrap">
		<span class="chip ai-chip" title={entry.blurb}>{entry.label}</span>
		{#if showBlurb}<span class="ai-blurb">{entry.blurb}</span>{/if}
	</span>
{/if}

<style>
	.ai-badge-wrap {
		display: inline-flex;
		align-items: baseline;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	/* Verbatim from SpecRenderer -- see the component note. */
	.chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.08rem 0.5rem;
		color: var(--dim);
		white-space: nowrap;
	}
	.ai-chip {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.ai-blurb {
		font-size: 0.8rem;
		color: var(--dim);
	}
</style>
