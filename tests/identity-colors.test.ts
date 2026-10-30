/**
 * THE SITE'S IDENTITY COLOURS ARE ONE LIBRARY, SOLVED, AND HELD TO THE RULE
 * (ledger 0467, feedback ac7d7b60).
 *
 * Mr. Pina's rule for identity colour, 2026-10-28: calendar layers, unit
 * tints and class colours come from the kit's colour library
 * (`tools/hx-kit/kit/colors.json`) through `solve()`, per theme; at most five
 * to seven hues a reader must tell apart on one screen, each with a word or a
 * glyph beside it; green only for act and done; no neon.
 *
 * THE LAUNCHER IS NOT IN THIS ANY MORE (ledger 0472, decision 73). Ledger 0467
 * put the home screen's apps into six shared colour families under this rule;
 * Mr. Pina called the result off-brand and decided every card is its own
 * app's, "unique visually, completely, like real apps on a computer" (since
 * ledger 0474, its icon and title on a banner in the room's own colours). So
 * a launcher card quotes its room's own colours (held by
 * tests/home-order-and-accent.test.ts), reads no `--id-*` token, is under no
 * hue budget, and may be neon where its room is.
 *
 * What is held here, and why each is a silent regression:
 *   1. THE GENERATED FILES ARE FRESH. `src/lib/design-system/identity.css` and
 *      `identity.ts` are exactly what `tools/identity-colors.mjs` writes now. A
 *      hand edit, or a library or ground change nobody regenerated, paints a
 *      value the solver never gave, and nothing on screen says so.
 *   2. EVERY `--id-*` NAME src/ READS IS GENERATED, AND EVERY GENERATED ONE IS
 *      READ. An undefined custom property paints nothing (a card with no
 *      strip), silently.
 *   3. EACH SCREEN'S SET: the calendar's layers and the unit tints are each
 *      at most seven entries, their FILLS stay
 *      CIEDE2000 10 apart in normal vision and 8 apart under simulated
 *      deuteranopia and protanopia (Machado 2009, solve()'s own `simulate`) on
 *      both grounds, their inks 10 apart in normal vision, and none is within
 *      10 of the brand green. The inks are not held to the colour-blind floor:
 *      at 4.8:1 on a near-white panel every ink sits near one lightness, so two
 *      inks can only differ in hue, which the simulation removes (the decision
 *      tests/color-tokens.test.ts records for the status inks). That is why
 *      every one of these surfaces carries a word or a glyph beside the hue,
 *      and why the calendar's glyphs are filled with the FILL.
 *   4. NO NEON LITERAL IN src/ outside a named list of files this lane does not
 *      own, each with its reason. The list can only shrink: a listed file that
 *      no longer carries one reddens until it is struck off.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDENTITY, type IdentityName } from '$lib/design-system/identity';
import { LAUNCHER_ROOMS } from '$lib/launcher/rooms';
import { CALENDAR_LAYERS, LAYER_MARK_SHAPES } from '$lib/calendar/model';
import { THUMB_TINT_COUNT } from '$lib/classroom/thumbnail';
import { CLASS_THEME_PALETTES, SECTION_ACCENTS } from '$lib/classroom/class-theme';

type Rgb = { r: number; g: number; b: number };
type Gen = {
	generate: () => { css: string; ts: string };
	USED: string[];
	BRAND: Record<string, unknown>;
	CSS_OUT: string;
	TS_OUT: string;
	solverThemes: () => { dark: { panels: Rgb[] }; light: { panels: Rgb[] } };
};
type ColorLib = {
	hex: (h: string) => Rgb;
	contrast: (a: Rgb, b: Rgb) => number;
	deltaE2000: (a: Rgb, b: Rgb) => number;
	simulate: (c: Rgb, kind: 'protan' | 'deutan' | 'tritan') => Rgb;
};
let G: Gen;
let K: ColorLib;
/* A computed URL, never a literal specifier: a literal import pulls the tool's
   JavaScript into svelte-check's program (docs/subsystems/testing.md). */
beforeAll(async () => {
	G = (await import(new URL('../tools/identity-colors.mjs', import.meta.url).href)) as Gen;
	K = (await import(new URL('../tools/hx-kit/color.mjs', import.meta.url).href)) as ColorLib;
});

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}
const SRC_FILES = walk(join(ROOT, 'src')).map((p) => relative(ROOT, p).split('\\').join('/'));
const TEXT_FILES = SRC_FILES.filter((p) => /\.(svelte|ts|js|mjs|css|html|json|svg)$/.test(p));

const BRAND_GREEN = { dark: '#78b870', light: '#2d6b26' };
/** The library's neutral metals the site draws. */
const NEUTRALS = new Set<IdentityName>(['titanium', 'aluminum', 'steel']);
type Side = 'dark' | 'light';
const SIDES: Side[] = ['dark', 'light'];

/** Every pair of a set, measured on one role, both sides, normal and simulated. */
function pairs(names: IdentityName[], role: 'fill' | 'ink') {
	const out: { a: string; b: string; side: Side; plain: number; deut: number; prot: number }[] = [];
	for (const side of SIDES)
		for (let i = 0; i < names.length; i++)
			for (let j = i + 1; j < names.length; j++) {
				const x = K.hex(IDENTITY[names[i]][side][role]);
				const y = K.hex(IDENTITY[names[j]][side][role]);
				out.push({
					a: names[i],
					b: names[j],
					side,
					plain: K.deltaE2000(x, y),
					deut: K.deltaE2000(K.simulate(x, 'deutan'), K.simulate(y, 'deutan')),
					prot: K.deltaE2000(K.simulate(x, 'protan'), K.simulate(y, 'protan'))
				});
			}
	return out;
}

/** The floors a screen's set is held to (see the header). */
function holdSet(where: string, names: IdentityName[]) {
	expect(names.length, `${where}: positive control, the set was read`).toBeGreaterThanOrEqual(4);
	expect(new Set(names).size, `${where}: at most seven hues on one screen`).toBeLessThanOrEqual(7);
	const fills = pairs([...new Set(names)], 'fill');
	expect(fills.length).toBeGreaterThan(0);
	const fillFail = fills.filter((p) => p.plain < 10 || p.deut < 8 || p.prot < 8).map((p) => `${p.a}/${p.b} ${p.side} ${p.plain.toFixed(1)}/${p.deut.toFixed(1)}/${p.prot.toFixed(1)}`);
	expect(fillFail, `${where}: fills`).toEqual([]);
	/* Two neutral metals (anchor chroma under OKLCH 0.03) are not two hues: they
	   are held to 8 in every vision and told apart by glyph and lightness. */
	const neutral = (n: IdentityName) => NEUTRALS.has(n);
	const inkFail = pairs([...new Set(names)], 'ink')
		.filter((p) => p.plain < (neutral(p.a as IdentityName) && neutral(p.b as IdentityName) ? 8 : 10))
		.map((p) => `${p.a}/${p.b} ${p.side} ${p.plain.toFixed(1)}`);
	expect(inkFail, `${where}: inks`).toEqual([]);
	for (const n of names)
		for (const side of SIDES)
			for (const role of ['fill', 'ink'] as const) {
				const d = K.deltaE2000(K.hex(IDENTITY[n][side][role]), K.hex(BRAND_GREEN[side]));
				expect(d, `${where}: ${n} ${side} ${role} is within the brand green`).toBeGreaterThanOrEqual(10);
			}
}

describe('1. the generated files are what the generator writes now', () => {
	it('identity.css and identity.ts match a fresh run of tools/identity-colors.mjs', () => {
		const { css, ts } = G.generate();
		expect(readFileSync(G.CSS_OUT, 'utf8'), 'run `node tools/identity-colors.mjs`').toBe(css);
		expect(readFileSync(G.TS_OUT, 'utf8'), 'run `node tools/identity-colors.mjs`').toBe(ts);
	});

	it('takes every entry from the kit library (or the brand token), and the library is not edited here', () => {
		const lib = JSON.parse(read('tools/hx-kit/kit/colors.json')).colors as Record<string, { anchor: string }>;
		for (const name of G.USED) {
			expect(lib[name], `${name} is in colors.json`).toBeDefined();
			expect(IDENTITY[name as IdentityName].anchor.toLowerCase()).toBe(lib[name].anchor.toLowerCase());
		}
		expect(Object.keys(IDENTITY).sort()).toEqual([...G.USED, ...Object.keys(G.BRAND)].sort());
		// No library entry the kit marks identity-only for green-means-done is used.
		expect(G.USED).not.toContain('bambu-green');
	});

	it('every ink clears 4.5:1 as a word on every ground it was solved over (positive control on the contract)', () => {
		const th = G.solverThemes();
		for (const [name, e] of Object.entries(IDENTITY)) {
			for (const g of th.dark.panels) expect(K.contrast(K.hex(e.dark.ink), g), `${name} dark`).toBeGreaterThanOrEqual(4.5);
			for (const g of th.light.panels) expect(K.contrast(K.hex(e.light.ink), g), `${name} light`).toBeGreaterThanOrEqual(4.5);
		}
		// NEGATIVE CONTROL: a raw anchor is not an ink. FIRST red as authored is not a word on the dark card.
		expect(K.contrast(K.hex('#ED1C24'), K.hex('#1a2a1a'))).toBeLessThan(4.5);
	});
});

describe('2. every --id-* name read in src/ is generated, and every generated one is read', () => {
	const refRe = /--id-([a-z]+(?:-[a-z]+)*?)-(ink|fill|on|line|wash)\b/g;
	const reads = new Set<string>();
	for (const f of TEXT_FILES) {
		if (f.startsWith('src/lib/design-system/identity.')) continue;
		for (const m of readFileSync(join(ROOT, f), 'utf8').matchAll(refRe)) reads.add(m[1]);
	}
	const classNames = [...CLASS_THEME_PALETTES.flatMap((p) => [p.wash.lib, p.edge.lib]), ...SECTION_ACCENTS.map((a) => a.colour.lib)];

	it('reads only generated names', () => {
		expect(reads.size).toBeGreaterThan(5); // positive control on the reader
		expect([...reads].filter((n) => !(n in IDENTITY))).toEqual([]);
	});

	it('generates nothing nobody reads', () => {
		const used = new Set([...reads, ...classNames]);
		expect(Object.keys(IDENTITY).filter((n) => !used.has(n))).toEqual([]);
	});
});

describe('3. each screen holds at most seven hues, told apart in every vision', () => {
	const launcher = read('src/lib/AppLauncher.svelte');
	const style = launcher.slice(launcher.lastIndexOf('<style>'));
	const ruleBody = (selector: string) => {
		const at = style.indexOf(selector);
		if (at < 0) return '';
		const open = style.indexOf('{', at);
		return style.slice(open + 1, style.indexOf('}', open));
	};
	const entry = (body: string, prop: string) =>
		body.match(new RegExp(`${prop}:\\s*var\\(--id-([a-z-]+?)-(?:ink|fill)\\)`))?.[1] as IdentityName | undefined;

	it('the launcher is outside the budget: no card reads a library entry, every card quotes its room (decision 73)', () => {
		const launcher = read('src/lib/AppLauncher.svelte');
		const cards = read('src/lib/launcher/cards.css');
		const art = read('src/lib/launcher/CardArt.svelte');
		const scenes = read('src/lib/launcher/art.ts');
		// Positive control: these are the files that paint the cards.
		expect(cards).toMatch(/\.app-card\[data-app='coins'\]/);
		expect(art).toContain('sceneSvg(app)');
		expect(scenes).toMatch(/\bgreenline\(app: App, ctx: Ctx\)/);
		for (const [name, src] of [['AppLauncher', launcher], ['cards.css', cards], ['CardArt', art], ['art.ts', scenes]] as const) {
			expect(src, name).not.toMatch(/--id-[a-z]+(?:-[a-z]+)*-(ink|fill|on|line|wash)\b/);
			expect(src, name).not.toContain('data-family');
		}
	});

	it('the calendar: seven layers, seven entries, seven glyphs; colour and fill are one entry', () => {
		const names = CALENDAR_LAYERS.map((l) => {
			const line = l.color.match(/^var\(--id-([a-z-]+)-line\)$/)?.[1];
			const fill = l.fill.match(/^var\(--id-([a-z-]+)-fill\)$/)?.[1];
			expect(line, `${l.id} colour is a library line`).toBeDefined();
			expect(fill, `${l.id} fill`).toBe(line);
			return line as IdentityName;
		});
		expect(names).toHaveLength(7);
		holdSet('calendar', names);
		const marks = CALENDAR_LAYERS.map((l) => l.mark);
		expect(new Set(marks).size, 'one glyph per layer').toBe(marks.length);
		for (const m of marks) expect(LAYER_MARK_SHAPES[m]).toMatch(/^M/);
	});

	it('the unit tints: one rule per tint, THUMB_TINT_COUNT of them, ink and fill one entry', () => {
		const thumb = read('src/lib/classroom/PostThumbnail.svelte');
		const rules = [...thumb.matchAll(/\.pt\[data-tint='(\d)'\] \{ --pt-tint: var\(--id-([a-z-]+)-ink\); --pt-fill: var\(--id-([a-z-]+)-fill\); \}/g)];
		expect(rules.map((r) => Number(r[1]))).toEqual([...Array(THUMB_TINT_COUNT).keys()]);
		for (const r of rules) expect(r[3], `tint ${r[1]}`).toBe(r[2]);
		// No tint token left that is not one of these.
		expect(thumb).not.toMatch(/--thumb-tint-\d/);
		holdSet('unit tints', rules.map((r) => r[2] as IdentityName));
	});

	it('class palettes and section colours are library entries, and only the IDEA palette is green', () => {
		for (const p of CLASS_THEME_PALETTES) {
			expect(p.wash.lib in IDENTITY, p.id).toBe(true);
			expect(p.edge.lib in IDENTITY, p.id).toBe(true);
			if (p.id !== 'idea') expect([p.wash.lib, p.edge.lib], p.id).not.toContain('idea-green');
		}
		for (const a of SECTION_ACCENTS) {
			expect(a.colour.lib in IDENTITY, a.id).toBe(true);
			const d = K.deltaE2000(K.hex(a.colour.dark), K.hex(BRAND_GREEN.dark));
			expect(d, `${a.id} is not a green`).toBeGreaterThanOrEqual(10);
		}
	});

	it('NEGATIVE CONTROL: the instrument fails a set it should (the old calendar and an indigo/violet pair)', () => {
		// indigo and violet are the kit's two nearest linking colours; under
		// protanopia they are one colour, so a set holding both must not pass.
		const p = pairs(['indigo', 'violet'], 'fill');
		expect(p.some((x) => x.prot < 8)).toBe(true);
		// And more than seven fails the count.
		expect(() => holdSet('eight', ['sky', 'indigo', 'magenta', 'marigold', 'first-red', 'titanium', 'aluminum', 'coral'])).toThrow();
	});
});

/* ---- 4. no neon -------------------------------------------------------- */

/** The two neons the site used: the arcade green and the chartreuse, as hex
    or as an rgb() triple. */
const NEON = /#00ff41\b|#c8ff00\b|\b0\s*,\s*255\s*,\s*65\b|\b200\s*,\s*255\s*,\s*0\b/i;

/**
 * FILES THIS LANE DOES NOT OWN THAT STILL CARRY ONE, each with its reason.
 * A prefix covers a room. The list may only shrink.
 */
const NEON_ALLOWED: Record<string, string> = {
	'src/lib/legacy/': 'frozen legacy HTML (docs/subsystems/legacy-content.md): the Coin Ledger and old assignments are Mr. Pina\'s call',
	'src/routes/vanguard/': 'VANGUARD is a standalone legacy game page with its own palette',
	'src/lib/gauntlet/': "GAUNTLET's VIEWPORT design system, a scoped room (themes.md)",
	'src/routes/gauntlet/': "GAUNTLET's room pages, the same design system",
	'src/lib/fsp/': 'FSP, the archived programme, deliberately not IDEA',
	'src/routes/fsp/': 'FSP pages',
	'src/routes/fsp-pulse/': 'FSP pages',
	'src/routes/fsp-tech-selection/': 'FSP pages',
	'src/lib/frc/': "the FRC room's achievement green and its review queue",
	'src/lib/tournaments/': 'var(--green) fallbacks in tournament components (status chips are lane 0466\'s)',
	'src/routes/tournaments/': 'var(--line) fallbacks in the tournament pages',
	'src/lib/version-badge.ts': 'the version stamp drawn into standalone legacy pages',
	'src/lib/greenline/': 'var(--green) fallbacks in the GREENLINE decal queue',
	'src/lib/pathways.ts': "the IDEA pathway's identity colour: a decision for Mr. Pina (ledger 0467 report)",
	'src/lib/PathwayChip.svelte': 'comments naming the IDEA pathway colour',
	'src/lib/PathwayPicker.svelte': 'var(--green) fallbacks',
	'src/lib/profile.ts': "avatar presets' identity colours (profiles subsystem)",
	'src/lib/Avatar.svelte': 'a var(--green) fallback',
	'src/lib/ProfileMenu.svelte': 'var(--green) fallbacks and the Matrix theme swatch',
	'src/lib/tab-icon/geometry.ts': 'the browser tab icon geometry (ledger 0396), edited only there',
	'src/lib/design-system/themes/matrix.css': 'a comment naming the phosphor green Matrix is built from',
	'src/lib/feedback/SiteFeedback.svelte': "the report box's GAUNTLET room values",
	'src/lib/server/feedback-launch.ts': "the report box's GAUNTLET room values",
	'src/lib/server/dev-deck-fixture.ts': 'a dev fixture picture',
	'src/app.css': 'var(--green) fallbacks in two shared rules',
	'src/routes/admin/': 'the Drive connect pages, a standalone admin response',
	'src/routes/dashboard/': 'a comment recording a measurement',
	'src/routes/dev/': 'dev harness fixtures'
};

/** This lane's own surfaces: none may be covered by the list above. */
const OWNED = [
	'src/lib/AppLauncher.svelte',
	'src/lib/portal-apps.ts',
	'src/lib/launcher/CardArt.svelte',
	'src/lib/launcher/rooms.ts',
	'src/lib/launcher/art.ts',
	'src/lib/launcher/cards.css',
	'src/lib/marks/',
	'src/lib/calendar/',
	'src/lib/classroom/class-theme.ts',
	'src/lib/classroom/PostThumbnail.svelte',
	'src/lib/classroom/thumbnail.ts',
	'src/lib/design-system/identity.css',
	'src/lib/design-system/identity.ts'
];

describe('4. no neon literal left in src/', () => {
	const carrying = TEXT_FILES.filter((f) => NEON.test(readFileSync(join(ROOT, f), 'utf8')));
	const allowed = (f: string) => Object.keys(NEON_ALLOWED).some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p));

	it('finds none outside the named rooms', () => {
		expect(TEXT_FILES.length).toBeGreaterThan(500); // positive control: the walk saw the tree
		expect(carrying.filter((f) => !allowed(f))).toEqual([]);
	});

	it('none in an identity surface this lane owns', () => {
		const owned = carrying.filter((f) => OWNED.some((o) => (o.endsWith('/') ? f.startsWith(o) : f === o)));
		expect(owned).toEqual([]);
		for (const o of OWNED) expect(allowed(o.endsWith('/') ? `${o}x` : o), o).toBe(false);
	});

	it('the list only shrinks: every entry still covers a file that carries one', () => {
		const stale = Object.keys(NEON_ALLOWED).filter((p) => !carrying.some((f) => (p.endsWith('/') ? f.startsWith(p) : f === p)));
		expect(stale).toEqual([]);
	});

	it('the launcher carries no neon: every card is lit by its sample hue, toned off neon (ledger 0475)', () => {
		/* Decision 73's second amendment: the chosen sample governs, and it
		   tones the Coin Ledger, VANGUARD and GAUNTLET off neon. */
		const cards = read('src/lib/launcher/cards.css');
		expect(cards).toMatch(/data-app='coins'/); // positive control: the file was read
		expect(NEON.test(cards)).toBe(false);
		expect(NEON.test(read('src/lib/launcher/art.ts'))).toBe(false);
		for (const r of LAUNCHER_ROOMS) expect(NEON.test([r.hue, r.core, r.ground].join(' ')), r.id).toBe(false);
	});

	it('POSITIVE CONTROL: the pattern finds each spelling the site used', () => {
		for (const s of ['#00FF41', '#c8ff00', 'rgba(0, 255, 65, 0.4)', 'rgba(200,255,0,.5)']) expect(NEON.test(s), s).toBe(true);
		for (const s of ['#00ff410', '#78b870', 'rgba(10, 255, 65)']) expect(NEON.test(s), s).toBe(false);
	});
});
