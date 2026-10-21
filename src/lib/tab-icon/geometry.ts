/**
 * THE TAB ICON'S GEOMETRY: every tab icon, section glyph, status and
 * home-screen icon on ideabosco.com is a pure function of this file.
 *
 * Mr. Pina chose the icon, Gear Key, from a design board on 2026-10-16
 * (ledger 0396). The board handed over one plain JavaScript module,
 * `idea-tab-icon.js`, with four candidate bases; this is a TypeScript port of
 * the one he picked. The other three (a light key, a bare gear and an "iD"
 * monogram key) and the helpers only they used are deleted, not kept dormant.
 *
 * DO NOT REDRAW, RESTYLE OR "IMPROVE" A SHAPE OR A COLOUR HERE. The decision
 * was made looking at these exact pixels at 16 and 32 px on six tab grounds.
 * `tests/tab-icon-geometry.test.ts` puts 771 calls through this file and
 * compares each SVG against `tests/fixtures/tab-icon-golden.json`, which was
 * recorded mechanically from the original module before this port existed
 * (`tools/tab-icon/golden.mjs`). A changed coordinate, a changed colour or a
 * changed gradient-id spelling reddens it. Changing the icon on purpose is a
 * design decision, then a new board, then a new fixture.
 *
 * PURE: no DOM, no clock, no randomness. String in, string out. The same call
 * returns the same bytes on the server, in the browser and in the build tool
 * (`tools/tab-icon/build.mjs`, which writes the static files in `static/IDEA/`
 * from this module alone). The floating-point arithmetic is the original's, on
 * the same engine, which is why a couple of coordinates carry a long tail such
 * as `30.400000000000002`: they are part of the recorded bytes.
 *
 * THE GRID. 32 units square; at 16 px two units are one pixel. Three layers:
 *   the KEY    says "IDEA" (the Plate's graphite machined key: a dark tray, a
 *              lit hairline edge, a gradient face; `src/lib/classroom/plate.css`)
 *   the GLYPH  says where you are (home is the emblem's gear with its hub as a
 *              mint LED; a section is its own glyph in its launcher accent)
 *   the LAMP   and the HAIRLINE say what is happening (unread, saving, live...)
 *
 * GRADIENT IDS ARE PREFIXED BY `uid`, so several icons inlined on one page do
 * not share an id. For a home icon drawn OFFLINE the prefix must be lowercase
 * letters and digits only: the offline branch finds the metal gradient by the
 * pattern `url(#[a-z0-9]+m)`, exactly as the original did.
 */

/** The palette. Only the colours the Gear Key base and the glyphs use. */
export const C = {
	mint: '#8FE08A',
	bone: '#EAE6D8',
	crimson: '#FF3355',
	gold: '#D3C68E',
	tray: '#070908',
	hairTop: '#8C978F',
	hairBot: '#3A413C',
	faceTop: '#2F3431',
	faceBot: '#161917',
	cup: '#0C0E0D',
	ledOff: '#2C332F',
	metalTop: '#E6EAE2',
	metalBot: '#A3ADA3'
} as const;

type Point = readonly [number, number];

const f = (n: number): string => (Math.round(n * 100) / 100).toString();
const P = (pts: readonly Point[]): string => 'M' + pts.map((p) => f(p[0]) + ',' + f(p[1])).join('L') + 'Z';
const circ = (cx: number, cy: number, r: number): string =>
	`M${f(cx - r)},${f(cy)}a${f(r)},${f(r)} 0 1 0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1 0 ${f(-2 * r)},0Z`;

function gear(cx: number, cy: number, ro: number, ri: number, n: number, to: number, ti: number, rot: number): string {
	const pts: Point[] = [];
	for (let k = 0; k < n; k++) {
		const a = (2 * Math.PI * k) / n + (rot || 0);
		for (const [d, r] of [
			[-ti, ri],
			[-to, ro],
			[to, ro],
			[ti, ri]
		])
			pts.push([cx + r * Math.cos(a + d), cy + r * Math.sin(a + d)]);
	}
	return P(pts);
}

const rr = (x: number, y: number, w: number, h: number, r: number): string =>
	`M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;

/** What a status may relight on the key (the offline tone dims all four). */
export interface KeyTone {
	hairTop?: string;
	hairBot?: string;
	faceTop?: string;
	faceBot?: string;
}

/** The key: dark tray outside, lit hairline, gradient face. */
export function key(u: string, o: KeyTone = {}): string {
	const ht = o.hairTop || C.hairTop,
		hb = o.hairBot || C.hairBot;
	const ft = o.faceTop || C.faceTop,
		fb = o.faceBot || C.faceBot;
	return (
		`<defs><linearGradient id="${u}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ht}"/><stop offset="1" stop-color="${hb}"/></linearGradient>` +
		`<linearGradient id="${u}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ft}"/><stop offset="1" stop-color="${fb}"/></linearGradient></defs>` +
		`<path d="${rr(0, 0, 32, 32, 8)}" fill="${C.tray}"/><path d="${rr(1, 1, 30, 30, 7)}" fill="url(#${u}h)"/><path d="${rr(2.4, 2.4, 27.2, 27.2, 5.6)}" fill="url(#${u}f)"/>`
	);
}

const metal = (u: string): string =>
	`<linearGradient id="${u}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.metalTop}"/><stop offset="1" stop-color="${C.metalBot}"/></linearGradient>`;

/** A lamp colour, or `'off'` (or nothing) for a dark LED. */
export type LampColor = string | null | undefined;

/** LED lamp: a dark cup with a lit core. On the gear it is the hub. */
export function lamp(cx: number, cy: number, r: number, col: LampColor, glow: boolean): string {
	const lit = !!col && col !== 'off';
	return (
		(glow && lit ? `<circle cx="${cx}" cy="${cy}" r="${f(r + 2.6)}" fill="${col}" opacity=".28"/>` : '') +
		`<circle cx="${cx}" cy="${cy}" r="${f(r + 1.1)}" fill="${C.cup}"/>` +
		`<circle cx="${cx}" cy="${cy}" r="${f(r)}" fill="${lit ? col : C.ledOff}"/>` +
		(lit ? `<circle cx="${f(cx - r * 0.32)}" cy="${f(cy - r * 0.36)}" r="${f(r * 0.34)}" fill="#fff" opacity=".55"/>` : '')
	);
}

/** The emblem's gear, eight teeth, as one path. */
export const GEAR = gear(16, 16, 13, 9.6, 8, 0.2, 0.27, Math.PI / 8);

/** The one base: Gear Key. `lampAt` is where status lands on the home icon. */
export const BASES = {
	gearkey: {
		name: 'Gear Key',
		lampAt: [16, 16, 4.4] as const,
		draw: (u: string, led: LampColor): string =>
			key(u) +
			`<defs>${metal(u)}</defs><path d="${GEAR} ${circ(16, 16, 6.2)}" fill="url(#${u}m)" fill-rule="evenodd"/>` +
			lamp(16, 16, 4.4, led, true)
	}
} as const;

export type TabIconBase = keyof typeof BASES;

export type TabSection =
	| 'home'
	| 'classroom'
	| 'notebook'
	| 'ideacad'
	| 'armory'
	| 'maps'
	| 'coins'
	| 'gauntlet'
	| 'vanguard'
	| 'greenline'
	| 'tournaments'
	| 'foundry'
	| 'frc'
	| 'certs'
	| 'admin';

export interface TabSectionDef {
	label: string;
	/** The glyph's ink: the app's own launcher accent. Null only for home. */
	col: string | null;
	col2?: string;
	/** The section's main address. */
	route: string;
	/**
	 * Further addresses that are the same section. NOT IN THE ORIGINAL MODULE:
	 * its `route` values were claims, and ledger 0396's route audit found some
	 * sections answer on more than one prefix (the history entry has the
	 * evidence). Longest prefix over `route` and `also` decides; see
	 * `sectionForPath` in `./sections.ts`.
	 */
	also?: readonly string[];
	/** Draws the glyph in the given ink. Absent only for home. */
	d?: (c: string) => string;
}

/**
 * Section glyphs, drawn in each app's own launcher accent (the identity
 * colours `src/lib/AppLauncher.svelte` declares). The colours are the design
 * module's literals and stay so.
 */
export const G: Record<TabSection, TabSectionDef> = {
	home: { label: 'Home', col: null, route: '/' },
	classroom: {
		label: 'Classroom',
		col: '#D3C68E',
		route: '/classroom',
		also: ['/reference'],
		d: (c) =>
			`<path d="M4,12.5L16,7.5L28,12.5L16,17.5Z" fill="${c}"/><path d="M9,15.6L16,18.6L23,15.6V21.4C23,23.4 9,23.4 9,21.4Z" fill="${c}" opacity=".72"/>`
	},
	notebook: {
		label: 'Notebook',
		col: '#E0B060',
		route: '/classroom/notebook',
		also: ['/notebook'],
		d: (c) =>
			`<path d="M10,6H22L24,8V25H10Z" fill="${c}"/><path d="M7,10H12M7,15H12M7,20H12" stroke="${c}" stroke-width="2"/><path d="M14.5,11.5H21M14.5,16H21" stroke="${C.faceBot}" stroke-width="2"/>`
	},
	ideacad: {
		label: 'IdeaCAD',
		col: C.bone,
		route: '/ideacad',
		d: (c) =>
			`<path d="M16,5L25.5,10.2L16,15.4L6.5,10.2Z" fill="${c}"/><path d="M6.5,12L15,16.8V26.5L6.5,21.7Z" fill="${c}" opacity=".6"/><path d="M25.5,12L17,16.8V26.5L25.5,21.7Z" fill="${c}" opacity=".84"/>`
	},
	armory: {
		label: 'Armory',
		col: '#A79BE8',
		route: '/armory',
		d: (c) =>
			`<path d="M11,14V11A5,5 0 0 1 21,11V14" fill="none" stroke="${c}" stroke-width="3"/><path d="M8,14H24V26H8Z M15,17.5V22.5H17V17.5Z" fill="${c}" fill-rule="evenodd"/>`
	},
	maps: {
		label: 'Maps',
		col: '#40E3B1',
		route: '/maps',
		d: (c) =>
			`<path d="M16,27C16,27 7.5,18.6 7.5,12.6A8.5,8.5 0 0 1 24.5,12.6C24.5,18.6 16,27 16,27Z ${circ(16, 12.6, 3.2)}" fill="${c}" fill-rule="evenodd"/>`
	},
	coins: {
		label: 'Coins',
		col: '#C8FF00',
		route: '/coin-desk',
		also: ['/coin-balance', '/coins', '/coin'],
		d: (c) =>
			`<ellipse cx="16" cy="9.5" rx="9.5" ry="3.6" fill="${c}"/><path d="M6.5,12.6C6.5,14.6 10.8,16.2 16,16.2S25.5,14.6 25.5,12.6V15.4C25.5,17.4 21.2,19 16,19S6.5,17.4 6.5,15.4Z M6.5,18.6C6.5,20.6 10.8,22.2 16,22.2S25.5,20.6 25.5,18.6V21.4C25.5,23.4 21.2,25 16,25S6.5,23.4 6.5,21.4Z" fill="${c}"/>`
	},
	gauntlet: {
		label: 'GAUNTLET',
		col: '#00FF41',
		route: '/gauntlet',
		d: (c) =>
			`<path d="M4.5,12.5L15,6.5L27.5,12.5L17,18.5Z" fill="${c}"/><path d="M4.5,12.5L17,18.5V26.5L4.5,20.5Z" fill="${c}" opacity=".62"/><path d="M17,18.5L27.5,12.5V20.5L17,26.5Z" fill="${c}" opacity=".84"/><ellipse cx="16" cy="12.5" rx="3.6" ry="1.9" fill="#0B110C"/>`
	},
	vanguard: {
		label: 'VANGUARD',
		col: '#C8FF00',
		route: '/vanguard',
		d: (c) => `<path d="M16,4.5L26,26L16,20.5L6,26Z" fill="${c}"/>`
	},
	greenline: {
		label: 'GREENLINE',
		col: '#2AE57E',
		route: '/greenline',
		d: (c) =>
			`<path d="M7,4.5V27.5" stroke="${C.bone}" stroke-width="2.2"/><path d="M8,5.5H26V19H8Z" fill="#0B110C"/><path d="M8,5.5H12.5V10H8Z M17,5.5H21.5V10H17Z M12.5,10H17V14.5H12.5Z M21.5,10H26V14.5H21.5Z M8,14.5H12.5V19H8Z M17,14.5H21.5V19H17Z" fill="${c}"/>`
	},
	tournaments: {
		label: 'Tournaments',
		col: '#0FBE7A',
		route: '/tournaments',
		d: (c) =>
			`<path d="M9.5,5.5H22.5V12.5C22.5,16.3 19.6,19 16,19C12.4,19 9.5,16.3 9.5,12.5Z M14.6,19H17.4V23H14.6Z M10.5,23H21.5V26H10.5Z" fill="${c}"/><path d="M9.5,8.5H6V11C6,13 7.6,14.5 9.5,14.5M22.5,8.5H26V11C26,13 24.4,14.5 22.5,14.5" fill="none" stroke="${c}" stroke-width="2"/>`
	},
	foundry: {
		label: 'Foundry',
		col: '#F6952F',
		route: '/foundry',
		d: (c) =>
			`<path d="M5,6.5L15.5,4.5L16.5,12.5L8.5,15Z" fill="${C.bone}" opacity=".9"/><path d="M15.8,9.2C18.5,10 19.4,12 19.4,15.5V18" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><path d="M6,19H27L24.5,27H8.5Z" fill="${C.bone}" opacity=".55"/><path d="M8.6,20.8H24.4L23.6,23.4H9.4Z" fill="${c}"/>`
	},
	frc: {
		label: 'FRC Training',
		col: '#ED1C24',
		col2: '#2F8CF0',
		route: '/frc',
		d: () =>
			`<path d="M5,9A4,4 0 0 1 9,5H23A4,4 0 0 1 27,9V12H23.5V9.5A1,1 0 0 0 22.5,8.5H9.5A1,1 0 0 0 8.5,9.5V22.5A1,1 0 0 0 9.5,23.5H12V27H9A4,4 0 0 1 5,23Z" fill="#ED3B42"/><path d="M27,20V23A4,4 0 0 1 23,27H20V23.5H22.5A1,1 0 0 0 23.5,22.5V20Z M12,27V23.5H20V27Z M27,12V20H23.5V12Z" fill="#2F8CF0"/><path d="M10.5,10.5H14V14H10.5Z M18,10.5H21.5V14H18Z M10.5,18H14V21.5H10.5Z M18,18H21.5V21.5H18Z" fill="${C.bone}"/>`
	},
	certs: {
		label: 'Certifications',
		col: C.mint,
		route: '/certifications',
		d: (c) => {
			const pts: Point[] = [];
			for (let i = 0; i < 24; i++) {
				const a = (Math.PI * 2 * i) / 24,
					r = i % 2 ? 10.2 : 12.2;
				pts.push([16 + r * Math.cos(a), 16 + r * Math.sin(a)]);
			}
			return `<path d="${P(pts)} M10.6,16.4L14.4,20.2L21.6,12.6L19.6,10.8L14.4,16.2L12.6,14.4Z" fill="${c}" fill-rule="evenodd"/>`;
		}
	},
	admin: {
		label: 'Admin',
		col: '#78B870',
		route: '/dashboard',
		also: ['/admin'],
		d: (c) =>
			`<path d="M16,4.5L25.5,8.3V15.8C25.5,21.4 21.2,25.3 16,27.5C10.8,25.3 6.5,21.4 6.5,15.8V8.3Z M16,9.2V22.6C18.8,21.2 20.8,18.8 20.8,15.8V11.1Z" fill="${c}" fill-rule="evenodd"/>`
	}
};

/** Every section id, in the design module's order. */
export const TAB_SECTIONS = Object.keys(G) as TabSection[];

/** What the icon is showing. `none` is the resting icon. */
export type TabIconKind =
	| 'none'
	| 'unread'
	| 'error'
	| 'attention'
	| 'live'
	| 'saving'
	| 'progress'
	| 'done'
	| 'offline';

/**
 * A status as the drawing reads it. `n` is an unread count (the drawing does
 * not print it; the title does), `p` a progress fraction from 0 to 1, and
 * `phase` where an animated state is in its cycle (one unit is one cycle of
 * the live pulse and two blinks of the saving lamp).
 */
export interface TabIconStatus {
	kind: TabIconKind;
	n?: number;
	p?: number;
	phase?: number;
}

/**
 * One tab icon. The lamp carries every event; the hairline carries every
 * duration.
 */
export function icon(
	base: TabIconBase,
	section?: TabSection | null,
	status?: TabIconStatus | null,
	uid?: string
): string {
	status = status || { kind: 'none' };
	uid = uid || 'k';
	const k = status.kind,
		ph = status.phase || 0;
	const off = k === 'offline';
	let led: LampColor = C.mint;
	if (k === 'unread') led = C.crimson;
	if (k === 'error') led = 'off';
	if (k === 'attention') led = C.gold;
	if (k === 'live') led = Math.cos(Math.PI * 2 * ph) > 0 ? C.crimson : '#7A1A2A';
	if (k === 'saving') led = Math.sin(Math.PI * 2 * ph * 2) > 0 ? C.mint : C.ledOff;
	if (off) led = 'off';
	const b = BASES[base];
	let body: string;
	const isHome = !section || section === 'home';
	const tone: KeyTone | null = off
		? { hairTop: '#59615B', hairBot: '#2A2F2C', faceTop: '#2A2E2B', faceBot: '#181B19' }
		: null;
	if (isHome) {
		body = b.draw(uid, led);
		if (off) body = body.replace(/url\(#[a-z0-9]+m\)/, '#5A625C');
	} else {
		const g = G[section];
		const col = off ? '#5F6862' : (g.col as string);
		const showLamp = ['unread', 'attention', 'saving', 'live'].includes(k);
		body = key(uid, tone || {}) + (g.d as (c: string) => string)(col) + (showLamp ? lamp(25, 25, 3.4, led, false) : '');
	}
	let over = '';
	const RIM =
		'M16,1.7H24A6.3,6.3 0 0 1 30.3,8V24A6.3,6.3 0 0 1 24,30.3H8A6.3,6.3 0 0 1 1.7,24V8A6.3,6.3 0 0 1 8,1.7Z';
	if (k === 'progress')
		over = `<path d="${RIM}" fill="none" stroke="${C.mint}" stroke-width="1.8" pathLength="100" stroke-dasharray="${f((status.p as number) * 100)} 100"/>`;
	if (k === 'live')
		over = `<path d="${RIM}" fill="none" stroke="${C.crimson}" stroke-opacity="${f(0.35 + 0.65 * Math.abs(Math.cos(Math.PI * ph)))}" stroke-width="1.8"/>`;
	if (k === 'done') over = `<path d="${RIM}" fill="none" stroke="${C.mint}" stroke-width="1.8"/>`;
	if (k === 'error')
		over = `<path d="M24,15.5L32,30.5H16Z" fill="${C.tray}"/><path d="M24,17.6L30.4,29.2H17.6Z" fill="#FFB020"/><path d="M24,21.2V25.4M24,26.8V28.2" stroke="#1A1200" stroke-width="2"/>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}${over}</svg>`;
}

/** The three home-screen icons a device asks for. */
export type AppIconKind = 'ios' | 'android' | 'maskable';

/**
 * Home-screen icons. iOS paints any transparent pixel of an apple-touch-icon
 * black, so the iOS icon is the same machined key filling the whole tile: its
 * lit hairline and face drawn to iOS's own corner radius (22.37% of the side),
 * the corners filled with face, so it keeps the key's bevel and iOS never
 * paints black. Android `any` is the key on transparency. Maskable is the face
 * edge to edge with the gear inside the 80% safe circle, so the launcher's
 * mask cuts face, never a frame.
 */
export function appIcon(base: TabIconBase, kind: AppIconKind): string {
	const ft = C.faceTop,
		fb = C.faceBot;
	if (kind === 'android') return icon(base, null, null, 'an');
	if (kind === 'ios') {
		const drawn = BASES[base]
			.draw('io', C.mint)
			.replace(/<path d="M8,0[^>]*>/, '')
			.replace(/<path d="M8,1H[^"]*"/, `<path d="${rr(0, 0, 32, 32, 7.16)}"`)
			.replace(/<path d="M8,2.4H[^"]*"/, `<path d="${rr(1.6, 1.6, 28.8, 28.8, 5.8)}"`);
		return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${fb}"/>${drawn}</svg>`;
	}
	const inner = BASES[base].draw('ap', C.mint).replace(/<path d="M8,0[^>]*>|<path d="M8,1[^>]*>|<path d="M8,2.4[^>]*>/g, '');
	const scale = kind === 'maskable' ? 0.72 : 0.9,
		o = 16 * (1 - scale);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="bf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ft}"/><stop offset="1" stop-color="${fb}"/></linearGradient></defs><rect width="32" height="32" fill="url(#bf)"/><g transform="translate(${o} ${o}) scale(${scale})">${inner}</g></svg>`;
}

/** An SVG as a `data:` URL, the shape an icon link's `href` takes. */
export const url = (s: string): string => 'data:image/svg+xml,' + encodeURIComponent(s);
