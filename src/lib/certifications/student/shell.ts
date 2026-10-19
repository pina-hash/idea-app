/**
 * What every student page hands the portal's chrome (ledger 0391, surface c).
 *
 * `CertShell` is mounted ONCE, by `src/routes/certifications/+layout.svelte`,
 * and a page cannot pass it props, so each page's server load returns a
 * `shell` key in this shape and the layout reads it off `page.data`. A page
 * that returns none gets the portal's own name as its title.
 *
 * Pure data and one predicate: no Svelte, no `$lib/server`.
 */
import { PORTAL_NAME } from '$lib/certifications/copy';

export interface CertCrumb {
	href: string;
	label: string;
}

export interface CertShellData {
	title: string;
	/** The label over the title bar. Defaults to the portal's lockup. */
	eyebrow?: string;
	lead?: string | null;
	crumbs?: CertCrumb[];
}

export const CERT_EYEBROW = 'IDEA · Certifications';

export const DEFAULT_SHELL: CertShellData = { title: PORTAL_NAME, eyebrow: CERT_EYEBROW };

/** The eyebrow over every desk page: the desk is the portal's console. */
export const DESK_EYEBROW = 'IDEA · Certifications · Desk';

/**
 * What every DESK page returns as `shell`: the desk eyebrow, the page's own
 * title, and the crumbs that lead back (the engine's import page names the
 * engine). The desk renders no second title bar; the layout's `CertShell`
 * draws this one.
 */
export function deskShell(title: string, lead: string | null = null, crumbs: CertCrumb[] = []): CertShellData {
	return { title, eyebrow: DESK_EYEBROW, lead, crumbs };
}

/** The one sentence a page shows when a `cert_*` function does not exist yet. */
export const CERT_UNAVAILABLE_SENTENCE = 'This part of IDEA Certifications is not available yet.';

/**
 * A PostgREST error naming a function the database does not have: the
 * migrations are applied by hand, one at a time, so this is a real deployment
 * state and never a broken page. Keyed on the code ALONE (CLAUDE.md, RPC
 * degradation): a runtime error inside the function is a different fact.
 */
export function certNotAvailable(error: { code?: string | null } | null | undefined): boolean {
	return !!error && error.code === 'PGRST202';
}

/** `page.data.shell` as a page returned it, or the default. */
export function shellOf(data: Record<string, unknown> | null | undefined): CertShellData {
	const s = data?.shell;
	if (!s || typeof s !== 'object') return DEFAULT_SHELL;
	const v = s as Partial<CertShellData>;
	return {
		title: typeof v.title === 'string' && v.title.trim() ? v.title : DEFAULT_SHELL.title,
		eyebrow: typeof v.eyebrow === 'string' ? v.eyebrow : CERT_EYEBROW,
		lead: typeof v.lead === 'string' ? v.lead : null,
		crumbs: Array.isArray(v.crumbs) ? v.crumbs.filter((c) => c && typeof c.href === 'string' && typeof c.label === 'string') : []
	};
}
