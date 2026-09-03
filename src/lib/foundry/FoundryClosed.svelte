<script lang="ts">
	/**
	 * WHAT A STUDENT SEES WHEN A CLASS HAS CLOSED THE FOUNDRY (0173, decision
	 * 01).
	 *
	 * A STATED REASON, NEVER A BLANK PAGE AND NEVER A 404. The Foundry is a
	 * surface every signed-in student knows exists -- it is on the launcher --
	 * so hiding its existence would confirm nothing and cost the reader the one
	 * thing they need, which is why it is off and who to ask. A 404 here would
	 * read as the site being broken.
	 *
	 * IT IS NOT THE GATE. The layout's server load is what withholds the page's
	 * data and 0173's own predicates are what refuse the writes; this renders a
	 * sentence. Deleting this component would leave a student with an empty
	 * area, not with access.
	 *
	 * THE SENTENCE IS `foundryClosedSentence`'s, once. A panel that composed
	 * its own would be the second statement of the refusal, and the two would
	 * drift the first time somebody added a class to the payload.
	 */
	import {
		foundryClosedNotes,
		foundryClosedSentence,
		type FoundryClosedSection
	} from './access.ts';

	let { closed = [] }: { closed?: FoundryClosedSection[] } = $props();

	const sentence = $derived(foundryClosedSentence(closed));
	const notes = $derived(foundryClosedNotes(closed));
</script>

<section class="fdy-closed" data-testid="foundry-closed">
	<h2>The Foundry is closed right now</h2>
	<p class="fdy-closed-lead">{sentence}</p>

	{#if notes.length > 0}
		<!-- WHAT THE INSTRUCTOR TYPED, ATTRIBUTED TO THE CLASS IT CAME FROM.
		     Optional by construction, so the panel reads correctly with none of
		     them: the sentence above already says everything a reader strictly
		     needs. -->
		<ul class="fdy-closed-notes">
			{#each notes as note (note.section_id)}
				<li>
					<span class="fdy-closed-from">{note.course_title} ({note.label})</span>
					<span class="fdy-closed-note">{note.note}</span>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="fdy-closed-next">
		Your apps and everything you have published are untouched. Ask your instructor to
		open it again and this page comes straight back.
	</p>
</section>

<style>
	.fdy-closed {
		max-width: 44rem;
		margin: 2rem auto;
		padding: 1.5rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
	}

	.fdy-closed h2 {
		margin: 0 0 0.75rem;
		font-family: var(--font-display);
		color: var(--text-1);
	}

	.fdy-closed-lead {
		margin: 0 0 1rem;
		color: var(--text-1);
		font-size: 1.05rem;
	}

	.fdy-closed-notes {
		margin: 0 0 1rem;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.6rem;
	}

	.fdy-closed-notes li {
		padding: 0.6rem 0.75rem;
		background: var(--surface-2);
		border-left: 2px solid var(--fg-heat-ember, var(--boundary));
		border-radius: var(--radius-sm, 4px);
	}

	.fdy-closed-from {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-2);
	}

	.fdy-closed-note {
		display: block;
		margin-top: 0.2rem;
		color: var(--text-1);
	}

	.fdy-closed-next {
		margin: 0;
		color: var(--text-2);
	}
</style>
