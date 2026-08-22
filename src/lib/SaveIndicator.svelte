<script lang="ts">
	import { SaveState, saveStateLabel } from '$lib/save-state.svelte';

	/**
	 * THE HONEST SAVE STATE, rendered the same way everywhere.
	 *
	 * One component so four surfaces cannot drift into four vocabularies and
	 * four colour schemes for the same five states. The words come from
	 * `saveStateLabel`, which is the single spelling of them; this file owns
	 * only how they look and where the Retry control sits.
	 *
	 * DELIBERATELY NOT A SHELL BANNER. It is mounted BY the surface that owns
	 * the work, inside that surface, so it can only ever speak for that
	 * surface's own SaveState. A single global indicator reading "all changes
	 * saved" while a sibling holds a failed write is a false negative with a
	 * much wider blast radius than the defect it would be papering over.
	 *
	 * Colour is never the only signal: every state carries its words, and the
	 * failed state additionally carries a marker glyph.
	 */
	let {
		state,
		/** An explicit save control, when the surface offers one. */
		onsave = null,
		/** Label for that control. */
		saveLabel = 'Save now',
		/** Hides the whole thing while clean, for a surface with no room to spare. */
		hideClean = true
	}: {
		state: SaveState;
		onsave?: (() => void) | null;
		saveLabel?: string;
		hideClean?: boolean;
	} = $props();

	const label = $derived(
		saveStateLabel({
			phase: state.phase,
			savedAt: state.savedAt,
			message: state.message,
			attempt: state.attempt,
			maxAttempts: state.maxAttempts
		})
	);
	const show = $derived(!(hideClean && label.kind === 'clean'));
</script>

{#if show}
	<span class="save-ind {label.kind}">
		<span class="save-ind-text" aria-live="polite">
			{#if label.kind === 'failed'}<span class="save-ind-mark" aria-hidden="true">!</span>{/if}
			{label.text}
		</span>
		{#if state.failed}
			<button type="button" class="save-ind-btn retry" onclick={() => void state.retry()}>
				Retry
			</button>
		{/if}
		{#if onsave}
			<button
				type="button"
				class="save-ind-btn"
				disabled={state.phase === 'writing'}
				onclick={onsave}
			>
				{saveLabel}
			</button>
		{/if}
	</span>
{/if}

<style>
	.save-ind {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.04em;
	}

	.save-ind-text {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}

	.save-ind-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.05rem;
		height: 1.05rem;
		border: 1px solid currentColor;
		border-radius: 50%;
		font-weight: 700;
		font-size: 0.66rem;
		line-height: 1;
	}

	/* FOUR ROOM HOOKS, read at the point of use with the portal's own tokens as
	   the fallback -- the mechanism Disclosure uses for `--disc-accent`.

	   The four defaults are the raw semantic tokens, which are tuned for the
	   app shell's dark plate. 0123 mounted this indicator inside `.nb-root` for
	   the first time, and measured on that room's LIGHT plate the FAILED message
	   -- the one a person most needs to be able to read -- came to 3.65:1. The
	   notebook already carries corrected values for exactly this reason
	   (`--nb-warn` / `--nb-ok` / `--nb-error` exist because the raw tokens are
	   the uncorrected ones), so the room points these at them and every other
	   surface renders byte-identically to what it rendered before. */
	.save-ind.clean .save-ind-text,
	.save-ind.dirty .save-ind-text {
		color: var(--save-warn, var(--amber));
	}
	.save-ind.writing .save-ind-text {
		color: var(--save-info, var(--cyan));
	}
	.save-ind.saved .save-ind-text {
		color: var(--save-ok, var(--green));
	}
	.save-ind.failed .save-ind-text {
		color: var(--save-error, var(--crimson));
	}

	.save-ind-btn {
		/* 44px, the tap-target floor. This sits in a status row, not inside any
		   locked density contract, so there is nothing here to trade against. */
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.7rem;
		background: transparent;
		border: 1px solid var(--hairline, rgba(255, 255, 255, 0.18));
		border-radius: var(--radius-sm, 4px);
		color: inherit;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.05em;
		cursor: pointer;
	}
	.save-ind-btn:hover:not(:disabled) {
		border-color: var(--green);
		color: var(--green);
	}
	.save-ind-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.save-ind-btn.retry {
		border-color: var(--save-error, var(--crimson));
		color: var(--save-error, var(--crimson));
	}
	.save-ind-btn.retry:hover {
		background: color-mix(in srgb, var(--save-error, var(--crimson)) 14%, transparent);
		border-color: var(--save-error, var(--crimson));
		color: var(--save-error, var(--crimson));
	}
</style>
