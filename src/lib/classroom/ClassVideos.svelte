<script lang="ts">
	import Disclosure from '$lib/Disclosure.svelte';
	import { youtubeThumbnailUrl } from '$lib/youtube';
	import { heldVideosNote, videoCountLabel, type ClassVideoIndex } from '$lib/classroom/class-videos';

	/**
	 * EVERY VIDEO POSTED IN THIS CLASS, AS THUMBNAIL CARDS (ledger 0298, R08).
	 *
	 * A section on the class page, between the search row and the units, and
	 * NOT an option in the kind select beside the search. The kind select
	 * narrows ROWS by what an item IS (assignment, material, announcement), and
	 * a video is not a kind: a material, an assignment and an announcement can
	 * each carry one. Putting "Videos" in that select would be a non-kind in a
	 * kind list that also had to swap the row list for a card grid. So this is
	 * its own section, and it OBEYS the row: the caller derives the index from
	 * the items the search and filters leave showing, so "calipers" in the
	 * search box narrows the videos to the calipers video too.
	 *
	 * CLOSED BY DEFAULT, WITH THE COUNT ON THE TRIGGER, the way the posted teams
	 * board is. A grid of stills at the top of the class pane would push the
	 * class itself a screen down on a phone; one 44px row says the videos are
	 * there and how many. And because the stills are `loading="lazy"` inside a
	 * region hidden in CSS, the reader's browser asks YouTube for nothing until
	 * the section is opened.
	 *
	 * TWO LINKS PER CARD, EACH WITH ITS OWN WORDS. The still and the title watch
	 * the video on YouTube in a new tab, which is what somebody opening a list
	 * of videos came to do; "Posted in <item>" goes back to the item, where the
	 * teacher's instructions around the link are. A video posted in more than
	 * one item is one card, and the other items are listed under "Also in".
	 *
	 * The caller mounts this only when there is at least one video, so a class
	 * with none has no section at all rather than an empty one.
	 *
	 * A KEY IN THE CLASS TOOLBAR (ledger 0396, part 7: "Videos 7"). `inline`
	 * is the class page's toolbar row, where a full-width row for one closed
	 * section was the dead space Mr. Pina reported. The component is laid out in
	 * two parts there, the way the grading console's header lays out its panels
	 * (ledger 0347): the section and the `Disclosure` take no box of their own
	 * (`display: contents`), so the trigger is a key in the toolbar's own flex
	 * row and the open list drops to a full-width band under the whole row
	 * (`order` and a 100% basis), pushing the class down rather than covering
	 * it, and giving the space back when it closes. The `Disclosure` still owns
	 * the open state, `aria-expanded`/`aria-controls`, the per-class memory and
	 * the print rule; this file only places the two boxes. The count is the
	 * bare number beside the word, since "Videos 7 videos" says it twice.
	 * KNOWN LIMIT, recorded rather than worked around: open, the band comes
	 * right after its key in the tab order, so a teacher tabs through the
	 * video links before reaching Select all, which sits on the key's own line
	 * (the grading console's header has the same order). That is the
	 * disclosure pattern's own order (the content follows its trigger), and
	 * putting the band after the bar would mean moving a node the Disclosure
	 * renders.
	 */
	let {
		index,
		itemHref,
		scope = null,
		showHeld = false,
		inline = false
	}: {
		index: ClassVideoIndex;
		/** Where an item lives in this class. */
		itemHref: (itemId: string) => string;
		/** What to remember an open/closed press against (per class), or null for nothing. */
		scope?: string | null;
		/** A manager is told what drafts and scheduled posts are holding back. */
		showHeld?: boolean;
		/** A key in the class toolbar's row, its list a band under the row (see above). */
		inline?: boolean;
	} = $props();

	/** A still that failed to load keeps its card, with the play mark alone (ItemBody's rule). */
	let brokenStill = $state<Record<string, true>>({});
	const heldNote = $derived(showHeld ? heldVideosNote(index.held) : null);
</script>

<section class="cvid-root" class:cvid-inline={inline} aria-label="Videos in this class" data-testid="class-videos">
	<Disclosure label="Videos" {scope} collapseWhen={true} testId="class-videos-toggle" bodyClass="cvid-body">
		{#snippet meta()}
			<span class="cvid-count" data-testid="class-videos-count">{inline ? index.videos.length : videoCountLabel(index.videos.length)}</span>
		{/snippet}
		<ul class="cvid-grid" data-testid="class-videos-grid">
			{#each index.videos as video (video.id)}
				<li class="cvid-card" data-testid="class-video" data-video={video.id}>
					<a
						class="cvid-watch"
						href={video.href}
						target="_blank"
						rel="noopener noreferrer"
						data-testid="class-video-watch"
					>
						<span class="cvid-frame">
							{#if !brokenStill[video.id]}
								<img
									src={youtubeThumbnailUrl(video.id)}
									alt=""
									loading="lazy"
									referrerpolicy="no-referrer"
									onerror={() => (brokenStill = { ...brokenStill, [video.id]: true })}
								/>
							{/if}
							<span class="cvid-play" aria-hidden="true">
								<svg viewBox="0 0 24 24" focusable="false"><path d="M9 7.5v9l7.5-4.5z" /></svg>
							</span>
						</span>
						<span class="cvid-label">{video.label || 'Watch on YouTube'}</span>
						<span class="cvid-meta">YouTube video &middot; opens in a new tab</span>
					</a>
					<a class="cvid-from" href={itemHref(video.item.itemId)} data-testid="class-video-item">
						<span class="cvid-from-word">Posted in</span>
						<span class="cvid-from-title">{video.item.title}</span>
					</a>
					{#if video.also.length}
						<p class="cvid-also-label">Also in</p>
						<ul class="cvid-also">
							{#each video.also as other (other.itemId)}
								<li>
									<a class="cvid-from" href={itemHref(other.itemId)} data-testid="class-video-also">
										<span class="cvid-from-title">{other.title}</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
		{#if heldNote}
			<p class="cvid-held" data-testid="class-videos-held">{heldNote}</p>
		{/if}
	</Disclosure>
</section>

<style>
	.cvid-root {
		margin: 0 0 var(--space-3);
		min-width: 0;
	}
	/* THE TOOLBAR KEY AND ITS BAND (see the header). `div.disc` for specificity
	   over the component's own `.disc` rule, as the grading console does. The
	   trigger is sized as a key here and painted as one by plate.css's key list,
	   which names it (`:where(.class-toolbar) .disc-trigger`); the edge below is
	   for a deployment with the plate switched off. */
	.cvid-inline,
	.cvid-inline :global(div.disc) {
		display: contents;
	}
	.cvid-inline :global(.disc-trigger) {
		flex: none;
		width: auto;
		max-width: 100%;
		/* The toolbar spaces its lines by its keys' own margins (ClassView's
		   `--tb-line-gap`), so its line breaks add no gap. */
		margin-block: calc(var(--tb-line-gap, 0px) / 2);
		padding: 0 0.8rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 6px);
		font-size: var(--fs-label);
	}
	/* On a key face every word is the key's ink: Disclosure's caret, count and
	   Show word read `--text-2`, measured for a flat trigger on a card. */
	.cvid-inline :global(.disc-trigger :is(.disc-caret, .disc-meta, .disc-action)),
	.cvid-inline .cvid-count {
		color: inherit;
	}
	.cvid-inline :global(.disc-meta) {
		flex: none;
		overflow: visible;
	}
	.cvid-inline :global(.disc-action) {
		margin-left: 0;
	}
	/* The open list: a full-width band under the toolbar's whole row, after
	   Select all at its right edge. Closed, Disclosure's own `display: none`
	   applies and the row is one line again. */
	.cvid-inline :global(.cvid-body) {
		order: 1;
		flex: 1 0 100%;
		min-width: 0;
		margin-block: calc(var(--tb-line-gap, 0px) / 2);
	}
	.cvid-inline :global(.cvid-body[data-open='true']) {
		padding-top: 0;
	}
	.cvid-inline .cvid-grid {
		margin-top: 0;
	}
	.cvid-count {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--text-2);
	}
	/*
	 * A ROW OF COMPARABLE THINGS, SO A GRID (CLAUDE.md's multicol rule is for a
	 * stack of unequal PANELS). Every card is a 16:9 still over two or three
	 * short lines, so a row costs at most a line of air, and a gallery reads
	 * left to right. `auto-fill`, not `auto-fit`: two videos on a 1440 page
	 * keep card width rather than stretching into two half-page stills.
	 */
	.cvid-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(15rem, 100%), 1fr));
		gap: var(--space-3) var(--space-2);
		align-items: start;
		margin: var(--space-2) 0 0;
		padding: 0;
		list-style: none;
	}
	.cvid-card {
		display: flex;
		flex-direction: column;
		min-width: 0;
		margin: 0;
		padding: 0.45rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
	}
	.cvid-watch {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		color: inherit;
		text-decoration: none;
		border-radius: calc(var(--radius-card) - 2px);
	}
	.cvid-watch:hover .cvid-label {
		color: var(--body-link, var(--cyan));
	}
	.cvid-watch:focus-visible,
	.cvid-from:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.cvid-frame {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border-radius: calc(var(--radius-card) - 2px);
		/* The ground a still sits on, and what shows when it cannot load: the
		   same near-black the body's own video card uses, in every theme,
		   because it is a picture frame rather than a surface. */
		background: #0b0a08;
	}
	.cvid-frame img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.cvid-play {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
	}
	.cvid-play svg {
		width: 2.4rem;
		height: 2.4rem;
		padding: 0.4rem;
		border-radius: 999px;
		background: rgba(8, 10, 8, 0.72);
		fill: #f2f1ea;
	}
	.cvid-label {
		margin-top: 0.2rem;
		font-weight: 600;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.cvid-meta {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		letter-spacing: 0.04em;
		color: var(--text-2);
	}
	/* Back to the item. A whole line, 44px, because this is a student's page
	   and a phone reaches it (IDEA_INTERFACE_STANDARDS 10). */
	.cvid-from {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		min-width: 0;
		color: var(--body-link, var(--cyan));
		text-decoration: none;
		font-size: var(--fs-caption);
		line-height: 1.3;
	}
	.cvid-from:hover .cvid-from-title {
		text-decoration: underline;
	}
	.cvid-from-word {
		flex: none;
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.cvid-from-title {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.cvid-also-label {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.cvid-also {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.cvid-held {
		margin: var(--space-2) 0 0;
		font-size: var(--fs-caption);
		color: var(--text-2);
	}
</style>
