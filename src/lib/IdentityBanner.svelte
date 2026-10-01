<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import BadgeIcon from '$lib/tournaments/BadgeIcon.svelte';
	import { displayName, profileStyle, type UserProfile } from '$lib/profile';
	import { subjectStyle, type AvatarSubject } from '$lib/avatars';
	import {
		accentAlpha,
		accentOf,
		backgroundCss,
		hasStyle,
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
	const glow = $derived(identity?.flourish === 'glow-pulse' && !!accent);
	const drift = $derived(identity?.flourish === 'particle-trail' && !!accent);

	const cssVars = $derived(
		[
			bg ? `--idb-bg:${bg}` : '',
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
	/* ========================================================================
	   THE BACKGROUND IS A WASH, NOT A FILL, AND THAT IS A MEASURED DECISION
	   RATHER THAN A TASTE ONE.

	   Report 15 asks for "banners like there are in the IDEA tournaments",
	   which is a FULL-STRENGTH background with the text on top of it. That
	   cannot be made legible, and the numbers are why: with the student
	   choosing the colour freely, `bannerInk`'s two-value light/dark rule
	   bottoms out at **1.90:1** at full opacity (worst case a mid olive,
	   #a5b478) against the 4.5:1 a body text carries. Picking whichever of the
	   two inks measures better instead only reaches **3.98:1**, and flips 35.7%
	   of the colour space -- a large visible change to a deployed tournament
	   surface, which is not this bundle's to make. A black scrim needs **0.60
	   alpha** before light ink clears, which mutes the colour far more than a
	   wash does AND still leaves the tagline at 3.90.

	   SO THE TEXT DOES NOT SIT ON THE STUDENT'S COLOUR AT ALL. The colour is
	   laid over the room's own plate at 0.22, which is exactly the treatment
	   `EntryChip` already uses and for the same stated reason -- a dense row
	   where the name has to stay the most legible thing on it. The ink is then
	   the ROOM's `--text-1`, which every room has already measured against its
	   own plates, so legibility is a property of the construction rather than a
	   number that has to hold for a colour nobody has picked yet. Measured over
	   four plates and the whole colour space at 0.22: the name's worst case is
	   **5.73:1**.

	   `bannerInk` IS THEREFORE NOT CALLED HERE, and that is not the lift having
	   failed. It is lifted, the tournament banner still calls it, and it is
	   still the right answer for a surface that paints the colour at full
	   strength. This surface does not. The 1.90:1 finding is the TOURNAMENT
	   banner's too and is reported in this bundle's history entry as a defect
	   found rather than fixed: fixing it means changing what a live projector
	   renders mid-tournament, with its own visual pass.
	   ======================================================================== */
	.idb {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-width: 0;
	}
	/* WITH A STYLE IT BECOMES A CARD; without one these rules do not apply at
	   all, so an uncustomized identity is an avatar and a name with no box
	   round them -- which is what every surface renders today and is the state
	   everybody is in until they choose something. */
	.idb.styled {
		position: relative;
		padding: 0.55rem 0.75rem;
		border-radius: var(--radius-card, 10px);
		border: 1px solid var(--boundary, rgba(255, 255, 255, 0.2));
		/* The accent rule, the same signal `EntryChip` draws. */
		border-left: 3px solid var(--idb-acc, var(--boundary, rgba(255, 255, 255, 0.2)));
		overflow: hidden;
	}
	/* THE WASH ITSELF, as a layer rather than as a `background` on the card, so
	   the opacity applies to the COLOUR and not to the text above it. An
	   `opacity` on the card would fade the name with it, which is the mistake
	   this shape avoids by construction. */
	.idb.styled.has-bg::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--idb-bg);
		opacity: 0.22;
		pointer-events: none;
	}
	.idb.styled > :global(*) {
		position: relative;
		z-index: 1;
	}
	.idb-text {
		min-width: 0;
		position: relative;
		z-index: 1;
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
		/* THE ROOM'S OWN INK, never a colour derived from the student's. Every
		   room aliases `--text-1` onto its own plate and has measured it there;
		   a value computed here would be measured against nothing. */
		color: var(--text-1, #e8ffe8);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* THE BADGE TAKES THE INK, NOT THE ACCENT, AND THAT IS THE SECOND THING
	   MEASURING CHANGED. Painted in the accent on the student's own background
	   it came out at **2.11:1** (a red crown on amber) and **2.50:1** (cyan on
	   a blue-violet gradient) against the 3:1 a graphical object carries --
	   because the accent and the background are TWO FREE COLOURS and no pairing
	   of two free colours can be guaranteed to contrast. A badge is a glyph
	   somebody chose to display, so it is a thing to be READ: it takes the text
	   tier and clears whatever the background is. The accent still paints the
	   ring and the rule, which are decoration. */
	.idb-badge {
		display: inline-flex;
		flex: none;
		color: var(--text-1, #e8ffe8);
	}
	/* THE TAGLINE IS THE SAME INK AS THE NAME, differentiated by SIZE and by
	   the mono face rather than by colour, and that is the repo's own finding
	   one tier up: muted copy sitting on an active fill takes the tier ABOVE,
	   because the wash lightens the ground out from under it. Measured on the
	   washed ground, `--text-2` bottoms out at **2.70:1**; `--text-1` holds the
	   name's 5.73:1. There is no opacity fade for the same reason -- a fade IS
	   a lightening, and at 0.82 it took the worst case to 3.38:1. */
	.idb-tagline {
		margin: 0.1rem 0 0;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		color: var(--text-1, #e8ffe8);
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
	.idb.drift::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: radial-gradient(circle at 20% 50%, var(--idb-acc-soft) 0, transparent 42%);
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
