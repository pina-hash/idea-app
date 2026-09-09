/**
 * Which of the notebook's FOUR plates is showing.
 *
 * A reactive module-level `$state` backed by localStorage (the
 * creative.svelte.ts / audio-settings.svelte.ts convention). Per BROWSER, not
 * per account, and deliberately so: this is a preference about the screen in
 * front of you and the light in the room, not about who you are. A student on
 * a bright shop workstation and the same student on a phone at night want
 * different answers, and a profile-stored one would insist they want the same.
 * It is also why this needed no migration.
 *
 * THE DEFAULT IS "THE SAME AS YOUR CLASSES", AND SINCE THE SITE GREW A THEME
 * OF ITS OWN THAT SENTENCE HAS TWO ANSWERS. The token layer is the classroom's
 * console register unconditionally, and the notebook's default plate maps onto
 * it one token to one (see the DEFAULT block in colors.css). The site theme
 * (`$lib/theme.svelte.ts`, `ThemeRoot`) repaints that register on `<html>`
 * under `data-theme='matrix'` -- and a notebook that kept painting the
 * UNTHEMED register beside a themed classroom would be answering "the same as
 * your classes" with the wrong classes. So the default plate FOLLOWS THE SITE:
 * notebook-theme.css keys the matrix plate on BOTH the notebook's own
 * `[data-nb-theme='matrix']` and on `:root[data-theme='matrix']` over an
 * unset plate. Nothing here reads the site preference to do that; the
 * cascade reads the attribute `ThemeRoot` wrote, which is the one answer to
 * "what did the site decide" rather than a second reading of the same store
 * and the same session gate that could disagree with it.
 *
 * `light`, `idea` and `matrix` are EXPLICIT choices, applied as a
 * `data-nb-theme` attribute on .nb-root, and an explicit plate does NOT
 * follow the site: a student who picked paper for their notebook picked it for
 * a reason (reading a photograph of paper), and a student who picked matrix
 * here with the site on IDEA gets matrix here. Two controls, one surface, and
 * the room's own control wins inside the room -- the divergence the brief
 * allows where the notebook has a reason, stated once.
 *
 * WHAT THE DEFAULT IS SHOWING RIGHT NOW is a different question from what is
 * STORED, and the picker has to answer both: "Default" with a note saying it
 * is following the site's Matrix theme, or "Default" with the console note.
 * `siteThemeOnDocument()` is that reading, taken off `<html>`'s attribute
 * through a MutationObserver -- the same source the cascade paints from, so
 * the words and the paint cannot disagree. It is DISPLAY only; nothing is
 * written from it.
 *
 * A STORED 'dark' RESOLVES TO THE DEFAULT, in `read()` below, and the key is
 * dropped on the way past. That is the whole migration: the retired id can
 * still be sitting in a student's browser, and answering it here means no CSS
 * block, no attribute value and no picker row has to keep existing for it.
 * 'system' was never written to storage (it removed the key), so it needs no
 * branch of its own -- an unrecognised value takes the same path.
 */

export type NotebookTheme = 'default' | 'light' | 'idea' | 'matrix';

/** The plates that carry an attribute: everything but the default. */
export type NotebookPlateAttr = Exclude<NotebookTheme, 'default'>;

const KEY = 'idea_notebook_theme';

/** Every state, in the order the picker lists them. */
export const NOTEBOOK_THEMES: NotebookTheme[] = ['default', 'light', 'idea', 'matrix'];

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
 * than a value the CSS would have to special-case -- and, since the default
 * follows the site, so that `:root[data-theme='matrix']` can reach it.
 */
export function notebookThemeAttr(): NotebookPlateAttr | undefined {
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

/**
 * THE SITE THEME AS THE DOCUMENT CARRIES IT: `<html data-theme>`, which
 * `ThemeRoot` writes only while there is a session and removes otherwise.
 * `null` until the observer has read it (server render, first paint) and
 * `undefined` for "no site theme", which is what the default IDEA palette is.
 *
 * Read off the element rather than off `$lib/theme.svelte.ts`, on purpose:
 * that store is the PREFERENCE, and whether it is APPLIED is `ThemeRoot`'s
 * session gate. Reading the store here would be a second copy of that gate,
 * and a second copy is what stops agreeing (a harness with no session and a
 * stored 'matrix' is the case where they already would). The attribute is
 * the one decision, and it is also exactly what the cascade paints from.
 */
let siteAttr = $state<string | null | undefined>(null);

export function siteThemeOnDocument(): string | null | undefined {
	return siteAttr;
}

/**
 * Start following `<html data-theme>`. Returns the teardown. Called from an
 * `$effect` in the picker; a second caller shares the same state, so two
 * pickers on one page (the feed and the console never mount together, but a
 * harness can) do not fight.
 */
export function watchSiteThemeOnDocument(): () => void {
	if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
	const el = document.documentElement;
	const readAttr = () => {
		siteAttr = el.getAttribute('data-theme') ?? undefined;
	};
	readAttr();
	const mo = new MutationObserver(readAttr);
	mo.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
	return () => mo.disconnect();
}

/**
 * WHICH PLATE IS ON SCREEN, as a pure function of the two inputs: the stored
 * notebook choice and the site attribute. This is the JS mirror of the two
 * selectors in notebook-theme.css and exists so the picker can SAY what is
 * showing; it paints nothing. `tests/notebook-theme.test.ts` holds the two in
 * step.
 */
export function notebookPlateShowing(
	stored: NotebookTheme,
	siteAttr: string | null | undefined
): NotebookTheme {
	if (stored !== 'default') return stored;
	return siteAttr === 'matrix' ? 'matrix' : 'default';
}

export const NOTEBOOK_THEME_LABELS: Record<NotebookTheme, string> = {
	default: 'Default',
	light: 'Light',
	idea: 'IDEA',
	matrix: 'Matrix'
};

/**
 * What each option is FOR, shown under its name in the picker. A list of
 * one-word names says nothing about why you would pick one, and "IDEA" in
 * particular is a name nobody can infer a look from.
 */
export const NOTEBOOK_THEME_NOTES: Record<NotebookTheme, string> = {
	default: 'The same surfaces as your classes, whichever site theme is on',
	light: 'Warm paper',
	idea: 'Green-black, in the program colours',
	matrix: 'Black ground, phosphor type, whatever the site is set to'
};

/**
 * The note the DEFAULT row carries while the site theme is Matrix: the same
 * sentence with the answer filled in, so a student reading "Default" beside a
 * black notebook is told why it is black.
 */
export const NOTEBOOK_THEME_FOLLOWING_NOTE = 'Following the site theme: Matrix right now';

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
