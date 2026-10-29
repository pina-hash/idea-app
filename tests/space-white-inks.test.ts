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
// THE LAUNCHER IS THE ONE EXCEPTION, AND IT IS A DECISION, NOT A DRIFT (Mr.
// Pina, 2026-10-14; decision 60). Its cards' Space White inks are no longer
// twins: lightness alone put eleven of fourteen cards in one green band, so
// each card names a curated colour of its own, and its block below holds a
// different rule -- every app has one, all clear the same floors, and no two
// are closer than a CIEDE2000 floor. The pathway chips and the avatars keep the
// twin rule unchanged.
//
// Why a test and not a harness: a twin that drifts off its hue or under its
// floor renders perfectly and reads as a slightly different color, which
// nobody reports. That is the silent regression the suite exists for.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PATHWAYS } from '$lib/pathways';
import { AVATAR_PRESETS } from '$lib/profile';
import { AVATAR_TINTS, AVATAR_TINTS_ON_LIGHT, avatarTint, avatarTintOnLight } from '$lib/avatars';
import { APP_FAMILIES, visibleApps } from '$lib/portal-apps';
import { IDENTITY, type IdentityName } from '$lib/design-system/identity';

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
	/* ONE INK PER FAMILY (ledger 0467, feedback ac7d7b60). Decision 62 gave
	   every card a curated Space White ink of its own, fourteen hues on one
	   screen; Mr. Pina's 2026-10-28 rule is at most five to seven a reader must
	   tell apart, each beside a word or a glyph. So a card's colour is its
	   FAMILY's (`PortalApp.family`, `data-family`), one entry of the kit's
	   colour library, and the ink on this theme is the value solve() gives that
	   entry over Space White's grounds, read by the family rule through the
	   generated `--id-*` token. No card names a Space White ink by hand. What
	   is held: every family has a rule or takes the default, every family ink
	   clears the same floors as words, no two family inks are near neighbours,
	   and no Space White rule re-pins a card. */
	const launcher = readFileSync('src/lib/AppLauncher.svelte', 'utf8');
	const style = launcher.slice(launcher.indexOf('<style>'));
	const ruleBody = (selector: string) => {
		const at = style.indexOf(selector);
		if (at < 0) return '';
		const open = style.indexOf('{', at);
		return style.slice(open + 1, style.indexOf('}', open));
	};
	const swCard = ruleBody(":global(:root[data-theme='space-white']) .app-card {");
	const darkCard = ruleBody('\t.app-card {');
	/** The library entry each family's ink reads; the default rule is the families nobody declares. */
	const entryOf = (body: string) => body.match(/--acc-ink:\s*var\(--id-([a-z-]+)-ink\)/)?.[1];
	const familyEntry = new Map<string, string>();
	for (const fam of APP_FAMILIES) {
		const rule = ruleBody(`.app-card[data-family='${fam.id}'] {`);
		familyEntry.set(fam.id, entryOf(rule || darkCard)!);
	}
	/** The Space White value of each family's ink, from the generated file. */
	const light = new Map<string, string>([...familyEntry].map(([fam, e]) => [fam, IDENTITY[e as IdentityName].light.ink]));
	/** Every app the launcher can draw, an admin's view included. */
	const everyApp = visibleApps(true);

	/* CIEDE2000, the perceptual difference the distinctness floor is stated in.
	   The standard formulation (Sharma, Wu and Dalal 2005), over D65 Lab. */
	const lab = ([r, g, b]: Rgb): [number, number, number] => {
		const [R, G, B] = [lin(r), lin(g), lin(b)];
		const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
		const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
		const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
		const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
		return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
	};
	const deltaE00 = (p: string, q: string) => {
		const [L1, a1, b1] = lab(parse(p).rgb);
		const [L2, a2, b2] = lab(parse(q).rgb);
		const rad = Math.PI / 180;
		const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
		const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
		const [a1p, a2p] = [(1 + G) * a1, (1 + G) * a2];
		const [C1p, C2p] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)];
		const hue = (a: number, b: number) => (a === 0 && b === 0 ? 0 : ((Math.atan2(b, a) / rad) + 360) % 360);
		const [h1p, h2p] = [hue(a1p, b1), hue(a2p, b2)];
		let dhp = 0;
		if (C1p * C2p !== 0) {
			dhp = h2p - h1p;
			if (dhp > 180) dhp -= 360;
			else if (dhp < -180) dhp += 360;
		}
		const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
		const Lbp = (L1 + L2) / 2;
		const Cbp = (C1p + C2p) / 2;
		let hbp = h1p + h2p;
		if (C1p * C2p !== 0) hbp = (Math.abs(h1p - h2p) > 180 ? (hbp < 360 ? hbp + 360 : hbp - 360) : hbp) / 2;
		const T =
			1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
		const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
		const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
		const Sc = 1 + 0.045 * Cbp;
		const Sh = 1 + 0.015 * Cbp * T;
		const Rt = -Math.sin(2 * 30 * Math.exp(-(((hbp - 275) / 25) ** 2)) * rad) * Rc;
		const [dL, dC, dH] = [(L2 - L1) / Sl, (C2p - C1p) / Sc, dHp / Sh];
		return Math.sqrt(dL ** 2 + dC ** 2 + dH ** 2 + Rt * dC * dH);
	};
	/** The floor two family inks may not come closer than. */
	const DISTINCT_FLOOR = 10;

	it('reads every family and the default rule (positive control on the reader)', () => {
		expect(APP_FAMILIES.length).toBeGreaterThanOrEqual(5);
		expect([...familyEntry.values()].every(Boolean)).toBe(true);
		expect(darkCard).toContain('--acc-ink: var(--id-titanium-ink);');
		expect(everyApp.length).toBeGreaterThanOrEqual(14);
	});

	it('gives EVERY app the launcher can draw a family, and at most seven families', () => {
		const fams = new Set(APP_FAMILIES.map((f) => f.id));
		expect(everyApp.filter((a) => !fams.has(a.family)).map((a) => a.id)).toEqual([]);
		expect(fams.size).toBeLessThanOrEqual(7);
		// Every family a card is in is drawn: no family list entry with no app.
		expect([...fams].filter((f) => !everyApp.some((a) => a.family === f))).toEqual([]);
	});

	it('no two families are near neighbours: every pair of Space White inks is at least the floor apart', () => {
		const ids = [...light.keys()];
		const close: string[] = [];
		let pairs = 0;
		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				const d = deltaE00(light.get(ids[i])!, light.get(ids[j])!);
				pairs++;
				if (d < DISTINCT_FLOOR) close.push(`${ids[i]}/${ids[j]} ${d.toFixed(1)}`);
			}
		}
		expect(pairs).toBe((ids.length * (ids.length - 1)) / 2);
		expect(pairs).toBeGreaterThanOrEqual(10);
		expect(close).toEqual([]);
	});

	it('NEGATIVE CONTROL: the per-card board this replaced drew more than seven hues', () => {
		/* Decision 62's fourteen curated inks, as shipped: distinct, and twice
		   the number a reader can tell apart at a glance. */
		const old = ['#1f55d0', '#845000', '#3a5068', '#3e2f9c', '#006aa0', '#00737a', '#c20a9d', '#4f6f00', '#d91119', '#0f7a35', '#8a2fc4', '#ad4f19', '#005e4b', '#7d2a64'];
		expect(new Set(old).size).toBeGreaterThan(7);
	});

	it('every family ink clears as WORDS: 4.5 on the card, its own hover wash and the CTA hover fill; 3:1 at 75% on the page; 3.0 washed', () => {
		let checked = 0;
		for (const [id, value] of light) {
			const ink = parse(value).rgb;
			expect(ratio(ink, PANEL), `${id} on the card`).toBeGreaterThanOrEqual(4.5);
			expect(ratio(ink, over(ink, 0.05, PANEL)), `${id} on its hover wash`).toBeGreaterThanOrEqual(4.5);
			expect(ratio(ink, INSET), `${id} on the CTA hover fill`).toBeGreaterThanOrEqual(4.5);
			expect(ratio(over(ink, 0.75, PAGE), PAGE), `${id} edge on the page`).toBeGreaterThanOrEqual(3);
			expect(washed(ink, PANEL), `${id} washed on the card`).toBeGreaterThanOrEqual(3);
			checked++;
		}
		expect(checked).toBe(light.size);
	});

	it('no family wears the olive-brown decision 40 took off this theme\'s words', () => {
		const gold = '#715d22';
		for (const [id, value] of light) {
			expect(deltaE00(value, gold), `${id} against the retired brown`).toBeGreaterThanOrEqual(DISTINCT_FLOOR);
		}
	});

	it('on Space White a card\'s word, glyph and call to action follow its family ink, and its edge is the plate hairline', () => {
		// PRESENT: the one rule moves the edge, the lines and the wash, and
		// re-pins neither `--acc` nor `--acc-ink`, so the family's own ink
		// reaches the word, the glyph and the call to action.
		expect(swCard).not.toMatch(/--acc(-ink)?:/);
		expect(swCard).toContain('--acc-edge: var(--plate-hair, var(--boundary));');
		expect(swCard).toContain('--acc-wash: color-mix(in srgb, var(--acc) 5%, var(--bg1));');
		expect(style).toMatch(/\.app-title \{[^}]*color: var\(--acc-title\);/);
		expect(style).toMatch(/\.app-icon \{[^}]*color: var\(--acc\);/);
		expect(style).toMatch(/\.app-cta \{[^}]*color: var\(--acc\);/);
		// ABSENT: no per-card or per-family Space White rule (the --id tokens
		// already answer per theme).
		expect(style).not.toMatch(/:global\(:root\[data-theme='space-white'\]\) \.app-card\[data-(app|family)=/);
		// AND THE DARK THEMES DERIVE THE SAME WAY: the word from the ink, the
		// edge from the ink at 75%, the strip from the pair.
		expect(darkCard).toContain('--acc: var(--acc-ink);');
		expect(darkCard).toContain('--acc-edge: color-mix(in srgb, var(--acc-ink) 75%, transparent);');
		expect(style).toMatch(/\t\.app-strip \{[^}]*background: linear-gradient\(to right, var\(--acc-primary\), var\(--acc-secondary\)\);/);
	});

	it('the plate hairline clears 3:1 against the page; the theme boundary does on the revert', () => {
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
		expect(ratio(token('--boundary'), PAGE)).toBeGreaterThanOrEqual(3);
	});

	it('no launcher mark paints a literal colour, so the card ink reaches every stroke with no theme rule', () => {
		const imported = [...launcher.matchAll(/import ([A-Z][A-Za-z]*Mark) from '\$lib\/marks\//g)].map((m) => m[1]);
		expect(imported.length).toBeGreaterThanOrEqual(12); // positive control on the reader
		const offenders: string[] = [];
		for (const name of imported) {
			const src = readFileSync(`src/lib/marks/${name}.svelte`, 'utf8')
				.replace(/<!--[\s\S]*?-->/g, '')
				.replace(/\/\*[\s\S]*?\*\//g, '');
			// Ledger 0467: no hex at all, not even as a var() fallback (the game
			// marks' fallback was the neon chartreuse).
			if (/#[0-9a-fA-F]{3,8}\b/.test(src)) offenders.push(name);
		}
		expect(offenders).toEqual([]);
		expect(ratio(parse('#eafff3').rgb, PANEL)).toBeLessThan(1.5);
		expect(style).not.toContain('.gl-marker');
	});

	it('NEGATIVE CONTROL: every family fill, as a word, fails or nearly fails on the light card where its ink clears', () => {
		// Why the ink exists: the fills are the strip and are not drawn as words.
		let under = 0;
		for (const e of familyEntry.values()) if (ratio(parse(IDENTITY[e as IdentityName].light.fill).rgb, PANEL) < 4.5) under++;
		expect(under).toBeGreaterThanOrEqual(4);
	});
});
