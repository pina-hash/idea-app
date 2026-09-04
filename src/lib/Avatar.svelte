<script lang="ts">
	import { avatarSource, type UserProfile } from '$lib/profile';
	import { avatarTint, subjectAvatar, subjectInitials, type AvatarSubject } from '$lib/avatars';

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
	 *   2. AN IMAGE THAT FAILS TO LOAD. An uploaded avatar is a public-bucket
	 *      URL built from a stored path (`avatarUploadUrl`), so a deleted
	 *      object, a stale path or a blocked network hands the browser a
	 *      broken-image glyph inside a circle. `onerror` swaps to the tile,
	 *      which is the same box -- so the row does not move either.
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
		size = 32
	}: {
		profile?: UserProfile | null;
		subject?: AvatarSubject | null;
		tintKey?: string | null;
		size?: number;
	} = $props();

	/**
	 * Reset on a NEW source rather than on mount. A `{#each}` over a roster
	 * reuses this component's instance when the list re-sorts or refetches, so
	 * a failure latched for one person would follow the box onto the next one
	 * and paint a tile over a picture that loads perfectly well.
	 */
	let failedUrl = $state<string | null>(null);

	const source = $derived(profile != null ? avatarSource(profile) : subjectAvatar(subject));
	const failed = $derived(source.kind === 'image' && failedUrl === source.url);
	const tint = $derived(avatarTint(tintKey));
	const px = $derived(`${size}px`);
	/* What the tile paints when the picture is absent OR broken. Read through
	   `subjectInitials` rather than off `source.text`, because a FAILED image
	   source has no text on it at all. */
	const fallbackText = $derived(
		source.kind === 'initials' ? source.text : subjectInitials(profile ?? subject)
	);
</script>

<span
	class="avatar"
	style="width:{px};height:{px};min-width:{px};--avatar-tint:{tint}"
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
		<svg viewBox="0 0 24 24" fill="none" stroke={source.preset.fg} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
			<path d={source.preset.d} />
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
</style>
