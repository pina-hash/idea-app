<script lang="ts">
	import {
		NOTEBOOK_THEMES,
		NOTEBOOK_THEME_LABELS,
		NOTEBOOK_THEME_NOTES,
		NOTEBOOK_THEME_SHORT,
		notebookTheme,
		setNotebookTheme,
		type NotebookTheme
	} from '$lib/notebook/notebook-theme.svelte';

	/**
	 * The notebook's appearance control, mounted in the masthead of both
	 * notebook screens (the student feed and the review console) so the choice
	 * is reachable wherever the theme applies.
	 *
	 * Presentation only: the preference lives in the store and the PALETTES
	 * live in the token layer -- this knows neither.
	 *
	 * IT IS A MENU, WHERE IT USED TO BE A CYCLE, and the third palette is what
	 * forced that. Cycling three states was already borderline; cycling four
	 * means up to three presses to reach the one you want, and -- worse -- a
	 * theme nobody knows exists cannot be discovered by pressing a button that
	 * shows one state at a time. A list names all four at once.
	 */

	const theme = $derived(notebookTheme());
	const short = $derived(NOTEBOOK_THEME_SHORT[theme]);
	const label = $derived(NOTEBOOK_THEME_LABELS[theme]);

	let open = $state(false);
	let rootEl = $state<HTMLDivElement | null>(null);

	function pick(next: NotebookTheme) {
		setNotebookTheme(next);
		open = false;
	}

	/**
	 * Dismissal listens on POINTERDOWN, not click: the press that opens an
	 * inline control is otherwise seen by this handler as an outside click and
	 * closes the very thing it just opened (the bug ProfileMenu already hit and
	 * documented). A detached target -- a node removed by the click that
	 * produced it -- is ignored for the same reason: `contains` is false for a
	 * node no longer in the document, which would read as "outside".
	 */
	$effect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			const t = e.target as Node | null;
			if (!t || !document.contains(t)) return;
			if (rootEl && !rootEl.contains(t)) open = false;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			open = false;
			(rootEl?.querySelector('.nb-theme') as HTMLButtonElement | null)?.focus();
		};
		window.addEventListener('pointerdown', onDown);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('pointerdown', onDown);
			window.removeEventListener('keydown', onKey);
		};
	});
</script>

{#snippet glyph(which: NotebookTheme)}
	{#if which === 'light'}
		<!-- sun -->
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
			<circle cx="12" cy="12" r="4.2" />
			<path
				d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"
				stroke-linecap="round"
			/>
		</svg>
	{:else if which === 'dark'}
		<!-- moon -->
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
			<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" stroke-linejoin="round" />
		</svg>
	{:else if which === 'idea'}
		<!-- gear: the IDEA emblem's own mark, reduced to a glyph -->
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
			<circle cx="12" cy="12" r="4.6" />
			<path
				d="M18.6 12h2M3.4 12h2M12 5.4v-2M12 18.6v2M16.67 7.33l1.41-1.41M5.92 18.08l1.41-1.41M16.67 16.67l1.41 1.41M5.92 5.92l1.41 1.41"
				stroke-linecap="round"
			/>
		</svg>
	{:else}
		<!-- half-filled circle: neither one nor the other, i.e. whatever the device says -->
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
			<circle cx="12" cy="12" r="8.2" />
			<path d="M12 3.8a8.2 8.2 0 0 1 0 16.4z" fill="currentColor" stroke="none" />
		</svg>
	{/if}
{/snippet}

<div class="nb-theme-picker" bind:this={rootEl}>
	<button
		type="button"
		class="nb-theme"
		title="Appearance: {label}. Click to change."
		aria-label="Appearance: {label}"
		aria-haspopup="menu"
		aria-expanded={open}
		data-testid="nb-theme-toggle"
		data-theme-state={theme}
		onclick={() => (open = !open)}
	>
		<span class="glyph" aria-hidden="true">{@render glyph(theme)}</span>
		<span class="nb-theme-word">{short}</span>
	</button>

	{#if open}
		<div class="menu" role="menu" aria-label="Appearance">
			{#each NOTEBOOK_THEMES as option (option)}
				<button
					type="button"
					role="menuitemradio"
					aria-checked={option === theme}
					class="option"
					class:current={option === theme}
					data-testid="nb-theme-option-{option}"
					onclick={() => pick(option)}
				>
					<span class="glyph" aria-hidden="true">{@render glyph(option)}</span>
					<span class="text">
						<span class="name">{NOTEBOOK_THEME_LABELS[option]}</span>
						<span class="note">{NOTEBOOK_THEME_NOTES[option]}</span>
					</span>
					<span class="tick" aria-hidden="true">{option === theme ? '✓' : ''}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* The masthead is an ink band in ALL THREE palettes (the emblem and
	   ProfileMenu are drawn for dark ground), so the trigger is styled for that
	   band rather than for the page -- the same reasoning as the header's own
	   .btn.secondary override in notebook-theme.css. The MENU is a different
	   matter: it hangs over the page, so it takes the page's own tokens and
	   therefore recolours with the theme like everything else. */
	.nb-theme-picker {
		position: relative;
		display: inline-flex;
	}
	.nb-theme {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 2.4rem;
		height: 2.4rem;
		padding: 0 var(--space-2);
		border: 1px solid rgba(234, 230, 216, 0.32);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--white);
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}
	.nb-theme:hover,
	.nb-theme[aria-expanded='true'] {
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
	.glyph :global(svg) {
		width: 1.15rem;
		height: 1.15rem;
	}
	.nb-theme-word {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		z-index: 60;
		min-width: 15rem;
		padding: var(--space-1);
		display: grid;
		gap: var(--space-1);
		background: var(--surface-1);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-card);
		box-shadow: var(--nb-shadow);
	}
	.option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		/* 44px, the phone tap target the rest of the notebook holds to. */
		min-height: 2.75rem;
		padding: var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--text-1);
		font-family: inherit;
		font-size: 0.85rem;
		text-align: left;
		cursor: pointer;
	}
	.option:hover {
		background: var(--surface-2);
	}
	.option:focus-visible {
		outline: 2px solid var(--nb-accent-ink);
		outline-offset: -2px;
	}
	.option.current {
		border-color: var(--nb-accent);
		background: var(--nb-accent-wash);
		color: var(--nb-accent-ink);
	}
	.text {
		display: grid;
		gap: var(--space-1);
		flex: 1 1 auto;
		min-width: 0;
	}
	.name {
		font-weight: 600;
		line-height: 1.2;
	}
	.note {
		font-size: 0.72rem;
		line-height: 1.25;
		color: var(--text-3);
	}
	.option.current .note {
		color: var(--text-2);
	}
	.tick {
		flex: 0 0 auto;
		width: 0.8rem;
		font-size: 0.8rem;
		color: var(--nb-accent-ink);
	}

	/*
	 * On a phone the review console's masthead has one item more than the
	 * feed's and the trigger's pair no longer fits on one line. Where something
	 * has to give it is the GLYPH, not the word -- a sun that could equally
	 * mean "you are in light mode" or "press for light mode" is the half that
	 * was never carrying the meaning. The menu keeps its glyphs: there the word
	 * is right beside them, so they cost nothing and read as a legend.
	 */
	@media (max-width: 30rem) {
		.nb-theme .glyph {
			display: none;
		}
		.nb-theme {
			padding: 0 var(--space-2);
		}
		/*
		 * THE MENU STOPS HANGING OFF THE TRIGGER AND SPANS THE MASTHEAD
		 * INSTEAD. Anchored to the trigger it is placed by `right: 0`, which is
		 * right on a wide header where the control sits at the far edge --
		 * but at this width the header WRAPS, the trigger lands mid-row, and a
		 * menu wider than the distance to the left edge is pushed off-screen
		 * (measured: left -19.2px on the review console, unreachable, and not
		 * even scrollable-to since the overflow is on the left).
		 *
		 * Dropping the picker to `position: static` hands the menu's
		 * containing block to .app-header, which is already `position:
		 * relative` and spans the full width -- so the inset pair below is
		 * measured from the SCREEN rather than from wherever the trigger
		 * happened to wrap to, and it cannot leave the viewport whatever the
		 * masthead does with its items.
		 */
		.nb-theme-picker {
			position: static;
		}
		.menu {
			left: 0.75rem;
			right: 0.75rem;
			min-width: 0;
		}
	}
</style>
