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
 */

import {
	DEFAULT_SITE_THEME,
	readStoredTheme,
	SITE_THEME_KEY,
	SITE_THEMES,
	siteThemeAttr,
	type SiteTheme
} from '$lib/theme';

export {
	DEFAULT_SITE_THEME,
	readStoredTheme,
	SITE_THEME_KEY,
	SITE_THEMES,
	SITE_THEME_LABELS,
	SITE_THEME_NOTES,
	siteThemeAttr,
	type SiteTheme
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

let theme = $state<SiteTheme>(read());

export function siteTheme(): SiteTheme {
	return theme;
}

export function setSiteTheme(next: SiteTheme) {
	theme = next;
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
export function siteThemeAttrNow(): 'matrix' | undefined {
	return siteThemeAttr(theme);
}
