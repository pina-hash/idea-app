/**
 * WHERE THE PREFERENCE LIVES, AND WHAT IT DOES WITH A VALUE IT DOES NOT KNOW.
 *
 * Two guarantees here fail silently and neither is visible from a browser pass
 * over a page that is working:
 *
 *   - THE DEFAULT IS AN ABSENCE. Turning the theme off has to leave a document
 *     and a browser store byte-identical to one that never turned it on. A
 *     `setSiteTheme('idea')` that WROTE `'idea'` would look identical on
 *     screen and leave residue in every browser that ever tried the theme.
 *
 *   - A RETIRED ID IS DROPPED. The notebook's plate picker has already been
 *     through this once ('dark' and 'system' are still sitting in students'
 *     browsers), and the repair is to answer the unknown value and clear it
 *     rather than fall back forever.
 *
 * The pure half is imported and CALLED; the reactive half and the applier are
 * asserted over their source, because a `$state` module and an `$effect` need
 * a compiler and a DOM that the `node` project deliberately does not have (see
 * vitest.config.ts, and the effect-reactivity test's own note on why a runtime
 * control written here would be green and prove nothing).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every file under a directory. A sweep that walked nothing would report a
 *  clean result, so its caller asserts a non-zero count of what it found. */
function* walk(dir: string): Generator<string> {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) yield* walk(p);
		else yield p;
	}
}

import {
	DEFAULT_SITE_THEME,
	readStoredTheme,
	SITE_THEMES,
	SITE_THEME_KEY,
	SITE_THEME_LABELS,
	SITE_THEME_NOTES,
	siteThemeAttr
} from '../src/lib/theme';

const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

describe('the theme registry', () => {
	it('lists the default first and gives every state a label and a note', () => {
		expect(SITE_THEMES[0]).toBe(DEFAULT_SITE_THEME);
		expect(SITE_THEMES.length).toBeGreaterThan(1); // a picker with one row is not a picker
		for (const t of SITE_THEMES) {
			expect(SITE_THEME_LABELS[t], t).toBeTruthy();
			/* A NOTE PER STATE, not a name alone: "Matrix" is a name nobody can
			   infer a look from, which is the same reason the notebook's picker
			   carries one under "IDEA". */
			expect(SITE_THEME_NOTES[t], t).toBeTruthy();
			expect(SITE_THEME_NOTES[t], t).not.toBe(SITE_THEME_LABELS[t]);
		}
		// Exhaustive in both directions: a state added to the union with no
		// label would be a blank row in the menu.
		expect(Object.keys(SITE_THEME_LABELS).sort()).toEqual([...SITE_THEMES].sort());
		expect(Object.keys(SITE_THEME_NOTES).sort()).toEqual([...SITE_THEMES].sort());
	});

	it('the default is the ABSENCE of the attribute and every other state has one', () => {
		expect(siteThemeAttr(DEFAULT_SITE_THEME)).toBeUndefined();
		for (const t of SITE_THEMES) {
			if (t === DEFAULT_SITE_THEME) continue;
			expect(siteThemeAttr(t), t).toBe(t);
		}
	});

	it('an unknown or retired stored id answers null rather than falling back', () => {
		for (const t of SITE_THEMES) expect(readStoredTheme(t)).toBe(t);
		expect(readStoredTheme(null)).toBeNull();
		// The shapes a real browser can actually be holding.
		for (const junk of ['dark', 'system', 'IDEA', 'matrix ', '', '{}', 'null']) {
			expect(readStoredTheme(junk), junk).toBeNull();
		}
	});

	it('the storage key is namespaced beside the other per-browser preferences', () => {
		expect(SITE_THEME_KEY).toBe('idea_site_theme');
		// The notebook's own key, so the two cannot collide.
		expect(SITE_THEME_KEY).not.toBe('idea_notebook_theme');
	});
});

describe('turning it off leaves nothing behind', () => {
	const reactive = src('../src/lib/theme.svelte.ts');

	it('setSiteTheme REMOVES the key for the default rather than storing it', () => {
		/* Asserted on the source because the writer needs a localStorage this
		   project has none of. The shape is small enough to read: the default
		   branch must call removeItem and must not call setItem. */
		const body = reactive.slice(reactive.indexOf('export function setSiteTheme'));
		expect(body).toContain('removeItem(SITE_THEME_KEY)');
		const defaultBranch = /if \(next === DEFAULT_SITE_THEME\) localStorage\.removeItem/;
		expect(body).toMatch(defaultBranch);
		// A stored default is the residue this exists to prevent.
		expect(body).not.toMatch(/setItem\(SITE_THEME_KEY,\s*DEFAULT_SITE_THEME\)/);
	});

	it('every store touch is inside a try/catch: a blocked store costs the persistence, never the choice', () => {
		/* Storage THROWS when it is full and where site data is blocked, and an
		   exception escaping a click handler is a dead control. */
		const touches = [...reactive.matchAll(/localStorage\.(getItem|setItem|removeItem)/g)];
		expect(touches.length).toBeGreaterThan(2); // positive control on the sweep
		for (const m of touches) {
			const before = reactive.slice(0, m.index ?? 0);
			expect(before.lastIndexOf('try {'), m[0]).toBeGreaterThan(before.lastIndexOf('} catch'));
		}
	});
});

describe('the applier', () => {
	const root = src('../src/lib/design-system/themes/ThemeRoot.svelte');
	const layout = src('../src/routes/+layout.svelte');

	it('writes onto the document element and removes rather than blanks', () => {
		expect(root).toContain('document.documentElement');
		expect(root).toContain("removeAttribute('data-theme')");
		// A class toggle or an inline style would both leave residue that
		// `removeAttribute` does not.
		expect(root).not.toContain('classList');
		expect(root).not.toMatch(/\.style\./);
	});

	it('is gated on a session, which is the whole signed-out answer', () => {
		/* The control lives in ProfileMenu, which renders nothing when signed
		   out, so a theme that survived sign-out would be one a visitor on a
		   public page cannot turn off. */
		expect(root).toMatch(/page\.data\.claims/);
		expect(root).toMatch(/signedIn\s*\?\s*siteThemeAttr/);
		const menu = src('../src/lib/ProfileMenu.svelte');
		expect(menu).toContain('{#if claims}');
		expect(menu).toContain('setSiteTheme');
	});

	it('is mounted ONCE, in the root layout, so every page route inherits it', () => {
		/* The SiteFeedback / NavigationProgress argument: there are no layout
		   resets in src/routes, so this mount is what makes the theme something
		   a new route inherits rather than has to remember. */
		expect(layout).toContain("import ThemeRoot from '$lib/design-system/themes/ThemeRoot.svelte'");
		expect([...layout.matchAll(/<ThemeRoot\s*\/>/g)].length).toBe(1);
		/* And NOTHING ELSE MOUNTS IT anywhere under src/, which is what makes
		   "once" true rather than "once here". A second mount is two effects
		   writing one attribute, and the loser wins silently. */
		const mounts: string[] = [];
		for (const f of walk(fileURLToPath(new URL('../src/', import.meta.url)))) {
			if (!f.endsWith('.svelte')) continue;
			if (/<ThemeRoot\s*\/?>/.test(readFileSync(f, 'utf8'))) mounts.push(f);
		}
		expect(mounts.length, mounts.join(', ')).toBe(1);
		expect(mounts[0].endsWith('src/routes/+layout.svelte')).toBe(true);
	});
});
