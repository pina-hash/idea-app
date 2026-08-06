/**
 * IDEA Tournaments Phase 2b: per-entry banner customization -- row type,
 * preset registries, and pure render helpers. Plain data, client-safe (the
 * curriculum.ts / pathways.ts convention); the write path and the
 * authoritative allowlists live in
 * supabase/migrations/0064_tournament_entry_styles.sql.
 *
 * KEEP IN SYNC: BADGES and FLOURISHES mirror the CHECK constraints in 0064.
 * The database is the authority on which ids exist; this file adds the label
 * and the artwork. Adding one means editing both, in the same change.
 *
 * These styles are deliberately INDEPENDENT of the tournament system chrome
 * (tournaments-theme.css). A student picks whatever colors they like for
 * their own banner; the emerald/gold system palette governs the app's own
 * frame around it, never the content.
 */

export type BackgroundType = 'solid' | 'gradient' | 'image';
export type BackgroundValue = string | [string, string];

export interface EntryStyle {
	entry_id: string;
	tournament_id: string;
	background_type: BackgroundType | null;
	background_value: BackgroundValue | null;
	accent_color: string | null;
	badge: string | null;
	flourish: string | null;
	tagline: string | null;
	updated_by?: string | null;
	updated_at?: string;
}

/** A style as the editor holds it before it is saved. */
export type EntryStyleDraft = Pick<
	EntryStyle,
	'background_type' | 'background_value' | 'accent_color' | 'badge' | 'flourish' | 'tagline'
>;

export const EMPTY_STYLE: EntryStyleDraft = {
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
 * is never the default -- a new entry has no accent at all and falls back to
 * NEUTRAL_ACCENT until its owner picks one. A freeform picker sits beside
 * these in the editor, so this list is a starting point, not a limit.
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

/** What an entry with no accent set renders as: neutral, never emerald. */
export const NEUTRAL_ACCENT = '#8a938c';

export interface BadgeDef {
	id: string;
	label: string;
	/** Stroked paths on a 24x24 grid (the pathways.ts inline-icon convention). */
	paths: string[];
}

export const BADGES: BadgeDef[] = [
	{ id: 'bolt', label: 'Bolt', paths: ['M13 2.5 4.5 14H10l-1 7.5L19.5 10H14z'] },
	{
		id: 'flame',
		label: 'Flame',
		paths: ['M12 2.8c3 4 5.2 6.3 5.2 9.4a5.2 5.2 0 0 1-10.4 0c0-1.7.8-3 1.9-4.1C10.2 9.4 12 6.1 12 2.8z']
	},
	{
		id: 'star',
		label: 'Star',
		paths: ['m12 3.2 2.7 5.6 6 .9-4.4 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.3 9.7l6-.9z']
	},
	{ id: 'shield', label: 'Shield', paths: ['M12 2.8 19 6v5.1c0 4.5-3 8.1-7 10.1-4-2-7-5.6-7-10.1V6z'] },
	{
		id: 'gear',
		label: 'Gear',
		paths: [
			'M12 8.6A3.4 3.4 0 1 0 12 15.4 3.4 3.4 0 0 0 12 8.6z',
			'm12 2.4 1.4 2.4 2.7-.6.7 2.7 2.4 1.2-1.2 2.5 1.2 2.5-2.4 1.2-.7 2.7-2.7-.6L12 21.6l-1.4-2.4-2.7.6-.7-2.7-2.4-1.2L6 12 4.8 9.5l2.4-1.2.7-2.7 2.7.6z'
		]
	},
	{
		id: 'skull',
		label: 'Skull',
		paths: [
			'M12 2.8a7.2 7.2 0 0 0-7.2 7.2c0 2.4 1.1 4 2.6 5v3a2 2 0 0 0 2 2h5.2a2 2 0 0 0 2-2v-3c1.5-1 2.6-2.6 2.6-5A7.2 7.2 0 0 0 12 2.8z',
			'M9.4 9.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z',
			'M14.6 9.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z'
		]
	},
	{ id: 'crown', label: 'Crown', paths: ['M3.8 7.6 8 11.2 12 4.4l4 6.8 4.2-3.6L18.6 19H5.4z'] },
	{
		id: 'rocket',
		label: 'Rocket',
		paths: [
			'M12 2.6c3.3 2.3 5.2 5.8 5.2 9.6l-2.3 2.3H9.1l-2.3-2.3c0-3.8 1.9-7.3 5.2-9.6z',
			'm9.3 14.5-2.8 2.8 1.4 3.4 2.2-2.2m5.6-4 2.8 2.8-1.4 3.4-2.2-2.2'
		]
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

/** The decisive moment a surface can hand a banner. */
export type FlourishEvent = 'win' | 'eliminated' | null;

export function flourishKind(id: string | null | undefined): 'ambient' | 'event' | null {
	return id ? (FLOURISH_BY_ID[id]?.kind ?? null) : null;
}

/** Styles keyed by entry id, for the render components. */
export function styleMap(rows: EntryStyle[]): Record<string, EntryStyle> {
	return Object.fromEntries(rows.map((s) => [s.entry_id, s]));
}

export function accentOf(style: EntryStyle | EntryStyleDraft | null | undefined): string {
	return style?.accent_color || NEUTRAL_ACCENT;
}

/** True when the entry has customized anything at all. */
export function hasStyle(style: EntryStyle | EntryStyleDraft | null | undefined): boolean {
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

function gradientPair(value: BackgroundValue | null): [string, string] | null {
	if (!Array.isArray(value) || value.length !== 2) return null;
	const [a, b] = value;
	return HEX.test(a) && HEX.test(b) ? [a, b] : null;
}

/**
 * The CSS `background` shorthand for a style, or null when it has no
 * background (the default treatment). Every value is re-validated here: the
 * RPC already guarantees the shape, but this is what interpolates into a
 * style attribute, so it never trusts a shape it has not checked.
 */
export function backgroundCss(style: EntryStyle | EntryStyleDraft | null | undefined): string | null {
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

export function isImageBackground(style: EntryStyle | EntryStyleDraft | null | undefined): boolean {
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
export function bannerInk(style: EntryStyle | EntryStyleDraft | null | undefined): string {
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
