<script lang="ts">
	/**
	 * THE ONE MARK FOR A MAJOR RELEASE: a star and the word, every time.
	 *
	 * Colour is never the only signal, so the glyph never stands alone: it is
	 * `aria-hidden` precisely because the word is always beside it.
	 *
	 * VIOLET, NEVER GOLD OR AMBER. The register gives `--violet` "special,
	 * sparingly", which is what a curated release is. `--gold` (#c8a848, hue
	 * about 45deg) sits inside `FOUNDRY_HEAT_HUE_BAND`, and in this room heat
	 * means IN PROGRESS and nothing else may wear it. A major release is not a
	 * lifecycle state either, so it is not a `ForgeStatus` tone.
	 *
	 * TWO TONES, AND THE CALLER SAYS WHICH:
	 *
	 *   cover  on a card's picture, which is a DARK ISLAND in every theme, so
	 *          every colour is PINNED (the card's own cover inks) on a pinned,
	 *          nearly opaque chip. A theme token here would be near-black ink
	 *          under Space White on a dark picture.
	 *   room   in a page (the detail pane, the inspector, the owner's list): the
	 *          word takes the room's `--text-1` and the star its `--violet-ink`,
	 *          which every theme re-declares for its own ground.
	 *
	 * NO SHADOW AND NO MOTION. A static mark is a recessed tag
	 * (`IDEA_INTERFACE_STANDARDS` 14), and nothing here animates.
	 */
	import { FOUNDRY_MAJOR_WORD } from './major.ts';

	let { tone = 'room' }: { tone?: 'cover' | 'room' } = $props();
</script>

<span class="fdy-major" class:cover={tone === 'cover'} data-fdy-major-mark={tone}>
	<svg class="fdy-major-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
		<path
			d="M8 1.2l2.06 4.18 4.6.67-3.33 3.25.79 4.58L8 11.72l-4.12 2.16.79-4.58L1.34 6.05l4.6-.67z"
		/>
	</svg>
	<span class="fdy-major-word">{FOUNDRY_MAJOR_WORD}</span>
</span>

<style>
	.fdy-major {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.2;
		color: var(--text-1, var(--white));
	}

	.fdy-major-glyph {
		flex: 0 0 auto;
		width: 0.95em;
		height: 0.95em;
		fill: var(--violet-ink, #a08ac7);
	}

	/*
	   THE COVER TONE. The chip is 0.9 opaque iron, the scrim's own colour, so
	   the words on it hold against a white picture as well as a black one:
	   composited over pure white the ground is about rgb(31, 30, 29), where
	   the word measures about 13:1 and the star about 5.6:1.
	*/
	.fdy-major.cover {
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		background: rgba(6, 5, 4, 0.9);
		color: #ece8e0;
		font-size: 0.72rem;
	}

	.fdy-major.cover .fdy-major-glyph {
		fill: #a08ac7;
	}

	.fdy-major-word {
		white-space: nowrap;
	}
</style>
