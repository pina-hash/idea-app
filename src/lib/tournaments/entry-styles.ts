/**
 * IDEA Tournaments Phase 2b: per-entry banner customization -- the row type,
 * and the entry-keyed helper. Plain data, client-safe (the curriculum.ts /
 * pathways.ts convention); the write path and the authoritative allowlists
 * live in supabase/migrations/0064_tournament_entry_styles.sql.
 *
 * THE PURE LAYER MOVED TO `$lib/identity-style.ts` AND IS RE-EXPORTED HERE
 * UNCHANGED (ledger 0289). Every registry and every helper below the row type
 * already took a style record and knew nothing about tournaments; what was
 * tournament-shaped was the TYPE they were declared against, so a profile
 * surface could not consume them without inventing an `entry_id` and a
 * `tournament_id` that mean nothing. The type is what moved. Nothing here
 * changed behaviour, no tournament surface changed an import, and
 * `tests/identity-style-shared.test.ts` asserts the two spellings answer
 * identically on the same corpus.
 *
 * KEEP IN SYNC: BADGES and FLOURISHES, now in `$lib/identity-style.ts`,
 * mirror the CHECK constraints in 0064 -- and, since 0220, a second set in
 * `profiles`. The database is the authority on which ids exist; that file adds
 * the label and the artwork. Adding one means editing it AND both migrations,
 * in the same change.
 *
 * These styles are deliberately INDEPENDENT of the tournament system chrome
 * (tournaments-theme.css). A student picks whatever colors they like for
 * their own banner; the emerald/gold system palette governs the app's own
 * frame around it, never the content.
 *
 * THE IDENTITY RULE (0062, restated by 0064's header) IS UNTOUCHED BY THE
 * LIFT AND MUST STAY THAT WAY: a tournament style decorates
 * `entries.display_name` and never reveals an account identity, and
 * `tournament_entry_styles.entry_id` is the primary key, so a banner dies with
 * its entry. Sharing the ARITHMETIC with profiles shares no data, no table and
 * no permission: 0220 gives a profile its own columns with their own gate, and
 * nothing joins the two. A future change that makes a profile style reachable
 * from a tournament surface, or the reverse, is a disclosure decision and not
 * a refactor.
 */

import type { IdentityStyle } from '$lib/identity-style';

export type {
	BackgroundType,
	BackgroundValue,
	BadgeDef,
	FlourishDef,
	FlourishEvent
} from '$lib/identity-style';

export {
	ACCENT_PRESETS,
	BADGES,
	BADGE_BY_ID,
	EMPTY_STYLE,
	FLOURISHES,
	FLOURISH_BY_ID,
	INK_DARK,
	INK_LIGHT,
	NEUTRAL_ACCENT,
	accentAlpha,
	accentOf,
	backgroundCss,
	bannerInk,
	flourishKind,
	hasStyle,
	isImageBackground
} from '$lib/identity-style';

/**
 * A tournament entry's style row. The two ids are the whole of what is
 * tournament-shaped about it: `entry_id` is the primary key (0064) and
 * `tournament_id` is denormalized for the realtime filter.
 */
export interface EntryStyle extends IdentityStyle {
	entry_id: string;
	tournament_id: string;
	updated_by?: string | null;
	updated_at?: string;
}

/** A style as the editor holds it before it is saved. */
export type EntryStyleDraft = Pick<
	EntryStyle,
	'background_type' | 'background_value' | 'accent_color' | 'badge' | 'flourish' | 'tagline'
>;

/** Styles keyed by entry id, for the render components. */
export function styleMap(rows: EntryStyle[]): Record<string, EntryStyle> {
	return Object.fromEntries(rows.map((s) => [s.entry_id, s]));
}
