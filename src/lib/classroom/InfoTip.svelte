<script lang="ts">
	import type { Snippet } from 'svelte';
	import { anchored } from '$lib/shell/anchored';

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
	 * IT ESCAPES ITS SCROLL CONTAINER, which it did not used to. The panel was
	 * `position: absolute` inside a `position: relative` wrapper, so it was
	 * clipped by the nearest ancestor that clips -- and on the grading console
	 * there are TWO stacked in one chain (the response table's `.table-scroll`,
	 * whose `overflow-x: auto` forces `overflow-y` to `auto`, and the work
	 * column's own `overflow-y: auto`). The panel opens above a `<th>` sitting
	 * on the top edge of the inner one, so it was clipped to nothing. It is
	 * positioned against the VIEWPORT now, by `$lib/shell/anchored`, which flips
	 * it in both axes near an edge.
	 *
	 * The panel element STAYS IN THIS COMPONENT'S MARKUP (the action writes two
	 * coordinates rather than portalling the node), which is what keeps the
	 * print rules below working on it.
	 *
	 * NO `{@html}`, no sanitizer to get wrong: `tip` is plain text, rendered as
	 * one text node.
	 */
	let { tip = null, children }: { tip?: string | null; children?: Snippet } = $props();

	const tipId = $props.id();
	const hasTip = $derived(!!tip?.trim());

	let triggerEl = $state<HTMLButtonElement | null>(null);
	let hovered = $state(false);
	let focused = $state(false);
	/**
	 * ESCAPE CLOSED IT WHILE THE TRIGGER STILL HOLDS FOCUS. Without this the
	 * panel is glued open for as long as focus stays put, and Escape does
	 * nothing -- which on a surface with keyboard shortcuts is the one key
	 * somebody will press to get rid of it.
	 */
	let dismissed = $state(false);
	const shown = $derived((hovered || focused) && !dismissed);

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !shown) return;
		// Stopped here so the surface's own Escape (back to the roster) does not
		// also fire: the visible panel is what the press was aimed at.
		event.stopPropagation();
		dismissed = true;
		// Focus RETURNED, which for this control means kept: the trigger is where
		// the person already was, and moving them anywhere else would be worse.
		triggerEl?.focus();
	}
</script>

{#if hasTip}
	<span class="info-tip">
		<!-- A real <button>, not a <span tabindex="0">: a non-interactive element
		     given a tabindex is exactly the a11y trap this exists to avoid, and a
		     button is keyboard-focusable (and reachable by touch) with no extra
		     attribute at all. It does nothing on click -- the tooltip is a
		     hover/focus affordance -- so it is reset to look like plain text. -->
		<button
			type="button"
			class="info-tip-trigger"
			aria-describedby={tipId}
			bind:this={triggerEl}
			onpointerenter={() => (hovered = true)}
			onpointerleave={() => {
				hovered = false;
				dismissed = false;
			}}
			onfocus={() => {
				focused = true;
				dismissed = false;
			}}
			onblur={() => {
				focused = false;
				dismissed = false;
			}}
			onkeydown={onKeydown}
		>
			{@render children?.()}
			<span class="info-tip-icon" aria-hidden="true">i</span>
		</button>
		<span
			class="info-tip-panel"
			class:shown
			role="tooltip"
			id={tipId}
			use:anchored={{ anchor: triggerEl, open: shown, prefer: 'above' }}>{tip}</span
		>
	</span>
{:else}
	{@render children?.()}
{/if}

<style>
	.info-tip {
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

	/* Hidden by default and revealed while the trigger is hovered or holds
	   keyboard focus. `position: fixed` is what escapes a scrolling ancestor's
	   clip; $lib/shell/anchored supplies the two coordinates and flips the panel
	   near a viewport edge. */
	.info-tip-panel {
		position: fixed;
		left: 0;
		top: 0;
		z-index: 60;
		min-width: 12rem;
		max-width: 20rem;
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius-card);
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--text-1);
		font-family: var(--font-display);
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
	}
	@media (prefers-reduced-motion: no-preference) {
		.info-tip-panel {
			transition: opacity 0.12s ease;
		}
	}
	.info-tip-panel.shown {
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
		   interaction. `!important` on the three positioning properties because
		   the anchor action writes them INLINE, and an inline declaration beats
		   a stylesheet one. */
		.info-tip-panel {
			position: static !important;
			left: auto !important;
			top: auto !important;
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
