/**
 * Which of the notebook's TWO palettes is showing.
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
 * guessed and the right theme arrives a frame later. The two explicit values
 * are overrides, applied as a `data-nb-theme` attribute on .nb-root, and the
 * CSS is written so each wins over the media query in its own direction.
 */

export type NotebookTheme = 'system' | 'light' | 'dark';

const KEY = 'idea_notebook_theme';

const THEMES: NotebookTheme[] = ['system', 'light', 'dark'];

function read(): NotebookTheme {
	if (typeof localStorage === 'undefined') return 'system';
	try {
		const stored = localStorage.getItem(KEY);
		return THEMES.includes(stored as NotebookTheme) ? (stored as NotebookTheme) : 'system';
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
 * media query is the only thing deciding -- rather than a third value the CSS
 * would have to special-case.
 */
export function notebookThemeAttr(): 'light' | 'dark' | undefined {
	return theme === 'system' ? undefined : theme;
}

export function setNotebookTheme(next: NotebookTheme) {
	theme = next;
	if (typeof localStorage === 'undefined') return;
	try {
		if (next === 'system') localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, next);
	} catch {
		// A blocked or full store costs the persistence, never the toggle.
	}
}

/** System -> Light -> Dark -> System. Cycling keeps "follow the OS" reachable. */
export function cycleNotebookTheme() {
	setNotebookTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
}

export const NOTEBOOK_THEME_LABELS: Record<NotebookTheme, string> = {
	system: 'Match my device',
	light: 'Light',
	dark: 'Dark'
};

/**
 * The same three states as a word short enough to sit ON the control, so the
 * masthead button is not a bare glyph whose meaning only a tooltip carries.
 * The full phrase above stays the accessible name and the tooltip.
 */
export const NOTEBOOK_THEME_SHORT: Record<NotebookTheme, string> = {
	system: 'Auto',
	light: 'Light',
	dark: 'Dark'
};
