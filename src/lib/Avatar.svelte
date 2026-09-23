<script lang="ts">
	import {
		avatarSource,
		markTransform,
		presetMarks,
		profileStyle,
		type UserProfile
	} from '$lib/profile';
	import {
		avatarTint,
		avatarTintOnLight,
		proxiedAvatarSource,
		subjectAvatar,
		subjectInitials,
		subjectStyle,
		type AvatarSubject
	} from '$lib/avatars';
	import { accentOf, type IdentityStyle } from '$lib/identity-style';

	/**
	 * A person's picture at any size: chosen preset mark, uploaded image,
	 * Google photo, or an initials tile (in that order; see avatarSource).
	 *
	 * TWO CALLERS, ONE COMPONENT. `profile` is the viewer's own row, which is
	 * what `ProfileMenu` has held since 0020. `subject` is ANYBODY ELSE --
	 * a roster row, a grading row -- which is a narrower shape than
	 * `UserProfile` and is adapted in `$lib/avatars.ts` rather than cast.
	 * Passing both is a caller bug and `profile` wins; passing neither is the
	 * ordinary empty state and renders a tile, never a hole.
	 *
	 * `tintKey` is what makes the tile STABLE per person (the email or the
	 * uuid, never a list index). Without one every tile takes the first tint,
	 * which is exactly the old behaviour and is not a defect -- it is simply
	 * the un-keyed case.
	 *
	 * THE THREE THINGS THAT MUST NOT PRODUCE A HOLE, because each of them is a
	 * live case rather than a hypothetical:
	 *   1. NO PICTURE. Most people here have chosen none, so the tile is the
	 *      common path and is styled as a deliberate mark.
	 *   2. AN IMAGE THAT FAILS TO LOAD, WHICH SINCE 0181 INCLUDES ONE THE
	 *      SERVER REFUSED. An uploaded avatar is asked for at `/api/avatar/<key>`,
	 *      and that route answers the same bodyless 404 for a deleted object, a
	 *      stale key and a caller with no session -- so a deleted picture, a
	 *      broken one and a refused one are ONE case here rather than three,
	 *      which is the point rather than an accident: a 404 meaning "no
	 *      picture" and a refusal meaning "not yours to see" must not be
	 *      distinguishable from the outside. `onerror` swaps to the tile, which
	 *      is the same box -- so the row does not move either, and the tile a
	 *      refusal lands on is byte-identical to the tile a person who chose no
	 *      picture gets.
	 *   3. A NAME TOO LONG FOR ITS ROW. Not this component's to wrap: the box
	 *      is fixed at `size` in BOTH dimensions with `flex-shrink: 0`, so a
	 *      name beside it can ellipsise without the picture giving up width.
	 *      That is why the width is inline rather than a class -- a caller
	 *      cannot accidentally let it collapse.
	 *
	 * IT IS `aria-hidden` AND ITS `alt` IS EMPTY, deliberately and in every
	 * case. This platform's rule is that a control carries a visible word, and
	 * an avatar is only ever rendered BESIDE the person's name -- so a screen
	 * reader that announced it too would read every roster row twice. A
	 * surface that wants to render one WITHOUT a name has a different
	 * question to answer first, and should answer it rather than flipping this
	 * attribute.
	 */
	let {
		profile = undefined,
		subject = undefined,
		tintKey = undefined,
		size = 32,
		style = undefined
	}: {
		profile?: UserProfile | null;
		subject?: AvatarSubject | null;
		tintKey?: string | null;
		size?: number;
		/**
		 * An identity style to paint instead of the one on `profile` / `subject`.
		 * Callers do not pass this: it exists for the profile menu's live
		 * preview, which has to show a DRAFT that is not saved anywhere yet.
		 */
		style?: IdentityStyle | null;
	} = $props();

	/**
	 * ============================================================================
	 * THE RESTRAINT, AND IT IS THE DECISION THAT MAKES REPORT 15 SHIPPABLE.
	 * ============================================================================
	 *
	 * Report 15 asks for tournament-grade banners "anywhere the profile shows up
	 * - authoring, publisher, leaderboard, my class". Taken literally on the
	 * surface that matters most, that is a class roster drawing THIRTY gradient
	 * banners, thirty background layers and thirty ambient animations, in a pane
	 * where the thing a teacher came to read is the names.
	 *
	 * SO THE FULL BANNER IS NOT WHAT AN AVATAR RENDERS. This component takes
	 * exactly ONE thing from a style -- the accent, as the ring already drawn
	 * round every tile -- which costs one `border-color` and not one extra node,
	 * one extra layer or one extra animation. `IdentityBanner.svelte` is where
	 * the background, the badge and the tagline live, and it is mounted on
	 * surfaces that show ONE person at a size where a banner is the point.
	 *
	 * WHAT WAS REJECTED, and why each is worse than it looks:
	 *   - A BACKGROUND WASH ON THE TILE, the way `EntryChip` does it. A chip is
	 *     a name on a row with a 24px thumbnail beside it; this is a 24px
	 *     CIRCLE, and a gradient inside it competes with the initials or the
	 *     mark, which are the thing that actually identifies the person.
	 *   - THE BADGE, as a corner pip. At 24px a badge is about six pixels of
	 *     glyph -- unreadable, and colour-only signal, which this platform
	 *     refuses.
	 *   - THE AMBIENT FLOURISH. `glow-pulse` is a keyframe animation; thirty of
	 *     them on one roster is thirty compositor layers running forever on a
	 *     six-to-eight-year-old school desktop, which is the stated performance
	 *     budget. It renders on the banner, where there is one.
	 *   - A `size` THRESHOLD that turned the banner on above some number of
	 *     pixels. That is a magic constant deciding a disclosure-shaped question
	 *     in the wrong place: whether a surface wants a banner is the SURFACE's
	 *     call, so it is a component choice, not an arithmetic one.
	 *
	 * The roster-scale cost of this is measured rather than asserted -- thirty
	 * identities, both arrangements, in this bundle's history entry.
	 */

	/**
	 * THE STYLE IS DERIVED, NOT REQUIRED, AND THAT IS THE WHOLE INHERITANCE
	 * MECHANISM. Every consumer already hands this component a `profile` or a
	 * `subject`; reading the style off that same object is what lets a surface
	 * pick up an identity accent with NO EDIT to it -- the same trick 0181 used
	 * to move every uploaded avatar onto a proxy without touching the nine
	 * surfaces that render one.
	 */
	const identity = $derived(
		style !== undefined ? style : profile != null ? profileStyle(profile) : subjectStyle(subject)
	);
	const accent = $derived(identity?.accent_color ? accentOf(identity) : null);

	/**
	 * Reset on a NEW source rather than on mount. A `{#each}` over a roster
	 * reuses this component's instance when the list re-sorts or refetches, so
	 * a failure latched for one person would follow the box onto the next one
	 * and paint a tile over a picture that loads perfectly well.
	 */
	let failedUrl = $state<string | null>(null);

	/*
	 * WHAT THE TILE PAINTS, ALWAYS THROUGH `subjectInitials` AND NEVER OFF
	 * `source.text`, and the second half of that sentence is a bug fix rather
	 * than a tidy-up.
	 *
	 * It used to read `source.kind === 'initials' ? source.text : ...`, which
	 * takes the text `avatarSource` put there -- and `avatarSource` builds it
	 * with `initials()`, which bottoms out in `displayName()`, whose last rung
	 * is the literal sentence 'Signed in'. So the `subject` path was corrected
	 * by `subjectAvatar` in 0033 and the `profile` path was NOT: a profile row
	 * with no display name, no full name and no address still rendered the
	 * initials **SI**, which reads as a person called S. I. rather than as an
	 * absence. Measured on the real functions, not inferred: `initials(null)`
	 * and `initials(<nameless row>)` both answer 'SI' today.
	 *
	 * Reading through `subjectInitials` unconditionally closes that and costs
	 * nothing anywhere else: for a subject it is the same call `subjectAvatar`
	 * already made, and for an IDENTIFIED profile it delegates straight back to
	 * `initials()` with the same three fields, so every existing tile paints
	 * byte-identical letters. The one behaviour that moves is the one that was
	 * wrong.
	 *
	 * It also still answers the case it was written for: a FAILED image source
	 * carries no text at all, so there is nothing to read off `source`.
	 *
	 * `initials()` ITSELF IS UNCHANGED AND STILL ANSWERS 'SI'. It is exported
	 * from `$lib/profile.ts`, which this bundle does not own, and its one
	 * remaining caller is `avatarSource` -- whose text no longer reaches a
	 * screen through this component. `tests/avatar-initials.test.ts` sweeps
	 * `src/` for a second caller so that stays true by measurement rather than
	 * by hope.
	 */
	const fallbackText = $derived(subjectInitials(profile ?? subject));

	/**
	 * WHERE AN UPLOADED PICTURE IS ASKED FOR, AND WHY THAT DECISION IS HERE.
	 *
	 * `avatarSource` resolves an `upload:<key>` to a Supabase Storage PUBLIC
	 * object URL, which is what 0020's public `avatars` bucket served and what
	 * every surface in this app put in its own HTML. 0181 closes that bucket,
	 * so the bytes are asked for at `/api/avatar/<key>` on our origin instead and
	 * `src/routes/api/avatar/[...path]/+server.ts` mints a signed URL on the
	 * CALLER'S OWN client and 302s to it.
	 *
	 * THIS IS THE ONE PLACE THAT REWRITE HAPPENS, and that is the whole reason
	 * it works. Nine surfaces render a face -- the profile menu, the classroom
	 * roster, the grading console, the three notebook surfaces, the admin
	 * dashboard, two harnesses and the GAUNTLET leaderboard -- and every one of
	 * them mounts this component rather than building a URL. So the store could
	 * be closed underneath all nine with an edit to none of them, which was not
	 * a convenience: the leaderboard was READ-ONLY to the bundle that did it,
	 * and a design needing to touch it could not have shipped.
	 * `tests/avatar-proxy.test.ts` sweeps `src/` so it stays the one place.
	 *
	 * IT MOVES THE `upload:` CASE AND NOTHING ELSE. A Google photo is a
	 * googleusercontent URL that is not in our store and not ours to gate; a
	 * preset is inline SVG and makes no request. `proxiedAvatarSource` reads
	 * the RAW `avatar` value rather than sniffing the resolved URL, so those
	 * two are left alone by construction rather than by a string test.
	 */
	const chosen = $derived((profile ?? subject)?.avatar ?? null);
	const resolved = $derived(profile != null ? avatarSource(profile) : subjectAvatar(subject));
	const source = $derived(proxiedAvatarSource(chosen, resolved, fallbackText));
	const failed = $derived(source.kind === 'image' && failedUrl === source.url);
	const tint = $derived(avatarTint(tintKey));
	const tintOnLight = $derived(avatarTintOnLight(tintKey));
	const px = $derived(`${size}px`);
</script>

<span
	class="avatar"
	class:accented={!!accent}
	style="width:{px};height:{px};min-width:{px};--avatar-tint:{tint};--avatar-tint-light:{tintOnLight}{accent
		? `;--avatar-accent:${accent}`
		: ''}"
	aria-hidden="true"
>
	{#if source.kind === 'image' && !failed}
		<img
			src={source.url}
			alt=""
			width={size}
			height={size}
			referrerpolicy="no-referrer"
			onerror={() => (failedUrl = source.kind === 'image' ? source.url : null)}
		/>
	{:else if source.kind === 'preset'}
		<!-- EVERY MARK OF THE PRESET, THROUGH `presetMarks`, WHICH IS THE ONE
		     IMPLEMENTATION. This used to be a single `<path d={preset.d} />`,
		     which was correct while a preset WAS one path. The picker in
		     ProfileMenu carried the identical line, and the two would now be a
		     cat with eyes beside a cat without them.

		     `color` carries the stroke so a filled mark can say
		     `fill="currentColor"` and pick up the preset's own colour without
		     each entry repeating its hex. -->
		<!-- THE STROKE IS `currentColor` AND THE COLOR IS TWO CUSTOM PROPERTIES
		     (ledger 0297, package F1b): the preset's dark-tile `fg` and its
		     light-ground twin `fgOnLight`, and the stylesheet picks by theme. It
		     used to be the hex in the attribute, which no theme can reach; the
		     paint on the dark tile is the same value it always was. -->
		<svg
			class="preset"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			style="--avatar-fg:{source.preset.fg};--avatar-fg-light:{source.preset.fgOnLight ?? source.preset.fg}"
		>
			{#each presetMarks(source.preset) as mark, i (i)}
				<path
					d={mark.d}
					fill={mark.fill ?? 'none'}
					stroke={mark.fill ? 'none' : (mark.stroke ?? 'currentColor')}
					stroke-width={mark.width ?? 1.5}
					transform={markTransform(mark)}
				/>
			{/each}
		</svg>
	{:else}
			<span class="initials" style="font-size:{Math.round(size * 0.4)}px">{fallbackText}</span>
	{/if}
</span>

<style>
	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* THE THREE PROPERTIES THAT KEEP A ROW FROM MOVING. `flex-shrink: 0`
		   and the inline `min-width` stop a long name squeezing the picture;
		   the fixed height stops a row with no picture sitting shorter than
		   one with a picture. Measured across avatar / no-avatar / failed-load
		   rows at both widths -- see this bundle's history entry. */
		flex-shrink: 0;
		border-radius: 50%;
		overflow: hidden;
		background: var(--bg2, #081209);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
	}
	/* THE ONE THING A STYLE CHANGES HERE. The ring already existed and already
	   carried a colour; an accented identity repoints it and nothing else. It
	   is 2px rather than 1px because at 24px a one-pixel ring in a custom hue
	   reads as an anti-aliasing artefact rather than as a choice -- and because
	   the ring is then a GRAPHICAL OBJECT carrying meaning, which is the 3:1
	   contract `--boundary` names. The accent presets are measured against it
	   in tools/browser-verify/routes/avatars.mjs.

	   NO GLOW, NO WASH, NO BADGE: see the restraint note in the script block. */
	.avatar.accented {
		border-width: 2px;
		border-color: var(--avatar-accent);
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.avatar svg {
		width: 62%;
		height: 62%;
	}
	.initials {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		/* Per-person, from the measured set in $lib/avatars.ts. The fallback is
		   the portal's own primary, which is what every tile painted before
		   there was a set. */
		color: var(--avatar-tint, var(--green, #00ff41));
		letter-spacing: 0.05em;
		line-height: 1;
	}
	.avatar svg.preset {
		color: var(--avatar-fg);
	}
	/* UNDER SPACE WHITE THE TILE IS LIGHT, SO THE INK IS THE LIGHT TWIN (ledger
	   0297, package F1b). The tile's ground is `--bg2`, which the theme turns
	   into its light inset; the dark set's tints and a neon preset stroke read
	   under 2:1 there. Each twin is the same hue at a lightness measured for
	   the light ground (`AVATAR_TINTS_ON_LIGHT`, `fgOnLight`), so a person
	   keeps their color and their picture stays legible. The theme's
	   attribute is written only on in-scope routes, so a roster in any other
	   room paints exactly what it did. */
	:global(:root[data-theme='space-white']) .initials {
		color: var(--avatar-tint-light, var(--avatar-tint));
	}
	:global(:root[data-theme='space-white']) .avatar svg.preset {
		color: var(--avatar-fg-light, var(--avatar-fg));
	}
</style>
