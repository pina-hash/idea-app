<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A small accessible tooltip: the wrapped content plus a quiet info glyph,
	 * revealing `tip` on HOVER and on KEYBOARD FOCUS alike, and rendered
	 * statically -- always visible, no interaction required -- in print.
	 *
	 * Built for two call sites that both used to rely on a bare `title`
	 * attribute (a table column's tip, the AI badge's note): a native title
	 * shows on hover but is not reliably reachable by keyboard on a
	 * non-interactive element, and it never appears at all on a printed page,
	 * where there is no hover to trigger it. This fixes both at once, in one
	 * place, rather than once per call site.
	 *
	 * NO `{@html}`, no sanitizer to get wrong: `tip` is plain text, rendered as
	 * one text node.
	 */
	let { tip = null, children }: { tip?: string | null; children?: Snippet } = $props();

	const tipId = $props.id();
	const hasTip = $derived(!!tip?.trim());
</script>

{#if hasTip}
	<span class="info-tip">
		<!-- A real <button>, not a <span tabindex="0">: a non-interactive element
		     given a tabindex is exactly the a11y trap this exists to avoid, and a
		     button is keyboard-focusable (and reachable by touch) with no extra
		     attribute at all. It does nothing on click -- the tooltip is a
		     hover/focus affordance -- so it is reset to look like plain text. -->
		<button type="button" class="info-tip-trigger" aria-describedby={tipId}>
			{@render children?.()}
			<span class="info-tip-icon" aria-hidden="true">i</span>
		</button>
		<span class="info-tip-panel" role="tooltip" id={tipId}>{tip}</span>
	</span>
{:else}
	{@render children?.()}
{/if}

<style>
	.info-tip {
		position: relative;
		display: inline-flex;
	}
	.info-tip-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		cursor: help;
		/* Reset: this is a <button> for keyboard focus, styled to read as the
		   plain label/chip it wraps. */
		appearance: none;
		background: none;
		border: none;
		margin: 0;
		padding: 0;
		font: inherit;
		color: inherit;
		text-align: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
	}
	.info-tip-icon {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 0.82rem;
		height: 0.82rem;
		border-radius: 50%;
		border: 1px solid currentColor;
		font-family: var(--font-mono);
		font-size: 0.56rem;
		line-height: 1;
		opacity: 0.7;
	}

	/* Hidden by default and revealed on hover ANYWHERE in the wrapper (so
	   moving the cursor onto the panel itself, e.g. to select the text, keeps
	   it open) or when the trigger holds keyboard focus. */
	.info-tip-panel {
		position: absolute;
		left: 0;
		bottom: calc(100% + 0.35rem);
		z-index: 20;
		min-width: 12rem;
		max-width: 20rem;
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius-card);
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--text-1);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.8rem;
		font-weight: 400;
		text-transform: none;
		letter-spacing: normal;
		line-height: 1.4;
		white-space: normal;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition: opacity 0.12s ease;
	}
	.info-tip:hover .info-tip-panel,
	.info-tip:focus-within .info-tip-panel {
		opacity: 1;
		visibility: visible;
	}

	@media print {
		.info-tip {
			display: block;
		}
		.info-tip-icon {
			display: none;
		}
		/* No hover on paper, so the note has to just BE there -- static, in flow,
		   always visible, rather than a floating panel that only ever appears on
		   interaction. */
		.info-tip-panel {
			position: static;
			display: block;
			max-width: none;
			margin-top: 0.15rem;
			padding: 0;
			border: none;
			background: none;
			box-shadow: none;
			color: #333;
			font-size: 0.72rem;
			opacity: 1 !important;
			visibility: visible !important;
		}
	}
</style>
