/**
 * WHICH SITE THEME IS SHOWING.
 *
 * A reactive module-level `$state` backed by localStorage -- the
 * `notebook-theme.svelte.ts` / `creative.svelte.ts` / `audio-settings.svelte.ts`
 * convention, which is what this repository already does for a per-person
 * setting. IT IS PER BROWSER AND NOT PER ACCOUNT, and that is the settled
 * argument rather than a fresh one: this is a preference about the screen in
 * front of you and the light in the room, not about who you are. A student on
 * a bright shop workstation and the same student on a phone at night want
 * different answers, and a profile column would insist they want the same. It
 * is also why this needed no migration -- the notebook's three plates have run
 * this way since they shipped.
 *
 * THE FILE IS `.svelte.ts` AND NOT `.ts`. A `$state` rune only compiles in a
 * rune-aware module; a plain `.ts` would have to become a store or a hand-
 * rolled subscriber, which is a second mechanism for the thing the notebook
 * already solved once. The PURE half -- the ids, the labels, the attribute
 * mapping, the stored-value parse -- lives in `$lib/theme.ts` and is
 * re-exported below, so `tests/theme-preference.test.ts` can assert all of it
 * in the `node` project without a compiler or a localStorage stub.
 *
 * ---------------------------------------------------------------------------
 * THE DEFAULT IS THE IDEA PALETTE, AND `prefers-color-scheme` REACHES NOTHING.
 * The token layer is the console register unconditionally (colors.css's own
 * DEFAULT block says so, and the notebook retired its `system` state for the
 * same reason). A theme here is an explicit choice or it is nothing.
 *
 * ---------------------------------------------------------------------------
 * AND IT IS APPLIED ONLY WHERE ITS OWN CONTROL IS REACHABLE, which is the one
 * decision in this file worth arguing about.
 *
 * The control lives in `ProfileMenu.svelte`, and ProfileMenu renders NOTHING
 * when signed out (`{#if claims}`). The site is public-first: `/`, `/maps`,
 * `/assignments/*`, `/reference/*` and the tournament section all answer a
 * visitor with no session, and on those pages there is no menu to open. So a
 * theme left on by the last person at a shared school desktop would be a theme
 * the next person cannot turn off, on a page that offers them no control at
 * all -- and a theme you cannot turn off is worse than a theme you cannot turn
 * on.
 *
 * `ThemeRoot.svelte` therefore writes the attribute only when there is a
 * session, and the stored choice is kept rather than cleared: signing back in
 * restores it, and a signed-out visitor gets the standard IDEA palette on
 * every surface, always. The cost is named rather than hidden -- the theme
 * disappears at sign-out, which is surprising exactly once and is the safe
 * direction of surprising.
 *
 * ---------------------------------------------------------------------------
 * THE GATE, THE DEFAULT AND THE ROUTE SCOPE ARE ONE PURE FUNCTION NOW,
 * `themeAttrFor` in `$lib/theme`, and this module does not restate any of
 * them. `ThemeRoot` asks it on every client-side change and the server asks it
 * to build the pre-paint boot script's table (ledger 0297), so the first paint
 * and the hydrated page answer the same question the same way. The one theme
 * with a route scope, Space White, has a second control beside the profile
 * menu -- `$lib/shell/ThemeSwitch.svelte` in the classroom's header -- and it
 * is gated on the same session, so "the theme is on only where its control is
 * reachable" still holds.
 */

import {
	DEFAULT_SITE_THEME,
	readStoredTheme,
	SITE_THEME_KEY,
	SITE_THEMES,
	siteThemeAttr,
	type SiteTheme,
	type SiteThemeAttr
} from '$lib/theme';

export {
	DEFAULT_SITE_THEME,
	readStoredTheme,
	SCOPED_SITE_THEMES,
	SITE_THEME_COLORS,
	SITE_THEME_KEY,
	SITE_THEMES,
	SITE_THEME_LABELS,
	SITE_THEME_NOTES,
	siteThemeAttr,
	themeAttrFor,
	themeColorFor,
	themeInScope,
	type SiteTheme,
	type SiteThemeAttr
} from '$lib/theme';

function read(): SiteTheme {
	if (typeof localStorage === 'undefined') return DEFAULT_SITE_THEME;
	try {
		const stored = localStorage.getItem(SITE_THEME_KEY);
		const parsed = readStoredTheme(stored);
		if (parsed) return parsed;
		if (stored !== null) localStorage.removeItem(SITE_THEME_KEY);
		return DEFAULT_SITE_THEME;
	} catch {
		return DEFAULT_SITE_THEME;
	}
}

/* The first read is taken once and handed to both, so the remembered dark
   theme is seeded from a plain value rather than from the `$state` (a read of
   the rune here would only ever capture its initial value, which is exactly
   what the compiler warns about). */
const initialTheme = read();
let theme = $state<SiteTheme>(initialTheme);

/** The light theme the one-tap switch turns on, and the dark one it returns to (see below). */
const LIGHT_THEME: SiteTheme = 'space-white';
let lastDark: SiteTheme = initialTheme === LIGHT_THEME ? DEFAULT_SITE_THEME : initialTheme;

export function siteTheme(): SiteTheme {
	return theme;
}

export function setSiteTheme(next: SiteTheme) {
	theme = next;
	if (next !== LIGHT_THEME) lastDark = next;
	if (typeof localStorage === 'undefined') return;
	try {
		/* TURNING IT OFF IS A REMOVAL, NOT A STORED 'idea'. The default is the
		   absence of the attribute and it is now also the absence of the key, so
		   a browser that has been switched back is byte-identical to one that
		   never switched at all -- which is the property "turning it off must be
		   complete" asks for, and a stored default would quietly not have. */
		if (next === DEFAULT_SITE_THEME) localStorage.removeItem(SITE_THEME_KEY);
		else localStorage.setItem(SITE_THEME_KEY, next);
	} catch {
		// A blocked or full store costs the persistence, never the choice.
	}
}

/** What the attribute is right now, for the one component that writes it. */
export function siteThemeAttrNow(): SiteThemeAttr | undefined {
	return siteThemeAttr(theme);
}

/* ---------------------------------------------------------------------------
 * THE ONE-TAP SWITCH (`$lib/shell/ThemeSwitch.svelte`) IS A TOGGLE BETWEEN
 * SPACE WHITE AND WHATEVER DARK THEME WAS SHOWING, and "whatever was showing"
 * has to be remembered somewhere or a Matrix user who taps it on and off
 * lands on IDEA. It is remembered HERE, in memory, and deliberately not in a
 * second storage key: the persisted preference is still exactly one value,
 * and the cost is named rather than hidden -- a Matrix user who reloads while
 * on Space White and then taps the switch off gets IDEA, and the profile
 * menu's rows are one step away for Matrix. A second key is a second copy of
 * the preference that can disagree with the first.
 * ------------------------------------------------------------------------- */
/** Is the light theme the stored choice right now. */
export function lightThemeOn(): boolean {
	return theme === LIGHT_THEME;
}

/** The switch's one action: light on, or back to the dark theme it replaced. */
export function toggleLightTheme() {
	if (theme === LIGHT_THEME) {
		setSiteTheme(lastDark);
	} else {
		lastDark = theme;
		setSiteTheme(LIGHT_THEME);
	}
}
