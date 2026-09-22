<script lang="ts">
	/**
	 * A PUBLISHER'S PAGE: who they are, and everything of theirs this viewer can
	 * see.
	 *
	 * REPORT 31: "Publishers should have profiles that you can visit and see all
	 * their published games and their profile should be comprehensive with their
	 * IDEA profile, their profile picture and everything."
	 *
	 * IT TAKES STATE AS PROPS AND FETCHES NOTHING, like every other Foundry
	 * surface. The route owns both reads; this owns the arrangement.
	 *
	 * IT IS NOT A SECOND GALLERY. The cards are `FoundryCard`, the same
	 * component the gallery and the boards mount, and the list arrives from
	 * `foundry_list_apps(p_owner := ...)` -- the same function the gallery calls
	 * with no owner. A second listing would be a second population rule to keep
	 * in step with the first.
	 *
	 * WHAT IT DELIBERATELY DOES NOT CARRY: no message control, no follow, no
	 * rating and no comment. None of those exists anywhere in this feature, none
	 * has a column, and each is a separate decision about students talking to
	 * students in public. This page is a shelf with a name on it.
	 *
	 * AND IT SHOWS NO PLAY FIGURES OF ITS OWN. A per-author total would be a
	 * number about a PERSON rather than about an app, and decision 35 is
	 * explicit: ranked by app, never by student. The cards carry their own
	 * per-app counts exactly as they do on the gallery, which is a fact about
	 * each app and nothing more; a sum across them with somebody's face above it
	 * is the student ranking that decision refuses. `FoundryOwnerStats` is the
	 * roll-up and it stays where it is, on `/foundry/mine`, where the only
	 * person reading it is its subject.
	 */
	import Avatar from '$lib/Avatar.svelte';
	import PathwayChip from '$lib/PathwayChip.svelte';
	import FoundryCard from './FoundryCard.svelte';
	import { foundryAuthorClass, foundryAuthorName } from './surface.ts';
	import { playCountLabel, type FoundryPlayCounts } from './telemetry.ts';
	import type { FoundryAppSummary, FoundryAuthorCard } from './transports.ts';

	let {
		card,
		apps,
		playCounts = {},
		coverUrl = (path: string) => path
	}: {
		card: FoundryAuthorCard;
		apps: FoundryAppSummary[];
		playCounts?: FoundryPlayCounts;
		coverUrl?: (path: string) => string | null;
	} = $props();

	/**
	 * THE TWO-RUNG LADDER, NEVER `displayName()` FROM `$lib/profile`, whose
	 * third rung is the EMAIL ADDRESS. There is no address in this payload to
	 * fall through to, so the wrong import would render an empty heading rather
	 * than leaking one -- but the rule is about which function is reached for on
	 * a Foundry surface, and `tests/foundry-author-name.test.ts` sweeps for it.
	 */
	const name = $derived(foundryAuthorName(card));
	const cls = $derived(foundryAuthorClass(card));

	/**
	 * THE PICTURE, THROUGH THE ONE COMPONENT, with `email` deliberately NULL.
	 *
	 * `AvatarSubject` accepts an address because a roster row is keyed on one
	 * and uses it for the initials tile and the tint. This payload has no
	 * address by design, so the initials come from the name and the TINT KEY is
	 * the owner uuid -- stable per person, which is all a tint needs, and opaque,
	 * which an address is not.
	 */
	const subject = $derived({
		avatar: card.avatar,
		avatar_url: card.avatar_url,
		display_name: card.owner_display_name,
		full_name: card.owner_full_name,
		email: null
	});

	/**
	 * "Publishing since March 2026". MONTH AND YEAR AND NOT A DATE, because the
	 * precise day somebody first published is a fact about a person's term that
	 * nothing on this page needs, and a bare month reads as a tenure rather than
	 * as a timestamp. An unparseable or missing value renders nothing at all
	 * rather than "Invalid Date", which is the one output here that would look
	 * like a bug in the page rather than a fact about the author.
	 */
	const since = $derived.by(() => {
		if (!card.first_published_at) return '';
		const d = new Date(card.first_published_at);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
	});

	const countLine = $derived(
		Number(card.app_count) === 1 ? '1 published app' : `${Number(card.app_count)} published apps`
	);
</script>

<div class="fdy-author-page">
	<header class="fdy-author-head">
		<!--
			`tintKey` IS THE OWNER UUID. See the subject above: a tint only has to
			be stable per person, and this is the one field on this payload that
			is guaranteed present and is not somebody's name.
		-->
		<div class="fdy-author-face">
			<Avatar {subject} tintKey={card.owner} size={88} />
		</div>
		<div class="fdy-author-who">
			<!--
				A NULL NAME RENDERS THE WORD "Publisher" AND NOT AN EMPTY HEADING.
				A page has to have a title, and this is the one place in the
				feature where "render nothing" is not available: a nameless h1 is
				a hole at the top of the document and is what a screen reader
				announces the page as. Everywhere a name sits BESIDE something
				else -- a card, a detail line -- it still renders as nothing.
			-->
			<h1 data-testid="foundry-author-name">{name ?? 'Publisher'}</h1>
			<div class="fdy-author-meta">
				<!--
					Identity, never an access gate, and never colour alone: the chip
					carries its own icon and label. No route or payload on this page
					branches on it.
				-->
				{#if card.pathway}<PathwayChip pathway={card.pathway} size="sm" />{/if}
				{#if cls}<span class="fdy-author-class">{cls}</span>{/if}
			</div>
			<p class="fdy-author-count">
				{countLine}{#if since}, publishing since {since}{/if}
			</p>
		</div>
	</header>

	<!--
		THE SHELF. `foundryMosaicColumns` is the gallery's arithmetic and is not
		reused here on purpose: that function caps a MULTICOL container, and this
		is an ordinary auto-fit grid of at most a handful of cards. A grid row is
		as tall as its tallest member, which is the defect CLAUDE.md's multicol
		rule exists to avoid -- and it does not apply here, because these are
		cards of one shape rather than panels of unequal height.
	-->
	<ul class="fdy-author-apps" data-testid="foundry-author-apps">
		{#each apps as app (app.id)}
			<!--
				NO `onselect`. The card is an ordinary link to the gallery with the
				app selected, so following one lands on the page that can actually
				RUN it -- this page has no stage and mounts no frame. A handler
				here would intercept the navigation and leave the reader on a page
				with no way to open what they just clicked.
			-->
			{@const plays = playCountLabel(playCounts[app.id]?.plays ?? 0)}
			<li>
				<FoundryCard
					{app}
					href="/foundry?app={app.slug}"
					{coverUrl}
					plays={plays ?? ''}
				/>
			</li>
		{/each}
	</ul>
</div>

<style>
	.fdy-author-page {
		display: flex;
		flex-direction: column;
		gap: var(--space-5, 1.25rem);
		min-width: 0;
	}

	/* WRAPS RATHER THAN BREAKING. At 375 the face and the name stack; above it
	   they sit on one row. No breakpoint of its own, which is the rule the sort
	   control already follows one component over. */
	.fdy-author-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4, 1rem);
		min-width: 0;
	}

	.fdy-author-face {
		flex: 0 0 auto;
	}

	.fdy-author-who {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		/* `min-width: 0` so a long name shrinks rather than forcing the whole
		   page wider than the viewport. An item's automatic minimum is its
		   min-content, which an ellipsis does not reduce. */
		min-width: 0;
	}

	.fdy-author-who h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.6rem;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.fdy-author-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
	}

	.fdy-author-class {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--cyan);
	}

	.fdy-author-count {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}

	.fdy-author-apps {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
		gap: var(--space-3, 0.75rem);
		margin: 0;
		padding: 0;
		list-style: none;
		min-width: 0;
	}

	.fdy-author-apps > li {
		min-width: 0;
	}
</style>
