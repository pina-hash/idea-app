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
import { visibleApps } from '$lib/portal-apps';

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
	/* EVERY CARD HAS A COLOUR OF ITS OWN (Mr. Pina, 2026-10-14; decision 60).
	   This block used to hold the launcher to the lightness-only rule the rest
	   of this file holds the pathway chips and the avatars to: each card's
	   Space White ink was its dark identity moved in lightness alone. Measured,
	   that put eleven of fourteen cards in one dark-green band (the five cards
	   with no accent of their own took the theme green, GAUNTLET and VANGUARD
	   share one brand green and so shared one twin, and GREENLINE, Tournaments,
	   Maps and the admin card were four more greens), and the report was "all my
	   apps look the same in white mode". The decision reverses the rule FOR THE
	   LAUNCHER ON SPACE WHITE ONLY: each card names a curated ink, and what is
	   held now is that every card has one, every one clears the same floors,
	   and no two are near neighbours. The dark themes are untouched. */
	const launcher = readFileSync('src/lib/AppLauncher.svelte', 'utf8');
	const style = launcher.slice(launcher.indexOf('<style>'));
	// The identity each card is BRANDED with: its base rule's --acc-primary.
	const identity = new Map<string, string>();
	const secondary = new Map<string, string>();
	for (const m of style.matchAll(/(?:^|\n)\t\.app-card\[data-app='([a-z-]+)'\]\s*\{([^}]*)\}/g)) {
		const primary = m[2].match(/--acc-primary:\s*(#[0-9a-fA-F]{6})/)?.[1];
		if (primary) identity.set(m[1], primary);
		const second = m[2].match(/--acc-secondary:\s*(#[0-9a-fA-F]{6})/)?.[1];
		if (second) secondary.set(m[1], second);
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
	/** Every app the launcher can draw, an admin's view included. */
	const everyApp = visibleApps(true).map((a) => a.id);

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
	/** The floor two card inks may not come closer than. The shipped palette's closest pair measures 12.0 (classroom against Maps). */
	const DISTINCT_FLOOR = 10;

	it('reads both sets and both card rules (positive control on the reader)', () => {
		expect(identity.size).toBeGreaterThanOrEqual(9);
		expect(light.size).toBeGreaterThanOrEqual(14);
		expect(everyApp.length).toBeGreaterThanOrEqual(14);
		expect(swCard).toContain('--acc-ink:');
		expect(darkCard).toContain('--acc-primary: var(--gold);');
	});

	it('gives EVERY app the launcher can draw an ink of its own, so a new app cannot arrive without one', () => {
		const missing = everyApp.filter((id) => !light.has(id));
		expect(missing).toEqual([]);
		// And no rule names an app the registry does not have (an inert selector paints nothing and says nothing).
		const ghosts = [...light.keys()].filter((id) => !everyApp.includes(id));
		expect(ghosts).toEqual([]);
	});

	it('no two cards are near neighbours: every pair of inks is at least the floor apart in CIEDE2000', () => {
		const ids = [...light.keys()];
		const close: string[] = [];
		let pairs = 0;
		let tightest = Infinity;
		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				const d = deltaE00(light.get(ids[i])!, light.get(ids[j])!);
				pairs++;
				tightest = Math.min(tightest, d);
				if (d < DISTINCT_FLOOR) close.push(`${ids[i]}/${ids[j]} ${d.toFixed(1)}`);
			}
		}
		// The sweep generated every pair (14 cards is 91), so a reader that found nothing cannot pass.
		expect(pairs).toBe((ids.length * (ids.length - 1)) / 2);
		expect(pairs).toBeGreaterThanOrEqual(91);
		expect(close).toEqual([]);
		expect(tightest).toBeGreaterThanOrEqual(DISTINCT_FLOOR);
		// One value per card, written out: no two cards share an ink by value either.
		expect(new Set(light.values()).size).toBe(light.size);
	});

	it('NEGATIVE CONTROL: the lightness-only twins this replaced fail the same floor', () => {
		/* The board the decision reversed, as it shipped on 2026-10-07 and in
		   ledger 0380: GAUNTLET and VANGUARD shared one twin, and the admin
		   card's twin sat beside the theme green the five accent-less cards took.
		   If these cleared the floor, the floor would be measuring nothing. */
		const oldGauntlet = 'hsl(135.3 100% 24.5%)';
		const oldVanguard = 'hsl(135.3 100% 24.5%)';
		expect(deltaE00(oldGauntlet, oldVanguard)).toBeLessThan(DISTINCT_FLOOR);
		const themeGreen = `#${token('--green').map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
		expect(deltaE00(themeGreen, 'hsl(113.3 33.6% 33.5%)')).toBeLessThan(DISTINCT_FLOOR);
		expect(deltaE00('hsl(147 78.2% 26.5%)', 'hsl(156.7 85.4% 25.5%)')).toBeLessThan(DISTINCT_FLOOR);
	});

	it('every ink clears as WORDS: 4.5 on the card, its own hover wash and the CTA hover fill; 3:1 at 75% on the page; 3.0 washed', () => {
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

	it('no card wears the olive-brown decision 40 took off this theme\'s words', () => {
		/* --gold on Space White is #715d22, the brown a gold or amber becomes
		   when it is taken dark enough to read on white; decision 40 item 1
		   moved it off this theme's words and the 2026-10-07 round refused two
		   twins for landing on it. The notebook's amber is the card nearest it,
		   on purpose redder and stronger; every ink is held at least the
		   distinctness floor away from it. */
		/* LEDGER 0465 TOOK THE BROWN OFF THE THEME ITSELF: --gold here is now
		   solve()'s ochre (#965600), so the brown is held as the value decision
		   40 retired rather than read off the theme, and no card may drift
		   back onto it. */
		const gold = '#715d22';
		const [goldHue] = rgbToHsl([0x71 / 255, 0x5d / 255, 0x22 / 255]);
		expect(goldHue).toBeGreaterThan(35); // positive control: it is the brown, read off the theme
		expect(goldHue).toBeLessThan(60);
		for (const [id, value] of light) {
			expect(deltaE00(value, gold), `${id} against --gold`).toBeGreaterThanOrEqual(DISTINCT_FLOOR);
		}
	});

	it('the three cards that were already told apart keep their inks: FIRST red, the Ledger\'s and the Foundry\'s second colours', () => {
		// Mr. Pina's decision kept these; each is still its identity colour moved in lightness only.
		expectLightnessOnly(identity.get('frc')!, light.get('frc')!, 'frc');
		expectLightnessOnly(secondary.get('coins')!, light.get('coins')!, 'coins');
		expectLightnessOnly(secondary.get('foundry')!, light.get('foundry')!, 'foundry');
	});

	it('on Space White a card\'s word, glyph and call to action follow ITS OWN ink, and its edge is the plate hairline', () => {
		// PRESENT: the one rule keeps a green fallback for a card with no ink,
		// moves the edge, the lines and the wash, and does NOT re-pin `--acc`,
		// so the per-card `--acc-ink` reaches the word, the glyph and the call
		// to action through the base rule.
		expect(swCard).not.toMatch(/--acc:\s*var\(--green\)/);
		expect(swCard).toContain('--acc-ink: var(--green);');
		expect(swCard).toContain('--acc-edge: var(--plate-hair, var(--boundary));');
		expect(swCard).toContain('--acc-wash: color-mix(in srgb, var(--acc) 5%, var(--bg1));');
		expect(swStrip).toContain('background: var(--acc-ink);');
		expect(style).toMatch(/\.app-title \{[^}]*color: var\(--acc-title\);/);
		expect(style).toMatch(/\.app-icon \{[^}]*color: var\(--acc\);/);
		expect(style).toMatch(/\.app-cta \{[^}]*color: var\(--acc\);/);
		// ABSENT: no per-card Space White rule re-pins the derived tokens, which
		// would put a second ink back on one of the three places by hand.
		expect(perCardDecls.length).toBeGreaterThanOrEqual(14); // positive control on the reader
		const offenders = perCardDecls.filter((d) => /--acc(-title|-edge(-strong)?|-line(-strong)?|-wash)?\s*:/.test(d));
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

	it('NEGATIVE CONTROL: every identity as authored fails as text on the light card', () => {
		for (const [id, primary] of identity) expect(ratio(parse(primary).rgb, PANEL), id).toBeLessThan(4.5);
	});
});
