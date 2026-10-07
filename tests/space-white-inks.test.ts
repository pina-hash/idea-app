// THE LIGHT-GROUND INK TWINS (ledger 0297, package F1b).
//
// Space White turns the grounds a pathway chip, an avatar tile and a launcher
// card sit on from near-black to near-white, and every identity color in this
// app was tuned for the dark ones: four pathways, most avatar presets and nine
// launcher accents are neon, and a neon word on a white panel measures 1.1 to
// 2.3:1. So each of them gained a LIGHT TWIN -- `Pathway.inkOnLight`,
// `AvatarPreset.fgOnLight`, `AVATAR_TINTS_ON_LIGHT` and a per-card `--acc-ink`
// keyed on the theme attribute in AppLauncher -- and the stylesheet picks by
// theme.
//
// What this file holds is the RULE those twins exist under, the one CLAUDE.md
// states for `--acc-ink`, `--violet-ink` and `Pathway.ink`: an identity is
// never moved to pass a check, the derived ink moves, and it moves in
// LIGHTNESS ONLY, hue and saturation held. So every twin is read back as HSL
// and compared with its identity, and then measured against the theme's own
// grounds, read out of `space-white.css` rather than typed here, so a later
// change to a ground re-measures every twin with no edit to this file.
//
// Why a test and not a harness: a twin that drifts off its hue or under its
// floor renders perfectly and reads as a slightly different color, which
// nobody reports. That is the silent regression the suite exists for.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PATHWAYS } from '$lib/pathways';
import { AVATAR_PRESETS } from '$lib/profile';
import { AVATAR_TINTS, AVATAR_TINTS_ON_LIGHT, avatarTint, avatarTintOnLight } from '$lib/avatars';

type Rgb = [number, number, number]; // 0..1

function hslToRgb(h: number, s: number, l: number): Rgb {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	const [r, g, b] =
		h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
	return [r + m, g + m, b + m];
}
function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
	const mx = Math.max(r, g, b);
	const mn = Math.min(r, g, b);
	const d = mx - mn;
	const l = (mx + mn) / 2;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	let h = 0;
	if (d) {
		if (mx === r) h = ((g - b) / d) % 6;
		else if (mx === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return [h, s * 100, l * 100];
}
/** A color as this app writes one: `#rrggbb` or `hsl(h s% l%)`. Anything else throws, so a new spelling cannot pass by parsing to black. */
function parse(value: string): { rgb: Rgb; hsl: [number, number, number] } {
	const v = value.trim();
	const hex = v.match(/^#([0-9a-f]{6})$/i);
	if (hex) {
		const rgb = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16) / 255) as Rgb;
		return { rgb, hsl: rgbToHsl(rgb) };
	}
	const hsl = v.match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/);
	if (hsl) {
		const [h, s, l] = hsl.slice(1).map(Number);
		return { rgb: hslToRgb(h, s / 100, l / 100), hsl: [h, s, l] };
	}
	throw new Error(`unparsed color ${value}`);
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: Rgb, b: Rgb) => {
	const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
};
/** The projector-washout model the theme file states: a 300:1 projector with 10% ambient added to every pixel. */
const washed = (a: Rgb, b: Rgb) => {
	const w = (l: number) => l * (1 - 1 / 300) + 1 / 300 + 0.1;
	const [x, y] = [w(lum(a)), w(lum(b))].sort((p, q) => q - p);
	return x / y;
};
const over = (fg: Rgb, alpha: number, bg: Rgb): Rgb => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;

/** The theme's own grounds, read out of its first block (the `:root[data-theme='space-white']` token block). */
const themeCss = readFileSync('src/lib/design-system/themes/space-white.css', 'utf8');
const tokenBlock = (() => {
	const start = themeCss.indexOf("[data-theme='space-white']");
	const open = themeCss.indexOf('{', start);
	return themeCss.slice(open + 1, themeCss.indexOf('}', open));
})();
const token = (name: string) => {
	const m = tokenBlock.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
	if (!m) throw new Error(`Space White does not declare ${name} as a hex`);
	return parse(m[1]).rgb;
};
const PAGE = token('--bg0');
const PANEL = token('--bg1');
const INSET = token('--bg2');
const PLATE = token('--plate');
const RAISED = token('--surface-raised');
const GROUNDS: [string, Rgb][] = [
	['page', PAGE],
	['panel', PANEL],
	['inset', INSET],
	['plate', PLATE],
	['raised', RAISED]
];

/** Hue and saturation held to the tenth the twins are written at, and the move is DOWN in lightness (a light ground needs a darker ink). */
function expectLightnessOnly(identity: string, twin: string, where: string) {
	const a = parse(identity).hsl;
	const b = parse(twin).hsl;
	const dh = Math.min(Math.abs(a[0] - b[0]), 360 - Math.abs(a[0] - b[0]));
	expect(dh, `${where}: hue ${b[0]} against identity ${a[0].toFixed(2)}`).toBeLessThanOrEqual(0.1);
	expect(Math.abs(a[1] - b[1]), `${where}: saturation ${b[1]} against identity ${a[1].toFixed(2)}`).toBeLessThanOrEqual(0.1);
	expect(b[2], `${where}: lightness`).toBeLessThanOrEqual(a[2] + 0.1);
}

describe('the grounds are read from the theme file', () => {
	it('finds all five, and they are the light console (positive control on the reader)', () => {
		for (const [name, g] of GROUNDS) expect(lum(g), name).toBeGreaterThan(0.6);
		// And the dark default is NOT what was read: its panel is #1a2a1a.
		expect(lum(PANEL)).not.toBeCloseTo(lum(parse('#1a2a1a').rgb), 2);
	});
});

describe('a pathway chip on a light ground (Pathway.inkOnLight)', () => {
	it('gives every pathway a twin, on its own hue, lightness only', () => {
		expect(PATHWAYS.length).toBe(6);
		for (const p of PATHWAYS) expectLightnessOnly(p.color, p.inkOnLight, p.id);
	});

	it('clears 4.5 as text on every ground, on the chip tint and the picker tint over each, and 3.0 washed', () => {
		let checked = 0;
		for (const p of PATHWAYS) {
			const ink = parse(p.inkOnLight).rgb;
			const id = parse(p.color).rgb;
			for (const [name, g] of GROUNDS) {
				for (const [tintName, alpha] of [['bare', 0], ['chip 12%', 0.12], ['picker 10%', 0.1]] as const) {
					const ground = over(id, alpha, g);
					expect(ratio(ink, ground), `${p.id} on ${name} ${tintName}`).toBeGreaterThanOrEqual(4.5);
					expect(washed(ink, ground), `${p.id} washed on ${name} ${tintName}`).toBeGreaterThanOrEqual(3);
					checked++;
				}
			}
		}
		expect(checked).toBe(6 * 5 * 3);
	});

	it('NEGATIVE CONTROL: the dark-ground ink the chip used to paint fails here', () => {
		// IDEA's identity is its own ink, and it is the case that made this twin
		// necessary: if it cleared, the whole file would be measuring nothing.
		const idea = PATHWAYS.find((p) => p.id === 'IDEA')!;
		expect(ratio(parse(idea.ink).rgb, PANEL)).toBeLessThan(2);
	});
});

describe('an avatar tile on a light ground', () => {
	it('gives every preset a twin, on its own hue, lightness only', () => {
		expect(AVATAR_PRESETS.length).toBeGreaterThanOrEqual(17);
		for (const p of AVATAR_PRESETS) {
			expect(p.fgOnLight, `${p.id} has no light twin`).toBeTruthy();
			expectLightnessOnly(p.fg, p.fgOnLight!, p.id);
		}
	});

	it('a preset stroke clears the 3:1 graphical floor on every ground, and 2.0 washed', () => {
		for (const p of AVATAR_PRESETS) {
			const ink = parse(p.fgOnLight!).rgb;
			for (const [name, g] of GROUNDS) {
				expect(ratio(ink, g), `${p.id} on ${name}`).toBeGreaterThanOrEqual(3);
				expect(washed(ink, g), `${p.id} washed on ${name}`).toBeGreaterThanOrEqual(2);
			}
		}
	});

	it('the initials tints are the SAME eight hues at one pinned lightness', () => {
		expect(AVATAR_TINTS_ON_LIGHT.length).toBe(AVATAR_TINTS.length);
		const lightness = new Set<number>();
		AVATAR_TINTS.forEach((dark, i) => {
			expectLightnessOnly(dark, AVATAR_TINTS_ON_LIGHT[i], `tint ${i}`);
			lightness.add(parse(AVATAR_TINTS_ON_LIGHT[i]).hsl[2]);
		});
		expect(lightness.size).toBe(1);
	});

	it('initials clear 4.5 as text on the tile and every ground it can sit on, and 3.0 washed', () => {
		// The tile paints --bg2; the rest are where a tile without its own
		// ground (a failed image) would show the card behind it.
		for (const t of AVATAR_TINTS_ON_LIGHT) {
			const ink = parse(t).rgb;
			for (const [name, g] of GROUNDS.filter(([n]) => n !== 'plate')) {
				expect(ratio(ink, g), `${t} on ${name}`).toBeGreaterThanOrEqual(4.5);
				expect(washed(ink, g), `${t} washed on ${name}`).toBeGreaterThanOrEqual(3);
			}
		}
	});

	it('a person keeps their hue: the light tint is picked by the same key as the dark one', () => {
		for (const key of ['alice@boscotech.net', 'Bob.Q@boscotech.net', '', null, 'zed']) {
			const i = AVATAR_TINTS.indexOf(avatarTint(key) as (typeof AVATAR_TINTS)[number]);
			expect(i).toBeGreaterThanOrEqual(0);
			expect(avatarTintOnLight(key)).toBe(AVATAR_TINTS_ON_LIGHT[i]);
		}
	});
});

describe('a launcher card on a light ground (AppLauncher under Space White)', () => {
	/* ONE GREEN INK, AND THE TWINS PAINT THE STRIP (round 2026-10-07). Each card
	   used to paint its word, glyph and edge in its own lightness-only twin, and
	   on the white console that was nine inks -- two of them the olive and
	   brown a lightness-only yellow or amber lands on over white, one an FRC
	   red this site reserves for errors. Mr. Pina's report ("a lot of the
	   colors look off") moved every card's word, glyph and call to action to
	   the theme's green and its edge to the plate's hairline, on this theme
	   only. The twins stay, still lightness-only and still measured, because
	   they paint the 2px strip -- and because a twin that drifts off its hue
	   renders perfectly and reads as a slightly different colour, which nobody
	   reports. */
	const launcher = readFileSync('src/lib/AppLauncher.svelte', 'utf8');
	const style = launcher.slice(launcher.indexOf('<style>'));
	// The identity each card is BRANDED with: its base rule's --acc-primary.
	const identity = new Map<string, string>();
	for (const m of style.matchAll(/(?:^|\n)\t\.app-card\[data-app='([a-z-]+)'\]\s*\{([^}]*)\}/g)) {
		const primary = m[2].match(/--acc-primary:\s*(#[0-9a-fA-F]{6})/)?.[1];
		if (primary) identity.set(m[1], primary);
	}
	// The light ink each card re-pins when the theme attribute is present, and
	// every declaration a per-card Space White rule makes.
	const light = new Map<string, string>();
	const perCardDecls: string[] = [];
	for (const m of style.matchAll(/((?::global\(:root\[data-theme='space-white'\]\) \.app-card\[data-app='[a-z-]+'\],?\s*)+)\{([^}]*)\}/g)) {
		perCardDecls.push(m[2]);
		const ink = m[2].match(/--acc-ink:\s*([^;]+);/)?.[1];
		if (!ink) continue;
		for (const id of m[1].matchAll(/data-app='([a-z-]+)'/g)) light.set(id[1], ink.trim());
	}
	// The one Space White rule every card takes, and the dark default it overrides.
	const ruleBody = (selector: string) => {
		const at = style.indexOf(selector);
		if (at < 0) return '';
		const open = style.indexOf('{', at);
		return style.slice(open + 1, style.indexOf('}', open));
	};
	const swCard = ruleBody(":global(:root[data-theme='space-white']) .app-card {");
	const darkCard = ruleBody('\t.app-card {');
	const swStrip = ruleBody(":global(:root[data-theme='space-white']) .app-strip {");

	it('reads both sets and both card rules (positive control on the reader)', () => {
		expect(identity.size).toBeGreaterThanOrEqual(9);
		expect(light.size).toBeGreaterThanOrEqual(9);
		expect(swCard).toContain('--acc-ink:');
		expect(darkCard).toContain('--acc-primary: var(--gold);');
	});

	it('gives EVERY branded card a light ink for its strip, so a new accent cannot arrive without one', () => {
		const missing = [...identity.keys()].filter((id) => !light.has(id));
		expect(missing).toEqual([]);
	});

	it('moves the ink in lightness only, never the identity', () => {
		for (const [id, ink] of light) expectLightnessOnly(identity.get(id)!, ink, id);
	});

	it('the strip twins still clear what they cleared as words: 4.5 on the card and the CTA hover fill; 3:1 at 75% on the page; 3.0 washed', () => {
		for (const [id, value] of light) {
			const ink = parse(value).rgb;
			expect(ratio(ink, PANEL), `${id} on the card`).toBeGreaterThanOrEqual(4.5);
			expect(ratio(ink, INSET), `${id} on the CTA hover fill`).toBeGreaterThanOrEqual(4.5);
			expect(ratio(over(ink, 0.75, PAGE), PAGE), `${id} edge on the page`).toBeGreaterThanOrEqual(3);
			expect(washed(ink, PANEL), `${id} washed on the card`).toBeGreaterThanOrEqual(3);
		}
	});

	it('on Space White every card writes, draws and calls to action in ONE ink, the theme green, and its strip is its own twin', () => {
		// PRESENT: the one rule moves the ink every word, glyph and CTA reads
		// (`--acc`, which `--acc-title`, `.app-icon` and `.app-cta` all read),
		// the edge, the lines and the wash, and the strip paints the twin solid.
		expect(swCard).toContain('--acc: var(--green);');
		expect(swCard).toContain('--acc-ink: var(--green);');
		expect(swCard).toContain('--acc-edge: var(--plate-hair, var(--boundary));');
		expect(swCard).toContain('--acc-wash: color-mix(in srgb, var(--acc) 5%, var(--bg1));');
		expect(swStrip).toContain('background: var(--acc-ink);');
		expect(style).toMatch(/\.app-title \{[^}]*color: var\(--acc-title\);/);
		expect(style).toMatch(/\.app-icon \{[^}]*color: var\(--acc\);/);
		expect(style).toMatch(/\.app-cta \{[^}]*color: var\(--acc\);/);
		// ABSENT: no per-card Space White rule puts a second ink back on a word,
		// a glyph or an edge.
		expect(perCardDecls.length).toBeGreaterThanOrEqual(8); // positive control on the reader (GAUNTLET and VANGUARD share one rule)
		const offenders = perCardDecls.filter((d) => /--acc(-title|-edge)?\s*:/.test(d));
		expect(offenders).toEqual([]);
		// AND THE DARK THEMES ARE UNTOUCHED: the default rule still derives the
		// word from the card's own ink and the edge from its brand at 75%.
		expect(darkCard).toContain('--acc: var(--acc-ink);');
		expect(darkCard).toContain('--acc-edge: color-mix(in srgb, var(--acc-ink) 75%, transparent);');
		expect(style).toMatch(/\t\.app-strip \{[^}]*background: linear-gradient\(to right, var\(--acc-primary\), var\(--acc-secondary\)\);/);
	});

	it('the green clears 4.5 on the card, its own hover wash and the CTA hover fill, and 3.0 washed; the edge clears 3:1 against the page', () => {
		const green = token('--green');
		expect(ratio(green, PANEL)).toBeGreaterThanOrEqual(4.5);
		expect(ratio(green, over(green, 0.05, PANEL))).toBeGreaterThanOrEqual(4.5);
		expect(ratio(green, INSET)).toBeGreaterThanOrEqual(4.5);
		expect(washed(green, PANEL)).toBeGreaterThanOrEqual(3);
		// The edge under the site plate: the plate's own hairline, read out of
		// plate.css's Space White block, against the page grounds it separates
		// a card from (the plate's page gradient runs from its top to its foot).
		const plate = readFileSync('src/lib/classroom/plate.css', 'utf8');
		const swAt = plate.indexOf(":root[data-theme='space-white'] :is(.cr-plate, .site-plate)");
		const swBlock = plate.slice(plate.indexOf('{', swAt) + 1, plate.indexOf('}', swAt));
		const plateToken = (name: string) => {
			const m = swBlock.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
			if (!m) throw new Error(`plate.css's Space White block does not declare ${name} as a hex`);
			return parse(m[1]).rgb;
		};
		const hair = plateToken('--plate-hair');
		for (const ground of ['--plate-plate-top', '--plate-plate-bot']) {
			expect(ratio(hair, plateToken(ground)), `the hairline on ${ground}`).toBeGreaterThanOrEqual(3);
		}
		// And on the `SITE_PLATE = ''` revert the fallback is the theme's own boundary.
		expect(ratio(token('--boundary'), PAGE)).toBeGreaterThanOrEqual(3);
	});

	it('no launcher mark paints a literal colour, so the card ink reaches every stroke with no theme rule', () => {
		// GREENLINE's old mark drew its start line and its lapping machine in a
		// literal #eafff3, 1.05:1 on the light card, and the launcher carried a
		// Space White rule to re-stroke them. The mark was redrawn on
		// currentColor (ledger 0298), so the rule is gone -- and the property
		// that replaces it is this one, over every mark the launcher imports: a
		// hex outside a `var(--x, #fallback)` would paint the same on both
		// themes and could not be re-inked by the card.
		const imported = [...launcher.matchAll(/import ([A-Z][A-Za-z]*Mark) from '\$lib\/marks\//g)].map((m) => m[1]);
		expect(imported.length).toBeGreaterThanOrEqual(12); // positive control on the reader
		const offenders: string[] = [];
		for (const name of imported) {
			const src = readFileSync(`src/lib/marks/${name}.svelte`, 'utf8')
				.replace(/<!--[\s\S]*?-->/g, '')
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/var\(--[a-z0-9-]+,\s*#[0-9a-fA-F]{3,8}\)/g, '');
			if (/#[0-9a-fA-F]{3,8}\b/.test(src)) offenders.push(name);
		}
		expect(offenders).toEqual([]);
		// NEGATIVE CONTROL: the literal the old mark carried really was invisible here.
		expect(ratio(parse('#eafff3').rgb, PANEL)).toBeLessThan(1.5);
		// And the retired rule is not left behind, re-stroking classes nothing draws.
		expect(style).not.toContain('.gl-marker');
	});

	it('NEGATIVE CONTROL: the twins the words moved off include the olive and brown decision 40 refused for gold', () => {
		/* The reason a lightness-only twin stopped being the word's ink here:
		   a yellow or an amber taken dark enough to carry text on white lands
		   in the same brown family as --gold (#715d22), which decision 40 item 1
		   took off this theme's words. If these two were not in that family the
		   argument for one ink would rest on taste alone. */
		const [goldHue] = rgbToHsl(token('--gold'));
		expect(goldHue).toBeGreaterThan(35);
		expect(goldHue).toBeLessThan(60);
		for (const id of ['coins', 'foundry']) {
			const [h, , l] = parse(light.get(id)!).hsl;
			expect(h, `${id} twin hue`).toBeGreaterThanOrEqual(25);
			expect(h, `${id} twin hue`).toBeLessThanOrEqual(75);
			expect(l, `${id} twin lightness`).toBeLessThan(35);
		}
	});

	it('NEGATIVE CONTROL: every identity as authored fails as text on the light card', () => {
		for (const [id, primary] of identity) expect(ratio(parse(primary).rgb, PANEL), id).toBeLessThan(4.5);
	});
});
