<script lang="ts">
	/**
	 * LINKS IN A STUDENT'S ANSWERS, EACH WITH AN OPEN KEY (ledger 0360).
	 *
	 * Mr. Pina, 2026-09-30: "a quick button I can click on" for the presentation
	 * share link a student hands in, instead of finding it in one line of the
	 * document and pasting it into the address bar. Every grading surface that
	 * shows an answer mounts THIS for its links -- the work head, the answers
	 * list and the Q&A view -- so the words, the safety attributes and the
	 * "not a working link" reading are written once.
	 *
	 * EVERY `href` COMES FROM `$lib/classroom/answer-links`, which admits http and
	 * https and nothing else (`openableUrl`). This component never builds an
	 * address of its own. Each anchor opens in a new tab with `noopener
	 * noreferrer`, and the host is printed beside it, so the teacher can see
	 * where a key goes before pressing it.
	 *
	 * IT RENDERS NOTHING WITH NO LINKS: absence is the mechanism, as it is for
	 * every optional region on the console.
	 */
	import type { AnswerLink } from '$lib/classroom/answer-links';

	let {
		links,
		heading = null,
		showLabel = true,
		testId = 'answer-links'
	}: {
		links: readonly AnswerLink[];
		/** A short heading over the list, or null for none (an inline cell). */
		heading?: string | null;
		/** Print each link's question beside it (off inside a cell that already names it). */
		showLabel?: boolean;
		testId?: string;
	} = $props();
</script>

{#if links.length}
	<div class="al" data-testid={testId}>
		{#if heading}<p class="al-head">{heading}</p>{/if}
		<ul class="al-list">
			{#each links as link, i (`${link.blockId}:${link.url ?? 'raw'}:${i}`)}
				<li class="al-row" data-testid="answer-link">
					{#if showLabel}<span class="al-label">{link.label}</span>{/if}
					{#if link.url}
						<span class="al-host" data-testid="answer-link-host">{link.host}</span>
						<a
							class="btn secondary tiny al-open"
							href={link.url}
							target="_blank"
							rel="noopener noreferrer"
							data-testid="answer-link-open"
							aria-label={`Open ${link.host}${showLabel ? ` for ${link.label}` : ''} in a new tab`}
						>
							Open
						</a>
					{:else}
						<!-- A DECLARED LINK FIELD HOLDING SOMETHING THAT IS NOT A LINK is
						     said in words, with what the student typed, and offers no key:
						     a control whose only outcome is a dead tab must not be offered. -->
						<span class="status-tag al-bad" data-testid="answer-link-bad">Not a working link</span>
						{#if link.raw}<span class="al-raw">{link.raw}</span>{/if}
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.al {
		min-width: 0;
	}
	.al-head {
		margin: 0 0 var(--space-1);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.al-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.al-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		min-width: 0;
	}
	.al-label {
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 0.8rem;
		color: var(--text-1);
	}
	.al-host {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.al-open {
		flex: none;
		text-decoration: none;
	}
	.al-bad {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--amber);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-chip, 4px);
		padding: 0.1rem 0.4rem;
	}
	.al-raw {
		font-size: 0.78rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
</style>
