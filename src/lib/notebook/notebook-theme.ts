/**
 * THE NOTEBOOK'S RETIRED PLATES, AND WHAT A STORED ONE MEANS NOW.
 *
 * The notebook used to paint a plate of its own -- default, light, IDEA or
 * Matrix -- chosen from a picker in its own masthead and stored per browser
 * under `idea_notebook_theme`. Ledger 0297 (package F4a) retired both, on Mr.
 * Pina's words of 2026-09-23: "visually and functionally the IDEA notebook
 * should follow IDEA Classroom, not the other way around." The notebook lives
 * inside the classroom and paints whatever the SITE theme is (IDEA, Matrix or
 * Space White); there is no second control for it.
 *
 * A STORED PLATE MUST NEVER ERROR OR STRAND A STUDENT. Every value a browser
 * can hold -- the four live ids, the retired 'dark' and 'system', and anything
 * a corrupted or hand-edited store holds -- resolves to the site theme, which
 * the student changes from their profile menu or the classroom's Light
 * button. The key is removed the first time a notebook surface loads, so the
 * answer does not have to be given again and a later feature cannot revive a
 * stale id by reusing the name.
 *
 * PLAIN DATA AND PURE FUNCTIONS: no runes, no DOM. The storage is handed in, so
 * every rule here is assertable in the `node` test project, and every touch is
 * inside a try/catch -- a blocked or throwing store costs the tidy-up, never
 * the page.
 */

/** The storage key the retired picker wrote. Named here so the sweep and its test cannot disagree. */
export const NOTEBOOK_THEME_KEY = 'idea_notebook_theme';

/**
 * Every plate id that was really written to a student's browser: the four the
 * picker offered, and 'dark' and 'system' from the plates before them. Kept as
 * the record of what `readStoredNotebookTheme` has to answer, not as a list
 * anything offers.
 */
export const RETIRED_NOTEBOOK_PLATES = ['default', 'light', 'idea', 'matrix', 'dark', 'system'] as const;

/**
 * WHAT A STORED VALUE PAINTS NOW: the site theme, for every value there is.
 * `null` means nothing was stored. Never throws, whatever it is handed.
 */
export function readStoredNotebookTheme(raw: unknown): 'site' | null {
	return raw === null || raw === undefined ? null : 'site';
}

/** The slice of `Storage` the sweep needs, so a test can hand in a stub. */
export type NotebookPlateStore = Pick<Storage, 'getItem' | 'removeItem'>;

/**
 * CLEAR A STORED PLATE, ONCE. Returns the value that was there (so a caller
 * and a test can see what was answered), or null when there was none or the
 * store could not be read. Never throws.
 */
export function retireStoredNotebookPlate(store: NotebookPlateStore | null | undefined): string | null {
	if (!store) return null;
	let stored: string | null = null;
	try {
		stored = store.getItem(NOTEBOOK_THEME_KEY);
	} catch {
		return null;
	}
	if (readStoredNotebookTheme(stored) === null) return null;
	try {
		store.removeItem(NOTEBOOK_THEME_KEY);
	} catch {
		// A blocked store keeps the value; it paints nothing either way.
	}
	return stored;
}

/** The page's own storage, when there is one to reach. Never throws. */
export function browserPlateStore(): NotebookPlateStore | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}
