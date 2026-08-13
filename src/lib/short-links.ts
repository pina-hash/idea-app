/**
 * Site-wide short links (migration 0093): client-safe row type, the shape of
 * the two write transports, and the pure validation the admin form mirrors.
 * No Svelte, no Supabase (the curriculum.ts convention).
 *
 * The rules here are the FRIENDLY copy. app_short_link_upsert enforces the same
 * ones inside a SECURITY DEFINER function that re-checks is_admin(), so a form
 * this module never saw still cannot create a bad row.
 */

export interface ShortLinkRow {
	slug: string;
	target: string;
	label: string | null;
	active: boolean;
	created_by: string;
	created_at: string;
	updated_at: string;
}

export interface ShortLinkTransports {
	upsert(
		slug: string,
		target: string,
		label: string | null,
		active: boolean
	): Promise<{ ok: boolean; message?: string }>;
	remove(slug: string): Promise<{ ok: boolean; message?: string }>;
	reload(): Promise<ShortLinkRow[]>;
}

export const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,60}$/;

/**
 * Slugs that name a real single-segment route. SvelteKit resolves a static
 * route ahead of the [shortlink] catch-all, so one of these would never be
 * reached -- accepting it would only mislead whoever created it. Mirrors
 * _app_short_link_reserved in 0093; change both together.
 */
export const RESERVED_SLUGS = [
	'admin',
	'api',
	'archive',
	'assignments',
	'auth',
	'classroom',
	'coins',
	'coin-balance',
	'coin-desk',
	'coin-entry',
	'contracts',
	'dashboard',
	'dev',
	'frc',
	'fsp',
	'gauntlet',
	'greenline',
	'notebook',
	'reference',
	'tournaments',
	'vanguard'
];

/** The one problem with this slug/target pair, or null. */
export function shortLinkIssue(slug: string, target: string): string | null {
	const s = slug.trim().toLowerCase();
	const t = target.trim();
	if (!s) return 'A slug is required.';
	if (!SLUG_RE.test(s)) {
		return 'A slug is lowercase letters, digits, dots, dashes and underscores.';
	}
	if (RESERVED_SLUGS.includes(s)) {
		return `"${s}" is a real page on this site, so a short link there would never be reached.`;
	}
	if (!t) return 'A target is required.';
	if (!/^\/[^/\\]/.test(t)) {
		// An open redirector -- our domain sending a visitor to an arbitrary
		// host -- is a phishing primitive, and nothing this feature needs is
		// off our own origin.
		return 'A target must be a path on this site, starting with a single "/".';
	}
	if (t.includes('#')) {
		// The fragment a visitor scanned is what has to survive the redirect; a
		// target carrying its own would win instead.
		return 'A target may not carry a "#" fragment.';
	}
	if (t.length > 500) return 'That target is too long.';
	return null;
}
