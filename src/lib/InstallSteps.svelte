<script lang="ts">
	/**
	 * THE TWO TAPS, AS ONE SENTENCE WITH THE SHARE ICON DRAWN IN IT (ledger 0396).
	 *
	 * The words are `INSTALL_COPY` in `$lib/install-app`, which is the phone
	 * pop-up's original iOS sentence split where the picture goes, so the pop-up
	 * and the header key's card read the same text and neither keeps a copy.
	 * The glyph is decoration beside the words "Share icon", hidden from
	 * assistive tech, so the sentence a screen reader hears is exactly
	 * `installSentence(steps)`: no word is carried only by the picture.
	 *
	 * The icon is Safari's Share mark (a tray with an arrow leaving it), drawn
	 * here rather than fetched, in the ink of the sentence around it.
	 */
	import type { InstallSteps } from '$lib/install-app';

	let { steps }: { steps: InstallSteps } = $props();
</script>

<span class="is-sentence"
	>{steps.lead}<span class="is-share" aria-hidden="true"
		><svg viewBox="0 0 24 24" focusable="false"
			><path d="M12 3.5v11" /><path d="M8 7.5l4-4 4 4" /><path
				d="M9 10.5H7a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-2"
			/></svg
		></span
	>, then <strong class="is-action">"{steps.action}"</strong> {steps.tail}</span
>

<style>
	.is-share {
		display: inline-block;
		width: 1.25em;
		height: 1.25em;
		margin: 0 0.05em 0 0.3em;
		vertical-align: -0.28em;
	}
	.is-share svg {
		display: block;
		width: 100%;
		height: 100%;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.is-action {
		font-weight: 700;
		white-space: nowrap;
	}
</style>
