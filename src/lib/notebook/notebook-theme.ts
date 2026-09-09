/**
 * THE NOTEBOOK PLATE REGISTRY: plain data and pure helpers, no runes, no
 * storage, no DOM. `notebook-theme.svelte.ts` is the reactive half and imports
 * this; the split is `$lib/theme.ts` / `$lib/theme.svelte.ts`'s, for the same
 * reason -- every rule in this file is assertable in the `node` test project
 * with no compiler, no browser and no localStorage to stub.
 *
 * FOUR PLATES. `default` is the classroom's console register and FOLLOWS THE
 * SITE THEME: it means "the same surfaces as your classes", and the site theme
 * is what decides what the classes look like, so when the site is on Matrix
 * the default plate paints Matrix too (in CSS alone -- see the matrix block in
 * notebook-theme.css). `light` and `idea` are explicit choices and do NOT
 * follow the site theme, because the notebook has its own reasons for each:
 * paper for reading photographs in bright light, and the program's own
 * colours. `matrix` is the fourth, an explicit choice that paints the
 * identical values whatever the site theme is.
 */

import type { SiteTheme } from '$lib/theme';

export type NotebookTheme = 'default' | 'light' | 'idea' | 'matrix';

/** The storage key, named here so the module and its tests cannot disagree.
 *  Unchanged from the three-plate picker: a stored 'light' or 'idea' keeps
 *  meaning what it meant. */
export const NOTEBOOK_THEME_KEY = 'idea_notebook_theme';

/** Every state, in the order the picker lists them. */
export const NOTEBOOK_THEMES: NotebookTheme[] = ['default', 'light', 'idea', 'matrix'];

/**
 * The DEFAULT is the ABSENCE of the attribute, so the `:not([data-nb-theme])`
 * palette block is the only thing deciding -- rather than a value the CSS
 * would have to special-case.
 */
export const DEFAULT_NOTEBOOK_THEME: NotebookTheme = 'default';

/**
 * What goes on `.nb-root`. `undefined` for the default, for the reason above.
 * A pure function of the id so nothing has to spell `=== 'default'` twice.
 */
export function notebookThemeAttrFor(theme: NotebookTheme): 'light' | 'idea' | 'matrix' | undefined {
	return theme === DEFAULT_NOTEBOOK_THEME ? undefined : (theme as 'light' | 'idea' | 'matrix');
}

/**
 * An unrecognised or retired id answers NULL rather than falling back
 * silently -- the caller drops the key. 'dark' and 'system' are the two ids
 * that were really written to students' browsers and both MUST answer null:
 * the retired warm plate is answered here and nowhere else, so no CSS block,
 * no attribute value and no picker row has to keep existing for it.
 */
export function readStoredNotebookTheme(raw: string | null): NotebookTheme | null {
	if (raw === null) return null;
	return NOTEBOOK_THEMES.includes(raw as NotebookTheme) ? (raw as NotebookTheme) : null;
}

export const NOTEBOOK_THEME_LABELS: Record<NotebookTheme, string> = {
	default: 'Default',
	light: 'Light',
	idea: 'IDEA',
	matrix: 'Matrix'
};

/**
 * What each option is FOR, shown under its name in the picker. A list of
 * one-word names says nothing about why you would pick one, and "IDEA" and
 * "Matrix" in particular are names nobody can infer a look from. The Default
 * row's note is the STATIC form; the picker renders `notebookDefaultNote`
 * there instead, so the row says what it follows right now.
 */
export const NOTEBOOK_THEME_NOTES: Record<NotebookTheme, string> = {
	default: 'The same surfaces as your classes, on any site theme',
	light: 'Warm paper',
	idea: 'Green-black, in the program colours',
	matrix: 'Black ground and phosphor type, in here only'
};

/**
 * The same states as a word short enough to sit ON the trigger, so the
 * masthead control is not a bare glyph whose meaning only a tooltip carries.
 * The full phrase above stays the accessible name.
 */
export const NOTEBOOK_THEME_SHORT: Record<NotebookTheme, string> = {
	default: 'Default',
	light: 'Light',
	idea: 'IDEA',
	matrix: 'Matrix'
};

/**
 * Which plate is PAINTED for a choice under a given site theme. The default
 * plate defers to the site theme (the CSS does this on its own; this is the
 * same rule stated once in TypeScript, so a harness and the picker can read
 * it); every explicit choice paints itself.
 */
export function notebookPlate(theme: NotebookTheme, site: SiteTheme): 'default' | 'light' | 'idea' | 'matrix' {
	if (theme === DEFAULT_NOTEBOOK_THEME && site === 'matrix') return 'matrix';
	return theme;
}

/**
 * The Default row's note, saying what it follows RIGHT NOW rather than
 * describing the mechanism. On the standard site theme the answer is the
 * classroom's own surfaces; on Matrix it names Matrix, so a student who
 * picked it on the site can see why the notebook already looks like it.
 */
export function notebookDefaultNote(site: SiteTheme): string {
	if (site === 'matrix') return 'Following the site theme: Matrix right now';
	return 'Following the site theme: the same surfaces as your classes';
}
