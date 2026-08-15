<script lang="ts">
	import {
		NOTEBOOK_THEME_LABELS,
		NOTEBOOK_THEME_SHORT,
		cycleNotebookTheme,
		notebookTheme
	} from '$lib/notebook/notebook-theme.svelte';

	/**
	 * The notebook's light/dark control, mounted in the masthead of both
	 * notebook screens (the student feed and the review console) so the choice
	 * is reachable wherever the theme applies.
	 *
	 * Presentation only: the preference itself lives in the store, and the
	 * PALETTE lives in the token layer -- this button knows neither.
	 *
	 * Three states rather than two, because "follow my device" is a real
	 * answer and a two-way switch loses it the moment anyone touches it.
	 */

	const theme = $derived(notebookTheme());
	const label = $derived(NOTEBOOK_THEME_LABELS[theme]);
	/**
	 * A sun in a dark masthead is ambiguous twice over -- it could mean "you
	 * are in light mode" or "press to go light" -- and a tooltip is not an
	 * answer on a phone. The word says which state you are in; the fact that
	 * it is a button says it can be changed.
	 */
	const short = $derived(NOTEBOOK_THEME_SHORT[theme]);
</script>

<button
	type="button"
	class="nb-theme"
	title="Appearance: {label}. Click to change."
	aria-label="Appearance: {label}"
	data-testid="nb-theme-toggle"
	data-theme-state={theme}
	onclick={cycleNotebookTheme}
>
	<span class="glyph" aria-hidden="true">
		{#if theme === 'light'}
			<!-- sun -->
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
				<circle cx="12" cy="12" r="4.2" />
				<path
					d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"
					stroke-linecap="round"
				/>
			</svg>
		{:else if theme === 'dark'}
			<!-- moon -->
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
				<path
					d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z"
					stroke-linejoin="round"
				/>
			</svg>
		{:else}
			<!-- half-filled circle: neither one nor the other, i.e. whatever the device says -->
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
				<circle cx="12" cy="12" r="8.2" />
				<path d="M12 3.8a8.2 8.2 0 0 1 0 16.4z" fill="currentColor" stroke="none" />
			</svg>
		{/if}
	</span>
	<span class="nb-theme-word">{short}</span>
	<span class="sr-only">{label}</span>
</button>

<style>
	/* The masthead is an ink band in BOTH palettes (the emblem and ProfileMenu
	   are drawn for dark ground), so this button is styled for that band
	   rather than for the page -- the same reasoning as the header's own
	   .btn.secondary override in notebook-theme.css. */
	.nb-theme {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 2.4rem;
		height: 2.4rem;
		padding: 0 0.5rem;
		border: 1px solid rgba(234, 230, 216, 0.32);
		border-radius: var(--nb-radius-control);
		background: transparent;
		color: var(--white);
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}
	.nb-theme:hover {
		border-color: rgba(234, 230, 216, 0.75);
	}
	.nb-theme:focus-visible {
		outline: 2px solid var(--nb-accent);
		outline-offset: 2px;
	}
	.glyph {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
	}
	.nb-theme-word {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.glyph svg {
		width: 1.15rem;
		height: 1.15rem;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/*
	 * On a phone the review console's masthead has one item more than the
	 * feed's and the pair no longer fits on one line. Where something has to
	 * give it is the GLYPH, not the word -- a sun that could equally mean "you
	 * are in light mode" or "press for light mode" is the half that was never
	 * carrying the meaning.
	 */
	@media (max-width: 30rem) {
		.glyph {
			display: none;
		}
		.nb-theme {
			padding: 0 0.45rem;
		}
	}
</style>
