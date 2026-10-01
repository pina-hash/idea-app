<script lang="ts">
	import BadgeIcon from './BadgeIcon.svelte';
	import type { TournamentEntry } from './tournaments';
	import { THUMBNAIL_MARK, thumbnailSrc, thumbnailState } from './thumbnail';
	import {
		accentAlpha,
		accentOf,
		backgroundCss,
		bannerInk,
		isImageBackground,
		type EntryStyle,
		type FlourishEvent
	} from './entry-styles';

	/**
	 * An entry at banner scale: the full-strength version of its Phase 2b
	 * customization (background, accent, badge, tagline, flourishes). Used
	 * wherever an entry gets room to breathe -- the entries list, the live
	 * match view, the TV projector, and the editor's own preview.
	 *
	 * With no style it renders the Phase 1 default treatment on a neutral
	 * panel: thumbnail + display name, nothing missing and nothing unstyled.
	 *
	 * Flourishes are COSMETIC ONLY. Ambient ones (glow, particles) run
	 * continuously; event ones play once when the parent hands this banner a
	 * decisive moment it already knows about via `event`. Nothing here reads
	 * or encodes match state -- the surfaces around it own that language --
	 * and every animation is off under prefers-reduced-motion.
	 */
	let {
		entry = null,
		style = null,
		seed = null,
		size = 'md',
		event = null,
		winner = false,
		dim = false,
		label = '',
		members = []
	}: {
		entry?: TournamentEntry | null;
		style?: EntryStyle | null;
		seed?: number | null;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		event?: FlourishEvent;
		winner?: boolean;
		dim?: boolean;
		/** Optional overline (e.g. a bracket position), shown above the name. */
		label?: string;
		/**
		 * The registrants' CHOSEN names (0192), shown under the entry name when
		 * they say something the name does not: more than one person, or one
		 * person who registered under a name other than the entry's. A solo
		 * entry named after its one member renders nothing here, exactly as
		 * before 0192.
		 */
		members?: string[];
	} = $props();

	const PARTICLE_SLOTS = Array.from({ length: 9 }, (_, i) => i);
	const CONFETTI_SLOTS = Array.from({ length: 14 }, (_, i) => i);

	const initial = $derived(entry ? entry.display_name.trim().charAt(0).toUpperCase() : '');
	const showMembers = $derived(
		!!entry &&
			(members.length > 1 || (members.length === 1 && members[0] !== entry.display_name))
	);
	const accent = $derived(accentOf(style));
	const hasAccent = $derived(!!style?.accent_color);
	const bg = $derived(entry ? backgroundCss(style) : null);
	const ink = $derived(bannerInk(style));
	const scrim = $derived(!!bg && isImageBackground(style));
	const ambient = $derived(style?.flourish === 'glow-pulse' || style?.flourish === 'particle-trail');
	const particles = $derived(style?.flourish === 'particle-trail');
	const glow = $derived(style?.flourish === 'glow-pulse');

	// One-shot event flourishes. `fx` re-keys the element so a repeat of the
	// same event restarts the animation rather than being ignored.
	let fx = $state<{ kind: 'confetti' | 'shake'; key: number } | null>(null);
	let fxKey = 0;
	$effect(() => {
		const want =
			event === 'win' && style?.flourish === 'confetti-on-win'
				? ('confetti' as const)
				: event === 'eliminated' && style?.flourish === 'screen-shake-on-elimination'
					? ('shake' as const)
					: null;
		if (!want) {
			fx = null;
			return;
		}
		fx = { kind: want, key: ++fxKey };
		const timer = setTimeout(() => (fx = null), 2600);
		return () => clearTimeout(timer);
	});

	const cssVars = $derived(
		[
			`--b-acc:${accent}`,
			`--b-acc-soft:${accentAlpha(accent, 0.45)}`,
			`--b-acc-wash:${accentAlpha(accent, 0.14)}`,
			`--b-ink:${ink}`,
			bg ? `--b-bg:${bg}` : ''
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

<div
	class="entry-banner {size}"
	class:has-bg={!!bg}
	class:has-acc={hasAccent}
	class:winner
	class:dim
	class:tbd={!entry}
	class:glow
	class:shake={fx?.kind === 'shake'}
	style={cssVars}
>
	{#if bg}<div class="bg" aria-hidden="true"></div>{/if}
	{#if scrim}<div class="scrim" aria-hidden="true"></div>{/if}

	{#if particles && ambient}
		<div class="particles" aria-hidden="true">
			{#each PARTICLE_SLOTS as i (i)}
				<i style="--i:{i}"></i>
			{/each}
		</div>
	{/if}

	{#if fx?.kind === 'confetti'}
		{#key fx.key}
			<div class="confetti" aria-hidden="true">
				{#each CONFETTI_SLOTS as i (i)}
					<i style="--i:{i}"></i>
				{/each}
			</div>
		{/key}
	{/if}

	<div class="body">
		{#if entry}
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
		{:else}
			<span class="thumb initial" aria-hidden="true">·</span>
		{/if}

		<div class="text">
			{#if label}<span class="label">{label}</span>{/if}
			<span class="name-row">
				{#if style?.badge}<span class="badge"><BadgeIcon id={style.badge} size="1em" /></span>{/if}
				<span class="name">{entry ? entry.display_name : 'TBD'}</span>
			</span>
			{#if showMembers}
				<span class="members">{members.join(' · ')}</span>
			{/if}
			{#if entry && style?.tagline}
				<span class="tagline">{style.tagline}</span>
			{/if}
		</div>

		{#if seed}<span class="seed">#{seed}</span>{/if}
	</div>
</div>

<style>
	.entry-banner {
		--pad: 0.7rem;
		--thumb: 2.4rem;
		--name: 1.1rem;
		--tag: 0.8rem;
		position: relative;
		overflow: hidden;
		border-radius: 10px;
		/* Neutral by default: works inside .tnm-root and on the portal pages. */
		background: var(--tnm-panel, var(--bg1, #0d120d));
		border: 1px solid var(--tnm-line, var(--line, rgba(0, 255, 65, 0.16)));
		color: var(--tnm-ink, var(--white, #e8ffe8));
		min-width: 0;
	}
	.entry-banner.md {
		--pad: 1rem;
		--thumb: 3.4rem;
		--name: 1.55rem;
		--tag: 0.9rem;
	}
	.entry-banner.lg {
		--pad: 1.5rem;
		--thumb: 5rem;
		--name: clamp(1.8rem, 3.4vw, 3rem);
		--tag: clamp(0.95rem, 1.3vw, 1.25rem);
	}
	.entry-banner.xl {
		--pad: clamp(1.4rem, 2.6vw, 2.6rem);
		--thumb: clamp(4.5rem, 9vw, 9rem);
		--name: clamp(2.2rem, 6vw, 5.6rem);
		--tag: clamp(1rem, 1.9vw, 1.9rem);
	}
	.entry-banner.dim,
	.entry-banner.tbd {
		opacity: 0.5;
	}

	.bg {
		position: absolute;
		inset: 0;
		background: var(--b-bg);
		z-index: 0;
	}
	/* Image art is unknown, so the ink is always light and gets a scrim
	 * under it. Solid/gradient backgrounds pick their ink by luminance
	 * instead, which stays cleaner. */
	.scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgba(6, 10, 8, 0.86) 0%, rgba(6, 10, 8, 0.42) 68%, rgba(6, 10, 8, 0.2) 100%);
		z-index: 1;
	}
	.entry-banner.has-bg .body {
		color: var(--b-ink);
	}
	.entry-banner.has-acc {
		border-color: var(--b-acc-soft);
	}
	/* The accent rule: a per-entry edge, never a flooded surface. */
	.entry-banner.has-acc::after {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 5px;
		background: var(--b-acc);
		z-index: 3;
	}
	.entry-banner.lg.has-acc::after,
	.entry-banner.xl.has-acc::after {
		width: 8px;
	}
	.entry-banner.glow {
		animation: banner-glow 2.6s ease-in-out infinite;
	}
	@keyframes banner-glow {
		50% {
			box-shadow: 0 0 1.6rem var(--b-acc-soft);
		}
	}
	.entry-banner.shake {
		animation: banner-shake 0.55s ease-in-out 3;
	}
	@keyframes banner-shake {
		0%,
		100% {
			transform: translateX(0);
		}
		20% {
			transform: translateX(-6px) rotate(-0.4deg);
		}
		45% {
			transform: translateX(5px) rotate(0.35deg);
		}
		70% {
			transform: translateX(-3px);
		}
	}

	.particles {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
	}
	.particles i {
		position: absolute;
		bottom: -10%;
		left: calc(6% + var(--i) * 10.5%);
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--b-acc);
		opacity: 0;
		animation: particle-rise 4.4s linear infinite;
		animation-delay: calc(var(--i) * -0.52s);
	}
	@keyframes particle-rise {
		0% {
			transform: translateY(0) scale(0.7);
			opacity: 0;
		}
		18% {
			opacity: 0.85;
		}
		100% {
			transform: translateY(-150%) scale(1.15);
			opacity: 0;
		}
	}

	.confetti {
		position: absolute;
		inset: 0;
		z-index: 4;
		pointer-events: none;
	}
	.confetti i {
		position: absolute;
		top: -12%;
		left: calc(3% + var(--i) * 7%);
		width: 7px;
		height: 11px;
		border-radius: 1px;
		background: var(--b-acc);
		opacity: 0;
		animation: confetti-fall 2.2s ease-in forwards;
		animation-delay: calc(var(--i) * 0.07s);
	}
	.confetti i:nth-child(3n) {
		background: #edede8;
	}
	.confetti i:nth-child(3n + 1) {
		background: #e0ac4e;
	}
	@keyframes confetti-fall {
		0% {
			transform: translateY(0) rotate(0deg);
			opacity: 1;
		}
		100% {
			transform: translateY(320%) rotate(520deg);
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.entry-banner.glow,
		.entry-banner.shake,
		.particles i,
		.confetti i {
			animation: none;
		}
		.confetti,
		.particles {
			display: none;
		}
	}

	.body {
		position: relative;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: var(--pad);
		padding: var(--pad);
		min-width: 0;
	}
	.thumb {
		width: var(--thumb);
		height: var(--thumb);
		border-radius: 8px;
		object-fit: cover;
		flex: none;
		border: 1px solid var(--tnm-line-strong, rgba(255, 255, 255, 0.18));
		background: rgba(0, 0, 0, 0.35);
	}
	.entry-banner.has-acc .thumb {
		border-color: var(--b-acc);
	}
	.thumb.initial {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: calc(var(--thumb) * 0.42);
		color: currentColor;
		opacity: 0.65;
	}
	/* The two FAULT marks -- see EntryChip for the argument. Same box as the
	   picture (width/height/radius/flex all live on `.thumb`), distinct on ink,
	   fill and border style, with a glyph of its own. Full opacity, unlike the
	   initial: an initial is decoration and these two are information. */
	.thumb.mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: calc(var(--thumb) * 0.46);
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
	.entry-banner.has-acc .thumb.mark {
		border-color: currentColor;
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.label {
		font-family: 'Share Tech Mono', monospace;
		font-size: calc(var(--tag) * 0.82);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.7;
	}
	.name-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		flex: none;
		font-size: calc(var(--name) * 0.78);
		color: var(--b-acc);
	}
	.entry-banner.has-bg .badge {
		color: var(--b-ink);
	}
	.entry-banner.has-bg.has-acc .badge {
		color: var(--b-acc);
	}
	.name {
		font-family: 'Rajdhani', sans-serif;
		font-weight: 700;
		font-size: var(--name);
		line-height: 1.08;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.entry-banner.winner .name {
		text-shadow: 0 0 0.8rem rgba(255, 255, 255, 0.25);
	}
	/* The people behind the name, in the banner's own ink at FULL opacity and
	   the tagline's size: a roster is information where a tagline is
	   flavour, so it does not take the tagline's 0.82. Mono, so it reads as
	   a list beside the Rajdhani name. Middots separate; the names are the
	   registrants' own chosen ones, never an account's. */
	.members {
		font-family: 'Share Tech Mono', monospace;
		font-size: var(--tag);
		letter-spacing: 0.04em;
		color: var(--b-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tagline {
		font-size: var(--tag);
		opacity: 0.82;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.seed {
		margin-left: auto;
		flex: none;
		font-family: 'Share Tech Mono', monospace;
		font-size: calc(var(--tag) * 0.95);
		opacity: 0.7;
	}
</style>
