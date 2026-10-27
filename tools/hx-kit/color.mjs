/**
 * IDEA HTML assignment kit: color math, with no dependencies.
 *
 * Used by build.mjs (to write the content palette) and test.mjs (to judge it).
 * Every formula here is a published one:
 *   - sRGB <-> OKLab/OKLCH: Bjorn Ottosson, "A perceptual color space for image
 *     processing" (2020), the matrices as published.
 *   - WCAG 2.2 relative luminance and contrast ratio: W3C Understanding 1.4.3,
 *     including the 0.04045 linearization cutoff. No rounding: 4.499 fails.
 *   - CIEDE2000: Sharma, Wu and Dalal (2005), "The CIEDE2000 color-difference
 *     formula: implementation notes, supplementary test data".
 *   - Color vision deficiency: Machado, Oliveira and Fernandes (2009), IEEE TVCG,
 *     the severity 1.0 matrices for protanopia, deuteranopia and tritanopia,
 *     applied in linear RGB as culori and colorjs.io do.
 * Colors are handled as { r, g, b } in 0..1 sRGB (gamma encoded) unless named.
 */

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hex(h) {
	const s = h.replace('#', '');
	const n = s.length === 3 ? s.split('').map((x) => x + x).join('') : s;
	return { r: parseInt(n.slice(0, 2), 16) / 255, g: parseInt(n.slice(2, 4), 16) / 255, b: parseInt(n.slice(4, 6), 16) / 255 };
}
export function toHex({ r, g, b }) {
	const p = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
	return `#${p(r)}${p(g)}${p(b)}`;
}

/* ---- OKLab / OKLCH ------------------------------------------------------ */
export function rgbToOklab({ r, g, b }) {
	const R = lin(r), G = lin(g), B = lin(b);
	const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
	const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
	const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
	return {
		L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	};
}
export function oklabToLinear({ L, a, b }) {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return {
		r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	};
}
export function oklch(L, C, H) {
	const h = (H * Math.PI) / 180;
	return { L, a: C * Math.cos(h), b: C * Math.sin(h) };
}
export function rgbToOklch(rgb) {
	const { L, a, b } = rgbToOklab(rgb);
	let H = (Math.atan2(b, a) * 180) / Math.PI;
	if (H < 0) H += 360;
	return { L, C: Math.hypot(a, b), H };
}
/** OKLCH to sRGB, reducing chroma until the color is inside the gamut (the CSS
    Color 4 approach in spirit: keep lightness and hue, give up chroma). */
export function oklchToRgb(L, C, H) {
	let lo = 0, hi = C, best = null;
	const inGamut = (c) => { const x = oklabToLinear(oklch(L, c, H)); return [x.r, x.g, x.b].every((v) => v >= -1e-4 && v <= 1 + 1e-4) ? x : null; };
	const full = inGamut(C);
	if (full) best = full;
	else {
		for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; const x = inGamut(mid); if (x) { best = x; lo = mid; } else hi = mid; }
		if (!best) best = inGamut(0);
	}
	return { r: clamp01(delin(best.r)), g: clamp01(delin(best.g)), b: clamp01(delin(best.b)) };
}

/* ---- WCAG 2.2 ----------------------------------------------------------- */
export function luminance({ r, g, b }) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
export function contrast(a, b) {
	const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
}
/** A translucent color over its real surface, before any contrast is measured. */
export function over(fg, alpha, bg) { return { r: fg.r * alpha + bg.r * (1 - alpha), g: fg.g * alpha + bg.g * (1 - alpha), b: fg.b * alpha + bg.b * (1 - alpha) }; }

/* ---- CIEDE2000 (Sharma, Wu, Dalal 2005) --------------------------------- */
function rgbToLab({ r, g, b }) {
	const R = lin(r), G = lin(g), B = lin(b);
	let X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
	let Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
	let Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
	const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
	X = f(X); Y = f(Y); Z = f(Z);
	return { L: 116 * Y - 16, a: 500 * (X - Y), b: 200 * (Y - Z) };
}
export function deltaE2000(c1, c2) {
	const p = rgbToLab(c1), q = rgbToLab(c2);
	const rad = Math.PI / 180;
	const C1 = Math.hypot(p.a, p.b), C2 = Math.hypot(q.a, q.b), Cb = (C1 + C2) / 2;
	const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
	const a1 = (1 + G) * p.a, a2 = (1 + G) * q.a;
	const C1p = Math.hypot(a1, p.b), C2p = Math.hypot(a2, q.b);
	const h = (a, b) => { if (a === 0 && b === 0) return 0; const x = Math.atan2(b, a) / rad; return x < 0 ? x + 360 : x; };
	const h1 = h(a1, p.b), h2 = h(a2, q.b);
	const dL = q.L - p.L, dC = C2p - C1p;
	let dh = 0;
	if (C1p * C2p !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
	const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
	const Lb = (p.L + q.L) / 2, Cbp = (C1p + C2p) / 2;
	let hb = h1 + h2;
	if (C1p * C2p !== 0) { if (Math.abs(h1 - h2) > 180) hb = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2; else hb = (h1 + h2) / 2; }
	const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
	const dTh = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
	const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
	const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
	const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
	const Rt = -Math.sin(2 * dTh * rad) * Rc;
	return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

/* ---- Color vision deficiency (Machado et al. 2009, severity 1.0) --------- */
const MACHADO = {
	protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
	deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
	tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]]
};
export function simulate(rgb, kind) {
	const m = MACHADO[kind];
	const v = [lin(rgb.r), lin(rgb.g), lin(rgb.b)];
	const o = m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
	return { r: clamp01(delin(clamp01(o[0]))), g: clamp01(delin(clamp01(o[1]))), b: clamp01(delin(clamp01(o[2]))) };
}

/** Muddy: the dark-yellow-to-brown region Palmer and Schloss (2010, PNAS) found
    least preferred (dark yellow and dark orange at the bottom of 32 colors), as an
    OKLCH box. The bounds are this kit's own heuristic, not a published standard:
    yellow-to-orange hues at mid-low lightness with some chroma. It is applied to
    fills and washes (areas), never to small text, where the design systems all use
    a dark ochre on light grounds (Radix amber 11, Primer attention fg). */
export function isMuddy(rgb) {
	const { L, C, H } = rgbToOklch(rgb);
	return H >= 35 && H <= 115 && C >= 0.03 && L < 0.66;
}

/* ---- The per-theme solver ----------------------------------------------- */
/** A yellow-to-orange anchor: on a light ground it can only be a bright fill
    with dark text on it, never a dark outline (the brown problem). */
export const isYellowFamily = (H) => H >= 55 && H <= 115;

const INK_DARK = '#0d1311';
const INK_LIGHT = '#f6f7f4';

/** Search lightness (keeping hue and as much of the anchor's chroma as the gamut
    allows) for the value closest to `L0` whose contrast against every ground is at
    least `target`, moving in the direction that raises contrast. */
function solveL(H, C, grounds, target, L0, dir) {
	const ok = (L) => grounds.every((g) => contrast(oklchToRgb(L, C, H), g) >= target);
	let L = L0;
	for (let i = 0; i < 200 && !ok(L); i++) L += dir * 0.004;
	return Math.min(0.99, Math.max(0.05, L));
}

/**
 * Solve one anchor color for one theme.
 * theme: { dark: bool, panels: [rgb...] (the grounds text sits on), page: rgb }
 * Returns hex strings: ink (text, >= 4.8:1 light, >= 6:1 dark on every panel stop),
 * fill (a mark, band, lamp or badge), on (text on the fill, >= 4.5:1), line (the
 * fill's edge: the fill itself when it reaches 3:1 on every ground, else the ink), and
 * wash (the fill at low alpha, as rgba over the panel), plus notes on what moved.
 */
export function solve(anchorHex, theme) {
	const a = rgbToOklch(hex(anchorHex));
	const notes = [];
	const C = Math.max(a.C, 0);
	const panels = theme.panels;
	const panel = panels[0];
	// ink
	let inkH = a.H;
	if (!theme.dark && isYellowFamily(a.H) && C > 0.04) { inkH = Math.max(45, a.H - 28); notes.push(`ink hue moved ${Math.round(a.H)} to ${Math.round(inkH)} toward orange, so text is an ochre, never olive`); }
	/* A dark warm text color reads as an ochre or a burnt orange only while it
	   keeps its chroma; a muted one is brown. So on light grounds a warm ink
	   takes a chroma floor (the report's warm-chroma floor, about CIE C* 38). */
	let inkC = C;
	if (!theme.dark && a.H >= 35 && a.H <= 115 && C > 0.02 && C < 0.15) { inkC = 0.15; notes.push('warm text kept saturated, a muted dark orange or yellow is brown'); }
	const ink = theme.dark
		? oklchToRgb(solveL(a.H, C, panels, 6.0, Math.max(a.L, 0.62), +1), C, a.H)
		: oklchToRgb(solveL(inkH, inkC, panels, 4.8, Math.min(a.L, 0.62), -1), inkC, inkH);
	// fill
	let fL;
	if (theme.dark) fL = Math.min(0.84, Math.max(0.6, a.L));
	else if (a.H >= 35 && a.H <= 115 && C > 0.04) { fL = Math.max(a.H >= 75 ? 0.82 : 0.7, a.L); if (fL !== a.L) notes.push('light-theme fill kept bright, a yellow or orange is never darkened into brown'); }
	else fL = Math.min(0.68, Math.max(0.4, a.L));
	let fill = oklchToRgb(fL, C, a.H);
	for (let i = 0; i < 40 && isMuddy(fill); i++) { fL += 0.01; fill = oklchToRgb(fL, C, a.H); }
	if (Math.abs(fL - a.L) > 0.12) notes.push(`fill lightness ${a.L.toFixed(2)} to ${fL.toFixed(2)} to read on this ground`);
	// on
	const pickOn = (f) => (contrast(hex(INK_DARK), f) >= contrast(hex(INK_LIGHT), f) ? INK_DARK : INK_LIGHT);
	let on = pickOn(fill);
	for (let i = 0; i < 60 && contrast(hex(on), fill) < 4.5; i++) {
		fL += on === INK_DARK ? 0.006 : -0.006;
		fill = oklchToRgb(fL, C, a.H);
		on = pickOn(fill);
	}
	// line and wash
	const line = panels.every((g) => contrast(fill, g) >= 3) ? toHex(fill) : toHex(ink);
	if (line !== toHex(fill)) notes.push('the fill alone is under 3:1 on the panel, so its edge is drawn in the ink');
	const washA = theme.dark ? 0.16 : 0.22;
	const f = fill;
	return {
		ink: toHex(ink), fill: toHex(fill), on, line,
		wash: `rgba(${Math.round(f.r * 255)},${Math.round(f.g * 255)},${Math.round(f.b * 255)},${washA})`,
		washOver: toHex(over(fill, washA, panel)),
		notes
	};
}
