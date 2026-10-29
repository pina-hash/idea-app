<script lang="ts">
	/**
	 * The draft / published / pending mark, everywhere one is rendered. Three
	 * signals per state -- a WORD, a GLYPH and a hue -- because colour is never
	 * the only signal, and the third state is the one the whole model exists
	 * for: `pending` means the public is still seeing the previously published
	 * version of this object.
	 *
	 * THE ONE STATUS CHIP (ledger 0466): a draft wears the draft tone and its
	 * pencil, published is ok, and pending is warn with the half-full ring (a
	 * staged edit the public cannot see yet).
	 */
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import type { StatusGlyph, StatusTone } from '$lib/ui/status-tone';
	import type { MapsPublishState } from './maps';

	let { state }: { state: MapsPublishState } = $props();

	const WORDS: Record<MapsPublishState, string> = {
		draft: 'Draft',
		published: 'Published',
		pending: 'Pending edit'
	};
	const TONES: Record<MapsPublishState, { tone: StatusTone; glyph: StatusGlyph }> = {
		draft: { tone: 'draft', glyph: 'draft' },
		published: { tone: 'ok', glyph: 'check' },
		pending: { tone: 'warn', glyph: 'progress' }
	};
</script>

<StatusChip {...TONES[state]} label={WORDS[state]} data-state={state} />
