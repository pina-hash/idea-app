/**
 * Which of the notebook's THREE palettes is showing.
 *
 * A reactive module-level `$state` backed by localStorage (the
 * creative.svelte.ts / audio-settings.svelte.ts convention). Per BROWSER, not
 * per account, and deliberately so: this is a preference about the screen in
 * front of you and the light in the room, not about who you are. A student on
 * a bright shop workstation and the same student on a phone at night want
 * different answers, and a profile-stored one would insist they want the same.
 * It is also why this needed no migration.
 *
 * 'system' is the default and follows prefers-color-scheme in CSS alone --
 * there is no matchMedia read here and none is wanted, because resolving the
 * OS preference in JS would mean the first paint is whatever the server
 * guessed and the right theme arrives a frame later. The explicit values are
 * overrides, applied as a `data-nb-theme` attribute on .nb-root, and the CSS
 * is written so each wins over the media query in its own direction.
 *
 * 'idea' IS OPT-IN ONLY, and that is a property of the CSS rather than of
 * anything here: the light and dark palettes each have a prefers-color-scheme
 * selector, the IDEA palette has none, so no device preference can select it.
 * 'system' therefore still means exactly what it always meant -- the
 * light/dark pair, decided by the OS -- and IDEA is reachable only by choosing
 * it.
 */

export type NotebookTheme = 'system' | 'light' | 'dark' | 'idea';

const KEY = 'idea_notebook_theme';

/** Every state, in the order the picker lists them. */
export const NOTEBOOK_THEMES: NotebookTheme[] = ['system', 'light', 'dark', 'idea'];

function read(): NotebookTheme {
	if (typeof localStorage === 'undefined') return 'system';
	try {
		const stored = localStorage.getItem(KEY);
		return NOTEBOOK_THEMES.includes(stored as NotebookTheme)
			? (stored as NotebookTheme)
			: 'system';
	} catch {
		return 'system';
	}
}

let theme = $state<NotebookTheme>(read());

export function notebookTheme(): NotebookTheme {
	return theme;
}

/**
 * What goes on the wrapper. 'system' is the ABSENCE of the attribute, so the
 * media query is the only thing deciding -- rather than a value the CSS would
 * have to special-case.
 */
export function notebookThemeAttr(): 'light' | 'dark' | 'idea' | undefined {
	return theme === 'system' ? undefined : theme;
}

export function setNotebookTheme(next: NotebookTheme) {
	theme = next;
	if (typeof localStorage === 'undefined') return;
	try {
		if (next === 'system') localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, next);
	} catch {
		// A blocked or full store costs the persistence, never the choice.
	}
}

export const NOTEBOOK_THEME_LABELS: Record<NotebookTheme, string> = {
	system: 'Match my device',
	light: 'Light',
	dark: 'Dark',
	idea: 'IDEA'
};

/**
 * What each option is FOR, shown under its name in the picker. A list of four
 * one-word names says nothing about why you would pick one, and "IDEA" in
 * particular is a name nobody can infer a look from.
 */
export const NOTEBOOK_THEME_NOTES: Record<NotebookTheme, string> = {
	system: 'Follows your light or dark setting',
	light: 'Warm paper',
	dark: 'Warm near-black',
	idea: 'Green-black, in the program colours'
};

/**
 * The same states as a word short enough to sit ON the trigger, so the
 * masthead control is not a bare glyph whose meaning only a tooltip carries.
 * The full phrase above stays the accessible name.
 */
export const NOTEBOOK_THEME_SHORT: Record<NotebookTheme, string> = {
	system: 'Auto',
	light: 'Light',
	dark: 'Dark',
	idea: 'IDEA'
};
