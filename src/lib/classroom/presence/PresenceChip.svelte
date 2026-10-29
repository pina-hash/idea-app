<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import { PRESENCE_DISPLAY, type PresenceState } from './state';

	/**
	 * ONE STATE, AS A WORD AND A GLYPH AND A HUE -- never a hue alone, and never
	 * a glyph alone. The word is always rendered and the glyph is
	 * `aria-hidden`: a reader who cannot see the mark has already been told.
	 *
	 * A `<span>`, NOT A CONTROL. There is nothing to press: presence is
	 * information, not an action. So the 44px floor does not arise here, no
	 * density class is declared and none may be -- the row this sits inside is a
	 * button that already carries `min-height: 44px`, and adding a target here
	 * would put a second one inside it.
	 *
	 * THE ONE STATUS CHIP (ledger 0466). The tone and its mark come from
	 * `PRESENCE_DISPLAY`, read through the one tone map: working ok, viewing
	 * info, open elsewhere warn, away neutral, never danger. Every pair is the
	 * status tokens' solid and its word, measured by `tests/color-tokens.test.ts`
	 * in every theme, so this chip no longer carries a measured ink of its own.
	 *
	 * EXHAUSTIVE OVER THE UNION, through `PRESENCE_DISPLAY`. A fifth state with
	 * no entry is a type error rather than a blank chip. `compact` is kept for
	 * its callers and draws the same chip.
	 */
	let { state, compact = false }: { state: PresenceState; compact?: boolean } = $props();

	const display = $derived(PRESENCE_DISPLAY[state]);
</script>

<StatusChip
	tone={display.tone}
	glyph={display.mark}
	label={display.label}
	class={compact ? 'pchip compact' : 'pchip'}
	data-testid="presence-chip"
	data-presence-state={state}
	title={display.hint}
/>
