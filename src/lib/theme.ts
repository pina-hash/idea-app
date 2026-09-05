/**
 * THE SITE THEME REGISTRY: plain data and pure helpers, no runes, no storage,
 * no DOM. `$lib/theme.svelte.ts` is the reactive half and imports this; the
 * split is the repository's own "a pure, client-safe registry per subsystem"
 * rule, and here it buys something specific -- every rule in this file is
 * assertable in the `node` test project with no compiler, no browser and no
 * localStorage to stub.
 */

export type SiteTheme = 'idea' | 'matrix';

/** The storage key, named here so the module and its tests cannot disagree. */
export const SITE_THEME_KEY = 'idea_site_theme';

/** Every state, in the order the picker lists them. */
export const SITE_THEMES: SiteTheme[] = ['idea', 'matrix'];

/**
 * The DEFAULT is the ABSENCE of the attribute, so the token layer's own
 * `:root` block is the only thing deciding -- rather than a value every theme
 * file would have to special-case.
 */
export const DEFAULT_SITE_THEME: SiteTheme = 'idea';

/**
 * What goes on `<html>`. `undefined` for the default, for the reason above.
 * A pure function of the id so nothing has to spell `=== 'idea'` twice.
 */
export function siteThemeAttr(theme: SiteTheme): 'matrix' | undefined {
	return theme === DEFAULT_SITE_THEME ? undefined : (theme as 'matrix');
}

/**
 * An unrecognised or retired id answers NULL rather than falling back
 * silently -- the caller drops the key, which is the repair
 * `notebook-theme.svelte.ts` makes and for the same reason: a value left
 * sitting there is a value that revives itself the day the id is reused.
 */
export function readStoredTheme(raw: string | null): SiteTheme | null {
	if (raw === null) return null;
	return SITE_THEMES.includes(raw as SiteTheme) ? (raw as SiteTheme) : null;
}

export const SITE_THEME_LABELS: Record<SiteTheme, string> = {
	idea: 'IDEA',
	matrix: 'Matrix'
};

/**
 * What each option is FOR, under its name in the picker. A list of one-word
 * names says nothing about why you would pick one, and "Matrix" is a name
 * nobody can infer a look from -- exactly as "IDEA" is in the notebook's own
 * plate picker.
 */
export const SITE_THEME_NOTES: Record<SiteTheme, string> = {
	idea: 'The standard green-metal palette',
	matrix: 'Black ground, phosphor green, falling code'
};
