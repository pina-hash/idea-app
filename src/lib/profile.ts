/**
 * Global user profile: shared types, avatar presets, and helpers for the
 * profile system (0020_profiles_identity.sql). PLAIN DATA + pure helpers
 * (client-safe, like curriculum.ts); the ProfileMenu / Avatar components
 * consume this.
 */
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { SupabaseClient } from '@supabase/supabase-js';
import { feedbackColumnMissing as columnMissing } from '$lib/feedback/feedback';
import type { BackgroundType, BackgroundValue, IdentityStyle } from '$lib/identity-style';

/** The profile row as loaded for the signed-in user by the root layout. */
export interface UserProfile {
	id: string;
	email: string | null;
	full_name: string | null;
	display_name: string | null;
	/** Google photo from the OAuth metadata (fallback picture). */
	avatar_url: string | null;
	/** Chosen picture: 'preset:<id>', 'upload:<storage path>', or null. */
	avatar: string | null;
	role: string;
	section_id: string | null;
	/** Bosco Tech pathway code (src/lib/pathways.ts) or null until chosen. */
	pathway: string | null;
	/** Free-form per-user portal settings (theme, homepage layout, ...). */
	preferences: Record<string, unknown>;
	/**
	 * When the user completed or skipped the first-time portal tour (0045).
	 * Null = never seen, so the homepage auto-launches it once. Undefined = the
	 * column is not readable yet (migration unapplied): the tour fails soft, no
	 * auto-launch and no write.
	 */
	tour_completed_at?: string | null;
	/**
	 * THE SIX IDENTITY-STYLE COLUMNS (0220). Present and null for a person who
	 * has customized nothing, which is everybody until they do; UNDEFINED when
	 * the migration is not applied yet, which is the same distinction
	 * `tour_completed_at` already carries and for the same reason. `profileStyle`
	 * below is the one place that difference is read, so no surface has to
	 * spell out "cannot tell" for itself.
	 */
	style_background_type?: BackgroundType | null;
	style_background_value?: BackgroundValue | null;
	style_accent_color?: string | null;
	style_badge?: string | null;
	style_flourish?: string | null;
	style_tagline?: string | null;
}

// Columns loaded for the signed-in user's own profile. Selecting a column
// that doesn't exist errors the whole query, so unapplied migrations degrade
// stepwise rather than losing the profile: `_NO_STYLE` is the pre-0220 shape
// (the six style columns stay undefined, so the identity controls report
// themselves unavailable rather than silently saving nothing), `_NO_TOUR` the
// pre-0045 one, `_LEGACY` the pre-0038 one (no pathway either).
//
// THE STYLE COLUMNS GET THEIR OWN RUNG, never a fold into an existing one.
// 0220 is applied by hand, so a deployment carrying this client without it is
// a real state -- and folding the six columns into the `tour_completed_at`
// rung would mean an unapplied 0220 costing the tour its column too, which is
// the "a new capability gets its OWN rung, never fold it into an existing one"
// rule. `styleReady` on the returned profile is what each rung reports.
const PROFILE_SELECT_BASE =
	'id, email, full_name, display_name, avatar_url, avatar, role, section_id, pathway, preferences';
const PROFILE_STYLE_COLUMNS =
	'style_background_type, style_background_value, style_accent_color, style_badge, style_flourish, style_tagline';
const PROFILE_SELECT = `${PROFILE_SELECT_BASE}, tour_completed_at, ${PROFILE_STYLE_COLUMNS}`;
const PROFILE_SELECT_NO_STYLE = `${PROFILE_SELECT_BASE}, tour_completed_at`;
const PROFILE_SELECT_NO_TOUR = PROFILE_SELECT_BASE;
const PROFILE_SELECT_LEGACY =
	'id, email, full_name, display_name, avatar_url, avatar, role, section_id, preferences';

/**
 * Load a signed-in user's own profile row through the given Supabase client.
 * Works with either the server or browser client, so both the SSR load and the
 * client-side hydration self-heal can use it. Returns null if the row isn't
 * readable (missing, or blocked by RLS because the request wasn't authed yet).
 *
 * THE LADDER STEPS DOWN ON THE ERROR CODE, NEVER ON AN ABSENT ROW, and the
 * difference is not academic. It used to retry on `!data`, but `maybeSingle()`
 * answers `data: null, error: null` for a row that is simply NOT THERE -- which
 * is the ordinary shape of the sign-in transient the caller in
 * `+layout.server.ts` exists to cover. So every one of those walked all three
 * rungs, and that caller then slept 200ms and walked them again: up to SIX
 * round trips plus 200ms to learn a thing the first rung already knew. Keyed on
 * the code, an absent row costs exactly one round trip and the happy path is
 * unchanged at one.
 *
 * A NARROWER RUNG IS ONLY WORTH ASKING FOR WHEN A COLUMN IS MISSING, which is
 * the one thing these three selects differ by (0045's `tour_completed_at`,
 * 0038's `pathway`). Anything else -- RLS, a transport failure, a malformed
 * request -- is answered the same way by all three, so retrying it is three
 * round trips to receive one refusal three times.
 *
 * `columnMissing` IS THE REPO'S ONE STATEMENT OF THAT RULE and is imported
 * rather than re-spelled here. Its `feedback` prefix says where it was born,
 * not what it does -- the `_notebook_email_for_user` situation -- and a second
 * copy under a `profile` name is exactly the pair that stops matching when
 * PostgREST changes which of `PGRST204` / `42703` it answers with.
 */
export async function fetchUserProfile(
	supabase: SupabaseClient,
	userId: string
): Promise<UserProfile | null> {
	const rungs = [
		PROFILE_SELECT,
		PROFILE_SELECT_NO_STYLE,
		PROFILE_SELECT_NO_TOUR,
		PROFILE_SELECT_LEGACY
	];

	for (let rung = 0; rung < rungs.length; rung++) {
		const { data, error } = await supabase
			.from('profiles')
			.select(rungs[rung])
			.eq('id', userId)
			.maybeSingle();

		if (!error) {
			/* The legacy rung has no `pathway` column to return, so the shape is
			   completed here rather than left undefined -- unchanged behaviour,
			   just moved with the select it belongs to. */
			if (data && rungs[rung] === PROFILE_SELECT_LEGACY) {
				/* Through `unknown`: with a non-literal select string PostgREST's
				   types widen `data` to include its error shape, which does not
				   overlap a plain record. The runtime value here is a row. */
				(data as unknown as Record<string, unknown>).pathway = null;
			}
			return (data as unknown as UserProfile) ?? null;
		}

		/* Only a missing column earns the next rung down; every other error is
		   this read's answer, and there is nothing narrower to ask after the
		   last one. */
		if (!columnMissing((error as { code?: string }).code)) return null;
	}

	return null;
}

/** The name to show for a user anywhere in the portal. */
export function displayName(profile: UserProfile | null | undefined): string {
	return profile?.display_name?.trim() || profile?.full_name?.trim() || profile?.email || 'Signed in';
}

/** Uppercase initials (max 2) for the fallback avatar tile. */
export function initials(profile: UserProfile | null | undefined): string {
	const name = displayName(profile);
	const parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
	const chars = parts.slice(0, 2).map((p) => p[0]);
	return (chars.join('') || '?').toUpperCase();
}

// ---------------------------------------------------------------------------
// AVATAR PRESETS.
//
// Originally eight single-stroke geometric marks ("original geometric marks in
// the program palette"). Ledger 0289 raises the set rather than replacing it,
// answering report 14 ("the default picture selections ... are very mundane and
// uninteresting ... should be much higher quality ... and there should be more
// options") and report 24, a student asking to "add the phone cat to the mascot
// pack" -- a pack that did not exist. It does now: see AVATAR_TIERS.
//
// EVERY EXISTING ID STILL WORKS, AND THAT IS A HARD CONSTRAINT RATHER THAN A
// COURTESY. `profiles.avatar` is free text holding 'preset:<id>', so every id
// below may already be sitting in a real row; dropping or renaming one turns a
// person's chosen picture into an initials tile with nothing anywhere saying
// why. The eight original entries are unchanged in id, label and artwork.
//
// TWO OF THEM CHANGED COLOUR, AND ONLY THEIR LIGHTNESS. Measured as glyph
// strokes on the six portal grounds (three in the default palette, three in
// matrix), `gear` (#3b6e8f) came out at worst 2.57:1 and `wave` (#5500aa) at
// worst 1.33:1 -- against the 3:1 floor a GRAPHICAL OBJECT carries. A student
// who picked Waveform was getting a mark that was very nearly not there, which
// is report 14's complaint in its most literal form. `$lib/avatars.ts` records
// that both values were refused as INITIALS INK for the same reason; what
// nobody had measured is that they also failed as the stroke they were kept
// for. The repair is `--acc-ink`'s rule: the hue and the saturation are the
// identity and do not move, the LIGHTNESS does. 203.6deg/41.6% stays and 39.6%
// becomes 47.8% (3.53:1); 270deg/100% stays and 33.3% becomes 65.5% (3.51:1).
// A violet waveform is still a violet waveform; it is now visible.
//
// THE NINE NEW MARKS SHARE ONE PINNED SATURATION AND LIGHTNESS (62%, 65%) with
// their hues spread around the wheel, which is the shape `AVATAR_TINTS` uses
// and for the same reason: it makes the whole set clear the floor TOGETHER
// rather than one entry at a time, so adding a tenth hue is checked by one
// sweep. Worst in the set is 3.95:1 (`orbit`, on the default --bg2). Every
// figure is re-measured by tools/browser-verify/routes/avatars.mjs against the
// real rendered ground; the table is in this bundle's history entry.
// ---------------------------------------------------------------------------

/**
 * WHICH GROUP A MARK BELONGS TO. The tiers exist so a picker can say what it
 * is offering -- eighteen unlabelled glyphs in one grid is a worse control
 * than eight was. `undefined` means `geometric`, so the eight original entries
 * did not have to be touched to gain one.
 */
export type AvatarTier = 'geometric' | 'creature' | 'instrument';

export const AVATAR_TIERS: { id: AvatarTier; label: string; note: string }[] = [
	{ id: 'geometric', label: 'Marks', note: 'Abstract geometry.' },
	{ id: 'creature', label: 'Mascots', note: 'Original line-art animals.' },
	{ id: 'instrument', label: 'Instruments', note: 'Things from the shop.' }
];

/**
 * One drawn element of a preset. A mark is STROKED in the preset's `fg` unless
 * it names a `fill`, which is what lets a figurative mark have a pupil or a
 * nose without a second rendering mechanism.
 *
 * `rotate` is degrees about the 24x24 centre, and it earns its place on the
 * symmetric marks: a turbine's three blades and an orbit's ring are one path
 * each plus an angle, where writing the rotated coordinates out by hand is
 * three chances to mistype a curve and no way to see which one is wrong.
 */
export interface AvatarMark {
	d: string;
	/** Filled with this colour instead of stroked. */
	fill?: string;
	/** Stroke colour; defaults to the preset's `fg`. */
	stroke?: string;
	/** Stroke width; defaults to 1.5, the value every original mark is drawn at. */
	width?: number;
	/** Degrees clockwise about (12, 12). */
	rotate?: number;
}

export interface AvatarPreset {
	id: string;
	label: string;
	/** Glyph stroke color (theme hex). */
	fg: string;
	/**
	 * SVG path data, 24x24 viewBox, stroked. STILL REQUIRED AND STILL THE
	 * PRIMARY PATH: every one of the eight original presets is exactly this
	 * field and nothing else, so widening the type cost them no edit.
	 */
	d: string;
	/** Drawn after `d`. Absent on every original mark. */
	marks?: AvatarMark[];
	/** Absent means `geometric`. */
	tier?: AvatarTier;
}

/**
 * EVERY DRAWN ELEMENT OF A PRESET, IN ORDER, AND THE ONE IMPLEMENTATION OF
 * "how does a preset draw". Two surfaces render a preset -- `Avatar.svelte`
 * and the picker in `ProfileMenu.svelte` -- and before this they each carried
 * their own `<path d={preset.d} />`. Two copies were survivable while a preset
 * was one path; with `marks` they would be a picker showing a cat with no eyes
 * beside an avatar showing a cat with eyes, and nothing would report it.
 */
export function presetMarks(preset: AvatarPreset): AvatarMark[] {
	return [{ d: preset.d }, ...(preset.marks ?? [])];
}

export function presetTier(preset: AvatarPreset): AvatarTier {
	return preset.tier ?? 'geometric';
}

/** The transform attribute for a mark, or undefined when it is not rotated. */
export function markTransform(mark: AvatarMark): string | undefined {
	return mark.rotate ? `rotate(${mark.rotate} 12 12)` : undefined;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
	// --- The original eight. Ids, labels and artwork unchanged; see the header
	//     for the two lightness repairs.
	{ id: 'hex', label: 'Hex prism', fg: '#00ff41', d: 'M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5zM12 2.5v9.5m0 0l8.2 4.75M12 12l-8.2 4.75' },
	{ id: 'cube', label: 'Iso cube', fg: '#00f0ff', d: 'M12 3l7 4v10l-7 4-7-4V7zM5 7l7 4 7-4M12 11v10' },
	{ id: 'triad', label: 'Origin triad', fg: '#c8ff00', d: 'M12 13V4m0 9l7.5 4.5M12 13l-7.5 4.5M12 13h.01' },
	{ id: 'reticle', label: 'Reticle', fg: '#88ddff', d: 'M12 5a7 7 0 110 14 7 7 0 010-14zm0-3v4m0 12v4M2 12h4m12 0h4' },
	{ id: 'bolt', label: 'Bolt', fg: '#00aa88', d: 'M13 2L6 13.5h5L10 22l8-11.5h-5.5z' },
	{ id: 'gear', label: 'Gear', fg: '#4785ad', d: 'M12 8.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7zm0-6v4m0 11v4m9.5-9.5h-4m-11 0h-4m15.8-6.3l-2.9 2.9M7.6 16.4l-2.9 2.9m14.6 0l-2.9-2.9M7.6 7.6L4.7 4.7' },
	{ id: 'wave', label: 'Waveform', fg: '#a74fff', d: 'M2 12h3l2-6 3 12 3-9 2 5 2-2h5' },
	{ id: 'delta', label: 'Delta wing', fg: '#ff8c00', d: 'M12 3l8.5 17.5L12 17l-8.5 3.5zM12 3v14' },

	// --- MASCOTS. This is the pack report 24 asked to add to and that did not
	//     exist; the cat is the answer to that ask, drawn here as an ORIGINAL
	//     line mark in the house format rather than as a copy of the picture
	//     the student had in mind. See this bundle's history entry for what to
	//     tell him.
	{
		id: 'cat',
		label: 'Cat',
		fg: '#ddaf6e',
		tier: 'creature',
		d: 'M5.4 13.8a6.6 6.6 0 1 1 13.2 0 6.6 6.6 0 0 1-13.2 0z',
		marks: [
			{ d: 'M7.1 8.8 6.1 3.5l4.7 2.7M16.9 8.8 17.9 3.5l-4.7 2.7' },
			{ d: 'M9.5 12.4a1 1 0 1 1 0 2 1 1 0 0 1 0-2z', fill: 'currentColor' },
			{ d: 'M14.5 12.4a1 1 0 1 1 0 2 1 1 0 0 1 0-2z', fill: 'currentColor' },
			{ d: 'M12 16.2 10.9 15h2.2z', fill: 'currentColor' },
			{ d: 'M12 16.2v1.1m0 0c0 .8-.7 1.2-1.5 1.1m1.5-1.1c0 .8.7 1.2 1.5 1.1', width: 1.2 },
			{ d: 'M2.7 13.2 5.7 13.6M2.7 16.1 5.7 15.3M21.3 13.2 18.3 13.6M21.3 16.1 18.3 15.3', width: 1.1 }
		]
	},
	{
		id: 'fox',
		label: 'Fox',
		fg: '#dd8a6e',
		tier: 'creature',
		d: 'M12 21.4 7 15.2 7.8 8.4 12 10.4l4.2-2 .8 6.8z',
		marks: [
			{ d: 'M7.8 8.4 6.4 3.4l4.2 2.7M16.2 8.4 17.6 3.4l-4.2 2.7' },
			{ d: 'M9.7 13a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z', fill: 'currentColor' },
			{ d: 'M14.3 13a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z', fill: 'currentColor' },
			{ d: 'M12 18.6 11.1 17.4h1.8z', fill: 'currentColor' }
		]
	},
	{
		id: 'owl',
		label: 'Owl',
		fg: '#6eb8dd',
		tier: 'creature',
		d: 'M12 3.8c4.1 0 6.9 3 6.9 7.2 0 5.5-3 9.2-6.9 9.2s-6.9-3.7-6.9-9.2c0-4.2 2.8-7.2 6.9-7.2z',
		marks: [
			{ d: 'M6.7 6.2 5.3 3.4M17.3 6.2 18.7 3.4' },
			{ d: 'M6.5 10.6a2.4 2.4 0 1 1 4.8 0 2.4 2.4 0 0 1-4.8 0zM12.7 10.6a2.4 2.4 0 1 1 4.8 0 2.4 2.4 0 0 1-4.8 0z', width: 1.3 },
			{ d: 'M8.9 9.75a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7z', fill: 'currentColor' },
			{ d: 'M15.1 9.75a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7z', fill: 'currentColor' },
			{ d: 'M12 11.8 10.9 13.9h2.2z', fill: 'currentColor' },
			{ d: 'M10.1 20.1v1.5M13.9 20.1v1.5', width: 1.2 }
		]
	},
	{
		id: 'bear',
		label: 'Bear',
		fg: '#af6edd',
		tier: 'creature',
		d: 'M5.6 13.6a6.4 6.4 0 1 1 12.8 0 6.4 6.4 0 0 1-12.8 0z',
		marks: [
			{ d: 'M7.2 6.2a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zM16.8 6.2a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z' },
			{ d: 'M9 16.4a3 2.4 0 1 1 6 0 3 2.4 0 0 1-6 0z', width: 1.2 },
			{ d: 'M9.6 11.6a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z', fill: 'currentColor' },
			{ d: 'M14.4 11.6a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z', fill: 'currentColor' },
			{ d: 'M12 15.9 10.8 14.6h2.4z', fill: 'currentColor' }
		]
	},
	{
		id: 'axolotl',
		label: 'Axolotl',
		fg: '#dd6eb8',
		tier: 'creature',
		d: 'M12 6.2c3 0 5.4 2.3 5.4 5.1 0 1.4-.6 2.7-1.5 3.6l.9 5.6H7.2l.9-5.6a5 5 0 0 1-1.5-3.6c0-2.8 2.4-5.1 5.4-5.1z',
		marks: [
			{ d: 'M6.7 9.1 3.2 7.2M6.6 11.5 2.8 11.3M6.9 13.9 3.4 15.6M17.3 9.1 20.8 7.2M17.4 11.5 21.2 11.3M17.1 13.9 20.6 15.6', width: 1.2 },
			{ d: 'M9.8 10.3a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7z', fill: 'currentColor' },
			{ d: 'M14.2 10.3a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7z', fill: 'currentColor' },
			{ d: 'M10.3 13.5c.6.6 1.1.9 1.7.9s1.1-.3 1.7-.9', width: 1.2 }
		]
	},

	// --- INSTRUMENTS. The abstract half of report 14's "more options": richer
	//     multi-path marks for somebody who does not want an animal.
	{
		id: 'compass',
		label: 'Compass',
		fg: '#6edddd',
		tier: 'instrument',
		d: 'M12 5.2 7 19.6M12 5.2l5 14.4',
		marks: [
			{ d: 'M12 3.4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z', fill: 'currentColor' },
			{ d: 'M7.7 17.6a8.8 8.8 0 0 0 8.6 0', width: 1.2 },
			{ d: 'M7 19.6 6.1 21.2M17 19.6l.9 1.6', width: 1.2 }
		]
	},
	{
		id: 'turbine',
		label: 'Turbine',
		fg: '#6edda6',
		tier: 'instrument',
		d: 'M12 10.3a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z',
		marks: [
			{ d: 'M12.9 10.5 15.2 3.2c2.9 1.4 4.3 4.3 3.3 7.2z' },
			{ d: 'M12.9 10.5 15.2 3.2c2.9 1.4 4.3 4.3 3.3 7.2z', rotate: 120 },
			{ d: 'M12.9 10.5 15.2 3.2c2.9 1.4 4.3 4.3 3.3 7.2z', rotate: 240 }
		]
	},
	{
		id: 'circuit',
		label: 'Circuit',
		fg: '#a6dd6e',
		tier: 'instrument',
		d: 'M8.4 8.4h7.2v7.2H8.4z',
		marks: [
			{ d: 'M3.6 12h4.8M15.6 12h4.8M12 3.6v4.8M12 15.6v4.8' },
			{ d: 'M3.6 12a.95.95 0 1 1 0-.02zM20.4 12a.95.95 0 1 1 0-.02zM12 3.6a.95.95 0 1 1 0-.02zM12 20.4a.95.95 0 1 1 0-.02z', fill: 'currentColor' },
			{ d: 'M10.6 10.6h2.8v2.8h-2.8z', width: 1.1 }
		]
	},
	{
		id: 'orbit',
		label: 'Orbit',
		fg: '#6e81dd',
		tier: 'instrument',
		d: 'M12 7.9a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2z',
		marks: [
			{ d: 'M2.5 12a9.5 3.4 0 1 1 19 0 9.5 3.4 0 0 1-19 0z', rotate: -28, width: 1.2 },
			{ d: 'M19.3 6.4a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3z', fill: 'currentColor' }
		]
	}
];

export function presetById(id: string | null | undefined): AvatarPreset | undefined {
	if (!id) return undefined;
	return AVATAR_PRESETS.find((p) => p.id === id);
}

/** Public URL of an uploaded avatar path in the 'avatars' bucket. */
export function avatarUploadUrl(path: string): string {
	return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}

/**
 * Resolve a profile's picture to what the Avatar component should render.
 * Priority: chosen preset -> chosen upload -> Google photo -> initials tile.
 */
export type AvatarSource =
	| { kind: 'preset'; preset: AvatarPreset }
	| { kind: 'image'; url: string }
	| { kind: 'initials'; text: string };

export function avatarSource(profile: UserProfile | null | undefined): AvatarSource {
	const chosen = profile?.avatar ?? '';
	if (chosen.startsWith('preset:')) {
		const preset = presetById(chosen.slice('preset:'.length));
		if (preset) return { kind: 'preset', preset };
	}
	if (chosen.startsWith('upload:')) {
		return { kind: 'image', url: avatarUploadUrl(chosen.slice('upload:'.length)) };
	}
	if (profile?.avatar_url) return { kind: 'image', url: profile.avatar_url };
	return { kind: 'initials', text: initials(profile) };
}

/**
 * THE VIEWER'S OWN IDENTITY STYLE, or null when they have customized nothing.
 *
 * THIS IS THE WHOLE OF WHY REPORT 15 COST NO CONSUMER AN EDIT. The root layout
 * loads this row once as `userProfile`, a key no page load shadows, so every
 * surface in the portal that renders the signed-in person already holds it --
 * and `PROFILE_SELECT` above is in this file. Widening the select and reading
 * it here is therefore the entire pipe for the viewer's own identity; the
 * sixty-nine mastheads that mount `ProfileMenu` inherit it without being
 * touched. See `$lib/avatars.ts` for the other half of the story, which is the
 * one that is NOT free: somebody else's style has to arrive through whichever
 * RPC feeds that surface.
 *
 * NULL MEANS TWO DIFFERENT THINGS AND CALLERS MUST NOT CONFLATE THEM, which is
 * what `profileStyleReady` is for: a person who has chosen nothing, and a
 * deployment where 0220 is not applied. The first renders the plain identity
 * and offers the controls; the second renders the plain identity and must say
 * the controls are unavailable rather than showing a picker whose save will be
 * refused by a column that is not there.
 */
export function profileStyle(profile: UserProfile | null | undefined): IdentityStyle | null {
	if (!profileStyleReady(profile)) return null;
	const style: IdentityStyle = {
		background_type: profile?.style_background_type ?? null,
		background_value: profile?.style_background_value ?? null,
		accent_color: profile?.style_accent_color ?? null,
		badge: profile?.style_badge ?? null,
		flourish: profile?.style_flourish ?? null,
		tagline: profile?.style_tagline ?? null
	};
	return style;
}

/**
 * Whether this deployment could tell us about a style at all: the widest rung
 * came back, so the columns exist. Keyed on `undefined` rather than on a
 * truthy value, because "chose no accent" is null and must not read as
 * "cannot tell" -- the `rankStateReady` distinction, in its second costume.
 */
export function profileStyleReady(profile: UserProfile | null | undefined): boolean {
	return profile != null && profile.style_accent_color !== undefined;
}

/**
 * Shared sign-out: also wipes this account's local VANGUARD state so the next
 * user of a shared/lab machine does not inherit it (vanguard_did, the
 * anonymous device cohort id, stays). Mirrors the original homepage sign-out.
 */
export async function signOutEverywhere(supabase: SupabaseClient): Promise<void> {
	await supabase.auth.signOut();
	try {
		for (let i = localStorage.length - 1; i >= 0; i--) {
			const k = localStorage.key(i);
			if (k && k.indexOf('vanguard_') === 0 && k !== 'vanguard_did') localStorage.removeItem(k);
		}
	} catch {
		/* localStorage unavailable; nothing to clear */
	}
}
