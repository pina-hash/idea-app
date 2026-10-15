<script lang="ts">
	/**
	 * A status, said three ways at once: a tone, a glyph and the word. The
	 * plate paints `.cert-readout` as a recessed tag; the tone only moves the
	 * ink, and the word beside it is what a reader who cannot tell the hues
	 * apart reads (IDEA_INTERFACE_STANDARDS 10, colour is never the only
	 * signal).
	 */
	import type { Readout } from './desk';

	let { readout, testId = null }: { readout: Readout; testId?: string | null } = $props();
</script>

<span class="cert-readout is-{readout.tone}" data-tone={readout.tone} data-testid={testId}>
	<span aria-hidden="true">{readout.glyph}</span>
	{readout.word}
</span>
