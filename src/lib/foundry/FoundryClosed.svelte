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
	 * IT IS NOT THE GATE. Each page load is what withholds its own data and
	 * 0173's own predicates are what refuse the writes; this renders a
	 * sentence. Deleting this component would leave a student with an empty
	 * area, not with access.
	 *
	 * THE SENTENCE IS `foundryClosedSentence`'s, once. A panel that composed
	 * its own would be the second statement of the refusal, and the two would
	 * drift the first time somebody added a class to the payload.
	 *
	 * TWO VARIANTS, ONE COMPONENT, ONE SENTENCE.
	 *
	 *   panel   in place of a surface a closure reaches, which today is the
	 *           gallery and nothing else.
	 *   notice  above a surface that carries on. A student whose shelf renders
	 *           normally while the gallery tab answers a refusal is reading a
	 *           room whose behaviour they cannot predict, so the same class
	 *           name and the same note are stated where they are still
	 *           working. Building a second component for it is how the two
	 *           come to describe two different closures.
	 *
	 * WHAT A CLOSURE DOES AND DOES NOT REACH IS `FOUNDRY_CLOSURE_LIMIT`, THE
	 * STRING THE INSTRUCTOR'S OWN CONTROL PRESSES AGAINST. One sentence, read
	 * by the person who closes it and by the person it closes on, so the two
	 * cannot be told different things about one act.
	 */
	import {
		FOUNDRY_CLOSURE_LIMIT,
		foundryClosedNotes,
		foundryClosedSentence,
		type FoundryClosedSection
	} from './access.ts';

	let {
		closed = [],
		variant = 'panel'
	}: { closed?: FoundryClosedSection[]; variant?: 'panel' | 'notice' } = $props();

	const sentence = $derived(foundryClosedSentence(closed));
	const notes = $derived(foundryClosedNotes(closed));
</script>

<section
	class="fdy-closed"
	class:is-notice={variant === 'notice'}
	data-testid="foundry-closed"
	data-variant={variant}
>
	{#if variant === 'panel'}
		<h2>The app gallery is closed right now</h2>
	{:else}
		<!-- A NOTICE IS NOT A HEADING FOR THE PAGE IT SITS ABOVE. The surface
		     under it has its own, and a second h2 announcing somebody else's
		     class would read as this page's title to anybody navigating by
		     headings. -->
		<p class="fdy-closed-kicker">A class has closed the app gallery</p>
	{/if}

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
		{FOUNDRY_CLOSURE_LIMIT}
		{#if variant === 'panel'}
			Ask your instructor to open it again and this page comes straight back.
		{/if}
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

	/* THE NOTICE SITS ABOVE A WORKING PAGE, so it takes that page's own
	   measure rather than the panel's centred column, and it is quieter: the
	   heat edge on the left is the same one the note list uses, which is the
	   room's own way of saying an adult turned something off. It must not
	   read as the page's own headline, which is why the kicker is a
	   paragraph and the type does not grow. */
	.fdy-closed.is-notice {
		max-width: none;
		margin: 1rem 0 1.25rem;
		padding: 0.85rem 1rem;
		border-left: 3px solid var(--fg-heat-ember, var(--boundary));
	}

	.fdy-closed-kicker {
		margin: 0 0 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}

	.fdy-closed.is-notice .fdy-closed-lead {
		font-size: 1rem;
		margin-bottom: 0.5rem;
	}

	.fdy-closed.is-notice .fdy-closed-notes {
		margin-bottom: 0.5rem;
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
