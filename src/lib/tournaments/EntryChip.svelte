<script lang="ts">
	import BadgeIcon from './BadgeIcon.svelte';
	import type { TournamentEntry } from './tournaments';
	import { accentAlpha, accentOf, backgroundCss, type EntryStyle } from './entry-styles';

	/**
	 * The one place a tournament participant renders compactly: display_name +
	 * thumbnail_url only (the identity rule; never an account name or avatar).
	 * A null entry is an undecided "TBD" slot.
	 *
	 * Phase 2b: an optional `style` applies that entry's own customization --
	 * accent rule, accent thumbnail ring, badge, and a LOW-OPACITY wash of its
	 * background. The wash is deliberately faint here: a chip appears inside
	 * dense bracket nodes and host rows, where the name has to stay the most
	 * legible thing on the row. The full-strength background, the tagline and
	 * the theatrical flourishes belong to EntryBanner. With no style (the
	 * default for every entry until its owner customizes it) this renders
	 * exactly as it did in Phase 1.
	 */
	let {
		entry = null,
		style = null,
		seed = null,
		winner = false,
		dim = false
	}: {
		entry?: TournamentEntry | null;
		style?: EntryStyle | null;
		seed?: number | null;
		winner?: boolean;
		dim?: boolean;
	} = $props();

	const initial = $derived(entry ? entry.display_name.trim().charAt(0).toUpperCase() : '');
	const accent = $derived(style?.accent_color ? accentOf(style) : null);
	const bg = $derived(entry ? backgroundCss(style) : null);
	const glow = $derived(style?.flourish === 'glow-pulse' && !!accent);

	const cssVars = $derived(
		[
			accent ? `--chip-acc:${accent}` : '',
			accent ? `--chip-acc-soft:${accentAlpha(accent, 0.42)}` : '',
			bg ? `--chip-bg:${bg}` : ''
		]
			.filter(Boolean)
			.join(';')
	);
</script>

<span
	class="entry-chip"
	class:winner
	class:dim
	class:tbd={!entry}
	class:has-bg={!!bg}
	class:has-acc={!!accent}
	class:glow
	style={cssVars || undefined}
>
	{#if entry}
		{#if accent}<span class="rule" aria-hidden="true"></span>{/if}
		{#if entry.thumbnail_url}
			<img class="thumb" src={entry.thumbnail_url} alt="" loading="lazy" />
		{:else}
			<span class="thumb initial" aria-hidden="true">{initial}</span>
		{/if}
		{#if style?.badge}
			<span class="badge"><BadgeIcon id={style.badge} size="0.95em" /></span>
		{/if}
		<span class="name">{entry.display_name}</span>
		{#if seed}
			<span class="seed">#{seed}</span>
		{/if}
	{:else}
		<span class="thumb initial" aria-hidden="true">·</span>
		<span class="name">TBD</span>
	{/if}
</span>

<style>
	.entry-chip {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', sans-serif;
		font-weight: 600;
	}
	/* The entry's own background, washed back so the name stays the loudest
	 * thing in a dense row. */
	.entry-chip.has-bg::before {
		content: '';
		position: absolute;
		inset: -0.18rem -0.4rem;
		border-radius: 5px;
		background: var(--chip-bg);
		opacity: 0.22;
		z-index: 0;
		pointer-events: none;
	}
	.entry-chip > * {
		position: relative;
		z-index: 1;
	}
	.rule {
		width: 3px;
		align-self: stretch;
		min-height: 1.35rem;
		border-radius: 2px;
		background: var(--chip-acc);
		flex: none;
	}
	.entry-chip.glow .rule {
		animation: chip-glow 2.4s ease-in-out infinite;
	}
	@keyframes chip-glow {
		50% {
			box-shadow: 0 0 0.5rem var(--chip-acc-soft);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.entry-chip.glow .rule {
			animation: none;
		}
	}
	.entry-chip.winner .name {
		color: var(--green, #00ff41);
	}
	.entry-chip.dim,
	.entry-chip.tbd {
		opacity: 0.45;
	}
	.thumb {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 4px;
		object-fit: cover;
		flex: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.18));
		background: var(--bg2, #101610);
	}
	.entry-chip.has-acc .thumb {
		border-color: var(--chip-acc);
	}
	.thumb.initial {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim, #7a8a7a);
	}
	.badge {
		display: inline-flex;
		align-items: center;
		flex: none;
		color: var(--chip-acc, var(--dim, #7a8a7a));
		margin-left: -0.15rem;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.seed {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--cyan, #00f0ff);
		opacity: 0.8;
		flex: none;
	}
</style>
