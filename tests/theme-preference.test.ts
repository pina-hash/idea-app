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
	SITE_THEME_COLORS,
	SITE_THEMES,
	SITE_THEME_KEY,
	SITE_THEME_LABELS,
	SITE_THEME_NOTES,
	siteThemeAttr,
	THEME_BOOT_HARNESSES,
	THEME_BOOT_MARKER,
	themeAttrFor,
	themeBootHarnessSession,
	themeBootScript,
	themeBootTable,
	themeColorFor
} from '../src/lib/theme';
import { runInNewContext } from 'node:vm';

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
		/* THE GATE MOVED INTO THE PURE FUNCTION, DELIBERATELY (ledger 0297).
		   This line used to match `signedIn ? siteThemeAttr(...)` written inline
		   in ThemeRoot. The pre-paint boot script needs the same answer before
		   hydration, and a second spelling of "signed in, not the default, in
		   scope" in the server hook is the copy that stops agreeing -- so the
		   gate is `themeAttrFor`, which both ask, and ThemeRoot hands it the
		   session and the path. The gate's own behaviour is asserted by CALLING
		   it, below, rather than by reading the component. */
		expect(root).toMatch(/themeAttrFor\(\s*siteTheme\(\),\s*page\.url\.pathname,\s*signedIn\s*\)/);
		expect(root).not.toMatch(/signedIn\s*\?\s*siteThemeAttr/);
		for (const t of SITE_THEMES) {
			for (const p of ['/', '/classroom', '/classroom/s-1', '/maps', '/frc']) {
				expect(themeAttrFor(t, p, false), `${t} signed out on ${p}`).toBeUndefined();
			}
		}
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

/*
 * THE PRE-PAINT WRITER (ledger 0297, package F1a). ThemeRoot's $effect runs
 * after hydration -- measured on /dev/themes with Matrix stored: first
 * contentful paint at 192ms and `data-theme` at 829ms -- so every full load
 * painted the wrong theme first. An inline script in <head> now sets the
 * attribute before the body is parsed, and these assertions are what keep it
 * honest, because every way it can break is silent: a script that never ran
 * leaves the page exactly as it looked before this bundle (a flash nobody
 * files), and a script that disagreed with ThemeRoot would flash ONE theme
 * and settle on another.
 *
 * THE SCRIPT IS EXECUTED, NOT READ. `runInNewContext` runs the exact string
 * the server injects against a fake `document` and `localStorage`, for every
 * stored value a real browser can hold on every kind of path, signed in and
 * out, and the attribute it writes is compared with what `themeAttrFor` --
 * ThemeRoot's answer -- says for the same inputs. So the two appliers are
 * proven to agree case for case rather than argued to.
 */
type FakeDoc = { attr: string | null; color: string };
function runBoot(script: string, stored: string | null, opts: { throws?: boolean } = {}): FakeDoc {
	const out: FakeDoc = { attr: null, color: SITE_THEME_COLORS.idea };
	if (!script) return out;
	const body = script.replace(/^<script>/, '').replace(/<\/script>$/, '');
	const meta = { setAttribute: (_k: string, v: string) => (out.color = v) };
	runInNewContext(body, {
		localStorage: {
			getItem: (k: string) => {
				if (opts.throws) throw new Error('SecurityError: storage blocked');
				return k === SITE_THEME_KEY ? stored : null;
			}
		},
		document: {
			documentElement: { setAttribute: (_k: string, v: string) => (out.attr = v) },
			querySelector: (sel: string) => (sel === 'meta[name="theme-color"]' ? meta : null)
		}
	});
	return out;
}

describe('the pre-paint writer agrees with ThemeRoot, case for case', () => {
	const STORED: (string | null)[] = [null, 'idea', 'matrix', 'space-white', 'dark', 'MATRIX', '', 'constructor', '__proto__', 'toString'];
	const PATHS = ['/', '/classroom', '/classroom/s-1/item/i-1', '/reference/i-1', '/frc', '/fsp/live', '/foundry', '/gauntlet', '/notebook', '/dev/themes', '/dev/frc'];

	it('writes exactly the attribute and theme-color ThemeRoot would, for every stored value, path and session', () => {
		let cases = 0;
		let themed = 0;
		for (const signedIn of [true, false]) {
			for (const path of PATHS) {
				const script = themeBootScript(path, signedIn);
				for (const stored of STORED) {
					const theme = readStoredTheme(stored) ?? DEFAULT_SITE_THEME;
					const want = themeAttrFor(theme, path, signedIn) ?? null;
					const got = runBoot(script, stored);
					expect(got.attr, `${signedIn ? 'in' : 'out'} ${path} stored=${JSON.stringify(stored)}`).toBe(want);
					expect(got.color, `${path} ${stored}`).toBe(themeColorFor(want ?? undefined));
					cases++;
					if (want) themed++;
				}
			}
		}
		// Both kinds of answer were actually exercised: a sweep that only ever
		// answered "no theme" would pass the equality above vacuously.
		expect(cases).toBe(2 * PATHS.length * STORED.length);
		expect(themed).toBeGreaterThan(10);
	});

	it('Space White paints only inside its scope, Matrix everywhere, and nothing signed out', () => {
		expect(runBoot(themeBootScript('/classroom/s-1', true), 'space-white').attr).toBe('space-white');
		expect(runBoot(themeBootScript('/classroom/s-1', true), 'space-white').color).toBe('#E8ECEB');
		expect(runBoot(themeBootScript('/frc', true), 'space-white').attr).toBeNull();
		expect(runBoot(themeBootScript('/frc', true), 'matrix').attr).toBe('matrix');
		expect(runBoot(themeBootScript('/classroom', false), 'matrix').attr).toBeNull();
	});

	it('a signed-out page, or one no theme reaches, carries no script at all', () => {
		for (const p of PATHS) expect(themeBootScript(p, false), p).toBe('');
		expect(Object.keys(themeBootTable('/classroom', false))).toEqual([]);
		// And a signed-in one does, with the default never in the table (it is an absence).
		const table = themeBootTable('/classroom', true);
		expect(Object.keys(table).sort()).toEqual(['matrix', 'space-white']);
		expect(table).not.toHaveProperty('idea');
	});

	it('a blocked store costs the theme, never the page: the script swallows the throw', () => {
		const script = themeBootScript('/classroom', true);
		expect(() => runBoot(script, 'matrix', { throws: true })).not.toThrow();
		expect(runBoot(script, 'matrix', { throws: true }).attr).toBeNull();
	});

	it('the script cannot close its own element or be read as a replace() pattern', () => {
		const script = themeBootScript('/classroom', true);
		expect(script.startsWith('<script>')).toBe(true);
		expect(script.endsWith('</script>')).toBe(true);
		// Exactly one closing tag, the real one.
		expect(script.split('</script>').length).toBe(2);
		expect(script).not.toContain('$');
		expect(script).toContain(JSON.stringify(SITE_THEME_KEY));
	});

	it('src/app.html carries the marker once, AFTER the theme-color meta it updates, and names the registry default', () => {
		const html = src('../src/app.html');
		expect(html.split(THEME_BOOT_MARKER).length).toBe(2);
		const meta = html.indexOf('<meta name="theme-color"');
		expect(meta).toBeGreaterThan(-1);
		expect(html.indexOf(THEME_BOOT_MARKER)).toBeGreaterThan(meta);
		// Before %sveltekit.head% and the body, so it runs before anything paints.
		expect(html.indexOf(THEME_BOOT_MARKER)).toBeLessThan(html.indexOf('%sveltekit.head%'));
		expect(html).toContain(`<meta name="theme-color" content="${SITE_THEME_COLORS.idea}" />`);
	});

	it('hooks.server.ts injects it after the session is known, with a function replacer', () => {
		const hooks = src('../src/hooks.server.ts');
		expect(hooks).toMatch(/sequence\(legacyRedirects,\s*supabase,\s*authGuard,\s*themeBoot\)/);
		expect(hooks).toMatch(/themeBootScript\(pathname,\s*!!event\.locals\.claims/);
		expect(hooks).toMatch(/html\.replace\(THEME_BOOT_MARKER,\s*\(\)\s*=>\s*script\)/);
		// The dev-harness session is dev-only, and it is the named list, not every /dev route.
		expect(hooks).toMatch(/const harnessSession = dev && themeBootHarnessSession\(pathname, searchParams\.get\('signedout'\)\)/);
		expect(hooks).not.toMatch(/pathname\.startsWith\('\/dev\/'\)/);
	});

	/* THE SERVER MAY ASSUME A HARNESS SESSION ONLY WHERE THE HARNESS FAKES ONE.
	   The boot script's table is built with the server's idea of "signed in";
	   ThemeRoot's comes from `page.data.claims`, which a harness supplies in its
	   own load. If the two disagree the first paint shows a theme the hydrated
	   page then removes -- measured on /dev/classroom-split/s-1 before the list
	   existed. So each listed harness is read and must return `claims` gated on
	   exactly `?signedout=1`, the one parameter the hook reads. */
	it('assumes a session only on the listed harnesses, each of which fakes one on the same parameter', () => {
		expect(THEME_BOOT_HARNESSES.length).toBeGreaterThan(0);
		for (const h of THEME_BOOT_HARNESSES) {
			const load = src(`../src/routes${h}/+page.ts`);
			expect(load, h).toMatch(/const signedOut = url\.searchParams\.get\('signedout'\) === '1';/);
			expect(load, h).toMatch(/claims: signedOut\s*\?\s*null/);
			expect(themeBootHarnessSession(h, null), h).toBe(true);
			expect(themeBootHarnessSession(h, '1'), h).toBe(false);
		}
		// Negative controls: a harness that fakes nothing, a prefix lookalike, a real route.
		expect(themeBootHarnessSession('/dev/classroom-split/s-1', null)).toBe(false);
		expect(themeBootHarnessSession('/dev/themes-lookalike', null)).toBe(false);
		expect(themeBootHarnessSession('/classroom', null)).toBe(false);
	});
});
