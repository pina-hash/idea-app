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
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
		   silent case: it paints under the theme and is undefined without it. */
		const base = read(new URL('colors.css', DS)) + read(new URL('effects.css', DS));
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

	it('no theme declares an identity or a semantic token', () => {
		const forbidden = new Set([...IDENTITY, ...SEMANTIC]);
		const offenders: string[] = [];
		for (const [file, css] of Object.entries(themeSource)) {
			for (const { name } of declarations(css)) {
				if (forbidden.has(name)) offenders.push(`${file}: ${name}`);
			}
		}
		expect(offenders).toEqual([]);
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

	it('every theme holds all four within 2% of the base luminance', () => {
		const drift: string[] = [];
		let checked = 0;
		for (const [file, css] of Object.entries(themeSource)) {
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
	   theme root itself, or the one named non-token exception -- the shell's
	   own decorative `.bg-fx` layer, which is fixed, pointer-events:none and
	   aria-hidden, so it can change no geometry and eat no tap. A theme that
	   started restyling components would be unbounded, and nothing else would
	   report it. */
	const ROOT = /^:root\[data-theme='[a-z-]+'\]$/;
	const BG_FX = /^:root\[data-theme='[a-z-]+'\] \.bg-fx$/;

	it('every theme selector is the theme root or the shell background layer', () => {
		const offenders: string[] = [];
		let seen = 0;
		for (const [file, css] of Object.entries(themeSource)) {
			for (const sel of selectors(css)) {
				seen++;
				if (!ROOT.test(sel) && !BG_FX.test(sel)) offenders.push(`${file}: ${sel}`);
			}
		}
		expect(seen).toBeGreaterThan(0);
		expect(offenders).toEqual([]);
	});

	it('POSITIVE CONTROL: the selector reader finds a component rule', () => {
		const mutant = ":root[data-theme='x'] .app-card { border-color: #0f0; }\n.pm-panel { color: red; }";
		const found = selectors(mutant);
		expect(found).toContain(':root[data-theme=\'x\'] .app-card');
		expect(found).toContain('.pm-panel');
		expect(found.filter((s) => !ROOT.test(s) && !BG_FX.test(s)).length).toBe(2);
	});

	it('anything a theme animates is gated on prefers-reduced-motion', () => {
		/* A theme that rains characters down a screen is motion. The gate is
		   `no-preference` -- declared inside the query rather than declared and
		   cancelled -- so a reader with the preference set has no animation to
		   cancel. `tools/browser-verify/routes/themes-state-matrix.mjs` measures
		   the running and reduced phases in a real browser; this is the cheap
		   half that reddens with no browser at all. */
		for (const [file, css] of Object.entries(themeSource)) {
			const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
			const animates = /(^|[\s;{])animation\s*:/m.test(bare);
			if (!animates) continue;
			for (const m of bare.matchAll(/(^|[\s;{])animation\s*:\s*([^;]+);/g)) {
				const decl = m[2].trim();
				if (/^\s*none\b/.test(decl)) continue;
				// The declaration must sit inside a no-preference query.
				const before = bare.slice(0, m.index ?? 0);
				const lastQuery = before.lastIndexOf('@media (prefers-reduced-motion: no-preference)');
				const lastClose = before.lastIndexOf('\n}\n');
				expect(lastQuery, `${file}: ungated \`animation: ${decl}\``).toBeGreaterThan(-1);
				expect(lastQuery, `${file}: \`animation: ${decl}\` is outside the gate`).toBeGreaterThan(
					lastClose
				);
			}
		}
	});
});
