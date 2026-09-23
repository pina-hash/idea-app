/**
 * THE SITE THEME REGISTRY: plain data and pure helpers, no runes, no storage,
 * no DOM. `$lib/theme.svelte.ts` is the reactive half and imports this; the
 * split is the repository's own "a pure, client-safe registry per subsystem"
 * rule, and here it buys something specific -- every rule in this file is
 * assertable in the `node` test project with no compiler, no browser and no
 * localStorage to stub.
 *
 * ---------------------------------------------------------------------------
 * ONE FUNCTION DECIDES WHETHER A THEME IS ON, AND BOTH APPLIERS ASK IT.
 * `themeAttrFor(theme, pathname, signedIn)` is the whole decision: the session
 * gate, the default-is-an-absence rule and the route scope. `ThemeRoot`
 * calls it on every client-side change, and the server calls it for every
 * registered theme to build the table the pre-paint boot script looks the
 * stored value up in (`themeBootTable` below). The boot script therefore holds
 * NO decision of its own -- it is a lookup of the stored string in a table
 * this function filled -- so the first paint and the hydrated page cannot
 * disagree about which theme is showing.
 */

export type SiteTheme = 'idea' | 'matrix' | 'space-white';

/** What `<html data-theme>` can carry. The default is the absence, so it is not here. */
export type SiteThemeAttr = Exclude<SiteTheme, 'idea'>;

/** The storage key, named here so the module and its tests cannot disagree. */
export const SITE_THEME_KEY = 'idea_site_theme';

/**
 * Every state, in the order the picker lists them. APPEND-ONLY, for the
 * reason `curriculum.ts`'s `SECTIONS` is: an id may be sitting in a browser's
 * storage, and a removed one is dropped by `readStoredTheme` rather than
 * honoured, which silently changes somebody's screen.
 */
export const SITE_THEMES: SiteTheme[] = ['idea', 'matrix', 'space-white'];

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
export function siteThemeAttr(theme: SiteTheme): SiteThemeAttr | undefined {
	return theme === DEFAULT_SITE_THEME ? undefined : (theme as SiteThemeAttr);
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
	matrix: 'Matrix',
	'space-white': 'Space White'
};

/**
 * What each option is FOR, under its name in the picker. A list of one-word
 * names says nothing about why you would pick one, and "Matrix" is a name
 * nobody can infer a look from -- exactly as "IDEA" is in the notebook's own
 * plate picker.
 *
 * SPACE WHITE'S NOTE NAMES WHERE IT PAINTS, because it is the one theme with a
 * route scope (below): picked on a Foundry or GAUNTLET page it changes nothing
 * on that page, and a row that says only "white" would read as a control that
 * did not work. When the scope widens, this sentence widens with it.
 */
export const SITE_THEME_NOTES: Record<SiteTheme, string> = {
	idea: 'The standard green-metal palette',
	matrix: 'Black ground, phosphor green, falling code',
	'space-white': 'A white console for the projector and bright rooms, on classroom pages'
};

/**
 * THE `theme-color` EACH THEME PUTS ON THE BROWSER'S OWN CHROME (the phone's
 * status bar, the tab strip on Android). The default is the literal
 * `src/app.html` has always carried, and `tests/theme-preference.test.ts`
 * holds the two equal, so the page and the registry cannot name two defaults.
 * Matrix keeps it: its page ground is #030503 against this #0A0C0D, a
 * difference nobody can see in a status bar, and holding it is what keeps a
 * Matrix user's browser byte-identical to before. Space White is its page
 * ground.
 */
export const SITE_THEME_COLORS: Record<SiteTheme, string> = {
	idea: '#0A0C0D',
	matrix: '#0A0C0D',
	'space-white': '#E8ECEB'
};

/** The theme-color for whatever attribute is on `<html>` (undefined = default). */
export function themeColorFor(attr: SiteThemeAttr | undefined): string {
	return attr ? SITE_THEME_COLORS[attr] : SITE_THEME_COLORS[DEFAULT_SITE_THEME];
}

/* ===========================================================================
 * THE ROUTE SCOPE.
 *
 * A LIGHT THEME HAS TO REPAINT WHAT A DARK ONE NEVER TOUCHES -- the semantic
 * inks (--green on white is 2.2:1) and the luminance of --white, --dim, --ice
 * and --gear, which are read as ink. Matrix is allowed to reach every page
 * because it moves neither; a theme that did would change contrast in rooms
 * it has never been measured in: FRC paints --dim on white paper, FSP reads
 * --white and --dim on its navy room, and every room with its own identity
 * (GAUNTLET, VANGUARD, GREENLINE, the Foundry, Maps, Tournaments, the coin
 * surfaces, IdeaCAD) reads the semantic hues on a dark plate of its own.
 *
 * So a SCOPED theme writes its attribute only on an ALLOWLIST of route
 * prefixes, and every other page renders in the default look BY CONSTRUCTION
 * -- there is no attribute there, so there is nothing to override and nothing
 * to measure. An allowlist and not a list of exclusions, because a room added
 * next term then gets the default look until somebody measures it, rather
 * than a light theme it was never checked against.
 *
 * THE LIST IS WHAT HAS BEEN MEASURED UNDER SPACE WHITE, AND NO MORE (ledger
 * 0297, package F1a). The classroom and the public reference viewer, which
 * mount the same `.cr-root` surfaces. The home page and the notebook are the
 * brief's scope too and are NOT here yet: the home hero, the launcher and the
 * notebook's plates paint literal dark values a token theme cannot reach, so
 * turning the attribute on there before their sweep (F1b, F4) would ship a
 * half-light page. Adding either is one entry here plus its line in the test.
 * ======================================================================== */

/** The themes whose attribute is written only on in-scope routes. */
export const SCOPED_SITE_THEMES: readonly SiteTheme[] = ['space-white'];

/** Production route prefixes a scoped theme covers: the prefix itself or anything under it. */
export const THEME_SCOPE_PREFIXES: readonly string[] = ['/classroom', '/reference'];

/**
 * THE `/dev` HARNESSES THAT STAND IN FOR THOSE ROUTES, matched as a raw
 * prefix of the path so a harness FAMILY (`/dev/classroom-split/...`,
 * `/dev/grading-rubric`) is one entry. They 404 in production, so this list
 * can change nothing a student sees; what it does is let a harness measure the
 * theme on the same component its real route mounts, and let a harness for an
 * out-of-scope room (`/dev/frc`, `/dev/foundry-*`) show the default look
 * exactly as its real route would.
 */
export const THEME_SCOPE_DEV_PREFIXES: readonly string[] = [
	'/dev/themes',
	'/dev/theme-switch',
	'/dev/classroom',
	'/dev/grading',
	'/dev/presence',
	'/dev/html-',
	'/dev/spec-',
	'/dev/check-in',
	'/dev/composer',
	'/dev/hall-pass',
	'/dev/song-queue',
	'/dev/instructor-',
	'/dev/item-images',
	'/dev/duplicate-drafts',
	'/dev/upload-limits',
	'/dev/attach-reach',
	'/dev/assignment-mirror',
	'/dev/ai-level-badge-reference'
];

/** Is this path one a scoped theme may paint? */
export function themeInScope(pathname: string): boolean {
	const p = pathname || '/';
	if (p.startsWith('/dev/')) return THEME_SCOPE_DEV_PREFIXES.some((d) => p.startsWith(d));
	return THEME_SCOPE_PREFIXES.some((x) => p === x || p.startsWith(x + '/'));
}

/**
 * THE DECISION. The attribute `<html>` should carry for this stored theme, on
 * this path, for a visitor who is or is not signed in.
 *
 *   - SIGNED OUT IS THE DEFAULT, ALWAYS. The control that turns a theme off
 *     lives in ProfileMenu, which renders nothing without a session, so a
 *     theme left on by the last person at a shared desktop would be one the
 *     next visitor cannot turn off (the argument in `theme.svelte.ts`).
 *   - THE DEFAULT IS AN ABSENCE (`siteThemeAttr`).
 *   - A SCOPED THEME IS AN ABSENCE OUTSIDE ITS SCOPE (the block above).
 */
export function themeAttrFor(
	theme: SiteTheme,
	pathname: string,
	signedIn: boolean
): SiteThemeAttr | undefined {
	if (!signedIn) return undefined;
	const attr = siteThemeAttr(theme);
	if (!attr) return undefined;
	if (SCOPED_SITE_THEMES.includes(theme) && !themeInScope(pathname)) return undefined;
	return attr;
}

/* ===========================================================================
 * BEFORE FIRST PAINT.
 *
 * `ThemeRoot` writes the attribute in an `$effect`, which runs after
 * hydration: measured on /dev/themes with Matrix stored, first contentful
 * paint at 192ms and `data-theme` at 829ms, so every full load painted 30-odd
 * frames of the wrong theme. The fix is a few bytes of script in `<head>`
 * that sets the attribute before the body is parsed.
 *
 * WHY A SCRIPT READING THE EXISTING localStorage KEY AND NOT A COOKIE. The
 * choice already lives in `idea_site_theme` in every browser that made one,
 * Matrix users included, and it is per device by design. A cookie mirror
 * would be a second copy of the preference that the server reads and the
 * store writes -- one that does not exist yet for anybody, so every existing
 * choice would flash once more until it was written, and one that can
 * disagree with the store forever after a write that failed. There is no CSP
 * on the portal, so an inline script is available.
 *
 * WHAT THE SERVER CONTRIBUTES is the two facts the browser cannot know before
 * hydration and the store cannot hold: whether this request has a session,
 * and whether this path is in a scoped theme's scope. It does not send those
 * facts; it evaluates `themeAttrFor` for every registered theme and sends the
 * ANSWERS, so the script is a table lookup with no rule in it to drift.
 * ======================================================================== */

/** The comment in `src/app.html` the server replaces with the boot script. */
export const THEME_BOOT_MARKER = '<!--idea-theme-boot-->';

/**
 * THE DEV HARNESSES WHOSE FAKED SESSION THE SERVER MAY ASSUME, AND ONLY
 * THOSE. A `/dev` page fakes its session in its own load, which the server
 * hook cannot see, so the hook has to be told which harness pages hand
 * `ThemeRoot` a `claims` object. Treating every `/dev` route as signed in was
 * the first draft and it was WRONG in a measurable way: most harnesses return
 * no claims, so the boot script painted a stored theme and `ThemeRoot` took it
 * off again after hydration (measured on /dev/classroom-split/s-1 with Space
 * White stored: the first paint and the settled page disagreed), which is the
 * flash this whole mechanism exists to remove, moved onto the harnesses.
 *
 * A harness joins by returning `claims` gated on exactly `?signedout=1`, and
 * `tests/theme-preference.test.ts` reads each listed page's load to check it
 * still does. A harness that fakes claims and is not listed simply gets no
 * pre-paint in dev, which is the pre-0297 behaviour and paints nothing wrong.
 */
export const THEME_BOOT_HARNESSES: readonly string[] = ['/dev/themes', '/dev/theme-switch'];

/** Whether a listed harness is showing its faked session for this request. */
export function themeBootHarnessSession(pathname: string, signedOutParam: string | null): boolean {
	const p = pathname || '/';
	return (
		THEME_BOOT_HARNESSES.some((h) => p === h || p.startsWith(h + '/')) && signedOutParam !== '1'
	);
}

/** stored value -> the attribute and the theme-color it paints, for this request. */
export type ThemeBootTable = Record<string, { a: SiteThemeAttr; c: string }>;

export function themeBootTable(pathname: string, signedIn: boolean): ThemeBootTable {
	const table: ThemeBootTable = {};
	for (const t of SITE_THEMES) {
		const a = themeAttrFor(t, pathname, signedIn);
		if (a) table[t] = { a, c: SITE_THEME_COLORS[t] };
	}
	return table;
}

/**
 * The inline script for this request, or the EMPTY STRING when no stored
 * value could apply here -- a signed-out page, or a path no theme reaches,
 * carries no script at all.
 *
 * `hasOwnProperty`, never a bare index: `m["constructor"]` is a function on
 * every object literal, and a stored value of "constructor" would otherwise
 * write `data-theme="undefined"`. Everything is inside one try: storage throws
 * where site data is blocked, and a throw here must cost the theme, never the
 * page. `<` is escaped in the table so nothing in it can close the element.
 */
export function themeBootScript(pathname: string, signedIn: boolean): string {
	const table = themeBootTable(pathname, signedIn);
	if (Object.keys(table).length === 0) return '';
	const json = JSON.stringify(table).replace(/</g, '\\u003c');
	const key = JSON.stringify(SITE_THEME_KEY);
	return (
		'<script>(function(){try{' +
		`var m=${json};var s=localStorage.getItem(${key});` +
		'if(s===null||!Object.prototype.hasOwnProperty.call(m,s))return;' +
		'var t=m[s];document.documentElement.setAttribute("data-theme",t.a);' +
		'var e=document.querySelector(\'meta[name="theme-color"]\');if(e)e.setAttribute("content",t.c)' +
		'}catch(e){}})()</script>'
	);
}
