/**
 * Avatars for SOMEBODY ELSE, and the tile a person with no picture gets.
 *
 * `$lib/profile.ts` already owns the viewer's OWN avatar: `avatarSource`
 * resolves a `UserProfile` to a preset mark, an uploaded image, the Google
 * photo, or an initials tile, and `ProfileMenu` renders it. That is the one
 * projection and this module does not write a second one -- everything here
 * either ADAPTS another shape onto it or answers a question it does not.
 *
 * WHY AN ADAPTER IS NEEDED AT ALL. A roster row is not a profile. The
 * classroom roster is EMAIL-KEYED (`classroom_enrollments`) and carries
 * `student_email` and `display_name`; a notebook grid row is keyed on
 * `student_key` and may have no account behind it at all. `avatarSource`
 * reads four fields and no more (`avatar`, `avatar_url`, `display_name`,
 * `full_name`, `email` through `initials`), so the honest adapter is a narrow
 * structural type rather than a cast to `UserProfile`, which would claim the
 * row carries a role, a pathway and a preferences blob it does not.
 */
import { avatarSource, initials, type AvatarSource } from '$lib/profile';

/**
 * The fields an avatar actually needs. Anything with these can be rendered,
 * and nothing wider is required -- which is also the disclosure statement: a
 * payload that gains an avatar gains exactly `avatar` and `avatar_url`.
 */
export interface AvatarSubject {
	/** Chosen picture: 'preset:<id>', 'upload:<storage path>', or null. */
	avatar?: string | null;
	/** Google photo from the OAuth metadata. */
	avatar_url?: string | null;
	display_name?: string | null;
	full_name?: string | null;
	email?: string | null;
}

/**
 * Resolve any subject to what `Avatar.svelte` renders. It delegates to
 * `avatarSource` rather than re-deriving the priority order: the day a fifth
 * source is added, a second copy of "which picture wins" is the one that
 * stops matching.
 */
export function subjectAvatar(subject: AvatarSubject | null | undefined): AvatarSource {
	const resolved = subjectAvatarRaw(subject);
	/**
	 * The PRIORITY ORDER is `avatarSource`'s and stays there; only the tile's
	 * TEXT is corrected, because `initials()` bottoms out in `displayName()`,
	 * whose last rung is the literal 'Signed in' -- a sentence about the
	 * viewer that becomes the false initials 'SI' when it is said about
	 * somebody else. See `subjectInitials`.
	 */
	return resolved.kind === 'initials'
		? { kind: 'initials', text: subjectInitials(subject) }
		: resolved;
}

function subjectAvatarRaw(subject: AvatarSubject | null | undefined): AvatarSource {
	if (!subject) return avatarSource(null);
	return avatarSource({
		id: '',
		email: subject.email ?? null,
		full_name: subject.full_name ?? null,
		display_name: subject.display_name ?? null,
		avatar_url: subject.avatar_url ?? null,
		avatar: subject.avatar ?? null,
		role: '',
		section_id: null,
		pathway: null,
		preferences: {}
	});
}

/**
 * The initials for any subject, through `initials()` in `$lib/profile.ts` --
 * which is the ONE implementation of "which letters" and of the
 * display_name -> full_name -> email ladder underneath it. `Avatar.svelte`
 * needs this separately from `subjectAvatar` for one case only: an image
 * source that FAILED to load still has to paint something, and by then the
 * resolved source says `image` and carries no text.
 */
export function subjectInitials(subject: AvatarSubject | null | undefined): string {
	/**
	 * '?' FOR A SUBJECT WITH NO IDENTITY AT ALL, and this is the one place
	 * where delegating blindly would have been wrong. `displayName()`'s last
	 * rung is the literal string 'Signed in' -- correct for `ProfileMenu`,
	 * which is always describing the person holding the session, and a claim
	 * about somebody else that is not merely useless but FALSE: a roster row
	 * with no name and no address would have rendered the initials 'SI', which
	 * reads as a person called S. I. rather than as an absence. Found by the
	 * mount test rather than by reading, which is why the case is here.
	 */
	const identified =
		(subject?.display_name ?? '').trim() ||
		(subject?.full_name ?? '').trim() ||
		(subject?.email ?? '').trim();
	if (!identified) return '?';
	return initials({
		id: '',
		email: subject?.email ?? null,
		full_name: subject?.full_name ?? null,
		display_name: subject?.display_name ?? null,
		avatar_url: null,
		avatar: null,
		role: '',
		section_id: null,
		pathway: null,
		preferences: {}
	});
}

/**
 * THE INITIALS TILE IS THE COMMON CASE AND MUST LOOK DELIBERATE.
 *
 * Most people in this school have chosen no avatar, so a roster is mostly
 * tiles; a wall of thirty identical green monograms is worse than no picture
 * at all, because it reads as a rendering failure rather than as a choice. A
 * per-person tint makes the tiles scannable while the INITIALS stay the
 * signal -- colour is never the only signal here, and two people can share a
 * hue without the tile becoming wrong.
 *
 * THE PALETTE IS NOT THE PRESET PALETTE, and that is a measured refusal
 * rather than a preference. `AVATAR_PRESETS` carries eight `fg` values, and
 * they are GLYPH STROKE colours on a dark tile -- `#5500aa` is the violet
 * CLAUDE.md records at 2.88 / 2.45 / 2.30 as TEXT on the three portal
 * grounds ("not a near-miss, unreadable") and `#3b6e8f` is no better. Reusing
 * them as ink would have put eight monograms on screen of which two could not
 * be read. This is `--acc-ink`'s rule in its third costume: the identity may
 * paint a fill, the INK is a separate value, and the move is lightness only.
 *
 * So these are eight hues spread around the wheel at ONE pinned lightness and
 * saturation, which is what makes the whole set clear the 4.5:1 floor
 * together rather than one at a time. Every one is measured on the real
 * ground by `tools/browser-verify/routes/avatars.mjs`; the figures are in
 * this bundle's history entry. Change the lightness and that sweep is what
 * says whether the set still clears.
 */
export const AVATAR_TINTS = [
	'hsl(140 55% 72%)',
	'hsl(190 55% 72%)',
	'hsl(215 55% 74%)',
	'hsl(265 55% 78%)',
	'hsl(310 45% 76%)',
	'hsl(20 55% 74%)',
	'hsl(45 55% 70%)',
	'hsl(95 45% 72%)'
] as const;

/**
 * A STABLE tint for one person, and stable is the whole requirement: a tile
 * that changes hue between two renders of the same roster is a worse signal
 * than no hue. Keyed on whatever identifies the person durably -- the email
 * on a roster row, the uuid where there is one -- never on the array index,
 * which moves the moment the list is sorted or filtered.
 *
 * An empty key answers the first tint rather than throwing: a row with no
 * identity at all still has to paint something, and this is a decoration.
 */
export function avatarTint(key: string | null | undefined): string {
	const k = (key ?? '').trim().toLowerCase();
	if (!k) return AVATAR_TINTS[0];
	// djb2, which is enough for eight buckets and is stable across engines.
	let h = 5381;
	for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0;
	return AVATAR_TINTS[Math.abs(h) % AVATAR_TINTS.length];
}

/**
 * An avatar subject out of a ROSTER ROW, read structurally.
 *
 * The two columns arrive from `classroom_section_roster` once 0179 is applied
 * and are simply ABSENT before it, which is why they are read off a widened
 * shape here rather than added to `ClassroomEnrollment` -- and why there is no
 * capability flag for them. Every other select ladder in this repository
 * reports itself (`notesReady`, `foldersReady`) because a missing column costs
 * a feature; here it costs nothing a viewer can see. Absent columns and "chose
 * no picture" render the identical initials tile, so a flag would turn off a
 * control that does not exist and would say "unavailable" about the state most
 * people are in anyway.
 *
 * The tint key is the EMAIL, because that is what a roster row is keyed on and
 * what stays stable when the list re-sorts. It is lowercased inside
 * `avatarTint`.
 */
export function rosterSubject(row: {
	student_email?: string | null;
	display_name?: string | null;
	avatar?: string | null;
	avatar_url?: string | null;
}): AvatarSubject {
	return {
		avatar: row.avatar ?? null,
		avatar_url: row.avatar_url ?? null,
		display_name: row.display_name ?? null,
		full_name: null,
		email: row.student_email ?? null
	};
}
/**
 * An avatar subject out of a NOTEBOOK GRID ROW (`GridStudent`), read
 * structurally for the same reason `rosterSubject` above is.
 *
 * THE TWO SHAPES ARE NOT THE SAME ROW AND MUST NOT BE MERGED. A classroom
 * roster row is email-keyed and spells the name `display_name`; a grid row is
 * keyed on `student_key` (the email where there is one and the uuid
 * otherwise, because a student who has never signed in has no uuid at all),
 * spells the name `name`, and has already been through
 * `_notebook_section_roster`'s coalesce ladder -- which falls back to
 * `display_name`, then `full_name`, then the address, then the literal
 * 'Student'. So `name` here is ALWAYS a non-empty string and never null,
 * which is why this adapter puts it in `display_name` and leaves `full_name`
 * null: the ladder already ran, in SQL, and re-running a second one in the
 * client is how the grid's row header and its avatar tile would come to
 * disagree about who this is.
 *
 * The two columns arrive from `notebook_get_section_grid` once 0180 is
 * applied and are simply ABSENT before it -- the RPC returns jsonb, so a
 * pre-0180 database omits the keys and they read `undefined`. There is no
 * capability flag for the same reason `rosterSubject` has none: absent
 * columns and "chose no picture" render the identical initials tile, so a
 * flag would turn off a control that does not exist.
 *
 * THE TINT KEY IS `student_key` AND IS THE CALLER'S TO PASS. It is the one
 * field on this row guaranteed present and stable (0094's own argument for
 * it), where `email` is null for an account with no address. This function
 * answers "which picture", never "which colour".
 */
export function gridStudentSubject(row: {
	name?: string | null;
	email?: string | null;
	avatar?: string | null;
	avatar_url?: string | null;
}): AvatarSubject {
	return {
		avatar: row.avatar ?? null,
		avatar_url: row.avatar_url ?? null,
		display_name: row.name ?? null,
		full_name: null,
		email: row.email ?? null
	};
}

/**
 * ===========================================================================
 * THE PROXY: WHERE AN UPLOADED AVATAR'S BYTES ARE ASKED FOR.
 * ===========================================================================
 *
 * `avatars` was a PUBLIC bucket from 0020 until 0181. `avatarUploadUrl` in
 * `$lib/profile.ts` built `<supabase>/storage/v1/object/public/avatars/<key>`
 * and `Avatar.svelte` put that straight in an `src`, so every page that
 * rendered a face also published a permanent, unexpiring, world-readable URL
 * for it into its own HTML.
 *
 * MEASURED, NOT READ OFF THE POLICY: with 0020's `to public` select policy in
 * force an anonymous caller does not have to guess a key. It can LIST them --
 * the policy places no restriction on which rows `public` may select, so
 * `select name from storage.objects where bucket_id = 'avatars'` answers with
 * every object in the bucket. That is why the fix is a boundary and not a
 * longer key: a random filename defends against guessing and not at all
 * against a listing.
 *
 * 0181 makes the bucket private and replaces that policy with one `to
 * authenticated`. These two functions are the client half: an uploaded avatar
 * is asked for at `/api/avatar/<key>` on OUR origin, and
 * `src/routes/api/avatar/[...path]/+server.ts` mints a short-lived signed URL on
 * the CALLER'S OWN client and 302s to it. The policy is the boundary; the
 * route is not.
 *
 * WHY THE REWRITE LIVES HERE AND NOT IN `avatarUploadUrl`. Every surface that
 * shows a face -- the profile menu, the classroom roster, the grading console,
 * the three notebook surfaces, the admin dashboard and the GAUNTLET
 * leaderboard -- mounts `Avatar.svelte`, and `Avatar.svelte` is the ONE place
 * that turns a resolved source into an `src`. Rewriting there reaches all of
 * them with no edit to any of them, which is what let the GAUNTLET leaderboard
 * keep working while being read-only to the bundle that did this.
 * `tests/avatar-proxy.test.ts` sweeps `src/` so it stays the one place.
 */

/**
 * Where an uploaded avatar's bytes are asked for: OUR origin, never Storage's.
 *
 * UNDER `/api/` RATHER THAN AT THE TOP LEVEL, AND THAT IS FORCED RATHER THAN
 * STYLISTIC. A top-level SvelteKit route resolves ahead of the `[shortlink]`
 * catch-all, so `src/routes/avatar/` would make the slug `avatar`
 * permanently unreachable as a short link -- which this repo treats as a
 * schema change: `RESERVED_SLUGS` and `_app_short_link_reserved` have to name
 * the identical set (`tests/short-link-reserved-names.test.ts`), so it costs a
 * migration on the short-link predicate as well as an edit to
 * `$lib/short-links.ts`. 0166 spent a whole migration adding `maps` for
 * exactly this. `api` is already reserved, this is a server route that needs
 * the server (a credential-free mint on the caller's own client), and every
 * other byte-serving route in the tree lives there -- so the same URL costs
 * nothing anybody has to remember.
 */
export const AVATAR_PROXY_PREFIX = '/api/avatar/';

/**
 * A STORAGE KEY IS NOT A TRUSTED STRING, AND THAT IS THE REASON THIS FUNCTION
 * EXISTS RATHER THAN A TEMPLATE LITERAL AT THE CALL SITE.
 *
 * `profiles.avatar` is free text on a row its owner updates DIRECTLY, through
 * 0001's "update own profile" policy, with no CHECK constraint and no
 * validating RPC anywhere in the chain. So `upload:../../anything` is a value
 * a signed-in person can write to their own row today. While the URL was a
 * dead public link that produced a broken image and nothing else; pointed at a
 * route that mints a signed URL from it, the same string becomes an input to a
 * storage key.
 *
 * The shape is therefore ASSERTED rather than escaped: `<uuid>/<filename>`,
 * where the filename carries no separator and no traversal. Anything else
 * answers null and the caller renders the initials tile -- the same tile a
 * person who chose no picture gets, which is what makes a malformed value
 * indistinguishable from an absent one.
 *
 * It is deliberately the SAME predicate the server route applies. Two
 * spellings of "is this a real key" is the pair that stops agreeing, and the
 * half that would go quiet is the server's.
 */
const AVATAR_KEY_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/[A-Za-z0-9._-]{1,120}$/;

/**
 * The storage key inside an `upload:<key>` value, or null for anything else --
 * a preset, a Google photo, an absent avatar, or a key that is not one.
 */
export function avatarObjectKey(chosen: string | null | undefined): string | null {
	const v = (chosen ?? '').trim();
	if (!v.startsWith('upload:')) return null;
	const key = v.slice('upload:'.length);
	if (!AVATAR_KEY_RE.test(key)) return null;
	// A leading or trailing dot on the filename half cannot make `.` or `..`
	// past the regex above (both are shorter than the uuid segment it demands
	// first), but a filename that IS `.` or `..` still resolves oddly in a URL,
	// so it is refused by name rather than by argument.
	const file = key.slice(key.indexOf('/') + 1);
	if (file === '.' || file === '..') return null;
	return key;
}

/**
 * The URL an uploaded avatar is asked for. Each segment is encoded: the key
 * has already been through `avatarObjectKey`, so nothing here can be a
 * traversal, but a route that depended on its input being clean would be one
 * regex edit away from not being.
 */
export function avatarProxyUrl(key: string): string {
	return AVATAR_PROXY_PREFIX + key.split('/').map(encodeURIComponent).join('/');
}

/**
 * The ONE rewrite, applied to a source `avatarSource` has already resolved.
 *
 * It moves ONLY the `upload:` case, and the two it leaves alone are the reason
 * it takes the raw `avatar` value rather than sniffing the resolved URL:
 *
 *   * A GOOGLE PHOTO is a `googleusercontent.com` URL. It is not in our store,
 *     it is not ours to gate, and routing it through a proxy of ours would
 *     make our server fetch a third party on every roster render for no
 *     boundary at all.
 *   * A PRESET is inline SVG and makes no request.
 *
 * A malformed `upload:` value falls through to `initials`, which is the tile
 * -- so it renders as an absence rather than as a hole, and it is the same
 * tile a refused image ends on.
 */
export function proxiedAvatarSource(
	chosen: string | null | undefined,
	resolved: AvatarSource,
	fallbackText: string
): AvatarSource {
	if (!(chosen ?? '').trim().startsWith('upload:')) return resolved;
	const key = avatarObjectKey(chosen);
	if (!key) return { kind: 'initials', text: fallbackText };
	return { kind: 'image', url: avatarProxyUrl(key) };
}
