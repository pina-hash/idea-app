<script lang="ts">
	import BadgeIcon from './BadgeIcon.svelte';
	import type { TournamentEntry } from './tournaments';
	import { THUMBNAIL_MARK, thumbnailSrc, thumbnailState } from './thumbnail';
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

	/**
	 * The four thumbnail states, decided in ONE place for both surfaces
	 * ($lib/tournaments/thumbnail.ts). `thumbFailed` is keyed on the URL rather
	 * than left standing: this component is reused across bracket rounds and a
	 * re-render with a DIFFERENT entry must not inherit the previous one's
	 * failure. Comparing against the last URL we armed for is what resets it,
	 * and it is a plain derivation rather than an $effect precisely so there is
	 * no write-during-render to schedule.
	 */
	let failedFor = $state<string | null>(null);
	const thumbSrc = $derived(thumbnailSrc(entry?.thumbnail_url));
	const thumbFailed = $derived(!!thumbSrc && failedFor === thumbSrc);
	const thumbState = $derived(thumbnailState(entry?.thumbnail_url, thumbFailed));

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
		{#if thumbSrc && !thumbFailed}
			<img
				class="thumb"
				src={thumbSrc}
				alt=""
				loading="lazy"
				onerror={() => (failedFor = thumbSrc)}
			/>
		{:else if thumbState === 'refused'}
			<span class="thumb mark refused" role="img" aria-label={THUMBNAIL_MARK.refused.label}
				>{THUMBNAIL_MARK.refused.glyph}</span
			>
		{:else if thumbState === 'failed'}
			<span class="thumb mark failed" role="img" aria-label={THUMBNAIL_MARK.failed.label}
				>{THUMBNAIL_MARK.failed.glyph}</span
			>
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
	/* The two FAULT marks. Same box as the picture and as the initial -- width,
	   height, radius and flex are all on `.thumb` -- so nothing on the row
	   moves when a state changes. What differs is PAINT, on three axes at once
	   (ink, fill, border style) plus a glyph, because a reader comparing two
	   chips on a projector is comparing colour and shape, not reading a class
	   name, and colour is never the only signal. */
	.thumb.mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		line-height: 1;
	}
	/* `--amber` (#d08030) is the warning IDENTITY and does not move. What moves
	   is the derived INK: the same hue (30deg) and the same saturation (63%) at
	   65% lightness instead of 50%, which is the `--acc-ink` rule applied here.
	   Measured against the fill this mark actually sits on inside a banner --
	   the pinned amber wash over the room's dark plate, rgb(54, 56, 37) -- the
	   identity value came out at 3.9:1 and this one at 5.6:1. The FILL stays
	   pinned rather than mixed from the ink, or lightening the ink would
	   lighten its own ground and hand most of that back. */
	.thumb.mark.refused {
		color: #dea66e;
		background: rgba(208, 128, 48, 0.16);
		border-style: solid;
		border-color: #dea66e;
	}
	.thumb.mark.failed {
		color: var(--ice, #a8b6ad);
		background: rgba(0, 0, 0, 0.62);
		border-style: dashed;
		border-color: var(--ice, #a8b6ad);
	}
	/* An accent ring is the ENTRY's identity and must not repaint a fault: a
	   refused picture on an accented chip has to stay legible as a refusal. */
	.entry-chip.has-acc .thumb.mark {
		border-color: currentColor;
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
