/**
 * Which of the notebook's FOUR palettes is chosen.
 *
 * A reactive module-level `$state` backed by localStorage (the
 * creative.svelte.ts / audio-settings.svelte.ts convention). Per BROWSER, not
 * per account, and deliberately so: this is a preference about the screen in
 * front of you and the light in the room, not about who you are. A student on
 * a bright shop workstation and the same student on a phone at night want
 * different answers, and a profile-stored one would insist they want the same.
 * It is also why this needed no migration.
 *
 * THE DEFAULT IS THE CLASSROOM'S CONSOLE REGISTER, AND IT FOLLOWS THE SITE
 * THEME. There used to be a 'system' state here that followed
 * prefers-color-scheme in CSS alone, choosing between a light paper plate and
 * a warm near-black one. That warm plate is retired (see the DEFAULT block in
 * colors.css): it was the notebook holding a private opinion about what a dark
 * room looks like, one step away from the classroom a student had just come
 * from. What replaced it is the classroom's own register -- and "the same
 * surfaces as your classes" is only true if it moves when the classes do, so
 * under the site's Matrix theme the default plate paints Matrix, in CSS alone
 * (the matrix block in notebook-theme.css). That is this control deferring,
 * not two controls fighting. Light and IDEA are explicit choices that do NOT
 * follow the site theme (paper for reading photographs in bright light; the
 * program plate), and Matrix is a fourth explicit choice that paints the same
 * values whatever the site theme is. All three are applied as a
 * `data-nb-theme` attribute on .nb-root.
 *
 * A STORED 'dark' RESOLVES TO THE DEFAULT, in `read()` below, and the key is
 * dropped on the way past. That is the whole migration: the retired id can
 * still be sitting in a student's browser, and answering it here means no CSS
 * block, no attribute value and no picker row has to keep existing for it.
 * 'system' was never written to storage (it removed the key), so it needs no
 * branch of its own -- an unrecognised value takes the same path.
 *
 * THE PURE HALF -- the ids, the labels, the attribute mapping, the stored-value
 * parse, which plate is painted -- lives in `./notebook-theme` (no runes) and
 * is re-exported below under the names this module has always exported, so
 * NotebookView and ReviewConsole need no change and
 * `tests/notebook-theme.test.ts` can assert all of it in the `node` project
 * without a compiler or a localStorage stub.
 */

import {
	DEFAULT_NOTEBOOK_THEME,
	NOTEBOOK_THEME_KEY,
	notebookThemeAttrFor,
	readStoredNotebookTheme,
	type NotebookTheme
} from './notebook-theme';

export {
	DEFAULT_NOTEBOOK_THEME,
	NOTEBOOK_THEME_KEY,
	NOTEBOOK_THEMES,
	NOTEBOOK_THEME_LABELS,
	NOTEBOOK_THEME_NOTES,
	NOTEBOOK_THEME_SHORT,
	notebookDefaultNote,
	notebookPlate,
	notebookThemeAttrFor,
	readStoredNotebookTheme,
	type NotebookTheme
} from './notebook-theme';

function read(): NotebookTheme {
	if (typeof localStorage === 'undefined') return DEFAULT_NOTEBOOK_THEME;
	try {
		const stored = localStorage.getItem(NOTEBOOK_THEME_KEY);
		const parsed = readStoredNotebookTheme(stored);
		if (parsed) return parsed;
		// A retired or corrupted plate id -- 'dark' and 'system' are the two that
		// were really written. Drop it now rather than letting the fallback repeat
		// silently forever, or reusing the id later would revive it.
		if (stored !== null) localStorage.removeItem(NOTEBOOK_THEME_KEY);
		return DEFAULT_NOTEBOOK_THEME;
	} catch {
		return DEFAULT_NOTEBOOK_THEME;
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
export function notebookThemeAttr(): 'light' | 'idea' | 'matrix' | undefined {
	return notebookThemeAttrFor(theme);
}

export function setNotebookTheme(next: NotebookTheme) {
	theme = next;
	if (typeof localStorage === 'undefined') return;
	try {
		/* TURNING IT OFF IS A REMOVAL, NOT A STORED 'default'. The default is the
		   absence of the attribute and it is also the absence of the key, so a
		   browser that has been switched back is byte-identical to one that
		   never switched at all. */
		if (next === DEFAULT_NOTEBOOK_THEME) localStorage.removeItem(NOTEBOOK_THEME_KEY);
		else localStorage.setItem(NOTEBOOK_THEME_KEY, next);
	} catch {
		// A blocked or full store costs the persistence, never the choice.
	}
}
