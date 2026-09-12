<script lang="ts">
	import { PRESENCE_DISPLAY, type PresenceState } from './state';

	/**
	 * ONE STATE, AS A WORD AND A GLYPH AND A HUE -- never a hue alone, and never
	 * a glyph alone. The word is always rendered, which is why the glyph is
	 * `aria-hidden`: a reader who cannot see the mark has already been told.
	 *
	 * A `<span>`, NOT A CONTROL. There is nothing to press: presence is
	 * information, not an action. So the 44px floor does not arise here, no
	 * density class is declared and none may be -- the row this sits inside is a
	 * button that already carries `min-height: 44px`, and adding a target here
	 * would put a second one inside it.
	 *
	 * EXHAUSTIVE OVER THE UNION, through `PRESENCE_DISPLAY`. A fifth state with
	 * no entry is a type error rather than a blank chip.
	 */
	let { state, compact = false }: { state: PresenceState; compact?: boolean } = $props();

	const display = $derived(PRESENCE_DISPLAY[state]);
</script>

<span
	class="pchip tone-{display.tone}"
	class:compact
	data-testid="presence-chip"
	data-presence-state={state}
	title={display.hint}
>
	<span class="pglyph" aria-hidden="true">{display.glyph}</span>
	<span class="pword">{display.label}</span>
</span>

<style>
	.pchip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-chip, 4px);
		white-space: nowrap;
		/* The fill is PINNED, never mixed from the ink beside it: a fill derived
		   from the ink moves whenever the ink does and hands most of the contrast
		   straight back. Same call the notebook's cell tokens make. */
		background: var(--bg2);
	}
	.pchip.compact {
		font-size: 0.68rem;
		padding: 0.05rem 0.3rem;
	}
	.pglyph {
		font-size: 0.8em;
		line-height: 1;
	}
	/* FOUR HUES, EACH READ THROUGH THE ROOM'S OWN REGISTER and never a raw
	   colour. `--green` is the semantic "active" of this register and is what
	   WORKING means here; `--teal` is its "in progress" neighbour and carries
	   VIEWING, which is present-but-not-typing; `--amber` is the warning tier and
	   carries OPEN ELSEWHERE, which is the one an instructor may want to act on;
	   AWAY is `--text-2`, the secondary-copy tier, because "not here" is the
	   resting state of most of a roster most of the time and painting it in a
	   status colour would make a quiet class look like an emergency.

	   `--crimson` IS NOT A CANDIDATE FOR ANY OF THEM. It is reserved for
	   live / rec / error, and a student not being at their desk is none of those
	   -- it is the ordinary condition of a class that has not started yet.

	   MEASURED ON THE CHIP'S OWN FILL (`--bg2`, rgb(34, 46, 34)) IN A REAL
	   BROWSER, not against the page plate the register was tuned on:

	       WORKING         6.00:1   --green
	       VIEWING         4.48:1   --teal          <- FAILED
	       OPEN ELSEWHERE  4.60:1   --amber
	       AWAY            5.51:1   --text-2

	   `--bg2` IS THE LIGHTEST OF THE THREE PORTAL GROUNDS, which is exactly the
	   case the register's accents are NOT tuned for -- the same arithmetic that
	   makes `--dim` clear only `--bg0`. So one of the four genuinely failed, and
	   the fix is the `--acc-ink` rule rather than a token move: the IDENTITY is
	   never moved to pass a contrast check, the DERIVED INK moves, and it moves
	   in LIGHTNESS ONLY -- desaturating is how a hue quietly stops being itself.

	   `--pchip-viewing-ink` is `--teal`'s own hue (145deg) and saturation (44.9%)
	   at 52% lightness instead of 44.1%, which measures 5.94:1 on that fill. It
	   is declared HERE, at the one call site that failed, and `--teal` itself does
	   not move: five other surfaces read that token on darker grounds where it
	   already clears, and raising it would repaint all of them to fix one.

	   AMBER'S 4.60 IS A PASS AND IT IS A THIN ONE. It is left alone because it
	   passes and because correcting a passing value is churn -- but anything that
	   lightens this fill moves it under, so a change to `--bg2` or to the chip's
	   background is a change that re-measures this table. */
	.pchip {
		--pchip-viewing-ink: #4ebc7b;
	}
	.tone-working {
		color: var(--green);
		border-color: var(--green);
	}
	.tone-viewing {
		color: var(--pchip-viewing-ink);
		border-color: var(--pchip-viewing-ink);
	}
	.tone-elsewhere {
		color: var(--amber);
		border-color: var(--amber);
	}
	.tone-away {
		color: var(--text-2);
		border-color: var(--boundary);
	}
</style>
