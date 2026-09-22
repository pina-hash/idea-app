<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import BadgeIcon from '$lib/tournaments/BadgeIcon.svelte';
	import { displayName, profileStyle, type UserProfile } from '$lib/profile';
	import { subjectStyle, type AvatarSubject } from '$lib/avatars';
	import {
		accentAlpha,
		accentOf,
		backgroundCss,
		bannerInk,
		hasStyle,
		isImageBackground,
		type IdentityStyle
	} from '$lib/identity-style';

	/**
	 * ============================================================================
	 * A PERSON'S CUSTOMIZED IDENTITY, AT A SIZE WHERE A BANNER IS THE POINT.
	 * ============================================================================
	 *
	 * The sibling `Avatar.svelte`'s restraint note names: an avatar takes ONE
	 * thing from a style, the accent ring, because it is drawn thirty times on a
	 * roster. This is the other half -- the background, the badge and the
	 * tagline -- and it is mounted where ONE person is being shown.
	 *
	 * IT IS THE "one new shared identity component" LEDGER 0289 ALLOWS, and it
	 * sits at `$lib/` rather than under a subsystem on purpose: a profile is not
	 * a classroom thing or a foundry thing, and the whole argument of this bundle
	 * is that consumers inherit an identity rather than each building one.
	 *
	 * WITH NO STYLE IT IS THE PLAIN IDENTITY AND NOTHING ELSE -- the avatar and
	 * the name, no card, no ground, no padding, no border. That is not a
	 * degraded state, it is the state EVERYBODY is in until they customize
	 * something, so it has to be the thing that looks deliberate. `hasStyle` is
	 * the switch and it is the shared one; a second reading of "has this person
	 * customized anything" is the pair that stops matching.
	 *
	 * THE NAME RULE IS NOT `displayName()` FOR SOMEBODY ELSE, AND THAT IS A
	 * DISCLOSURE DECISION RATHER THAN A STYLE ONE. `displayName()`'s third rung
	 * is the EMAIL ADDRESS -- correct for `ProfileMenu`, which is always
	 * describing the person holding the session and showing them their own
	 * address. Said about a CLASSMATE on a surface every signed-in student can
	 * read, it publishes an address, which is exactly why CLAUDE.md forbids that
	 * function on every Foundry surface. So a `subject` falls back to
	 * display_name then full_name and then to NOTHING, the way
	 * `foundryAuthorName` does; only a `profile` (the viewer's own row) may
	 * reach the address. A caller that knows better passes `name`.
	 */
	let {
		profile = undefined,
		subject = undefined,
		style = undefined,
		name = undefined,
		size = 44,
		tintKey = undefined,
		heading = false
	}: {
		profile?: UserProfile | null;
		subject?: AvatarSubject | null;
		/** Overrides the style on `profile` / `subject` (the editor's live draft). */
		style?: IdentityStyle | null;
		/** Overrides the derived name. */
		name?: string | null;
		size?: number;
		tintKey?: string | null;
		/** Render the name as an `<h2>` rather than a `<span>`. */
		heading?: boolean;
	} = $props();

	const identity = $derived(
		style !== undefined ? style : profile != null ? profileStyle(profile) : subjectStyle(subject)
	);
	const styled = $derived(hasStyle(identity));

	const shownName = $derived(
		name ??
			(profile != null
				? displayName(profile)
				: ((subject?.display_name ?? '').trim() || (subject?.full_name ?? '').trim() || ''))
	);

	const accent = $derived(identity?.accent_color ? accentOf(identity) : null);
	const bg = $derived(backgroundCss(identity));
	/**
	 * THE INK IS THE BACKGROUND'S, NEVER THE ACCENT'S, and only when there IS a
	 * background. `bannerInk` picks dark or light from the background's own
	 * luminance -- so a student who chooses a pale yellow gets dark text rather
	 * than a white-on-white banner. With no background the room's own `--text-1`
	 * governs, because the banner is then sitting on whatever plate the surface
	 * is made of and this component has no business guessing its colour.
	 */
	const ink = $derived(bg ? bannerInk(identity) : null);
	const glow = $derived(identity?.flourish === 'glow-pulse' && !!accent);
	const drift = $derived(identity?.flourish === 'particle-trail' && !!accent);

	const cssVars = $derived(
		[
			bg ? `--idb-bg:${bg}` : '',
			ink ? `--idb-ink:${ink}` : '',
			accent ? `--idb-acc:${accent}` : '',
			accent ? `--idb-acc-soft:${accentAlpha(accent, 0.45)}` : ''
		]
			.filter(Boolean)
			.join(';')
	);
</script>

<div
	class="idb"
	class:styled
	class:has-bg={!!bg}
	class:scrim={isImageBackground(identity)}
	class:glow
	class:drift
	style={cssVars || undefined}
>
	<!-- The avatar is the SAME component every other surface mounts, handed the
	     same style, so the accent ring here and the accent ring on a roster row
	     cannot come to disagree. -->
	<Avatar {profile} {subject} {tintKey} {size} style={identity} />

	<div class="idb-text">
		<div class="idb-line">
			{#if heading}
				<h2 class="idb-name">{shownName}</h2>
			{:else}
				<span class="idb-name">{shownName}</span>
			{/if}
			{#if identity?.badge}
				<!-- `BadgeIcon` lives under `tournaments/` and has no tournament
				     content in it at all: forty lines, no theme import, and since
				     ledger 0289 its one import resolves into `$lib/identity-style`.
				     The path says where it was born, not what it does -- the
				     `_notebook_email_for_user` situation -- and it is NOT moved here,
				     because moving it edits three tournament callers this bundle does
				     not own to fix a name. -->
				<span class="idb-badge"><BadgeIcon id={identity.badge} size="1.05em" /></span>
			{/if}
		</div>
		{#if identity?.tagline}
			<p class="idb-tagline">{identity.tagline}</p>
		{/if}
	</div>
</div>

<style>
	.idb {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-width: 0;
	}
	/* WITH A STYLE IT BECOMES A CARD; without one these rules do not apply at
	   all, so an uncustomized identity is an avatar and a name with no box
	   round them -- byte-identical to what every surface renders today. */
	.idb.styled {
		padding: 0.55rem 0.75rem;
		border-radius: var(--radius-card, 10px);
		border: 1px solid var(--boundary, rgba(255, 255, 255, 0.2));
	}
	.idb.styled.has-bg {
		position: relative;
		background: var(--idb-bg);
		border-color: transparent;
		color: var(--idb-ink);
		overflow: hidden;
	}
	/* An IMAGE background is unknown art, so the text gets a scrim rather than
	   a guess. `bannerInk` always answers light ink for one, so the scrim is
	   dark. 0220 refuses an image background on a PROFILE, so this arm only
	   fires for a tournament style rendered through this component -- it is kept
	   because the component is shared and the shape is legal in the type. */
	.idb.styled.scrim::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0.42));
		pointer-events: none;
	}
	.idb.styled.scrim > :global(*),
	.idb.styled.scrim .idb-text {
		position: relative;
		z-index: 1;
	}
	/* The accent rule, the same signal `EntryChip` draws. It is the LAST
	   element in the box rather than the first so it does not push the avatar
	   off the leading edge of the row. */
	.idb.styled:not(.has-bg) {
		border-left: 3px solid var(--idb-acc, var(--boundary, rgba(255, 255, 255, 0.2)));
	}
	.idb-text {
		min-width: 0;
	}
	.idb-line {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}
	.idb-name {
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-weight: 600;
		font-size: 1rem;
		margin: 0;
		/* `--text-1` and not a literal: every room this can land in aliases it
		   onto its own plate. With a background the ink is the background's,
		   which is what the cascade order here says. */
		color: var(--idb-ink, var(--text-1, #e8ffe8));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.idb-badge {
		display: inline-flex;
		flex: none;
		/* The badge takes the ACCENT where there is one, and the ink otherwise.
		   Never a third colour: a badge is a decoration of the identity, not a
		   second identity. */
		color: var(--idb-acc, var(--idb-ink, var(--text-2, #9ab)));
	}
	.idb-tagline {
		margin: 0.1rem 0 0;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		/* On a custom background the ink is the only safe colour, so the tagline
		   takes it at reduced opacity rather than a token measured against a
		   plate this banner may not be sitting on. */
		color: var(--idb-ink, var(--text-2, #9ab));
		opacity: var(--idb-tagline-fade, 0.82);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ------------------------------------------------------------------------
	   THE AMBIENT FLOURISHES. They render HERE and never on `Avatar.svelte`:
	   one banner is one animation, where a roster is thirty of them forever on
	   a six-to-eight-year-old school desktop (the stated performance budget).

	   Both are TRANSFORM AND OPACITY ONLY -- no layout property is animated, so
	   neither can move anything beside it -- and both are gated behind
	   prefers-reduced-motion, like everything that moves on this site. Nothing
	   is hidden in a base state: with the animation cancelled the banner is at
	   full opacity with no transform, so a reduced-motion reader sees the whole
	   thing and loses only the motion.
	   ------------------------------------------------------------------------ */
	.idb.glow {
		box-shadow: 0 0 0 0 transparent;
	}
	.idb.drift::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: radial-gradient(
			circle at 20% 50%,
			var(--idb-acc-soft) 0,
			transparent 42%
		);
		opacity: 0;
	}
	@media (prefers-reduced-motion: no-preference) {
		.idb.glow {
			animation: idb-glow 2.6s ease-in-out infinite;
		}
		.idb.drift::after {
			animation: idb-drift 6s linear infinite;
		}
	}
	@keyframes idb-glow {
		50% {
			box-shadow: 0 0 0.75rem var(--idb-acc-soft);
		}
	}
	@keyframes idb-drift {
		0% {
			opacity: 0;
			transform: translateX(-12%);
		}
		50% {
			opacity: 0.55;
		}
		100% {
			opacity: 0;
			transform: translateX(62%);
		}
	}
</style>
