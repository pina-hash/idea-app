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
import { planDeck, readDeckFile, type DeckPlan } from './classroom-decks';
import { memoryZipSource } from './deck-zip';

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
	/**
	 * Pad the archive with one big media file. The committed deck is ~3 MB;
	 * padding it PAST DECK_UPLOAD_MAX_ZIP_BYTES (4 MB) is what lets the
	 * harness demonstrate the real client-side size refusal against real
	 * bytes, rather than asserting the pure size-check function in
	 * isolation. It also still exercises real upload progress for anything
	 * under the cap.
	 */
	padBytes?: number;
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
	if (opts.padBytes && opts.padBytes > 0) {
		// Not zeros: the entries are STORED, so this is only about giving the
		// transfer real weight, but a recognisable pattern makes a truncated or
		// mis-ordered chunk visible if one ever survives to ingest.
		const pad = new Uint8Array(opts.padBytes);
		for (let i = 0; i < pad.length; i++) pad[i] = (i * 31 + (i >> 11)) & 0xff;
		entries.push({ name: `${root}uploads/large-media.bin`, bytes: pad });
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

// ---------------------------------------------------------------------------
// Staged ingestion (0105), mirrored for the harness.
//
// The zip arrives in ONE multipart POST now (the production shape is
// unchanged from here on: authorize + write-to-Drive + plan collapsed into a
// single request, then `files`/`finish`/`abort` unchanged) -- there is no
// separate upload-session step to emulate any more.
// ---------------------------------------------------------------------------

/**
 * The harness's stand-in for a `classroom_deck_ingest_jobs` row.
 *
 * It exists so /dev/classroom-deck drives the SAME four stages the real client
 * drives -- begin, files (repeatedly), finish -- rather than a single call that
 * would prove nothing about the shape that matters. `filesPerStage` is small on
 * purpose: the real server stops on a TIME budget, which a local in-memory
 * unpack would never reach, so the harness bounds by COUNT instead and the
 * progress bar has the same several-calls-to-finish behaviour to report.
 */
interface DevJob {
	id: string;
	deckId: string;
	zip: Uint8Array;
	plan: DeckPlan;
	filesDone: number;
	byPath: Map<string, { bytes: Uint8Array; mimeType: string }>;
	state: 'uploading' | 'done' | 'abandoned';
	stageOpen: boolean;
}

const jobs = new Map<string, DevJob>();
let jobSeq = 0;

export const DEV_FILES_PER_STAGE = 4;

export async function devIngestBegin(
	deckId: string,
	zip: Uint8Array,
	entryPath: string | null
): Promise<
	| { ok: true; jobId: string; total: number; warnings: string[]; entryPath: string }
	| { ok: false; error: string; candidates?: string[] }
> {
	const result = await planDeck(memoryZipSource(zip), entryPath);
	if (!result.ok) return { ok: false, error: result.error, candidates: result.candidates };
	const id = `dev-job-${++jobSeq}`;
	jobs.set(id, {
		id,
		deckId,
		zip,
		plan: result.plan,
		filesDone: 0,
		byPath: new Map(),
		state: 'uploading',
		stageOpen: false
	});
	return {
		ok: true,
		jobId: id,
		total: result.plan.files.length,
		warnings: result.plan.warnings,
		entryPath: result.plan.entryPath
	};
}

/**
 * Stores the next slice. `interrupt` reproduces a stage that stored files and
 * died before recording them -- the case resumption exists for -- by leaving
 * the stage OPEN and reporting no progress.
 */
export async function devIngestFiles(
	jobId: string,
	opts: { interrupt?: boolean } = {}
): Promise<{ ok: boolean; reason?: string; filesDone?: number; total?: number; complete?: boolean }> {
	const job = jobs.get(jobId);
	if (!job) return { ok: false, reason: 'not_found' };
	if (job.state !== 'uploading') return { ok: false, reason: job.state };

	const source = memoryZipSource(job.zip);
	const slice = job.plan.files.slice(job.filesDone, job.filesDone + DEV_FILES_PER_STAGE);
	for (const file of slice) {
		job.byPath.set(file.path, await readDeckFile(source, file));
	}
	if (opts.interrupt) {
		// The bytes are stored; nothing is recorded. Exactly what a killed
		// request leaves behind, and the next call has to cope with it.
		job.stageOpen = true;
		return { ok: false, reason: 'interrupted', filesDone: job.filesDone, total: job.plan.files.length };
	}
	job.filesDone += slice.length;
	job.stageOpen = false;
	return {
		ok: true,
		filesDone: job.filesDone,
		total: job.plan.files.length,
		complete: job.filesDone >= job.plan.files.length
	};
}

export function devIngestFinish(jobId: string): { ok: boolean; reason?: string; deck?: StoredDeck } {
	const job = jobs.get(jobId);
	if (!job) return { ok: false, reason: 'not_found' };
	if (job.state !== 'uploading') return { ok: false, reason: job.state };
	if (job.filesDone < job.plan.files.length) return { ok: false, reason: 'incomplete' };
	const deck: StoredDeck = {
		id: job.deckId,
		title: 'IDEA FSP Day 2',
		plan: job.plan,
		byPath: job.byPath
	};
	decks.set(job.deckId, deck);
	job.state = 'done';
	return { ok: true, deck };
}

export function devIngestAbort(jobId: string): void {
	const job = jobs.get(jobId);
	if (job && job.state === 'uploading') {
		job.state = 'abandoned';
		// Nothing partial survives: the harness's equivalent of deleting the
		// deck's Drive folder.
		job.byPath.clear();
	}
}

export async function ingestFixture(
	id: string,
	opts: FixtureOptions & { entryPath?: string | null } = {}
) {
	return ingestZip(id, buildFixtureZip(opts), opts.entryPath ?? null);
}

async function ingestZip(id: string, zip: Uint8Array, entryPath: string | null) {
	// The same two steps the real ingest route takes: plan from the archive's
	// index, then read each file's bytes when it is that file's turn.
	const source = memoryZipSource(zip);
	const result = await planDeck(source, entryPath);
	if (!result.ok) return result;

	const byPath = new Map<string, { bytes: Uint8Array; mimeType: string }>();
	for (const file of result.plan.files) {
		byPath.set(file.path, await readDeckFile(source, file));
	}

	decks.set(id, { id, title: 'IDEA FSP Day 2', plan: result.plan, byPath });
	return result;
}

export function storedDeck(id: string): StoredDeck | undefined {
	return decks.get(id);
}
