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
 * THE DEFAULT IS THE CLASSROOM'S CONSOLE REGISTER, AND IT IS UNCONDITIONAL.
 * There used to be a 'system' state here that followed prefers-color-scheme in
 * CSS alone, choosing between a light paper plate and a warm near-black one.
 * That warm plate is retired (see the DEFAULT block in colors.css): it was the
 * notebook holding a private opinion about what a dark room looks like, one
 * step away from the classroom a student had just come from. What replaced it
 * is the classroom's own register, and a single default has no half to pair
 * with -- so 'system' went with it rather than being redefined into a name that
 * no longer follows the system. Light and IDEA are explicit choices, applied as
 * a `data-nb-theme` attribute on .nb-root.
 *
 * A STORED 'dark' RESOLVES TO THE DEFAULT, in `read()` below, and the key is
 * dropped on the way past. That is the whole migration: the retired id can
 * still be sitting in a student's browser, and answering it here means no CSS
 * block, no attribute value and no picker row has to keep existing for it.
 * 'system' was never written to storage (it removed the key), so it needs no
 * branch of its own -- an unrecognised value takes the same path.
 */

export type NotebookTheme = 'default' | 'light' | 'idea';

const KEY = 'idea_notebook_theme';

/** Every state, in the order the picker lists them. */
export const NOTEBOOK_THEMES: NotebookTheme[] = ['default', 'light', 'idea'];

function read(): NotebookTheme {
	if (typeof localStorage === 'undefined') return 'default';
	try {
		const stored = localStorage.getItem(KEY);
		if (stored === null) return 'default';
		if (NOTEBOOK_THEMES.includes(stored as NotebookTheme)) return stored as NotebookTheme;
		// A retired or corrupted plate id -- 'dark' and 'system' are the two that
		// were really written. Drop it now rather than letting the fallback repeat
		// silently forever, or reusing the id later would revive it.
		localStorage.removeItem(KEY);
		return 'default';
	} catch {
		return 'default';
	}
}

let theme = $state<NotebookTheme>(read());

export function notebookTheme(): NotebookTheme {
	return theme;
}

/**
 * What goes on the wrapper. 'default' is the ABSENCE of the attribute, so the
 * `:not([data-nb-theme])` palette block is the only thing deciding -- rather
 * than a value the CSS would have to special-case.
 */
export function notebookThemeAttr(): 'light' | 'idea' | undefined {
	return theme === 'default' ? undefined : theme;
}

export function setNotebookTheme(next: NotebookTheme) {
	theme = next;
	if (typeof localStorage === 'undefined') return;
	try {
		if (next === 'default') localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, next);
	} catch {
		// A blocked or full store costs the persistence, never the choice.
	}
}

export const NOTEBOOK_THEME_LABELS: Record<NotebookTheme, string> = {
	default: 'Default',
	light: 'Light',
	idea: 'IDEA'
};

/**
 * What each option is FOR, shown under its name in the picker. A list of
 * one-word names says nothing about why you would pick one, and "IDEA" in
 * particular is a name nobody can infer a look from.
 */
export const NOTEBOOK_THEME_NOTES: Record<NotebookTheme, string> = {
	default: 'The same dark surfaces as your classes',
	light: 'Warm paper',
	idea: 'Green-black, in the program colours'
};

/**
 * The same states as a word short enough to sit ON the trigger, so the
 * masthead control is not a bare glyph whose meaning only a tooltip carries.
 * The full phrase above stays the accessible name.
 */
export const NOTEBOOK_THEME_SHORT: Record<NotebookTheme, string> = {
	default: 'Default',
	light: 'Light',
	idea: 'IDEA'
};
