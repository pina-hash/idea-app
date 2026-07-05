/**
 * Global user profile: shared types, avatar presets, and helpers for the
 * profile system (0020_profiles_identity.sql). PLAIN DATA + pure helpers
 * (client-safe, like curriculum.ts); the ProfileMenu / Avatar components
 * consume this.
 */
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { SupabaseClient } from '@supabase/supabase-js';

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
// Avatar presets: original geometric marks in the program palette (no pure
// red/white/yellow). Each is a 24x24 stroke glyph on a dark tile.
// ---------------------------------------------------------------------------

export interface AvatarPreset {
	id: string;
	label: string;
	/** Glyph stroke color (theme hex). */
	fg: string;
	/** SVG path data, 24x24 viewBox, stroked. */
	d: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
	{ id: 'hex', label: 'Hex prism', fg: '#00ff41', d: 'M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5zM12 2.5v9.5m0 0l8.2 4.75M12 12l-8.2 4.75' },
	{ id: 'cube', label: 'Iso cube', fg: '#00f0ff', d: 'M12 3l7 4v10l-7 4-7-4V7zM5 7l7 4 7-4M12 11v10' },
	{ id: 'triad', label: 'Origin triad', fg: '#c8ff00', d: 'M12 13V4m0 9l7.5 4.5M12 13l-7.5 4.5M12 13h.01' },
	{ id: 'reticle', label: 'Reticle', fg: '#88ddff', d: 'M12 5a7 7 0 110 14 7 7 0 010-14zm0-3v4m0 12v4M2 12h4m12 0h4' },
	{ id: 'bolt', label: 'Bolt', fg: '#00aa88', d: 'M13 2L6 13.5h5L10 22l8-11.5h-5.5z' },
	{ id: 'gear', label: 'Gear', fg: '#3b6e8f', d: 'M12 8.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7zm0-6v4m0 11v4m9.5-9.5h-4m-11 0h-4m15.8-6.3l-2.9 2.9M7.6 16.4l-2.9 2.9m14.6 0l-2.9-2.9M7.6 7.6L4.7 4.7' },
	{ id: 'wave', label: 'Waveform', fg: '#5500aa', d: 'M2 12h3l2-6 3 12 3-9 2 5 2-2h5' },
	{ id: 'delta', label: 'Delta wing', fg: '#ff8c00', d: 'M12 3l8.5 17.5L12 17l-8.5 3.5zM12 3v14' }
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
