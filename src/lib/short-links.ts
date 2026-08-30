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
 * Slugs that name a real single-segment route, or a top-level entry under
 * static/ (which is served ahead of routing entirely -- CLAUDE.md, "Carrying
 * over legacy content"). SvelteKit resolves either one ahead of the
 * [shortlink] catch-all, so one of these would never be reached -- accepting
 * it would only mislead whoever created it.
 *
 * Mirrors _app_short_link_reserved, redefined in 0156 (0093's own copy is an
 * immutable applied record and is never edited to match this one); change
 * both together. tests/short-link-reserved-names.test.ts asserts they agree,
 * and separately walks the real route tree so a route added later reddens
 * the suite instead of drifting silently the way this list did for a year.
 *
 * NOT here, deliberately: `_platform` (leading `_`) and `IDEA` (uppercase) --
 * both fail the slug shape check before a reserved check could ever matter,
 * so listing them would be dead code.
 */
export const RESERVED_SLUGS = [
	'a',
	'admin',
	'api',
	'archive',
	'assignments',
	'auth',
	'b',
	'classroom',
	'coin-balance',
	'coin-desk',
	'coin-entry',
	'coins',
	'contracts',
	'dashboard',
	'dev',
	'downloads',
	'foundry',
	'frc',
	'fsp',
	'fsp-pulse',
	'fsp-tech-selection',
	'gauntlet',
	'greenline',
	'manifest.webmanifest',
	'notebook',
	'push-sw.js',
	'reference',
	'robots.txt',
	'sitemap.xml',
	'tools',
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
