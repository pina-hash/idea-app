<script lang="ts">
	/**
	 * A HOUSE RELEASE: one of IDEA's own games, as a card in the gallery's
	 * Major releases section (report 927b1c69, which named IDEA GREENLINE and
	 * IDEA VANGUARD as what the section is for).
	 *
	 * IT IS A LINK TO THE GAME'S OWN PAGE AND NOTHING ELSE. These are not
	 * Foundry apps: there is no app row, no version, no stage and no play
	 * count, so the card opens no detail pane and carries no figure. It leaves
	 * the Foundry for `/greenline` or `/vanguard/`, exactly as the home
	 * launcher's card does.
	 *
	 * WHAT IT READS IS `PORTAL_APPS`' OWN ENTRY (`foundryHouseReleases`), so the
	 * title and the address are never retyped here. What it PAINTS is its own:
	 * a pinned dark ground and pinned light ink, because a card in this mosaic
	 * is a dark island in every theme, like a generated cover. It does not borrow
	 * the launcher's per-app accent pairs: `PORTAL_APPS` carries an app's
	 * identity and never its paint.
	 *
	 * THE CARD IS THE GENERATED-COVER SHAPE, 3:2, so it sits in the section's
	 * multicol mosaic beside student covers without a rule of its own.
	 */
	import type { Component } from 'svelte';
	import GreenlineMark from '$lib/marks/GreenlineMark.svelte';
	import VanguardMark from '$lib/marks/VanguardMark.svelte';

	import {
		FOUNDRY_HOUSE_KICKER,
		type FoundryHouseRelease,
		type FoundryHouseReleaseId
	} from './major.ts';

	/**
	 * ONE MARK PER HOUSE ID, AND A `Record` OVER THE ID UNION SAYS SO. A third
	 * id added to `FOUNDRY_HOUSE_RELEASE_IDS` without a mark here is a type
	 * error, where an if/else would have quietly drawn VANGUARD's mark on it.
	 */
	const HOUSE_MARKS: Record<FoundryHouseReleaseId, Component<{ once?: boolean }>> = {
		greenline: GreenlineMark,
		vanguard: VanguardMark
	};

	let { release }: { release: FoundryHouseRelease } = $props();
	const Mark = $derived(HOUSE_MARKS[release.id]);
</script>

<!--
	THE ACCESSIBLE NAME IS ON THE LINK, as on every gallery card: the title and
	what the card is, so a reader who never sees the plate still hears that it
	is one of IDEA's own games and not a student's.
-->
<a
	class="fdy-house"
	href={release.href}
	data-testid="fdy-house-card"
	data-portal-app={release.id}
	aria-label="{release.title}, an IDEA original game"
>
	<span class="fdy-house-art" aria-hidden="true">
		<span class="fdy-house-mark">
			<!-- `once`: the launcher's own standard. One pass, then the rest frame
			     held, and nothing hidden at rest, all inside the mark's own
			     reduced-motion gate. -->
			<Mark once />
		</span>
		<span class="fdy-house-title">{release.title}</span>
	</span>
	<span class="fdy-house-plate" data-testid="fdy-house-kicker">{FOUNDRY_HOUSE_KICKER}</span>
</a>

<style>
	.fdy-house {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 1.5;
		overflow: hidden;
		border-radius: var(--radius-sm, 6px);
		text-decoration: none;
		/*
		   PINNED, because the card is a dark island in every theme: the
		   generated cover's own ink on the generated cover's own lightness.
		   That gradient is fixed in lightness and only its hue moves, and its
		   ink was measured on it, so one measurement stands for both cards.
		   The two hues are well outside the heat band (15 to 50 degrees).
		*/
		--fdy-house-ink: #ece8e0;
		--fdy-house-hue: 210;
		color: var(--fdy-house-ink);
		background-image: linear-gradient(
			150deg,
			hsl(var(--fdy-house-hue) 34% 27%),
			hsl(calc(var(--fdy-house-hue) + 18) 40% 15%)
		);
		/*
		   VANGUARD's mark draws its thrust in `--gold`, which in this room is
		   inside the heat band. On this card the mark is one ink, so the token
		   is pointed at it here and nowhere else.
		*/
		--gold: var(--fdy-house-ink);
		container-type: inline-size;
	}

	.fdy-house[data-portal-app='greenline'] {
		--fdy-house-hue: 150;
	}

	.fdy-house[data-portal-app='vanguard'] {
		--fdy-house-hue: 230;
	}

	/* The room's link rules would otherwise tint and underline a card. The
	   ring is the KEYBOARD's: drawn on hover too, a mouse pass looked like
	   focus and a tap could leave it standing. */
	.fdy-house:hover,
	.fdy-house:focus-visible {
		color: var(--fdy-house-ink);
		text-decoration: none;
	}

	.fdy-house:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	.fdy-house-art {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2, 0.5rem);
		width: 100%;
		height: 100%;
		padding: var(--space-4, 1rem) var(--space-4, 1rem) 2.2rem;
	}

	.fdy-house-mark {
		display: block;
		width: clamp(2.5rem, 22cqw, 4.5rem);
		height: clamp(2.5rem, 22cqw, 4.5rem);
		color: var(--fdy-house-ink);
	}

	.fdy-house-title {
		font-family: var(--font-display);
		font-size: clamp(1.05rem, 8cqw, 1.7rem);
		line-height: 1.15;
		text-align: center;
		color: var(--fdy-house-ink);
		overflow-wrap: anywhere;
	}

	/* Always on screen, at every width: unlike a student card's name plate
	   this is the only thing saying the card is not a student's game. */
	.fdy-house-plate {
		position: absolute;
		inset: auto 0 0 0;
		padding: 1.1rem var(--space-3, 0.75rem) var(--space-2, 0.5rem);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fdy-house-ink);
		background-image: linear-gradient(
			to top,
			rgba(6, 5, 4, 0.94) 0%,
			rgba(6, 5, 4, 0.82) 45%,
			rgba(6, 5, 4, 0) 100%
		);
	}
</style>
