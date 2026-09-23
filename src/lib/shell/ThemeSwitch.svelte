<script lang="ts">
	import { page } from '$app/state';
	import { lightThemeOn, toggleLightTheme } from '$lib/theme.svelte';

	/**
	 * ONE TAP WHILE PROJECTING (ledger 0297, package F1a).
	 *
	 * Mr. Pina's projector washes out dark grounds, and the only way to change
	 * the theme used to be the profile menu: open it, scroll a 1139px panel
	 * past the pathway and picture pickers, pick a row -- three actions, below
	 * the fold at 1440x900, from the front of a room. This is the same choice
	 * as that menu's Space White row, one press away in the classroom's own
	 * masthead.
	 *
	 * A TOGGLE, NOT A THIRD PICKER. It turns the light theme on, or puts back
	 * whichever dark theme it replaced (IDEA or Matrix, remembered by the
	 * store in `$lib/theme.svelte`), so the press means the same thing every
	 * time it is made. Picking among all three stays the profile menu's job;
	 * two full pickers are two controls to keep in step.
	 *
	 * THE LABEL NEVER CHANGES, THE STATE IS `aria-pressed`, and that is the
	 * toggle-button pattern rather than a style: a control whose word flipped
	 * between "Light" and "Dark" would announce the state it is NOT in half the
	 * time. The visible word is the accessible name, so a voice user can say
	 * what they see. Pressed is marked three ways and colour is never the only
	 * one: `aria-pressed`, a FILLED glyph where the resting one is an outline,
	 * and a 2px ink edge where the resting one is the boundary.
	 *
	 * RENDERED ONLY WITH A SESSION, which is `ThemeRoot`'s own gate: signed out,
	 * no theme applies (see `themeAttrFor`), so a control whose only effect
	 * would be invisible must not be offered. The classroom requires a session
	 * anyway; the harness that mounts this without one proves the absence.
	 *
	 * NO RELOAD. The press writes the store; `ThemeRoot` derives the attribute
	 * from it and writes `<html data-theme>` in the same tick.
	 */
	const signedIn = $derived(!!page.data.claims);
	const on = $derived(lightThemeOn());
</script>

{#if signedIn}
	<button
		type="button"
		class="theme-switch"
		class:on
		aria-pressed={on}
		data-testid="theme-switch"
		onclick={toggleLightTheme}
	>
		<svg class="ts-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
			<circle cx="8" cy="8" r="3.1" class="ts-disc" />
			<g class="ts-rays">
				<path d="M8 1.2v1.9M8 12.9v1.9M1.2 8h1.9M12.9 8h1.9M3.2 3.2l1.35 1.35M11.45 11.45l1.35 1.35M3.2 12.8l1.35-1.35M11.45 4.55l1.35-1.35" />
			</g>
		</svg>
		<span class="ts-word">Light</span>
	</button>
{/if}

<style>
	/* 44px at every width: the classroom masthead is student-facing
	   (IDEA_INTERFACE_STANDARDS 10). `min-height`, never a height. The word
	   sits clear of the edge by the padding, never touching it. */
	.theme-switch {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.7rem;
		background: var(--surface-1);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		line-height: 1;
		cursor: pointer;
		white-space: nowrap;
	}
	.theme-switch:hover {
		border-color: var(--green);
	}
	.theme-switch:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	/* PRESSED: a 2px ink edge (drawn as an inset so the box does not move)
	   and a filled disc. The green is the accent INK, which is what the
	   selection mark takes on every theme. */
	.theme-switch.on {
		border-color: var(--accent-ink);
		box-shadow: inset 0 0 0 1px var(--accent-ink);
	}
	.ts-glyph {
		flex: none;
		display: block;
	}
	.ts-disc {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
	}
	.theme-switch.on .ts-disc {
		fill: currentColor;
	}
	.ts-rays path {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
		stroke-linecap: round;
	}
</style>
