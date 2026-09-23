/**
 * THE THEME LAYER'S THREE RULES, ASSERTED OFF THE STYLESHEETS THEMSELVES.
 *
 * Every regression this file exists to catch is SILENT. A theme that repainted
 * the launcher's per-app accents renders perfectly; it simply makes twelve
 * cards one colour, and the only thing that would notice is a person looking
 * at the grid. A theme that introduced a token nobody else declares renders
 * perfectly too, until the surface that needed the token in the base palette
 * shows nothing. And a theme that moved --dim's LIGHTNESS renders perfectly on
 * every surface it was designed for, while quietly changing the contrast of
 * five FRC components on a white plate this theme has never been near.
 *
 * None of the three fails a type check, a build, or a browser pass over the
 * pages the theme was written against. So they are asserted here, over
 * `src/lib/design-system/themes/*.css`, against the token file as the source
 * of truth -- and each sweep carries a POSITIVE CONTROL, because a parser that
 * silently matched nothing would report a clean result for every one of them.
 *
 * ---------------------------------------------------------------------------
 * THE RULES CHANGED DELIBERATELY FOR ONE THEME, AND THIS IS WHY (ledger 0297,
 * package F1a). Space White is a LIGHT theme, and a light theme cannot keep
 * two of these rules and be readable: --green on a white panel is 2.2:1, and
 * --white, --dim, --ice and --gear are read as INK, so holding their
 * luminance would hold them pale on a pale ground. The rules exist to keep
 * rooms no theme is measured in legible -- FRC paints --dim on white paper,
 * FSP reads --white on navy, every identity room reads the semantic hues on a
 * dark plate of its own. So the protection for a theme that must repaint them
 * moves from "never repaint" to "never REACH those rooms": its attribute is
 * written only on an allowlist of routes (`themeAttrFor` / `themeInScope` in
 * src/lib/theme.ts), and the block at the foot of this file proves the scope
 * answers "out" for FRC, FSP and every identity room. A theme that is NOT in
 * `SCOPED_SITE_THEMES` -- Matrix today -- is held to the original rules,
 * unchanged, and IDENTITY stays forbidden for every theme, scoped or not.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	SCOPED_SITE_THEMES,
	SITE_THEMES,
	THEME_SCOPE_EXACT,
	THEME_SCOPE_PREFIXES,
	themeAttrFor,
	themeInScope,
	type SiteTheme
} from '../src/lib/theme';

const DS = new URL('../src/lib/design-system/', import.meta.url);
const THEMES_DIR = new URL('themes/', DS);

const read = (u: URL) => readFileSync(fileURLToPath(u), 'utf8');

/** Every theme file on disk, so a theme added next term is swept with no edit here. */
const THEME_FILES = readdirSync(fileURLToPath(THEMES_DIR))
	.filter((f) => f.endsWith('.css') && f !== 'index.css')
	.sort();

const themeSource = Object.fromEntries(
	THEME_FILES.map((f) => [f, read(new URL(f, THEMES_DIR))])
) as Record<string, string>;

/** The theme id a file declares its root block for, read off the file itself. */
const themeIdOf = (css: string): string | null =>
	/:root\[data-theme='([a-z-]+)'\]\s*\{/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? null;

/** Is this file's theme one whose attribute is route-scoped (see theme.ts). */
const isScoped = (file: string) =>
	SCOPED_SITE_THEMES.includes(themeIdOf(themeSource[file]) as SiteTheme);

/** `--name: value;` declarations, comments stripped first so a documented hex
 *  in a header block cannot be read as a declaration. */
function declarations(css: string): { name: string; value: string }[] {
	const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const out: { name: string; value: string }[] = [];
	for (const m of bare.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
		out.push({ name: m[1], value: m[2].trim() });
	}
	return out;
}

/** Selectors, comments stripped, at-rule preludes excluded. */
function selectors(css: string): string[] {
	const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const out: string[] = [];
	for (const m of bare.matchAll(/(^|[};])\s*([^{};@]+?)\s*\{/g)) {
		const sel = m[2].trim().replace(/\s+/g, ' ');
		if (sel && !sel.startsWith('@') && !/^(from|to|\d+%)$/.test(sel)) out.push(sel);
	}
	return out;
}

const hexToRgb = (h: string): [number, number, number] => {
	const s = h.replace('#', '');
	const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
	return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
};
/** WCAG relative luminance. The whole point of the luminance rule below is
 *  that contrast is a function of THIS and nothing else, so it is what the
 *  test compares rather than a hex string or an HSL lightness. */
const luminance = (hex: string) => {
	const f = (v: number) => {
		const x = v / 255;
		return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
	};
	const [r, g, b] = hexToRgb(hex);
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

describe('the theme layer exists and is swept', () => {
	it('finds at least one theme file, and index.css imports every one of them', () => {
		// A sweep over an empty directory passes every assertion below.
		expect(THEME_FILES.length).toBeGreaterThan(0);
		const index = read(new URL('index.css', THEMES_DIR));
		for (const f of THEME_FILES) expect(index).toContain(`./${f}`);
		// And the token entry point pulls the themes in, or none of this paints.
		expect(read(new URL('index.css', DS))).toContain('./themes/index.css');
	});

	it('the token files are not edited by a theme: every theme token already exists', () => {
		/* A theme "adds a layer that overrides token VALUES; it does not edit the
		   token file and it does not introduce a token." A NEW name here is the
		   silent case: it paints under the theme and is undefined without it.

		   THE TOKEN FILES ARE FOUR, AND THIS USED TO READ TWO. surfaces.css
		   declares --texture-brushed and --texture-vignette on :root, and
		   Space White sets both to `none` (no glow, no blur); typography.css is
		   the fourth token file index.css imports. Reading only colors.css and
		   effects.css would call a real token "new". */
		const base =
			read(new URL('colors.css', DS)) +
			read(new URL('effects.css', DS)) +
			read(new URL('surfaces.css', DS)) +
			read(new URL('typography.css', DS));
		const known = new Set(declarations(base).map((d) => d.name));
		expect(known.size).toBeGreaterThan(50); // positive control on the parser
		expect(known.has('--bg0')).toBe(true);

		const unknown: string[] = [];
		for (const [file, css] of Object.entries(themeSource)) {
			for (const { name } of declarations(css)) {
				if (!known.has(name)) unknown.push(`${file}: ${name}`);
			}
		}
		expect(unknown).toEqual([]);
	});
});

describe('identity and semantic colours are not themeable', () => {
	/* KIND 1, IDENTITY. The launcher declares each app's pair on its own
	   `[data-app='<id>']` rule; a theme that redeclared either name would
	   repaint every card at once, because the theme sits on :root and those
	   are inherited custom properties. The list is the FAMILY, not an app
	   roster, which is what makes a thirteenth app need no edit here. */
	const IDENTITY = ['--acc-primary', '--acc-secondary', '--acc-ink', '--acc-edge', '--acc-line'];

	/* KIND 2, SEMANTIC. Six hues plus the reserved status red and the two ink
	   corrections. These are how a reader tells success from warning from
	   metadata from error on one screen. */
	const SEMANTIC = [
		'--green',
		'--gold',
		'--cyan',
		'--amber',
		'--teal',
		'--violet',
		'--violet-ink',
		'--crimson'
	];

	it('no theme declares an identity token, scoped or not', () => {
		/* THE LAUNCHER'S ACCENTS ARE NOT A THEME'S TO MOVE, LIGHT OR DARK. A
		   light theme that needs a card's accent re-inked does it in the card's
		   own sanctioned place (the sweep's), never by repainting the pair on
		   :root -- which would make twelve cards one colour. */
		const offenders: string[] = [];
		let swept = 0;
		for (const [file, css] of Object.entries(themeSource)) {
			for (const { name } of declarations(css)) {
				swept++;
				if (IDENTITY.includes(name)) offenders.push(`${file}: ${name}`);
			}
		}
		expect(swept).toBeGreaterThan(10); // the sweep read real declarations
		expect(offenders).toEqual([]);
	});

	it('no UNSCOPED theme declares a semantic token; a scoped one may, and only because it is scoped', () => {
		const offenders: string[] = [];
		let unscoped = 0;
		for (const [file, css] of Object.entries(themeSource)) {
			if (isScoped(file)) continue;
			unscoped++;
			for (const { name } of declarations(css)) {
				if (SEMANTIC.includes(name)) offenders.push(`${file}: ${name}`);
			}
		}
		// Matrix is unscoped and is held to the original rule, unchanged.
		expect(unscoped).toBeGreaterThan(0);
		expect(themeIdOf(themeSource['matrix.css'])).toBe('matrix');
		expect(isScoped('matrix.css')).toBe(false);
		expect(offenders).toEqual([]);
	});

	it('every theme file that repaints a semantic or luminance-held token is in SCOPED_SITE_THEMES', () => {
		/* The inverse direction, so the exemption above cannot be claimed by a
		   file that is not actually scoped: a theme repainting --green that
		   `themeAttrFor` would write on every route is the FRC-paper failure
		   with a new name. */
		/* "Repaints" a luminance-held tier means MOVES it past the 2% the rule
		   below allows -- Matrix re-hues all four at held luminance, which is
		   exactly what an unscoped theme may do. */
		const baseVals = Object.fromEntries(
			declarations(read(new URL('colors.css', DS))).map((d) => [d.name, d.value])
		) as Record<string, string>;
		const heldMoved = (d: { name: string; value: string }) =>
			['--white', '--dim', '--ice', '--gear'].includes(d.name) &&
			(!/^#[0-9a-f]{6}$/i.test(d.value) ||
				Math.abs(luminance(d.value) - luminance(baseVals[d.name])) / luminance(baseVals[d.name]) > 0.02);
		const repainters = Object.entries(themeSource)
			.filter(([, css]) => declarations(css).some((d) => SEMANTIC.includes(d.name) || heldMoved(d)))
			.map(([file]) => file);
		expect(repainters).toContain('space-white.css'); // positive control: the one that does
		for (const file of repainters) expect(isScoped(file), file).toBe(true);
		// And every scoped id has its file, so the list cannot name a ghost.
		for (const id of SCOPED_SITE_THEMES) {
			expect(Object.values(themeSource).some((css) => themeIdOf(css) === id), id).toBe(true);
		}
	});

	it('POSITIVE CONTROL: the same sweep DOES catch a forbidden declaration', () => {
		/* Without this, a parser that had stopped matching declarations would
		   report the clean result above forever. The mutant is a string, not a
		   file edit -- nothing on disk is touched. */
		const mutant = ":root[data-theme='x'] {\n\t--acc-primary: #00ff41;\n}";
		const names = declarations(mutant).map((d) => d.name);
		expect(names).toContain('--acc-primary');
	});

	it('the launcher still declares a distinct accent per app, and the count is real', () => {
		/* The other half of the same claim, from the launcher's own side: if
		   the per-app rules ever collapsed into one, the theme rule above would
		   still pass and the grid would still be unreadable. */
		const launcher = read(new URL('../src/lib/AppLauncher.svelte', import.meta.url));
		const bare = launcher.replace(/\/\*[\s\S]*?\*\//g, '');
		const apps = new Set<string>();
		for (const m of bare.matchAll(/\.app-card\[data-app='([a-z-]+)'\]/g)) apps.add(m[1]);
		expect(apps.size).toBeGreaterThanOrEqual(9);

		/* THE PAIR IS THE IDENTITY, NOT THE PRIMARY -- and asserting the primary
		   alone would have understated it by one. GAUNTLET and VANGUARD share
		   #00ff41 as their primary and are told apart by their SECONDARY (cyan
		   against acid yellow), which is exactly the case a primary-only count
		   would have called a collision. Measured in Chromium over the rendered
		   grid: 13 cards, 10 distinct (primary, secondary) pairs -- the nine
		   declared here plus the shared default the unlisted cards take. */
		const pairs = new Set<string>();
		for (const m of bare.matchAll(
			/\.app-card\[data-app='[a-z-]+'\][^{]*\{([\s\S]*?)\n\t\}/g
		)) {
			const p = /--acc-primary:\s*([^;]+);/.exec(m[1]);
			const q = /--acc-secondary:\s*([^;]+);/.exec(m[1]);
			if (p) pairs.add(`${p[1].trim()}|${q ? q[1].trim() : ''}`);
		}
		// A floor, because a tenth declared pair is a legitimate change and a
		// ceiling here would redden on the next app anybody adds.
		expect(pairs.size).toBeGreaterThanOrEqual(9);
	});
});

describe('a chrome token whose ground the theme does not own holds its luminance', () => {
	/* The four tokens read OUTSIDE the portal shell, on grounds no theme file
	   decides: --dim paints five FRC components' meta on .frc-root's WHITE
	   paper, and .fsp-root reads --white and --dim dozens of times on a light
	   room that is deliberately not IDEA. Contrast is a function of relative
	   luminance, so holding the luminance holds every ratio in every room a
	   theme never measured. */
	const UNOWNED = ['--white', '--dim', '--ice', '--gear'];
	const TOLERANCE = 0.02; // 2% of the base luminance

	const baseValues = Object.fromEntries(
		declarations(read(new URL('colors.css', DS))).map((d) => [d.name, d.value])
	) as Record<string, string>;

	it('the base values parse as hex (positive control on the reader)', () => {
		for (const t of UNOWNED) {
			expect(baseValues[t], t).toMatch(/^#[0-9a-f]{3,8}$/i);
			expect(luminance(baseValues[t])).toBeGreaterThan(0);
		}
		// The four are genuinely different from each other, so a reader that
		// returned one value for all of them would not pass this.
		expect(new Set(UNOWNED.map((t) => baseValues[t])).size).toBe(4);
	});

	it('every UNSCOPED theme holds all four within 2% of the base luminance', () => {
		/* A SCOPED theme is exempt, and the exemption is paid for by the scope:
		   its attribute never reaches FRC's paper or FSP's navy, which are the
		   rooms this rule exists for (the block at the foot of this file). */
		const drift: string[] = [];
		let checked = 0;
		for (const [file, css] of Object.entries(themeSource)) {
			if (isScoped(file)) continue;
			const vals = Object.fromEntries(declarations(css).map((d) => [d.name, d.value]));
			for (const t of UNOWNED) {
				const v = vals[t];
				if (!v) continue; // not repainting it at all is fine
				expect(v, `${file}: ${t}`).toMatch(/^#[0-9a-f]{3,8}$/i);
				checked++;
				const base = luminance(baseValues[t]);
				const now = luminance(v);
				const delta = Math.abs(now - base) / base;
				if (delta > TOLERANCE) {
					drift.push(`${file}: ${t} ${baseValues[t]} -> ${v} (${(delta * 100).toFixed(1)}%)`);
				}
			}
		}
		// A sweep that checked nothing would report no drift.
		expect(checked).toBeGreaterThan(0);
		expect(drift).toEqual([]);
	});

	it('POSITIVE CONTROL: a lightened --dim is caught', () => {
		/* #849080 -> #a9bcab is --dim moved to --ice's lightness: exactly the
		   kind of "it looks better on black" edit this rule exists to refuse. */
		const base = luminance('#849080');
		const mutant = luminance('#a9bcab');
		expect(Math.abs(mutant - base) / base).toBeGreaterThan(TOLERANCE);
		// And the shipped value is NOT caught, so the control is not vacuous.
		const shipped = luminance('#5e9a60');
		expect(Math.abs(shipped - base) / base).toBeLessThanOrEqual(TOLERANCE);
	});
});

describe('a theme is a token layer, not a stylesheet', () => {
	/* WHAT KEEPS A THEME BOUNDED. Every selector in a theme file must be the
	   theme root itself, or one of a NAMED list of non-token exceptions, each
	   with the reason it is there and a pinned shape. A theme that started
	   restyling components would be unbounded, and nothing else would report
	   it. The list is pinned in length, every entry must be USED by some theme
	   (a stale exception is a hole nobody is looking through), and each
	   exception may carry only the declarations named beside it. */
	const ROOT = /^:root\[data-theme='[a-z-]+'\]$/;
	const EXCEPTIONS: { selector: RegExp; why: string; onlyDeclares: RegExp[] }[] = [
		{
			/* The shell's own decorative background layer: position fixed,
			   pointer-events none, aria-hidden, z-index 0, mounted once in the
			   root layout -- restyling it can change no geometry, eat no tap and
			   reach no reader. The rain canvas is its child (MatrixRain.svelte)
			   and rides on the same properties. */
			selector: /^:root\[data-theme='[a-z-]+'\] \.bg-fx$/,
			why: 'the shell background layer',
			onlyDeclares: [/^background(-color|-image|-size|-repeat|-position)?$/]
		},
		{
			/* The landing page's opaque plate. `/` is wrapped in
			   `.legacy-index.surface-machined`: position relative, z-index 1,
			   `background-color: var(--bg0)` -- opaque and ABOVE .bg-fx, so
			   without this the rain falls behind a plate on the one page every
			   student opens. Measured: with the first version of the theme on,
			   no part of .bg-fx was visible anywhere on the home harness. The
			   plate's textures stay (they are translucent and sit over the
			   rain as an edge vignette); only its colour goes. */
			selector: /^:root\[data-theme='[a-z-]+'\] \.legacy-index\.surface-machined$/,
			why: "the landing page's opaque plate, made transparent so the rain shows on /",
			onlyDeclares: [/^background-color$/]
		},
		{
			/* The landing page's own particle starfield, a second fixed canvas
			   at 35% opacity inside that wrapper. Two particle systems on one
			   ground are noise; under this theme the rain is the one. */
			selector: /^:root\[data-theme='[a-z-]+'\] \.legacy-index #bg-canvas$/,
			why: "the landing page's starfield, switched off under the rain",
			onlyDeclares: [/^display$/]
		},
		/* THE TWO ROOMS THE RAIN REACHES INTO (ledger 0117, report 25), two
		   selectors each and one declaration each. The room stylesheet hides
		   `.bg-fx` with `body:has(<room>) .bg-fx { display: none }` and paints
		   the wrapper opaque; under the theme the first is put back and the
		   second is made transparent, and nothing else about the room moves --
		   its cards keep their fills, so copy inside one is unchanged. The
		   NOTEBOOK is deliberately absent: ledger 0119 gave it a Matrix plate
		   of its own whose header says no rain, and whether that plate should
		   carry it is Mr. Pina's call (see matrix.css). GAUNTLET, GREENLINE,
		   VANGUARD, FRC, Tournaments and FSP are deliberately NOT here either,
		   and a third room is a third pair with its reason written beside it,
		   never a wider selector. */
		{
			selector: /^:root\[data-theme='[a-z-]+'\] body:has\(\.cr-root\) \.bg-fx$/,
			why: 'the classroom room lets the shell layer back under the theme',
			onlyDeclares: [/^display$/]
		},
		{
			selector: /^:root\[data-theme='[a-z-]+'\] \.cr-root$/,
			why: "the classroom's opaque plate, made transparent so the rain shows",
			onlyDeclares: [/^background-color$/]
		},
		{
			selector: /^:root\[data-theme='[a-z-]+'\] body:has\(\.fg-root\) \.bg-fx$/,
			why: 'the Foundry room lets the shell layer back under the theme',
			onlyDeclares: [/^display$/]
		},
		{
			selector: /^:root\[data-theme='[a-z-]+'\] \.fg-root$/,
			why: "the forge's opaque plate, made transparent so the rain shows",
			onlyDeclares: [/^background-color$/]
		},
		/* THE EIGHTH, AND THE FIRST THAT DECLARES TOKENS RATHER THAN A PROPERTY
		   (ledger 0297). Space White is a light theme scoped to the classroom,
		   and three dark surfaces are mounted INSIDE the classroom -- IdeaCAD's
		   Blade editor on a schema-4 item, the notebook under view-as, and the
		   deck's black projection stage. Each reads the semantic inks off
		   <html>, so each would inherit white-tuned ink on a plate still black.
		   This block hands each island the DEFAULT value of every token the
		   theme moves, at zero specificity (`:where` on both halves) so every
		   room's own declarations still win. It may declare CUSTOM PROPERTIES
		   ONLY -- no property at all -- and the block below derives exactly
		   which ones from the stylesheets. */
		{
			selector:
				/^:where\(:root\[data-theme='space-white'\]\) :where\(\.ic-root, \.nb-root, \.deck-stage\)$/,
			why: "Space White's dark islands keep the default look inside a light page",
			onlyDeclares: []
		}
	];

	/** The rule bodies of a stylesheet, comments stripped: [selector, body]. */
	function rules(css: string): [string, string][] {
		const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
		const out: [string, string][] = [];
		/* Each match consumes `selector { body }` whole; what is left between
		   matches is whitespace, an at-rule prelude or a stray brace, none of
		   which is a selector. An at-rule prelude cannot match: `@` is excluded
		   from the selector class. */
		for (const m of bare.matchAll(/([^{};@]+?)\s*\{([^{}]*)\}/g)) {
			const sel = m[1].trim().replace(/\s+/g, ' ');
			if (sel && !sel.startsWith('@') && !/^(from|to|\d+%)$/.test(sel)) out.push([sel, m[2]]);
		}
		return out;
	}
	const propsOf = (body: string) =>
		[...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]).filter((n) => !n.startsWith('--'));

	it('the exception list is exactly eight entries, each used by some theme', () => {
		expect(EXCEPTIONS.length).toBe(8);
		for (const ex of EXCEPTIONS) {
			const used = Object.values(themeSource).some((css) => selectors(css).some((s) => ex.selector.test(s)));
			expect(used, `stale exception: ${ex.why}`).toBe(true);
		}
	});

	it('every theme selector is the theme root or a named exception, and each exception declares only what it is for', () => {
		const offenders: string[] = [];
		let seen = 0;
		for (const [file, css] of Object.entries(themeSource)) {
			for (const [sel, body] of rules(css)) {
				seen++;
				if (ROOT.test(sel)) continue;
				const ex = EXCEPTIONS.find((e) => e.selector.test(sel));
				if (!ex) {
					offenders.push(`${file}: ${sel}`);
					continue;
				}
				for (const prop of propsOf(body)) {
					if (!ex.onlyDeclares.some((re) => re.test(prop))) offenders.push(`${file}: ${sel} declares ${prop}, outside its exception`);
				}
			}
		}
		expect(seen).toBeGreaterThan(3); // the root block plus the three exceptions, at least
		expect(offenders).toEqual([]);
	});

	it('POSITIVE CONTROL: the selector reader finds a component rule, and an exception that grows is caught', () => {
		const mutant = ":root[data-theme='x'] .app-card { border-color: #0f0; }\n.pm-panel { color: red; }\n:root[data-theme='x'] .legacy-index #bg-canvas { display: none; opacity: 0.5; }";
		const found = rules(mutant);
		expect(found.map(([s]) => s)).toContain(":root[data-theme='x'] .app-card");
		expect(found.map(([s]) => s)).toContain('.pm-panel');
		const unlisted = found.filter(([s]) => !ROOT.test(s) && !EXCEPTIONS.some((e) => e.selector.test(s)));
		expect(unlisted.length).toBe(2);
		const grown = found.find(([s]) => /#bg-canvas/.test(s))!;
		const ex = EXCEPTIONS[2];
		expect(propsOf(grown[1]).filter((p) => !ex.onlyDeclares.some((re) => re.test(p)))).toEqual(['opacity']);
	});

	it('a theme file carries no CSS animation at all: the motion is the canvas, gated in the component', () => {
		/* The first version of the theme animated .bg-fx's background-position
		   and gated it on prefers-reduced-motion in this file. That rule is
		   gone, and the rain is a JS-driven canvas whose gate is measured by
		   tests/dom/theme-rain-mount.test.ts (no frame scheduled under
		   `reduce`, a still field painted instead) and by the harness reading
		   data-motion off the canvas. A CSS animation reappearing here would be
		   a second, ungated copy of the motion -- so its absence is asserted,
		   not merely its gating. */
		for (const [file, css] of Object.entries(themeSource)) {
			const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
			expect(bare, `${file} declares an animation`).not.toMatch(/(^|[\s;{])animation(-name)?\s*:/m);
			expect(bare, `${file} declares keyframes`).not.toMatch(/@keyframes/);
		}
	});
});

describe("Space White's dark islands: the block is DERIVED from the stylesheets, in both directions", () => {
	/* WHICH TOKENS THE ISLAND BLOCK MUST HAND BACK is not a list anybody should
	   keep by hand, because the answer moves every time a token is added to a
	   base file. It is every base token the theme redeclares, PLUS every base
	   token whose value depends -- through any chain of var() -- on one it
	   redeclares: an alias resolves where it is DECLARED, so --focus-ring:
	   var(--cyan) computed on <html> reaches an island as the light theme's
	   cyan unless the island redeclares the alias itself. This computes that
	   closure off the four token files and holds the block to it exactly, and
	   each value to its base declaration verbatim. */
	const bareOf = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
	const declsIn = (body: string) => {
		const out: Record<string, string> = {};
		for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) out[m[1]] = m[2].replace(/\s+/g, ' ').trim();
		return out;
	};
	/** The body of the FIRST block opening with `selectorStart`. */
	function blockAfter(css: string, selectorStart: string): Record<string, string> {
		const bare = bareOf(css);
		const at = bare.indexOf(selectorStart);
		expect(at, `selector not found: ${selectorStart}`).toBeGreaterThan(-1);
		const open = bare.indexOf('{', at);
		return declsIn(bare.slice(open + 1, bare.indexOf('\n}', open)));
	}

	const base: Record<string, string> = {
		...blockAfter(read(new URL('colors.css', DS)), ':root {'),
		...blockAfter(read(new URL('effects.css', DS)), ':root {'),
		...blockAfter(read(new URL('surfaces.css', DS)), ':root {'),
		...blockAfter(read(new URL('typography.css', DS)), ':root {')
	};
	const sw = themeSource['space-white.css'];
	const moved = blockAfter(sw, ":root[data-theme='space-white'] {");
	const island = blockAfter(sw, ":where(:root[data-theme='space-white'])");
	const refs = (v: string) => [...v.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);

	function closure(movedNames: Set<string>): Set<string> {
		const out = new Set<string>([...movedNames].filter((n) => n in base));
		let grew = true;
		while (grew) {
			grew = false;
			for (const [n, v] of Object.entries(base)) {
				if (!out.has(n) && refs(v).some((r) => out.has(r))) {
					out.add(n);
					grew = true;
				}
			}
		}
		return out;
	}

	it('reads real blocks (positive control on the reader)', () => {
		expect(Object.keys(base).length).toBeGreaterThan(80);
		expect(base['--bg0']).toBe('#121a12');
		expect(Object.keys(moved).length).toBeGreaterThan(30);
		expect(moved['--green']).toBe('#3b6c36');
		expect(island['--green']).toBe('#78b870');
	});

	it('the island block declares exactly the dependency closure of what the theme moves', () => {
		const need = closure(new Set(Object.keys(moved)));
		// The closure reaches aliases the theme never names, which is its point.
		expect(need.has('--focus-ring')).toBe(true);
		expect(need.has('--nb-accent')).toBe(true);
		expect(need.has('--accent-ink')).toBe(true);
		expect([...need].sort()).toEqual(Object.keys(island).sort());
	});

	it('every island value is its base declaration, verbatim', () => {
		const drift: string[] = [];
		for (const [n, v] of Object.entries(island)) if (base[n] !== v) drift.push(`${n}: ${v} vs base ${base[n]}`);
		expect(Object.keys(island).length).toBeGreaterThan(40);
		expect(drift).toEqual([]);
	});

	it('POSITIVE CONTROL: the closure reaches an alias of a moved token and leaves an unrelated one out', () => {
		const need = closure(new Set(['--cyan']));
		expect(need.has('--focus-ring')).toBe(true); // var(--cyan)
		expect(need.has('--status-info')).toBe(true); // var(--cyan)
		expect(need.has('--bg0')).toBe(false); // unrelated, not pulled in
		// An island that forgot one alias fails the equality above.
		const short = Object.keys(island).filter((n) => n !== '--focus-ring').sort();
		expect(short).not.toEqual([...closure(new Set(Object.keys(moved)))].sort());
	});
});

describe('a theme that repaints what the rooms read never reaches them: the route scope', () => {
	/* The protection the luminance and semantic rules gave FRC's paper and
	   FSP's navy, moved to where it now lives. Every room with its own
	   identity is listed; a scoped theme must answer "out" for every one, for
	   a SIGNED-IN visitor, which is the only visitor any theme applies to. */
	const ROOMS_OUT = [
		'/frc',
		'/frc/training/unit-1',
		'/fsp',
		'/fsp/live',
		'/fsp/ask',
		'/fsp-pulse',
		'/fsp-tech-selection',
		'/foundry',
		'/foundry/review',
		'/gauntlet',
		'/gauntlet/author',
		'/greenline',
		'/vanguard',
		'/maps',
		'/maps/edit',
		'/tournaments',
		'/tournaments/abc/tv',
		'/coins',
		'/coins/index.html',
		'/coin-desk',
		'/ideacad',
		'/a/app-id/',
		'/b/app-id/version-id/',
		'/hx/doc-id',
		'/dev/frc',
		'/dev/fsp-day1',
		'/dev/foundry-gallery',
		'/dev/gauntlet-shell',
		'/dev/greenline-portal',
		'/dev/ideacad',
		'/dev/maps-viewer',
		'/dev/tournaments',
		'/dev/coin-desk'
	];

	it('FRC and FSP are OUT of scope, and so is every identity room, for every scoped theme', () => {
		expect(SCOPED_SITE_THEMES.length).toBeGreaterThan(0);
		// The brief's two named rooms, counted so a list that lost them reddens.
		expect(ROOMS_OUT.filter((p) => /^\/(dev\/)?(frc|fsp)/.test(p)).length).toBeGreaterThan(6);
		for (const p of ROOMS_OUT) {
			expect(themeInScope(p), p).toBe(false);
			for (const t of SCOPED_SITE_THEMES) expect(themeAttrFor(t, p, true), `${t} on ${p}`).toBeUndefined();
		}
		// No allowlisted prefix names either room, however spelled.
		for (const x of THEME_SCOPE_PREFIXES) expect(x).not.toMatch(/^\/(frc|fsp)/);
	});

	it('POSITIVE CONTROL: the classroom IS in scope, so the refusals above are the scope and not a dead function', () => {
		for (const p of ['/classroom', '/classroom/s-1', '/classroom/s-1/item/i-1', '/reference/i-1', '/dev/themes', '/dev/classroom-split/s-1']) {
			expect(themeInScope(p), p).toBe(true);
			expect(themeAttrFor('space-white', p, true), p).toBe('space-white');
		}
		// A near-miss spelling is not a prefix match.
		expect(themeInScope('/classroomx')).toBe(false);
	});

	/* THE HOME PAGE IS IN SCOPE AS ONE EXACT PATH (ledger 0297, package F1b),
	   and this is the assertion that keeps it one. Every route in the site
	   begins with `/`, so the failure it guards against is the careless edit
	   that puts `/` in the PREFIX list -- which would reach FRC's paper and
	   FSP's navy in one line and redden nothing else in this file, because the
	   rooms-out sweep above would still read "out" for any room whose path the
	   prefix matcher happened to reject. Both directions, on the same function:
	   `/` is in, and nothing that merely starts with it is. */
	it('the home page is in scope as an EXACT path, and nothing under it rides in with it', () => {
		// IN: the page itself, for a signed-in visitor, and its harnesses.
		expect(THEME_SCOPE_EXACT).toContain('/');
		expect(themeInScope('/')).toBe(true);
		for (const t of SCOPED_SITE_THEMES) expect(themeAttrFor(t, '/', true), `${t} on /`).toBe(t);
		expect(themeInScope('/dev/home-order')).toBe(true);
		// Signed out is still the default, on the home page as everywhere.
		for (const t of SCOPED_SITE_THEMES) expect(themeAttrFor(t, '/', false), `${t} on / signed out`).toBeUndefined();
		// OUT: every path under `/` that is not itself in scope, the rooms first.
		const underRoot = ['/frc', '/fsp', '/fsp/live', '/archive', '/foundry', '/gauntlet', '/index.html', '//', '/209h', '/coins/'];
		for (const p of underRoot) {
			expect(themeInScope(p), p).toBe(false);
			for (const t of SCOPED_SITE_THEMES) expect(themeAttrFor(t, p, true), `${t} on ${p}`).toBeUndefined();
		}
		// And the structural half: `/` is never a PREFIX, and every exact path is
		// a path rather than a pattern.
		expect(THEME_SCOPE_PREFIXES).not.toContain('/');
		for (const x of THEME_SCOPE_EXACT) expect(x).toMatch(/^\/[a-z0-9-]*$/);
	});

	it('POSITIVE CONTROL: the same sweep catches `/` put in the PREFIX list', () => {
		/* The matcher is re-run by hand with `/` added to the prefixes, which is
		   the one-line edit the test above exists to refuse; it must put FRC in
		   scope, or the refusal above is not what keeps FRC out. The mutant is a
		   local copy of the rule, not a file edit. */
		const mutant = (p: string) => [...THEME_SCOPE_PREFIXES, '/'].some((x) => p === x || p.startsWith(x === '/' ? x : x + '/'));
		expect(mutant('/frc')).toBe(true);
		expect(mutant('/fsp/live')).toBe(true);
		expect(themeInScope('/frc')).toBe(false);
	});

	it('an UNSCOPED theme is not route-limited: Matrix paints every room it always did', () => {
		for (const p of [...ROOMS_OUT, '/classroom', '/']) expect(themeAttrFor('matrix', p, true), p).toBe('matrix');
		expect(SITE_THEMES).toContain('matrix');
	});
});
