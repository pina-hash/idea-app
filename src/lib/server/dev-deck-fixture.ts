/**
 * A REAL deck export, built at dev time, for /dev/classroom-deck.
 *
 * The fixture is the actual Claude Design deck committed at static/fsp/day2 --
 * its entry HTML, its `_ds/` design-system tree, its runtime .js files and its
 * images -- zipped in memory and pushed through the SHIPPING unpacker
 * (planDeckFromZip). So the harness exercises the same code an upload does,
 * over the same file shapes, with no Drive, no Supabase and no session.
 *
 * THE ONE THING IT ADDS is a real `.image-slots.state.json`. The committed copy
 * is a stub `{}` (the real sidecar embeds ~20 base64 photos and is too large to
 * pull through the tooling that synced it), which means the committed deck has
 * nothing to frame. The fixture writes one with genuine {u, s, x, y} values for
 * real slot ids read out of that deck, because the regression this whole
 * feature has to survive -- an image rendering UNCROPPED, which looks plausible
 * rather than broken -- is invisible without framing to lose.
 *
 * Dev-only: every caller is behind a `dev` guard that 404s in production.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planDeckFromZip, type DeckPlan } from './classroom-decks';

const DECK_DIR = fileURLToPath(new URL('../../../static/fsp/day2', import.meta.url));

/**
 * Framing a browser can be MEASURED against. image-slot applies these as inline
 * percentages on the inner <img>: left = (50 + x)%, top = (50 + y)%, and the
 * width/height as base-cover x s. So `x: -12` must render `left: 38%` -- and
 * with the state file missing, the slot shows its placeholder and no <img> at
 * all. Those two readings are the whole point of the fixture.
 */
const FRAMED_SLOTS: Record<string, { s: number; x: number; y: number }> = {
	'frc-arena': { s: 2.4, x: -12, y: 7 },
	'frc-robot-action': { s: 1.6, x: 18, y: -9 },
	'robot-2026': { s: 1.25, x: -5, y: 4 }
};

/**
 * A distinguishable test image as a data URL. An SVG carries its own intrinsic
 * size (so image-slot's geometry maths has real naturalWidth/Height to work
 * from) and draws a grid with corner markers, which makes a crop visible to the
 * eye as well as to a measurement.
 */
function testImage(label: string, hue: number): string {
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">` +
		`<rect width="1200" height="800" fill="hsl(${hue} 45% 22%)"/>` +
		`<g stroke="hsl(${hue} 70% 55%)" stroke-width="3" fill="none">` +
		[...Array(11)].map((_, i) => `<path d="M${i * 120} 0V800"/>`).join('') +
		[...Array(8)].map((_, i) => `<path d="M0 ${i * 114}H1200"/>`).join('') +
		`</g>` +
		`<circle cx="60" cy="60" r="42" fill="#ff3355"/>` +
		`<circle cx="1140" cy="740" r="42" fill="#00ff41"/>` +
		`<text x="600" y="420" font-family="monospace" font-size="86" fill="#fff" text-anchor="middle">${label}</text>` +
		`</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function stateFileJson(): string {
	const slots: Record<string, { u: string; s: number; x: number; y: number }> = {};
	let hue = 140;
	for (const [id, view] of Object.entries(FRAMED_SLOTS)) {
		slots[id] = { u: testImage(id, hue), ...view };
		hue += 70;
	}
	return JSON.stringify(slots);
}

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else out.push(full);
	}
	return out;
}

/**
 * Builds a zip in memory. STORED entries only (method 0) -- the shipping reader
 * supports them, and skipping compression keeps the fixture to arithmetic. CRC
 * is left zero because nothing in the reader verifies it.
 */
function makeZip(entries: { name: string; bytes: Uint8Array }[]): Uint8Array {
	const enc = new TextEncoder();
	const local: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = enc.encode(entry.name);
		const lh = new Uint8Array(30 + name.length + entry.bytes.length);
		const lv = new DataView(lh.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(4, 20, true);
		lv.setUint16(6, 0x0800, true);
		lv.setUint16(8, 0, true);
		lv.setUint32(18, entry.bytes.length, true);
		lv.setUint32(22, entry.bytes.length, true);
		lv.setUint16(26, name.length, true);
		lh.set(name, 30);
		lh.set(entry.bytes, 30 + name.length);
		local.push(lh);

		const ch = new Uint8Array(46 + name.length);
		const cv = new DataView(ch.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(4, 20, true);
		cv.setUint16(6, 20, true);
		cv.setUint16(8, 0x0800, true);
		cv.setUint32(20, entry.bytes.length, true);
		cv.setUint32(24, entry.bytes.length, true);
		cv.setUint16(28, name.length, true);
		cv.setUint32(42, offset, true);
		ch.set(name, 46);
		central.push(ch);
		offset += lh.length;
	}

	const cdSize = central.reduce((n, c) => n + c.length, 0);
	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, entries.length, true);
	ev.setUint16(10, entries.length, true);
	ev.setUint32(12, cdSize, true);
	ev.setUint32(16, offset, true);

	const out = new Uint8Array(offset + cdSize + 22);
	let p = 0;
	for (const b of [...local, ...central, eocd]) {
		out.set(b, p);
		p += b.length;
	}
	return out;
}

export interface FixtureOptions {
	/** Withhold `.image-slots.state.json`, i.e. reproduce the regression. */
	withoutStateFile?: boolean;
	/** Wrap everything in a folder, the way a zipped export really arrives. */
	root?: string;
	/** Add a second root-level page so entry detection has to ask. */
	ambiguous?: boolean;
	/** Add an entry that tries to climb out of the deck root. */
	traversal?: boolean;
}

export function buildFixtureZip(opts: FixtureOptions = {}): Uint8Array {
	const root = opts.root ?? 'IDEA FSP Day 2/';
	const entries: { name: string; bytes: Uint8Array }[] = [];

	for (const full of walk(DECK_DIR)) {
		const rel = relative(DECK_DIR, full).split(sep).join('/');
		// The committed stub sidecar is replaced (or dropped) below.
		if (rel === '.image-slots.state.json') continue;
		entries.push({ name: root + rel, bytes: new Uint8Array(readFileSync(full)) });
	}

	if (!opts.withoutStateFile) {
		entries.push({
			name: `${root}.image-slots.state.json`,
			bytes: new TextEncoder().encode(stateFileJson())
		});
	}
	// A real export ships a preview image; the committed copy does not, so the
	// fixture adds one to exercise the thumbnail path.
	entries.push({
		name: `${root}.thumbnail`,
		bytes: new Uint8Array(readFileSync(join(DECK_DIR, 'jarvis-ironman.jpg')))
	});
	// And the two alternate renderings an export really carries, so the
	// skip-the-duplicates path is exercised rather than assumed.
	entries.push({
		name: `${root}IDEA FSP Day 2 (standalone).html`,
		bytes: new TextEncoder().encode('<html><body>huge inlined copy</body></html>')
	});
	if (opts.ambiguous) {
		entries.push({
			name: `${root}handout.html`,
			bytes: new TextEncoder().encode('<html><body>a second real page</body></html>')
		});
	}
	if (opts.traversal) {
		entries.push({
			name: `${root}../escaped.html`,
			bytes: new TextEncoder().encode('<html>nope</html>')
		});
	}

	return makeZip(entries);
}

export interface StoredDeck {
	id: string;
	title: string;
	plan: DeckPlan;
	byPath: Map<string, { bytes: Uint8Array; mimeType: string }>;
}

/**
 * In-memory only, and per dev-server process. There is no database here: the
 * point of the harness is the UNPACKER, the VIEWER and the framing, all of
 * which are decided before a row is ever written.
 */
const decks = new Map<string, StoredDeck>();

export function ingestFixture(id: string, opts: FixtureOptions & { entryPath?: string | null } = {}) {
	const zip = buildFixtureZip(opts);
	const result = planDeckFromZip(zip, opts.entryPath ?? null);
	if (!result.ok) return result;

	decks.set(id, {
		id,
		title: 'IDEA FSP Day 2',
		plan: result.plan,
		byPath: new Map(result.plan.files.map((f) => [f.path, { bytes: f.bytes, mimeType: f.mimeType }]))
	});
	return result;
}

export function storedDeck(id: string): StoredDeck | undefined {
	return decks.get(id);
}
