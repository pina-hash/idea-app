/**
 * IDENTITY STYLE: the pure layer a customized identity renders from, shared by
 * IDEA Tournaments and by a person's own profile.
 *
 * WHY THIS MODULE EXISTS. Every helper below was written for
 * `$lib/tournaments/entry-styles.ts` (0064, Phase 2b) and every one of them
 * already took a style RECORD and knew nothing about tournaments -- the
 * registries, the CSS derivation, the luminance-driven ink. What was
 * tournament-shaped was the TYPE they were declared against: `EntryStyle`
 * carries `entry_id` and `tournament_id`, so consuming them from a profile
 * surface meant either inventing two ids that mean nothing or writing the
 * arithmetic a second time. A second implementation of "what is this colour's
 * ink" is the thing that quietly stops matching, so the type is what moved and
 * the code did not.
 *
 * `entry-styles.ts` RE-EXPORTS ALL OF IT, so no tournament surface changed and
 * `EntryStyle` still means what it meant. That file keeps exactly what is
 * genuinely about tournaments: the row type with its two ids, and `styleMap`,
 * which keys rows by entry.
 *
 * WHAT IS DELIBERATELY NOT HERE. The tournament ALLOWLIST lives in the database
 * (0064's CHECK constraints) and the profile allowlist lives in 0220's; this
 * module carries the label and the artwork for the ids, which is what it always
 * did. Adding a badge or a flourish means editing this file AND both
 * migrations, in the same change -- the note 0064 carries, now with a second
 * table under it.
 */

export type BackgroundType = 'solid' | 'gradient' | 'image';
export type BackgroundValue = string | [string, string];

/**
 * The six fields a customized identity is made of, and the whole of what a
 * renderer needs. A row type adds its own key (`EntryStyle` adds `entry_id`,
 * a profile carries them as columns on `profiles`); nothing here reads one.
 */
export interface IdentityStyle {
	background_type: BackgroundType | null;
	background_value: BackgroundValue | null;
	accent_color: string | null;
	badge: string | null;
	flourish: string | null;
	tagline: string | null;
}

/** A style as an editor holds it before it is saved. */
export type IdentityStyleDraft = IdentityStyle;

export const EMPTY_STYLE: IdentityStyleDraft = {
	background_type: null,
	background_value: null,
	accent_color: null,
	badge: null,
	flourish: null,
	tagline: null
};

/**
 * Accent presets offered to students, ordered around the color wheel from
 * red. Deliberately NOT green-dominated: emerald is one option of eight and
 * is never the default -- an uncustomized identity has no accent at all and
 * falls back to NEUTRAL_ACCENT until its owner picks one. A freeform picker
 * sits beside these in the tournament editor, so this list is a starting
 * point, not a limit.
 *
 * THESE ARE FILL AND EDGE COLOURS, NEVER INK, and that is the `--acc-ink`
 * rule rather than a preference: an accent paints a rule, a ring and a badge
 * on a ground this module does not choose, and the text beside it is the
 * room's own ink. `bannerInk` below is the one place a text colour is derived,
 * and it derives it from the BACKGROUND rather than from the accent. Anything
 * that wants to paint a WORD in an accent has a contrast measurement to make
 * first; see `$lib/avatars.ts`'s `AVATAR_TINTS` header for the same refusal in
 * its first costume.
 */
export const ACCENT_PRESETS: { id: string; label: string; hex: string }[] = [
	{ id: 'red', label: 'Red', hex: '#e5484d' },
	{ id: 'orange', label: 'Orange', hex: '#f76b15' },
	{ id: 'gold', label: 'Gold', hex: '#efb539' },
	{ id: 'emerald', label: 'Emerald', hex: '#0fbe7a' },
	{ id: 'cyan', label: 'Cyan', hex: '#22cccc' },
	{ id: 'blue', label: 'Blue', hex: '#3e7bfa' },
	{ id: 'violet', label: 'Violet', hex: '#8e5bf0' },
	{ id: 'pink', label: 'Pink', hex: '#ec4899' }
];

/** What an identity with no accent set renders as: neutral, never emerald. */
export const NEUTRAL_ACCENT = '#8a938c';

/**
 * THE BADGE SET: EIGHT EMBLEMS, AND THE ART IS REDRAWN IN PLACE, NEVER THE IDS
 * (ledger 0360, report R16). The ids are stored -- 0064's tournament CHECK,
 * 0220's `profiles_style_badge_ck` and every class-theme vote row name them --
 * so the LIST IS APPEND-ONLY and the order below is the order every picker
 * shows. What an id LOOKS like is not stored anywhere, so redrawing one is a
 * code change with no migration, and every surface that draws a badge picks
 * the new art up at once because they all go through `BadgeIcon`.
 *
 * WHY THEY WERE REDRAWN. The first set was one stroked outline each, which on
 * a raised key reads as an emoji someone typed rather than a mark that belongs
 * to the plate, and the gear was a twelve-point zigzag with no flat tooth on
 * it: a sun, not a gear. Each emblem is now built the way the Plate look builds
 * a control, in three layers of ONE ink (`currentColor`, so a key, a banner and
 * a chip each paint it in their own measured colour and nothing here names a
 * colour):
 *
 *   faces    a recessed face, filled with the ink at a low mix. Two faces that
 *            overlap compound, which is how a bevel gets a lit half and a
 *            shaded half without a second colour.
 *   paths    the OUTLINE, stroked at the house 1.6. Never empty for a real
 *            badge: `paths.length > 0` is the has-a-badge predicate three
 *            classroom surfaces read, and `class-theme.ts` copies this array BY
 *            REFERENCE.
 *   details  thin lines at reduced strength: a facet, a bevel, a rim, a
 *            highlight. They add the machining at 20px and up and fall away
 *            harmlessly at 11px, where the outline and the faces carry it.
 *   solids   small marks in the full ink -- a jewel, an eye socket, a window --
 *            the parts that have to survive the smallest size.
 *
 * THE GEAR IS A REAL GEAR: eight flat-topped trapezoid teeth (tip radius 10.3,
 * root radius 7.5) around a bored hub, so the silhouette is a spur gear at any
 * size. `tests/badge-art.test.ts` counts its teeth from this path.
 *
 * `motion` NAMES THE ONE SHORT BEAT `BadgeIcon` PLAYS -- a quarter-second-scale
 * gesture that ends exactly on the rest frame, never a loop, and only under
 * `prefers-reduced-motion: no-preference`. It is required, so an emblem added
 * without one is a type error rather than a still badge among moving ones.
 */
export type BadgeMotion = 'flash' | 'flicker' | 'twinkle' | 'sheen' | 'turn' | 'nod' | 'glint' | 'lift';

export const BADGE_MOTIONS: readonly BadgeMotion[] = [
	'flash',
	'flicker',
	'twinkle',
	'sheen',
	'turn',
	'nod',
	'glint',
	'lift'
];

export interface BadgeDef {
	id: string;
	label: string;
	/** The outline, stroked on a 24x24 grid (the pathways.ts inline-icon convention). Never empty. */
	paths: string[];
	/** Recessed faces, filled with a low mix of the ink and drawn first (evenodd). */
	faces?: string[];
	/** Facets, bevels and highlights: thin strokes at reduced strength, drawn over the outline. */
	details?: string[];
	/** Small marks in the full ink, drawn last. */
	solids?: string[];
	/** The one-shot beat `BadgeIcon` plays; never a loop. */
	motion: BadgeMotion;
}

const GEAR_OUTLINE =
	'M10.5 4.65L10.74 1.78A10.3 10.3 0 0 1 13.26 1.78L13.5 4.65A7.5 7.5 0 0 1 16.14 5.75L18.34 3.88A10.3 10.3 0 0 1 20.12 5.66L18.25 7.86A7.5 7.5 0 0 1 19.35 10.5L22.22 10.74A10.3 10.3 0 0 1 22.22 13.26L19.35 13.5A7.5 7.5 0 0 1 18.25 16.14L20.12 18.34A10.3 10.3 0 0 1 18.34 20.12L16.14 18.25A7.5 7.5 0 0 1 13.5 19.35L13.26 22.22A10.3 10.3 0 0 1 10.74 22.22L10.5 19.35A7.5 7.5 0 0 1 7.86 18.25L5.66 20.12A10.3 10.3 0 0 1 3.88 18.34L5.75 16.14A7.5 7.5 0 0 1 4.65 13.5L1.78 13.26A10.3 10.3 0 0 1 1.78 10.74L4.65 10.5A7.5 7.5 0 0 1 5.75 7.86L3.88 5.66A10.3 10.3 0 0 1 5.66 3.88L7.86 5.75A7.5 7.5 0 0 1 10.5 4.65Z';
const GEAR_HUB = 'M12 8.8A3.2 3.2 0 1 1 12 15.2A3.2 3.2 0 1 1 12 8.8Z';

export const BADGES: BadgeDef[] = [
	{
		id: 'bolt',
		label: 'Bolt',
		paths: ['M13.4 2 4.6 13.4h6.6L10.4 22l9-11.6h-6.6z'],
		faces: ['M13.4 2 4.6 13.4h6.6L10.4 22l9-11.6h-6.6z', 'M11.2 13.4 10.4 22l9-11.6h-6.6z'],
		details: ['M12.2 5.7 7.9 11.4'],
		motion: 'flash'
	},
	{
		id: 'flame',
		label: 'Flame',
		paths: [
			'M12 2.4c3.6 3.7 6.4 6.9 6.4 11.2a6.4 6.4 0 0 1-12.8 0c0-2.4 1.1-4.2 2.4-5.4.3 1.8 1.2 2.9 2.4 3.5C10 8.8 10.6 5.6 12 2.4z'
		],
		faces: [
			'M12 2.4c3.6 3.7 6.4 6.9 6.4 11.2a6.4 6.4 0 0 1-12.8 0c0-2.4 1.1-4.2 2.4-5.4.3 1.8 1.2 2.9 2.4 3.5C10 8.8 10.6 5.6 12 2.4z'
		],
		details: ['M15.2 9.6c.9 1.2 1.4 2.5 1.4 4'],
		solids: ['M12 12.2c1.7 1.7 2.8 3.1 2.8 4.7a2.8 2.8 0 0 1-5.6 0c0-1.5 1-2.9 2.8-4.7z'],
		motion: 'flicker'
	},
	{
		id: 'star',
		label: 'Star',
		paths: ['M12 2.9L14.35 9.46L21.32 9.67L15.8 13.94L17.76 20.63L12 16.7L6.24 20.63L8.2 13.94L2.68 9.67L9.65 9.46Z'],
		faces: [
			'M12 2.9L14.35 9.46L21.32 9.67L15.8 13.94L17.76 20.63L12 16.7L6.24 20.63L8.2 13.94L2.68 9.67L9.65 9.46Z',
			'M12 12.7L12 2.9L14.35 9.46ZM12 12.7L21.32 9.67L15.8 13.94ZM12 12.7L17.76 20.63L12 16.7ZM12 12.7L6.24 20.63L8.2 13.94ZM12 12.7L2.68 9.67L9.65 9.46Z'
		],
		details: ['M12 12.7 12 2.9M12 12.7 21.32 9.67M12 12.7 17.76 20.63M12 12.7 6.24 20.63M12 12.7 2.68 9.67'],
		motion: 'twinkle'
	},
	{
		id: 'shield',
		label: 'Shield',
		paths: ['M12 2.4 19.8 5.4v5.8c0 4.9-3.3 8.7-7.8 10.6C7.5 19.9 4.2 16.1 4.2 11.2V5.4z'],
		faces: [
			'M12 2.4 19.8 5.4v5.8c0 4.9-3.3 8.7-7.8 10.6C7.5 19.9 4.2 16.1 4.2 11.2V5.4z',
			'M12 2.4 19.8 5.4v5.8c0 4.9-3.3 8.7-7.8 10.6z'
		],
		details: ['M12 2.4v19.4', 'M10.6 5.3 6.2 7v4.2c0 3.5 1.8 6.3 4.4 8'],
		motion: 'sheen'
	},
	{
		id: 'gear',
		label: 'Gear',
		paths: [GEAR_OUTLINE, GEAR_HUB],
		faces: [GEAR_OUTLINE + GEAR_HUB],
		details: ['M12 6.6A5.4 5.4 0 1 1 12 17.4A5.4 5.4 0 1 1 12 6.6Z'],
		motion: 'turn'
	},
	{
		id: 'skull',
		label: 'Skull',
		paths: [
			'M12 2.6a7.4 7.4 0 0 0-7.4 7.4c0 2.5 1.1 4.2 2.7 5.2v2.9a2 2 0 0 0 2 2h5.4a2 2 0 0 0 2-2v-2.9c1.6-1 2.7-2.7 2.7-5.2A7.4 7.4 0 0 0 12 2.6z'
		],
		faces: [
			'M12 2.6a7.4 7.4 0 0 0-7.4 7.4c0 2.5 1.1 4.2 2.7 5.2v2.9a2 2 0 0 0 2 2h5.4a2 2 0 0 0 2-2v-2.9c1.6-1 2.7-2.7 2.7-5.2A7.4 7.4 0 0 0 12 2.6z'
		],
		details: ['M10.3 17.4v2.6M12 17.4v2.7M13.7 17.4v2.6'],
		solids: [
			'M9.3 8.4a1.9 1.9 0 1 1 0 3.8a1.9 1.9 0 1 1 0-3.8z',
			'M14.7 8.4a1.9 1.9 0 1 1 0 3.8a1.9 1.9 0 1 1 0-3.8z',
			'M12 12.9l1 1.9h-2z'
		],
		motion: 'nod'
	},
	{
		id: 'crown',
		label: 'Crown',
		paths: ['M3.6 8.6 7.8 12 12 5.4l4.2 6.6 4.2-3.4-1.8 10.4H5.4z'],
		faces: ['M3.6 8.6 7.8 12 12 5.4l4.2 6.6 4.2-3.4-1.8 10.4H5.4z', 'M5.85 16.4h12.3l-.35 2.2H5.4z'],
		details: ['M5.9 16.4h12.2'],
		solids: [
			'M3.6 5.8a1.2 1.2 0 1 1 0 2.4a1.2 1.2 0 1 1 0-2.4z',
			'M12 2.4a1.2 1.2 0 1 1 0 2.4a1.2 1.2 0 1 1 0-2.4z',
			'M20.4 5.8a1.2 1.2 0 1 1 0 2.4a1.2 1.2 0 1 1 0-2.4z'
		],
		motion: 'glint'
	},
	{
		id: 'rocket',
		label: 'Rocket',
		paths: [
			'M12 2.2c2.6 1.9 4 5 4 8.6v5.6H8v-5.6c0-3.6 1.4-6.7 4-8.6z',
			'M8 11.6 5 14.4v3.8l3-1.8M16 11.6l3 2.8v3.8l-3-1.8'
		],
		faces: [
			'M12 2.2c2.6 1.9 4 5 4 8.6v5.6H8v-5.6c0-3.6 1.4-6.7 4-8.6z',
			'M12 2.2c2.6 1.9 4 5 4 8.6v5.6h-4z',
			'M8 11.6 5 14.4v3.8l3-1.8zM16 11.6l3 2.8v3.8l-3-1.8z'
		],
		details: ['M12 17.8c.9.9 1.4 1.8 1.4 2.7a1.4 1.4 0 0 1-2.8 0c0-.9.5-1.8 1.4-2.7z'],
		solids: ['M12 7.4a1.7 1.7 0 1 1 0 3.4a1.7 1.7 0 1 1 0-3.4z'],
		motion: 'lift'
	}
];

export const BADGE_BY_ID: Record<string, BadgeDef> = Object.fromEntries(
	BADGES.map((b) => [b.id, b])
);

/**
 * Cosmetic effects. AMBIENT ones render continuously on a banner; EVENT ones
 * are one-shots a surface plays at a decisive moment it already knows about
 * (a win, an elimination). Neither ever encodes match state -- status,
 * winner and the live indicator own that language -- and every one of them
 * is gated behind prefers-reduced-motion at the render site.
 *
 * ONLY THE AMBIENT ONES MEAN ANYTHING ON A PROFILE. A profile surface has no
 * decisive moment to play an event flourish at, so `PROFILE_FLOURISHES` below
 * is the subset a profile offers -- filtered from this list by `kind` rather
 * than typed out again, so a flourish added here cannot be silently missed.
 */
export interface FlourishDef {
	id: string;
	label: string;
	kind: 'ambient' | 'event';
	note: string;
}

export const FLOURISHES: FlourishDef[] = [
	{
		id: 'glow-pulse',
		label: 'Glow pulse',
		kind: 'ambient',
		note: 'A slow pulse in your accent color.'
	},
	{
		id: 'particle-trail',
		label: 'Particle trail',
		kind: 'ambient',
		note: 'Drifting sparks across your banner.'
	},
	{
		id: 'confetti-on-win',
		label: 'Confetti on win',
		kind: 'event',
		note: 'Bursts on the big screen when you win a match.'
	},
	{
		id: 'screen-shake-on-elimination',
		label: 'Shake on elimination',
		kind: 'event',
		note: 'Your banner rattles when you are knocked out.'
	}
];

export const FLOURISH_BY_ID: Record<string, FlourishDef> = Object.fromEntries(
	FLOURISHES.map((f) => [f.id, f])
);

/**
 * The flourishes a PROFILE may carry, derived rather than listed. An event
 * flourish names a moment a tournament has and a profile does not, so offering
 * one on a profile would be a control whose only possible outcome is nothing
 * happening -- the same refusal the platform makes for a control whose only
 * answer is a refusal. 0220's CHECK constraint carries the same subset, and
 * `tests/identity-style-shared.test.ts` reconciles the two.
 */
export const PROFILE_FLOURISHES: FlourishDef[] = FLOURISHES.filter((f) => f.kind === 'ambient');

/** The decisive moment a surface can hand a banner. */
export type FlourishEvent = 'win' | 'eliminated' | null;

export function flourishKind(id: string | null | undefined): 'ambient' | 'event' | null {
	return id ? (FLOURISH_BY_ID[id]?.kind ?? null) : null;
}

export function accentOf(style: IdentityStyle | null | undefined): string {
	return style?.accent_color || NEUTRAL_ACCENT;
}

/** True when the identity has customized anything at all. */
export function hasStyle(style: IdentityStyle | null | undefined): boolean {
	if (!style) return false;
	return !!(
		style.background_type ||
		style.accent_color ||
		style.badge ||
		style.flourish ||
		style.tagline
	);
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Is this a `#rrggbb` string? Exported so a control can refuse before a save. */
export function isHex(value: unknown): value is string {
	return typeof value === 'string' && HEX.test(value);
}

function gradientPair(value: BackgroundValue | null): [string, string] | null {
	if (!Array.isArray(value) || value.length !== 2) return null;
	const [a, b] = value;
	return HEX.test(a) && HEX.test(b) ? [a, b] : null;
}

/**
 * The CSS `background` shorthand for a style, or null when it has no
 * background (the default treatment). Every value is re-validated here: the
 * writer already guarantees the shape, but this is what interpolates into a
 * style attribute, so it never trusts a shape it has not checked.
 *
 * THAT RE-VALIDATION MATTERS MORE ON A PROFILE THAN IT DID ON AN ENTRY, and
 * the reason is the write path rather than anything about the value. A
 * tournament style has exactly one writer, the SECURITY DEFINER RPC
 * `tournament_set_entry_style`, which validates before it inserts. A profile
 * style is written by the student's own browser under 0001's "update own
 * profile" RLS policy, so the guarantee comes from 0220's CHECK constraints
 * instead -- a different mechanism, in a different place, that this function
 * does not and should not know about. It re-validates for both, identically.
 */
export function backgroundCss(style: IdentityStyle | null | undefined): string | null {
	if (!style?.background_type || style.background_value == null) return null;
	if (style.background_type === 'solid') {
		const v = style.background_value;
		return typeof v === 'string' && HEX.test(v) ? v : null;
	}
	if (style.background_type === 'gradient') {
		const pair = gradientPair(style.background_value);
		return pair ? `linear-gradient(135deg, ${pair[0]} 0%, ${pair[1]} 100%)` : null;
	}
	const url = style.background_value;
	if (typeof url !== 'string' || !url.startsWith('https://')) return null;
	// Quotes + a url()-breaking character guard: the value is interpolated
	// into a style attribute.
	if (/["'()\\]/.test(url)) return null;
	return `url("${url}") center / cover no-repeat`;
}

export function isImageBackground(style: IdentityStyle | null | undefined): boolean {
	return style?.background_type === 'image';
}

function luminance(hex: string): number {
	const n = Number.parseInt(hex.slice(1), 16);
	const chan = (v: number) => {
		const c = v / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return (
		0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255)
	);
}

export const INK_DARK = '#0e1412';
export const INK_LIGHT = '#edede8';

/**
 * Text color for a banner's own background. A light custom background gets
 * dark ink rather than a muddy scrim; an image background always gets light
 * ink, because the art is unknown and the render pairs it with a scrim.
 */
export function bannerInk(style: IdentityStyle | null | undefined): string {
	if (!style?.background_type || style.background_value == null) return INK_LIGHT;
	if (style.background_type === 'solid') {
		const v = style.background_value;
		return typeof v === 'string' && HEX.test(v) && luminance(v) > 0.42 ? INK_DARK : INK_LIGHT;
	}
	if (style.background_type === 'gradient') {
		const pair = gradientPair(style.background_value);
		if (!pair) return INK_LIGHT;
		const mean = (luminance(pair[0]) + luminance(pair[1])) / 2;
		return mean > 0.42 ? INK_DARK : INK_LIGHT;
	}
	return INK_LIGHT;
}

/** rgba() form of a hex, for accent washes. */
export function accentAlpha(hex: string, alpha: number): string {
	if (!HEX.test(hex)) return `rgba(138, 147, 140, ${alpha})`;
	const n = Number.parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
