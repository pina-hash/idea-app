<script lang="ts">
	/**
	 * The draft / published / pending mark, everywhere one is rendered. Three
	 * signals per state -- a WORD, a GLYPH and a hue -- because colour is never
	 * the only signal, and the third state is the one the whole model exists
	 * for: `pending` means the public is still seeing the previously published
	 * version of this object.
	 *
	 * The hues are semantic tokens in their existing roles: --green is
	 * completion (published), --ice is not-yet-started (draft), --amber is the
	 * warning register (a staged edit the public cannot see yet). The WORD is
	 * painted in body ink, so what carries the meaning is measured against the
	 * ground rather than the identity hue.
	 */
	import type { MapsPublishState } from './maps';

	let { state }: { state: MapsPublishState } = $props();

	const WORDS: Record<MapsPublishState, string> = {
		draft: 'Draft',
		published: 'Published',
		pending: 'Pending edit'
	};
	const GLYPHS: Record<MapsPublishState, string> = {
		draft: '○', // ○ empty: nothing public yet
		published: '●', // ● full: what the public sees is this
		pending: '◐' // ◐ half: public sees the old half
	};
</script>

<span class="mp-chip mp-chip-{state}" data-state={state}>
	<span class="glyph" aria-hidden="true">{GLYPHS[state]}</span>{WORDS[state]}
</span>

<style>
	.mp-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--white);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		padding: 0.1rem 0.55rem;
		white-space: nowrap;
	}
	.glyph {
		font-size: 0.62rem;
	}
	.mp-chip-draft {
		border-style: dashed;
	}
	.mp-chip-draft .glyph {
		color: var(--ice);
	}
	.mp-chip-published {
		border-color: var(--green);
	}
	.mp-chip-published .glyph {
		color: var(--green);
	}
	.mp-chip-pending {
		border-color: var(--amber);
	}
	.mp-chip-pending .glyph {
		color: var(--amber);
	}
</style>
