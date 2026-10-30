/**
 * THE CINEMATIC LIGHT, DRAWN (ledger 0475, decision 73 as amended the second
 * time, 2026-10-30).
 *
 * Every home-screen card is a dark film still: ONE light source in the app's
 * hue about two-thirds across, haze, one object, an eased scrim the icon and
 * title stand on, a vignette, and (in CSS) faint grain. This file is the
 * sample Mr. Pina chose, ported: the scenes are `dirA.js` and the helpers and
 * filled icons are `lib.js` from that sample, transcribed, with GREENLINE and
 * the Foundry redrawn in the same grammar at his request. Change a scene here
 * and nowhere else.
 *
 * Every colour a scene or an icon names is either the app's own (`hue`,
 * `core`, `ground`, `light`, `glow` in ./rooms.ts) or a dark the sample laid
 * under it (a board face, a steel door, asphalt), and `cardInks()` derives
 * the words' inks the way the sample does. ./cards.css writes those inks out
 * per card; tests/home-order-and-accent.test.ts holds the two together.
 *
 * NOTHING HERE IS TEXT A PERSON TYPED. Both functions return SVG built from
 * constants in this file and ./rooms.ts, which is why CardArt and AppLauncher
 * may render them with `{@html}`. The ids are derived from the app's id, so
 * the server's markup and the browser's agree and no two cards share one.
 */
import { COIN_SYMBOL } from '$lib/coin-format';
import { launcherRoom, type LauncherRoom } from './rooms';

/* ---- colour ------------------------------------------------------------ */
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (a: number[]) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
/** `a` moved toward `b` by `t`, in sRGB, as the sample mixes. */
export const mix = (a: string, b: string, t: number) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
export const rgba = (h: string, a: number) => `rgba(${rgb(h).join(',')},${a})`;

/* ---- one card's drawing context: ids, defs, filters, gradients --------- */
type Stop = (string | number)[];
interface Ctx {
	defs: string[];
	id: (k: string) => string;
	blur: (sd: number) => string;
	lin: (x1: number, y1: number, x2: number, y2: number, stops: Stop[]) => string;
	rad: (stops: Stop[]) => string;
}
const stopsOf = (stops: Stop[]) => stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('');
function makeCtx(prefix: string): Ctx {
	let seq = 0;
	const blurs = new Map<number, string>();
	const ctx: Ctx = {
		defs: [],
		id: (k) => `${prefix}${k}${++seq}`,
		blur(sd) {
			const hit = blurs.get(sd);
			if (hit) return hit;
			const id = ctx.id('f');
			ctx.defs.push(`<filter id="${id}" filterUnits="userSpaceOnUse" x="-200" y="-200" width="800" height="500" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${sd}"/></filter>`);
			blurs.set(sd, id);
			return id;
		},
		lin(x1, y1, x2, y2, stops) {
			const id = ctx.id('l');
			ctx.defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopsOf(stops)}</linearGradient>`);
			return `url(#${id})`;
		},
		rad(stops) {
			const id = ctx.id('r');
			ctx.defs.push(`<radialGradient id="${id}">${stopsOf(stops)}</radialGradient>`);
			return `url(#${id})`;
		}
	};
	return ctx;
}

/* ---- the light's vocabulary --------------------------------------------- */
/** A soft pool of light with an eased falloff. */
function glow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string, a: number) {
	const f = ctx.rad([[0, color, a], [0.25, color, a * 0.72], [0.5, color, a * 0.36], [0.75, color, a * 0.11], [1, color, 0]]);
	return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}"/>`;
}
/** The thin bright element: a white-hot core, a tight glow, a wide bloom. */
function bloom(ctx: Ctx, d: string, color: string, core: string, w = 1.2, { wide = 1, cap = 'round', extra = '' } = {}) {
	return `<g fill="none" stroke-linecap="${cap}" stroke-linejoin="round" ${extra}>
<path d="${d}" stroke="${color}" stroke-width="${w * 9 * wide}" opacity="0.28" filter="url(#${ctx.blur(9 * wide)})"/>
<path d="${d}" stroke="${color}" stroke-width="${w * 3}" opacity="0.85" filter="url(#${ctx.blur(2.2)})"/>
<path d="${d}" stroke="${core}" stroke-width="${w}"/></g>`;
}
/** The eased scrim the title stands on: the card's ground at the left, gone by 64%. */
function scrim(ctx: Ctx, ground: string, a0 = 0.94, end = 0.64) {
	const stops: Stop[] = [];
	for (let i = 0; i <= 10; i++) {
		const t = i / 10;
		const e = 1 - t * t * (3 - 2 * t);
		stops.push([(t * end).toFixed(3), ground, (a0 * e).toFixed(3)]);
	}
	stops.push([1, ground, 0]);
	return `<rect width="340" height="88" fill="${ctx.lin(0, 0, 340, 0, stops)}"/>`;
}
function vignette(ctx: Ctx, a = 0.55) {
	const f = ctx.rad([[0, '#000', 0], [0.55, '#000', 0], [0.8, '#000', a * 0.45], [1, '#000', a]]);
	return `<rect width="340" height="88" fill="${f}" transform="translate(170 44) scale(1.25 1.6) translate(-170 -44)"/>`;
}

type App = LauncherRoom;
const ground = (ctx: Ctx, app: App, top?: string, bot?: string) => `<rect width="340" height="88" fill="${ctx.lin(0, 0, 0, 88, [[0, top || mix(app.ground, app.hue, 0.05)], [1, bot || app.ground]])}"/>`;

/* ---- the scenes: one light, one object, no words ---------------------- */
const SCENES: Record<string, (app: App, ctx: Ctx) => string> = {
	// The lit board: a picture-light bar along the top of a dark board, its
	// brass light falling down the face.
	classroom(app: App, ctx: Ctx) {
		const face = ctx.lin(0, 10, 0, 76, [[0, mix('#16120a', app.hue, 0.62)], [0.18, mix('#16120a', app.hue, 0.34)], [0.45, mix('#16120a', app.hue, 0.12)], [1, '#0c0a07']]);
		const wash = ctx.lin(0, 8, 0, 88, [[0, app.hue, 0.22], [1, app.hue, 0]]);
		return `${ground(ctx, app, '#0d0b07', '#0a0805')}
${glow(ctx, 258, 6, 130, 64, app.hue, 0.34)}
<polygon points="188,14 336,6 346,88 172,88" fill="${wash}" filter="url(#${ctx.blur(4)})"/>
<polygon points="196,17 326,10 326,72 196,69" fill="${face}"/>
<path d="M196 69.8L326 72.8" stroke="${rgba(app.hue, 0.3)}" stroke-width="2.4"/>
${bloom(ctx, 'M192 14.2L330 6.6', app.hue, app.core, 1.3)}
${scrim(ctx, app.ground)}${vignette(ctx, 0.6)}`;
	},
	// A page under the lamp: one sheet on the desk in a pool of amber light,
	// its far edge catching the bulb.
	notebook(app: App, ctx: Ctx) {
		const paper = ctx.lin(240, 46, 268, 92, [[0, '#d8c6a8'], [0.45, '#8d7a5f'], [1, '#2e261c']]);
		return `${ground(ctx, app, '#0b0907', '#120d08')}
${glow(ctx, 246, 66, 150, 54, app.hue, 0.3)}
${glow(ctx, 258, -6, 40, 40, app.core, 0.12)}
<polygon points="178,80 236,48 324,56 276,96" fill="#000" opacity="0.6" filter="url(#${ctx.blur(5)})" transform="translate(4 5)"/>
<polygon points="176,76 234,46 322,54 272,94" fill="${paper}"/>
<polygon points="176,76 234,46 322,54 272,94" fill="${ctx.lin(176, 0, 322, 0, [[0, '#000', 0.55], [0.5, '#000', 0], [1, '#000', 0.4]])}"/>
${bloom(ctx, 'M236 46.2L322 54.2', app.hue, app.core, 1.1)}
${scrim(ctx, app.ground)}${vignette(ctx, 0.6)}`;
	},
	// The part on the turntable: a revolved part rim-lit in cool studio
	// light, its revolve axis the one green line.
	ideacad(app: App, ctx: Ctx) {
		const L = app.light!;
		const cyl = (x0: number, x1: number) => ctx.lin(x0, 0, x1, 0, [[0, '#0e1215'], [0.28, '#3c4852'], [0.42, '#4d5a65'], [0.7, '#1b2228'], [1, '#0b0e10']]);
		const top = ctx.lin(0, 18, 0, 56, [[0, '#53616c'], [1, '#2a333a']]);
		return `${ground(ctx, app, '#0f1418', '#0a0d10')}
${glow(ctx, 240, 36, 95, 52, L, 0.2)}
<rect x="0" y="66" width="340" height="22" fill="${ctx.lin(0, 66, 0, 88, [[0, '#0d1114'], [1, '#07090b']])}"/>
<path d="M120 66.5H340" stroke="${rgba(L, 0.18)}" stroke-width="1"/>
<g opacity="0.16" transform="translate(0 133) scale(1 -1)"><rect x="196" y="52" width="84" height="14" fill="${cyl(196, 280)}"/><rect x="218" y="26" width="40" height="26" fill="${cyl(218, 258)}"/></g>
<rect x="196" y="51" width="84" height="15" fill="${cyl(196, 280)}"/>
<ellipse cx="238" cy="66" rx="42" ry="4.5" fill="${cyl(196, 280)}"/>
<ellipse cx="238" cy="51" rx="42" ry="4.5" fill="${top}"/>
<rect x="218" y="24" width="40" height="27" fill="${cyl(218, 258)}"/>
<ellipse cx="238" cy="51" rx="20" ry="2.2" fill="${cyl(218, 258)}"/>
<ellipse cx="238" cy="24" rx="20" ry="2.3" fill="${top}"/>
<ellipse cx="238" cy="24" rx="8" ry="1.1" fill="#070a0c"/>
${bloom(ctx, 'M258 25V50.5M280 51.5V65', L, mix(L, '#ffffff', 0.6), 0.9)}
${bloom(ctx, 'M238 2V23', app.hue, app.core, 0.9, { cap: 'butt' })}
<path d="M238 26V66" stroke="${rgba(app.hue, 0.35)}" stroke-width="0.7" stroke-dasharray="3 2.5"/>
${scrim(ctx, app.ground)}${vignette(ctx, 0.55)}`;
	},
	// The vault seam: two steel doors, one drawn back a hand's width, cold
	// light standing in the gap.
	armory(app: App, ctx: Ctx) {
		const left = ctx.lin(150, 0, 233, 0, [[0, '#0b0f13'], [1, mix('#10161c', app.hue, 0.18)]]);
		const right = ctx.lin(239, 0, 340, 0, [[0, mix('#131a21', app.hue, 0.3)], [0.3, '#10161c'], [1, '#0a0e12']]);
		return `${ground(ctx, app)}
<rect x="150" y="0" width="83" height="88" fill="${left}"/>
<rect x="239" y="0" width="101" height="88" fill="${right}"/>
${[26, 62].map((y) => `<path d="M150 ${y}H233M239 ${y}H340" stroke="#05080a" stroke-width="1.4"/><path d="M150 ${y + 1.2}H233M239 ${y + 1.2}H340" stroke="${rgba(app.core, 0.06)}" stroke-width="0.8"/>`).join('')}
${glow(ctx, 236, 44, 70, 60, app.hue, 0.32)}
${bloom(ctx, 'M236 -4V92', app.hue, app.core, 1.6, { wide: 1.4, cap: 'butt' })}
${scrim(ctx, app.ground)}${vignette(ctx, 0.6)}`;
	},
	// The locator on the shop plan, seen from above: one beacon lighting the
	// walls of the room it is in.
	maps(app: App, ctx: Ctx) {
		const g = app.glow!;
		const wall = ctx.rad([[0, mix('#1d3a31', g, 0.35)], [1, '#0f1c18']]);
		return `${ground(ctx, app, '#08120f', '#060e0b')}
${glow(ctx, 232, 46, 120, 70, g, 0.26)}
<path d="M190 22H292V70" fill="none" stroke="${wall}" stroke-width="3.4" stroke-linecap="butt" mask="url(#${cornerFade(ctx)})"/>
<path d="M190 22H292V70" fill="none" stroke="${rgba(app.core, 0.1)}" stroke-width="0.8" transform="translate(0 -1.4)" mask="url(#${cornerFade(ctx)})"/>
<circle cx="232" cy="46" r="15" fill="none" stroke="${rgba(g, 0.22)}" stroke-width="5" filter="url(#${ctx.blur(3)})"/>
${bloom(ctx, 'M220 46a12 12 0 1 0 24 0a12 12 0 1 0 -24 0', g, rgba(app.core, 0.9), 0.8)}
<circle cx="232" cy="46" r="6" fill="${g}" opacity="0.5" filter="url(#${ctx.blur(3)})"/>
<circle cx="232" cy="46" r="2.4" fill="${app.core}"/>
${scrim(ctx, app.ground)}${vignette(ctx, 0.6)}`;
	},
	// A coin standing on its edge on black glass, its milled rim catching the
	// light from behind.
	coins(app: App, ctx: Ctx) {
		const face = ctx.lin(212, 14, 252, 62, [[0, '#2b3214'], [0.5, '#151a09'], [1, '#0c0f05']]);
		const rim = ctx.lin(0, 10, 0, 64, [[0, '#4a561c'], [1, '#1a1f0a']]);
		return `${ground(ctx, app, '#0a0d06', '#080a05')}
${glow(ctx, 274, 38, 90, 56, app.hue, 0.24)}
<rect y="64" width="340" height="24" fill="#050604" opacity="0.7"/>
<path d="M140 64.5H340" stroke="${rgba(app.hue, 0.16)}" stroke-width="1"/>
<g transform="translate(34 0)"><g opacity="0.18" transform="translate(0 129) scale(1 -1)"><ellipse cx="238" cy="38" rx="21" ry="26" fill="${rim}"/><ellipse cx="232" cy="38" rx="21" ry="26" fill="${face}"/></g>
<ellipse cx="238" cy="38" rx="21" ry="26" fill="${rim}"/>
<ellipse cx="232" cy="38" rx="21" ry="26" fill="${face}"/>
<ellipse cx="232" cy="38" rx="15.5" ry="19.5" fill="none" stroke="${rgba(app.core, 0.1)}" stroke-width="1.2"/>
${bloom(ctx, 'M238 12A21 26 0 0 1 238 64', app.hue, app.core, 1.2)}</g>
${scrim(ctx, app.ground)}${vignette(ctx, 0.6)}`;
	},
	// The ticker light: the last trades as one luminous trace, its head the
	// brightest point on the floor.
	market(app: App, ctx: Ctx) {
		const d = 'M96 74L122 69L140 72L160 61L178 64L196 52L212 56L232 32';
		const fade = ctx.lin(96, 0, 232, 0, [[0, app.hue, 0], [0.5, app.hue, 0.6], [1, app.hue, 1]]);
		const coreFade = ctx.lin(96, 0, 232, 0, [[0, app.core, 0], [0.45, app.core, 0.7], [1, app.core, 1]]);
		const area = ctx.lin(0, 30, 0, 88, [[0, app.hue, 0.2], [1, app.hue, 0]]);
		return `${ground(ctx, app, '#0e0b16', '#09070e')}
${glow(ctx, 232, 32, 90, 50, app.hue, 0.3)}
<path d="${d}L232 88L96 88Z" fill="${area}" mask="url(#${maskFade(ctx)})"/>
<path d="M232 32H340" stroke="${rgba(app.hue, 0.28)}" stroke-width="0.8" stroke-dasharray="2 3"/>
<path d="${d}" fill="none" stroke="${fade}" stroke-width="10" opacity="0.28" filter="url(#${ctx.blur(8)})"/>
<path d="${d}" fill="none" stroke="${fade}" stroke-width="3.4" opacity="0.8" filter="url(#${ctx.blur(2)})" stroke-linejoin="round"/>
<path d="${d}" fill="none" stroke="${coreFade}" stroke-width="1.3" stroke-linejoin="round"/>
<path d="M196 32H268" stroke="${app.core}" stroke-width="0.7" opacity="0.5" filter="url(#${ctx.blur(0.6)})"/>
<circle cx="232" cy="32" r="7" fill="${app.hue}" opacity="0.55" filter="url(#${ctx.blur(4)})"/>
<circle cx="232" cy="32" r="2.4" fill="${app.core}"/>
${scrim(ctx, app.ground)}${vignette(ctx, 0.6)}`;
	},
	// The clock sweep: a great dial's edge in steel fog, the hand sweeping,
	// the time already run trailing behind it as light.
	gauntlet(app: App, ctx: Ctx) {
		const C = [300, 104], R = 94;
		const pt = (a: number, r = R) => [C[0] + Math.cos((a * Math.PI) / 180) * r, C[1] + Math.sin((a * Math.PI) / 180) * r].map((v) => v.toFixed(1));
		const sector = (a0: number, a1: number, op: number) => {
			const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
			return `<path d="M${C[0]} ${C[1]}L${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}Z" fill="${app.hue}" opacity="${op}"/>`;
		};
		const trail = [[198, 206, 0.03], [206, 214, 0.05], [214, 221, 0.08], [221, 227, 0.12], [227, 232, 0.17], [232, 236, 0.24]].map(([a, b, o]) => sector(a, b, o)).join('');
		const ticks = [200, 215, 230, 245, 260, 275, 290].map((a) => { const [x0, y0] = pt(a, R + 2), [x1, y1] = pt(a, R + 9); return `<path d="M${x0} ${y0}L${x1} ${y1}" stroke="${rgba(app.core, a === 245 ? 0.5 : 0.18)}" stroke-width="${a === 245 ? 2 : 1.6}"/>`; }).join('');
		const [hx, hy] = pt(236);
		return `${ground(ctx, app, '#06090d', '#04070a')}
${glow(ctx, 262, -6, 130, 60, '#3b6e8f', 0.4)}
<circle cx="${C[0]}" cy="${C[1]}" r="${R + 5.5}" fill="none" stroke="${rgba(app.hue, 0.12)}" stroke-width="7"/>
${ticks}
<g filter="url(#${ctx.blur(1.2)})">${trail}</g>
${bloom(ctx, `M${C[0]} ${C[1]}L${hx} ${hy}`, app.hue, app.core, 1.1)}
${scrim(ctx, app.ground)}${vignette(ctx, 0.55)}`;
	},
	// The alliance wall at night: the field's blue LED rail along the floor
	// and one stack light standing over it.
	frc(app: App, ctx: Ctx) {
		const wall = ctx.lin(0, 0, 0, 60, [[0, '#050a12'], [1, mix('#08101c', app.hue, 0.12)]]);
		return `${ground(ctx, app, '#050a12', '#03060b')}
<rect x="0" y="0" width="340" height="60" fill="${wall}"/>
<rect x="0" y="61" width="340" height="27" fill="${ctx.lin(0, 61, 0, 88, [[0, '#06101e'], [1, '#03060b']])}"/>
${glow(ctx, 250, 60, 150, 26, app.hue, 0.34)}
<path d="M120 66H340" stroke="${app.hue}" stroke-width="3" opacity="0.18" filter="url(#${ctx.blur(3)})"/>
${bloom(ctx, 'M110 60.5H340', app.hue, app.core, 1.3, { cap: 'butt' })}
<rect x="234.4" y="40" width="3.2" height="20" fill="#0c1520"/>
<rect x="230" y="12" width="12" height="9" rx="2.5" fill="#101a26"/>
<rect x="230" y="31" width="12" height="9" rx="1" fill="#1a0b0d"/>
<rect x="230" y="31" width="12" height="9" rx="1" fill="#ed1c24" opacity="0.22"/>
<rect x="228" y="18" width="16" height="16" fill="${app.hue}" opacity="0.5" filter="url(#${ctx.blur(5)})"/>
<rect x="230" y="21.5" width="12" height="9" fill="${ctx.lin(0, 21.5, 0, 30.5, [[0, app.core], [1, app.hue]])}"/>
${scrim(ctx, app.ground)}${vignette(ctx, 0.6)}`;
	},
	// The climb: the ship nose-up in the dark, its exhaust burning a straight
	// line down the screen.
	vanguard(app: App, ctx: Ctx) {
		const ship = 'M232 18L236.6 30.5L244.5 39V43L235.2 40L233.7 44.5H230.3L228.8 40L219.5 43V39L227.4 30.5Z';
		const stars = [[176, 14], [204, 70], [268, 20], [292, 62], [318, 30], [254, 80], [190, 20]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 2 ? 0.7 : 0.9}" fill="${app.core}" opacity="${i % 3 ? 0.35 : 0.55}"/>`).join('');
		return `${ground(ctx, app, '#040805', '#050a06')}
<g transform="translate(36 0)">${glow(ctx, 232, 60, 70, 46, app.hue, 0.24)}
${bloom(ctx, 'M232 46V92', app.hue, app.core, 1.6, { cap: 'butt', wide: 1.2 })}
<circle cx="232" cy="46" r="4" fill="${app.core}" opacity="0.7" filter="url(#${ctx.blur(1.6)})"/>
<path d="${ship}" fill="#0a120c"/>
<path d="${ship}" fill="none" stroke="${ctx.lin(0, 18, 0, 45, [[0, app.core, 0.85], [1, app.hue, 0.2]])}" stroke-width="0.9" stroke-linejoin="round"/></g>${stars}
${scrim(ctx, app.ground)}${vignette(ctx, 0.6)}`;
	},
	// The night track: one floodlight on its mast, its cold cone falling on
	// the asphalt, and the green streak burning across the track where the
	// light lands.
	greenline(app: App, ctx: Ctx) {
		const L = app.light!;
		const cone = ctx.lin(0, 8, 0, 88, [[0, L, 0.3], [0.55, L, 0.1], [1, L, 0]]);
		const asphalt = ctx.lin(0, 58, 0, 88, [[0, '#0c1218'], [1, '#05080b']]);
		const d = 'M96 86L344 66';
		const fade = ctx.lin(96, 0, 344, 0, [[0, app.hue, 0], [0.42, app.hue, 0.75], [1, app.hue, 1]]);
		const coreFade = ctx.lin(96, 0, 344, 0, [[0, app.core, 0], [0.4, app.core, 0.8], [1, app.core, 1]]);
		const sparks = [[-60, 9], [-30, 11], [-8, 8], [20, 7], [200, 7], [222, 9], [-120, 7], [-150, 6]]
			.map(([deg, len], i) => `<path d="M236 75.2L${(236 + Math.cos((deg * Math.PI) / 180) * len).toFixed(1)} ${(75.2 + Math.sin((deg * Math.PI) / 180) * len).toFixed(1)}" stroke="${i % 3 ? '#ffb02e' : '#ffd9a0'}" stroke-width="${i % 3 ? 0.8 : 0.6}" opacity="0.85"/>`)
			.join('');
		return `${ground(ctx, app, '#06090d', '#04060a')}
<rect x="0" y="58" width="340" height="30" fill="${asphalt}"/>
<path d="M0 58.5H340" stroke="${rgba(L, 0.08)}" stroke-width="1"/>
${glow(ctx, 246, 6, 60, 26, L, 0.3)}
<polygon points="240,9 252,9 300,88 176,88" fill="${cone}" filter="url(#${ctx.blur(4)})"/>
${glow(ctx, 236, 76, 110, 22, app.hue, 0.28)}
<rect x="245" y="9" width="2" height="50" fill="#1a232b"/>
<rect x="236" y="3.6" width="20" height="5.6" rx="1" fill="#141c23"/>
${[240, 244, 248, 252].map((x) => `<circle cx="${x}" cy="6.4" r="1.4" fill="${L}"/>`).join('')}
${bloom(ctx, 'M237 6.4H255', L, '#ffffff', 0.8)}
<path d="${d}" fill="none" stroke="${fade}" stroke-width="12" opacity="0.26" filter="url(#${ctx.blur(8)})"/>
<path d="${d}" fill="none" stroke="${fade}" stroke-width="3.6" opacity="0.85" filter="url(#${ctx.blur(2.2)})"/>
<path d="${d}" fill="none" stroke="${coreFade}" stroke-width="1.3"/>
<g stroke-linecap="round">${sparks}</g>
<circle cx="236" cy="75.2" r="5" fill="#ffb02e" opacity="0.4" filter="url(#${ctx.blur(3)})"/>
<circle cx="236" cy="75.2" r="1.6" fill="#ffe7c2"/>
${scrim(ctx, app.ground)}${vignette(ctx, 0.55)}`;
	},
	// The pour: iron black, a crucible tipped high on the right, its molten
	// stream falling into the ingot mould, the floor seam glowing either side.
	foundry(app: App, ctx: Ctx) {
		const pot = ctx.lin(244, 0, 276, 0, [[0, '#3a2c20'], [0.45, '#1e1712'], [1, '#0e0b09']]);
		const mould = ctx.lin(0, 60, 0, 72, [[0, '#1f1813'], [1, '#0b0907']]);
		const stream = ctx.lin(0, 24, 0, 62, [[0, app.core], [1, app.hue]]);
		return `${ground(ctx, app, '#0f0d0b', '#0a0908')}
<rect x="0" y="68" width="340" height="20" fill="${ctx.lin(0, 68, 0, 88, [[0, '#0b0a08'], [1, '#060504']])}"/>
${glow(ctx, 234, 62, 120, 34, app.hue, 0.36)}
${bloom(ctx, 'M120 68.5H340', app.hue, rgba(app.core, 0.55), 0.7, { cap: 'butt', extra: `mask="url(#${seamFade(ctx)})"` })}
<polygon points="206,60 262,60 258,70 210,70" fill="${mould}"/>
${bloom(ctx, 'M208 60.6H260', app.hue, app.core, 1.2, { cap: 'butt' })}
<g transform="rotate(-38 262 18)"><path d="M250 9h24l-2.8 16a3.6 3.6 0 0 1-3.5 3h-11.4a3.6 3.6 0 0 1-3.5-3z" fill="${pot}"/></g>
${glow(ctx, 250, 16, 16, 10, app.hue, 0.4)}
${bloom(ctx, 'M247 18.3L265.9 3.5', app.hue, rgba(app.core, 0.9), 0.7)}
<path d="M247 18.6C239.5 25 236.4 40 235.6 60" fill="none" stroke="${app.hue}" stroke-width="7" opacity="0.3" filter="url(#${ctx.blur(5)})"/>
<path d="M247 18.6C239.5 25 236.4 40 235.6 60" fill="none" stroke="${app.hue}" stroke-width="3" opacity="0.85" filter="url(#${ctx.blur(1.4)})"/>
<path d="M247 18.6C239.5 25 236.4 40 235.6 60" fill="none" stroke="${stream}" stroke-width="1.5"/>
<circle cx="235.6" cy="60.4" r="6" fill="${app.hue}" opacity="0.5" filter="url(#${ctx.blur(4)})"/>
${scrim(ctx, app.ground)}${vignette(ctx, 0.6)}`;
	},
	// The final: two seeds' lines of light meeting in one point under a
	// spotlight, the winner's line running on.
	tournaments(app: App, ctx: Ctx) {
		const cone = ctx.lin(0, -10, 0, 50, [[0, app.core, 0.14], [1, app.core, 0]]);
		return `${ground(ctx, app, '#07120d', '#050c09')}
<polygon points="226,-8 238,-8 262,52 202,52" fill="${cone}" filter="url(#${ctx.blur(3)})"/>
${glow(ctx, 232, 44, 80, 40, app.hue, 0.28)}
${bloom(ctx, 'M140 20H198L230 44', app.hue, rgba(app.core, 0.85), 1)}
${bloom(ctx, 'M140 68H198L230 44', app.hue, rgba(app.core, 0.85), 1)}
${bloom(ctx, 'M234 44H344', app.hue, app.core, 1.4, { cap: 'butt' })}
<circle cx="232" cy="44" r="8" fill="${app.hue}" opacity="0.5" filter="url(#${ctx.blur(4)})"/>
<circle cx="232" cy="44" r="3" fill="${app.core}"/>
${scrim(ctx, app.ground)}${vignette(ctx, 0.6)}`;
	},
	// Light through the keyhole: a dark escutcheon on a dark door, the room
	// beyond it lit, the light falling out across the floor.
	dashboard(app: App, ctx: Ctx) {
		const kh = 'M229.6 41.4A7.4 7.4 0 1 1 238.4 41.4L241.2 58H226.8Z';
		const plate = ctx.lin(0, 6, 0, 82, [[0, '#13201e'], [1, '#0a1211']]);
		const spill = ctx.lin(0, 50, 0, 88, [[0, app.hue, 0.18], [1, app.hue, 0]]);
		return `${ground(ctx, app, '#08100f', '#060c0b')}
<polygon points="226,58 242,58 300,88 168,88" fill="${spill}" filter="url(#${ctx.blur(3)})"/>
<rect x="208" y="10" width="52" height="68" rx="8" fill="${plate}"/>
<rect x="208" y="10" width="52" height="68" rx="8" fill="none" stroke="${rgba(app.core, 0.08)}" stroke-width="1"/>
${glow(ctx, 234, 44, 64, 50, app.hue, 0.3)}
<path d="${kh}" fill="${app.hue}" opacity="0.7" filter="url(#${ctx.blur(6)})"/>
<path d="${kh}" fill="${ctx.lin(0, 30, 0, 58, [[0, app.core], [1, mix(app.core, app.hue, 0.6)]])}"/>
<path d="${kh}" fill="none" stroke="${rgba(app.core, 0.9)}" stroke-width="0.8"/>
${scrim(ctx, app.ground)}${vignette(ctx, 0.6)}`;
	}
};


// The room's corner is lit where the beacon reaches and gone elsewhere.
function cornerFade(ctx: Ctx) {
	const id = ctx.id('cf');
	ctx.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="340" height="88"><ellipse cx="250" cy="44" rx="80" ry="52" fill="${ctx.rad([[0, '#fff', 1], [0.6, '#fff', 0.6], [1, '#fff', 0]])}"/></mask>`);
	return id;
}
// The foundry floor seam glows only near the pour.
function seamFade(ctx: Ctx) {
	const id = ctx.id('sf');
	ctx.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="340" height="88"><rect width="340" height="88" fill="${ctx.lin(120, 0, 340, 0, [[0, '#fff', 0], [0.5, '#fff', 1], [1, '#fff', 0.35]])}"/></mask>`);
	return id;
}
// Fades the market's under-trace wash in from the left.
function maskFade(ctx: Ctx) {
	const id = ctx.id('mf');
	ctx.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="340" height="88"><rect width="340" height="88" fill="${ctx.lin(96, 0, 232, 0, [[0, '#fff', 0], [1, '#fff', 1]])}"/></mask>`);
	return id;
}

/* ---- the filled icons (a 32-unit space) ---------------------------------
   Items draw in order into a mask: w is solid, b is cut away, bt is a glyph
   cut away. Tones are shade overlays clipped to the icon (a face in shadow).
   `accent` is the sample's record of the one line that glows; the launcher
   lights the whole icon the same way for every app. */
interface Mark {
	items: [string, string][];
	tones?: [string, number, string][];
	accent: string;
}
const rr = (x: number, y: number, w: number, h: number, r: number) => `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${w - 2 * r}a${r} ${r} 0 0 1 -${r} -${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}z`;
const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;

const MARKS: Record<string, Mark> = {
	// A teaching board on its easel, its chalk tray cut across the foot.
	classroom: {
		items: [['w', rr(3, 4, 26, 17.5, 2)], ['w', 'M9.6 21h3.1l-3.1 9H6.5z'], ['w', 'M19.3 21h3.1l3.1 9h-3.1z'], ['w', rr(13, 1.6, 6, 3.2, 0.8)], ['b', 'M3 17.4h26v1.5H3z']],
		accent: 'M4 18.15H28'
	},
	// A page with its corner turned, a camera lens set in it.
	notebook: {
		items: [['w', 'M8 2h11.5L27 9.5V28a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z'], ['b', circ(16.5, 19.5, 5.2)], ['w', circ(16.5, 19.5, 2.3)]],
		tones: [['#000', 0.38, 'M19.5 2L27 9.5h-5.5a2 2 0 0 1-2-2z']],
		accent: circ(16.5, 19.5, 5.2)
	},
	// A machined block with a bore through its top face.
	ideacad: {
		items: [['w', 'M16 2.5L28.5 9.7V23.3L16 30.5L3.5 23.3V9.7Z'], ['b', ell(16, 9.7, 5.4, 3.1)]],
		tones: [['#000', 0.26, 'M3.5 9.7L16 16.9V30.5L3.5 23.3Z'], ['#000', 0.5, 'M28.5 9.7V23.3L16 30.5V16.9Z']],
		accent: ell(16, 9.7, 5.4, 3.1)
	},
	// A cabinet of three drawers, the middle one drawn out, each with its pull.
	armory: {
		items: [['w', rr(2.5, 2.6, 25, 8, 1.6)], ['w', rr(5, 12, 25, 8, 1.6)], ['w', rr(2.5, 21.4, 25, 8, 1.6)], ['b', rr(11, 5.6, 8, 2, 1)], ['b', rr(13.5, 15, 8, 2, 1)], ['b', rr(11, 24.4, 8, 2, 1)]],
		accent: 'M14.5 16H20.5'
	},
	// One room of the shop plan, an L, with the locator set in it.
	maps: {
		items: [['w', 'M5 3h22a2 2 0 0 1 2 2v22a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2v-9H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z'], ['b', circ(21.5, 11, 4.8)], ['w', circ(21.5, 11, 2.1)]],
		accent: circ(21.5, 11, 4.8)
	},
	// The struck coin: a milled rim, the field, the coin symbol cut in.
	coins: {
		items: [['w', circ(16, 16, 13.8)], ['b', circ(16, 16, 11.8)], ['w', circ(16, 16, 10.6)], ['bt', COIN_SYMBOL]],
		accent: circ(16, 16, 12.8)
	},
	// Three candles rising on one base line: the trading floor.
	market: {
		items: [['w', rr(3.5, 17, 6.2, 9, 1.2)], ['w', rr(6, 13.5, 1.2, 15, 0.6)], ['w', rr(12.9, 10.5, 6.2, 12, 1.2)], ['w', rr(15.4, 6.5, 1.2, 19, 0.6)], ['w', rr(22.3, 3.5, 6.2, 14, 1.2)], ['w', rr(24.8, 1, 1.2, 21, 0.6)], ['w', rr(2, 28.4, 28, 2, 1)]],
		accent: 'M6.6 15L16 8.5L25.4 2.2'
	},
	// The stopwatch: crown, lug, and the sector already run.
	gauntlet: {
		items: [['w', circ(16, 18.5, 11.6)], ['w', rr(14.3, 4, 3.4, 4, 0.6)], ['w', rr(11.8, 1.4, 8.4, 3.2, 1.2)], ['w', 'M24.2 7.6l2.3-2.3 2.6 2.6-2.3 2.3z'], ['b', circ(16, 18.5, 9.2)], ['w', 'M16 18.5V9.3A9.2 9.2 0 0 1 24.65 15.35Z'], ['w', circ(16, 18.5, 1.7)]],
		accent: 'M16 18.5L24.65 15.35'
	},
	// The VANGUARD ship, nose up, cockpit cut in.
	vanguard: {
		items: [['w', 'M16 1.5L20.6 14L28.5 22.6V26.6L19.2 23.6L17.7 28.5H14.3L12.8 23.6L3.5 26.6V22.6L11.4 14Z'], ['b', 'M16 7.2L17.8 13.4H14.2Z']],
		accent: 'M14.3 28.5H17.7'
	},
	// The racer from behind: rear wing on its struts, cabin, body, wheels,
	// the two tail lights cut in.
	greenline: {
		items: [['w', rr(5, 6.5, 22, 2.8, 1)], ['w', 'M10.4 9h2.2v4.4h-2.2z'], ['w', 'M19.4 9h2.2v4.4h-2.2z'], ['w', 'M11.8 18l2-5.2h4.4l2 5.2z'], ['w', 'M7 17.4h18l1.8 5.6v3.6a1.4 1.4 0 0 1-1.4 1.4H6.6a1.4 1.4 0 0 1-1.4-1.4V23z'], ['w', rr(1.2, 20.6, 5.4, 9.6, 1.5)], ['w', rr(25.4, 20.6, 5.4, 9.6, 1.5)], ['b', rr(8.6, 20.6, 5, 2.1, 1)], ['b', rr(18.4, 20.6, 5, 2.1, 1)], ['b', 'M12.6 24.8h6.8v1.5h-6.8z']],
		tones: [['#000', 0.45, 'M1.2 20.6h5.4v9.6H1.2z'], ['#000', 0.45, 'M25.4 20.6h5.4v9.6h-5.4z']],
		accent: 'M8.6 21.65H13.6M18.4 21.65H23.4'
	},
	// The crucible: its molten line cut across the lip, the pour falling into
	// the ingot mould below.
	foundry: {
		items: [['w', 'M6.5 3.5h19l-2.4 12.6a3.2 3.2 0 0 1-3.1 2.6h-8a3.2 3.2 0 0 1-3.1-2.6z'], ['b', 'M7.6 7.2h16.8l-0.3 1.6H7.9z'], ['w', rr(15, 18, 2, 5.4, 1)], ['w', 'M6.5 24.5h19l-2.2 5.5H8.7z'], ['b', 'M9.6 26.2h12.8l-0.6 1.4H10.2z']],
		tones: [['#000', 0.36, 'M16 3.5h9.5l-2.4 12.6a3.2 3.2 0 0 1-3.1 2.6H16z'], ['#000', 0.36, 'M16 24.5h9.5l-2.2 5.5H16z']],
		accent: 'M7.6 8H24.4'
	},
	// The bracket: two seeds meeting, the winner's line running out.
	tournaments: {
		items: [['w', rr(3, 4.4, 12, 3.8, 1)], ['w', rr(3, 23.8, 12, 3.8, 1)], ['w', rr(11.2, 4.4, 3.8, 23.2, 1)], ['w', rr(11.2, 14.1, 14, 3.8, 1)], ['w', circ(26.2, 16, 3.9)]],
		accent: 'M15 16H26'
	},
	// The master plate, its keyhole cut through.
	dashboard: {
		items: [['w', rr(5, 2.5, 22, 27, 4.5)], ['b', 'M13.7 15.9A4.3 4.3 0 1 1 18.3 15.9L19.9 24.8H12.1Z']],
		accent: 'M13.7 15.9A4.3 4.3 0 1 1 18.3 15.9L19.9 24.8H12.1Z'
	}
};


/** The SVG for one card's scene, 340 by 88, sliced to fill the banner. */
export function sceneSvg(id: string): string {
	const app = launcherRoom(id);
	const draw = app && SCENES[app.id];
	if (!app || !draw) return '';
	const ctx = makeCtx(`la-${id}-`);
	const body = draw(app, ctx);
	return `<svg class="scene" viewBox="0 0 340 88" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs>${ctx.defs.join('')}</defs>${body}</svg>`;
}

/**
 * The SVG for one card's icon: the app's filled mark, lit from above, its
 * core running into its hue. The FIRST mark is not here: FRC's icon is
 * FIRST's own image, unaltered (AppLauncher).
 */
export function iconSvg(id: string): string {
	const app = launcherRoom(id);
	const m = MARKS[id];
	if (!app || !m) return '';
	const ctx = makeCtx(`la-${id}-i`);
	const fill = ctx.lin(0, 2, 0, 30, [[0, app.core], [0.55, mix(app.core, app.hue, 0.6)], [1, app.hue]]);
	const mid = ctx.id('m');
	const body = m.items
		.map(([k, d]) =>
			k === 'bt'
				? `<text x="16" y="20" text-anchor="middle" font-family="Orbitron" font-weight="900" font-size="10.5" fill="#000">${d}</text>`
				: `<path d="${d}" fill="${k === 'w' ? '#fff' : '#000'}"/>`
		)
		.join('');
	ctx.defs.push(`<mask id="${mid}" maskUnits="userSpaceOnUse" x="-6" y="-6" width="44" height="44">${body}</mask>`);
	const tones = (m.tones ?? []).map(([c, o, d]) => `<path d="${d}" fill="${c}" opacity="${o}"/>`).join('');
	return `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><defs>${ctx.defs.join('')}</defs><g mask="url(#${mid})"><rect x="-4" y="-4" width="40" height="40" fill="${fill}"/>${tones}</g></svg>`;
}

/** Every app the launcher draws an icon for: all of them but FRC, whose icon is FIRST's own. */
export const ICON_IDS = Object.keys(MARKS);
/** Every app the launcher draws a scene for. */
export const SCENE_IDS = Object.keys(SCENES);

/**
 * THE WORDS' INKS, DERIVED FROM THE LIGHT the way the sample derives them.
 * ./cards.css writes these out per card and the test holds it to them, so a
 * colour on a card is always one of its light's.
 */
export function cardInks(room: LauncherRoom) {
	return {
		ground: room.ground,
		edge: mix(room.ground, room.hue, 0.28),
		title: mix('#eef0ec', room.core, 0.3),
		titleGlow: `0 1px 2px rgba(0,0,0,0.6), 0 0 10px ${room.ground}`,
		accent: room.titleAccent ? (room.id === 'coins' ? mix(room.hue, '#f3ffcf', 0.2) : room.hue) : undefined,
		icon: room.hue,
		iconFilter: `drop-shadow(0 1px 1.5px rgba(0,0,0,0.7)) drop-shadow(0 0 7px ${rgba(room.hue, 0.28)})`,
		sub: mix('#a9b0ab', room.core, 0.25),
		ctaInk: mix(room.core, room.hue, 0.35),
		ctaEdge: rgba(room.hue, 0.55),
		ctaBg: rgba(room.hue, 0.08),
		glow: rgba(room.hue, 0.22)
	};
}
