/**
 * Turning an uploaded Claude Design "Project HTML" export into something the
 * classroom can store and serve. Server-only ($lib/server) -- the caps and the
 * path rule here are enforcement, not advice.
 *
 * WHAT AN EXPORT ACTUALLY IS (audited against a real one, and against the copy
 * of a real deck committed at static/fsp/day2): a folder holding an entry
 * `.html` at its root, plus `_ds/` (the bound design system's CSS + JS bundle),
 * `uploads/` (gifs and other referenced media), `assets/` (logos), the runtime
 * files `support.js` / `image-slot.js` / `deck-stage.js`, and the HIDDEN
 * `.image-slots.state.json`.
 *
 * THREE RULES THE WHOLE MODULE EXISTS TO KEEP:
 *
 * 1. THE HIDDEN STATE FILE SURVIVES. `image-slot.js` fetches
 *    `.image-slots.state.json` at runtime, by that exact document-relative
 *    name, and applies the `{u, s, x, y}` it finds there as each image's
 *    scale and pan. Lose it -- skip it as a dotfile, rename it, drop it on
 *    the way to storage -- and every image renders at its uncropped default.
 *    That looks PLAUSIBLE rather than broken, so nothing raises an error and
 *    the author's manual framing is simply gone. Nothing in this module or in
 *    deck-zip.ts filters a name for a leading dot.
 *
 * 2. NO PATH IS EVER REWRITTEN. Every reference inside an export is already
 *    correct relative to the entry file, so the tree is stored and served as a
 *    UNIT under one per-deck prefix and the browser's own relative resolution
 *    does the rest. The only path surgery here is stripping the wrapper
 *    directory the zip was made from, which moves the whole tree together and
 *    so changes no reference between its files.
 *
 * 3. NOTHING ESCAPES THE DECK ROOT. `deckPathOk` is the first of three
 *    independent refusals of a traversing path (this module, then the CHECK
 *    constraint + write RPC in 0101, then the serving route's own resolution).
 *
 * SIZE, AND THE PLATFORM CEILING NOBODY HERE CAN RAISE. The caps below are
 * about memory and zip bombs. On Vercel the binding limit is lower and is not
 * ours: a serverless function's request body is capped at ~4.5 MB, so a deck
 * zip past that is refused by the platform before this code runs at all. That
 * is worth knowing before blaming the upload route -- the `(standalone).html`
 * variant an export ships is usually most of the weight, and it is skipped
 * here anyway, so re-zipping without it is the practical answer.
 */

import { ensureDriveSubfolder } from './notebook-drive';
import { classroomFolderId } from './classroom-attachments';
import { readZipEntries, ZipError, type ZipLimits } from './deck-zip';

/** Guards against a hostile or accidental archive; see the header on Vercel. */
export const DECK_LIMITS: ZipLimits & { maxZipBytes: number } = {
	maxZipBytes: 48 * 1024 * 1024,
	maxEntries: 500,
	maxFileBytes: 24 * 1024 * 1024,
	maxTotalBytes: 96 * 1024 * 1024
};

/** Decks live in their own subfolder under the existing classroom parent. */
export const DECKS_FOLDER_NAME = 'IDEA Classroom decks';

export async function decksFolderId(): Promise<string> {
	return ensureDriveSubfolder(DECKS_FOLDER_NAME, await classroomFolderId());
}

/**
 * MIRRORS `_classroom_deck_path_ok` in migration 0101 -- one rule, written in
 * two languages because both layers must be able to refuse independently.
 * CHANGE BOTH TOGETHER.
 *
 * A legal deck path is relative, forward-slashed, contained, and names a plain
 * file. A leading dot on a SEGMENT NAME is explicitly fine: `.thumbnail` and
 * `.image-slots.state.json` are both real, required files.
 */
export function deckPathOk(path: string): boolean {
	return (
		typeof path === 'string' &&
		path.length >= 1 &&
		path.length <= 400 &&
		path === path.trim() &&
		!path.startsWith('/') &&
		!path.includes('\\') &&
		!path.includes('\0') &&
		!/(^|\/)\.\.(\/|$)/.test(path) &&
		// A segment that IS "." -- never a name that merely starts with one.
		!/(^|\/)\.(\/|$)/.test(path) &&
		!path.includes('//') &&
		!path.endsWith('/') &&
		!path.includes(':')
	);
}

/**
 * The archive's own name for an entry, made comparable before it is judged.
 *
 * Backslashes become slashes FIRST, on purpose: some Windows zippers write
 * `a\b.png`, and a reader that passed those through would either break the
 * deck or -- worse -- let `..\..\x` through a rule that only looks for `../`.
 * Converting and then validating is strictly safer than either accepting or
 * rejecting a backslash outright.
 *
 * Returns null for anything that is not a legal deck path once normalized.
 */
export function normalizeDeckPath(name: string): string | null {
	let p = (name ?? '').replace(/\\/g, '/').trim();
	// A zip may store "./index.html"; that is the same file, not a "." segment.
	while (p.startsWith('./')) p = p.slice(2);
	p = p.replace(/\/{2,}/g, '/');
	if (!deckPathOk(p)) return null;
	return p;
}

/**
 * Strips the wrapper directory a zip was made from ("MyDeck/index.html" ->
 * "index.html"), so the deck root is the folder the entry HTML actually sits
 * in. Moves the whole tree together, so no reference between deck files
 * changes.
 *
 * Stops the moment ANY file sits at the root, which is what keeps it from
 * eating a real directory: an export always has its entry HTML at the deck
 * root, so the first shared segment that is not a wrapper ends the loop.
 */
export function stripCommonRoot(paths: string[]): string[] {
	let out = paths;
	for (let i = 0; i < 8; i++) {
		if (out.length < 2) break;
		const firsts = new Set<string>();
		let flat = false;
		for (const p of out) {
			const slash = p.indexOf('/');
			if (slash < 0) {
				flat = true;
				break;
			}
			firsts.add(p.slice(0, slash));
		}
		if (flat || firsts.size !== 1) break;
		const prefix = `${[...firsts][0]}/`;
		out = out.map((p) => p.slice(prefix.length));
	}
	return out;
}

/** The one hidden file that carries every image's crop and pan (see header). */
export const IMAGE_STATE_FILE = '.image-slots.state.json';
/** The export's own preview image, when it ships one. */
export const THUMBNAIL_FILE = '.thumbnail';

/**
 * Content types by extension. Extension only -- never anything the client
 * declared -- because this is what the proxy will echo back from the app's own
 * origin. `charset=utf-8` on the text types matters: an export is UTF-8 and a
 * browser left to guess renders its punctuation as mojibake.
 */
const MIME_BY_EXT: Record<string, string> = {
	html: 'text/html; charset=utf-8',
	htm: 'text/html; charset=utf-8',
	css: 'text/css; charset=utf-8',
	js: 'text/javascript; charset=utf-8',
	mjs: 'text/javascript; charset=utf-8',
	json: 'application/json; charset=utf-8',
	map: 'application/json; charset=utf-8',
	txt: 'text/plain; charset=utf-8',
	svg: 'image/svg+xml',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	ico: 'image/x-icon',
	bmp: 'image/bmp',
	mp4: 'video/mp4',
	webm: 'video/webm',
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	ogg: 'audio/ogg',
	woff: 'font/woff',
	woff2: 'font/woff2',
	ttf: 'font/ttf',
	otf: 'font/otf',
	eot: 'application/vnd.ms-fontobject',
	pdf: 'application/pdf',
	csv: 'text/csv; charset=utf-8',
	xml: 'application/xml; charset=utf-8',
	webmanifest: 'application/manifest+json'
};

/** Magic-byte sniff, used ONLY for a file with no usable extension. */
function sniffImage(bytes: Uint8Array): string | null {
	if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
		return 'image/png';
	}
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return 'image/jpeg';
	}
	if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
		return 'image/gif';
	}
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
		bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
	) {
		return 'image/webp';
	}
	return null;
}

/**
 * The stored content type for one deck file.
 *
 * `.thumbnail` is the case the sniff exists for: it is a real image with no
 * extension at all, and serving it as octet-stream would give the item card a
 * download link instead of a preview.
 */
export function deckFileMime(path: string, bytes: Uint8Array): string {
	const base = path.slice(path.lastIndexOf('/') + 1);
	// A leading dot on the WHOLE basename is not an extension separator, so
	// ".thumbnail" has no extension and ".image-slots.state.json" has "json".
	const dot = base.lastIndexOf('.');
	const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
	const known = MIME_BY_EXT[ext];
	if (known) return known;
	return sniffImage(bytes) ?? 'application/octet-stream';
}

export interface DeckSlide {
	index: number;
	label: string;
}

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	'#39': "'",
	nbsp: ' '
};

function decodeEntities(s: string): string {
	return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, name: string) => {
		const key = name.toLowerCase();
		if (ENTITIES[key]) return ENTITIES[key];
		if (key.startsWith('#x')) {
			const code = parseInt(key.slice(2), 16);
			return Number.isFinite(code) ? String.fromCodePoint(code) : m;
		}
		if (key.startsWith('#')) {
			const code = parseInt(key.slice(1), 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : m;
		}
		return m;
	});
}

function attrOf(tag: string, name: string): string | null {
	const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
	const m = re.exec(tag);
	if (!m) return null;
	return decodeEntities(m[2] ?? m[3] ?? '');
}

/**
 * The deck's slide list, read out of the entry HTML at INGEST so no surface
 * has to fetch and parse a megabyte of markup to draw an index.
 *
 * LABELS ONLY. `data-speaker-notes` sits on the same elements and is never
 * read here, never stored, and therefore cannot reach a student through
 * anything this app renders. (It remains inside the deck's own HTML, as the
 * author wrote it -- rewriting deck content to strip it would break rule 2 in
 * the header and is not something this feature does.)
 *
 * Keyed on a `<section>` carrying a `data-label`, rather than on the
 * `fsp-slide` class specifically: the label attribute IS the slide signal, and
 * a template that names its slide class differently still indexes correctly.
 */
export function extractSlides(html: string, cap = 200): DeckSlide[] {
	const slides: DeckSlide[] = [];
	// Attribute values may legitimately contain ">", so the tag matcher steps
	// over quoted runs rather than stopping at the first angle bracket.
	const re = /<section\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html)) !== null) {
		const label = attrOf(m[1], 'data-label');
		if (label === null) continue;
		slides.push({ index: slides.length, label: label.trim().slice(0, 120) });
		if (slides.length >= cap) break;
	}
	return slides;
}

export interface DeckFilePlan {
	path: string;
	bytes: Uint8Array;
	mimeType: string;
}

export interface DeckPlan {
	entryPath: string;
	thumbnailPath: string | null;
	hasStateFile: boolean;
	slides: DeckSlide[];
	files: DeckFilePlan[];
	totalBytes: number;
	/** Human-readable, non-blocking. The loudest one is a missing state file. */
	warnings: string[];
	/** Root-level HTML files that could have been the entry (>= 1). */
	entryCandidates: string[];
}

export type DeckPlanResult =
	| { ok: true; plan: DeckPlan }
	| { ok: false; error: string; candidates?: string[] };

/**
 * A root-level `.html` that is not one of the alternate renderings an export
 * ships beside the real deck.
 *
 * `Something (standalone).html` is the same deck inlined into one enormous
 * self-contained file, and `*.dc.html` is its template form; storing either
 * would mean tens of megabytes of duplicate content for a page nothing points
 * at. They are skipped as ENTRY CANDIDATES and, being duplicates, are dropped
 * from storage entirely.
 */
export function isAlternateRendering(path: string): boolean {
	const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
	return /\(standalone\)\.html?$/.test(base) || base.endsWith('.dc.html');
}

function isRootHtml(path: string): boolean {
	return !path.includes('/') && /\.html?$/i.test(path);
}

/**
 * Reads a deck zip and works out what to store.
 *
 * ENTRY DETECTION IS ALLOWED TO GIVE UP. With exactly one plausible root HTML
 * it picks it; with several it refuses and hands back the candidates so the
 * uploader can choose, rather than guessing and silently hosting the wrong
 * rendering of the deck. `preferredEntry` is that choice coming back.
 */
export function planDeckFromZip(
	zipBytes: Uint8Array,
	preferredEntry?: string | null
): DeckPlanResult {
	let raw;
	try {
		raw = readZipEntries(zipBytes, DECK_LIMITS);
	} catch (e) {
		if (e instanceof ZipError) return { ok: false, error: e.message };
		return { ok: false, error: `Could not read that zip: ${(e as Error).message}` };
	}

	// Normalize + refuse escapes BEFORE anything is grouped or stripped.
	const normalized: { path: string; bytes: Uint8Array }[] = [];
	for (const entry of raw) {
		const path = normalizeDeckPath(entry.name);
		if (path === null) {
			return {
				ok: false,
				error: `"${entry.name}" is not a safe path for a deck file. A deck may not contain absolute paths or refer outside its own folder.`
			};
		}
		normalized.push({ path, bytes: entry.bytes });
	}

	const stripped = stripCommonRoot(normalized.map((f) => f.path));
	const files = normalized.map((f, i) => ({ path: stripped[i], bytes: f.bytes }));

	// Stripping cannot introduce an illegal path, but it CAN reveal a
	// duplicate, and a duplicate would make the stored manifest ambiguous.
	const seen = new Set<string>();
	for (const f of files) {
		if (!deckPathOk(f.path)) {
			return { ok: false, error: `"${f.path}" is not a safe path for a deck file.` };
		}
		if (seen.has(f.path)) {
			return { ok: false, error: `That zip contains "${f.path}" more than once.` };
		}
		seen.add(f.path);
	}

	const candidates = files.map((f) => f.path).filter(isRootHtml).filter((p) => !isAlternateRendering(p));

	let entryPath: string;
	if (preferredEntry) {
		const wanted = normalizeDeckPath(preferredEntry);
		if (!wanted || !seen.has(wanted)) {
			return { ok: false, error: `"${preferredEntry}" is not a file in that zip.`, candidates };
		}
		if (!/\.html?$/i.test(wanted)) {
			return { ok: false, error: 'The entry file must be an HTML file.', candidates };
		}
		entryPath = wanted;
	} else if (candidates.length === 1) {
		entryPath = candidates[0];
	} else if (candidates.length === 0) {
		const alternates = files.map((f) => f.path).filter(isRootHtml);
		return {
			ok: false,
			error: alternates.length
				? 'That zip has no entry page -- only the standalone/template renderings of a deck. Export the project HTML rather than the standalone file.'
				: 'That zip has no HTML file at its top level, so there is nothing to open as a deck.'
		};
	} else {
		return {
			ok: false,
			error: 'That zip has more than one page that could be the deck. Choose which one to open.',
			candidates
		};
	}

	const warnings: string[] = [];
	const hasStateFile = seen.has(IMAGE_STATE_FILE);
	if (!hasStateFile) {
		warnings.push(
			`This deck has no ${IMAGE_STATE_FILE}, so any image the author cropped or panned by hand will show uncropped. Re-export the project (including hidden files) if the framing matters.`
		);
	}

	const thumbnailPath = seen.has(THUMBNAIL_FILE)
		? THUMBNAIL_FILE
		: (files.map((f) => f.path).find((p) => p.endsWith(`/${THUMBNAIL_FILE}`)) ?? null);

	const entryBytes = files.find((f) => f.path === entryPath)!.bytes;
	const slides = extractSlides(new TextDecoder('utf-8', { fatal: false }).decode(entryBytes));
	if (!slides.length) {
		warnings.push('No labelled slides were found in this deck, so it opens without a slide list.');
	}

	// Drop the alternate renderings: they are duplicates of the deck being
	// stored and are usually most of the archive's weight.
	const keep = files.filter((f) => f.path === entryPath || !isAlternateRendering(f.path));
	const dropped = files.length - keep.length;
	if (dropped > 0) {
		warnings.push(
			`Skipped ${dropped} duplicate rendering${dropped === 1 ? '' : 's'} of this deck (the standalone/template HTML).`
		);
	}

	const planned: DeckFilePlan[] = keep.map((f) => ({
		path: f.path,
		bytes: f.bytes,
		mimeType: deckFileMime(f.path, f.bytes)
	}));

	return {
		ok: true,
		plan: {
			entryPath,
			thumbnailPath,
			hasStateFile,
			slides,
			files: planned,
			totalBytes: planned.reduce((n, f) => n + f.bytes.length, 0),
			warnings,
			entryCandidates: candidates
		}
	};
}

export interface DeckZipField {
	bytes: Uint8Array;
	filename: string;
}

/**
 * Validates the "file" form field of a deck upload.
 *
 * The media type is checked LOOSELY on purpose. Browsers type a .zip as
 * application/zip, application/x-zip-compressed, or -- routinely -- nothing at
 * all, and `File.type` is REQUIRED to be empty when the platform has no
 * mapping (the notebook's HEIC lesson). Refusing on that string would reject
 * real uploads, and it would prove nothing anyway: the archive is PARSED a few
 * lines later, which is a far stronger check than any label.
 */
export async function readDeckZipForm(
	form: FormData
): Promise<DeckZipField | { error: string; status: number }> {
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) {
		return { error: 'Attach the deck zip as the "file" form field.', status: 400 };
	}
	if (file.size > DECK_LIMITS.maxZipBytes) {
		return {
			error: `Deck uploads are capped at ${Math.floor(DECK_LIMITS.maxZipBytes / 1024 / 1024)} MB.`,
			status: 413
		};
	}
	const name = (file.name ?? '').trim();
	const declared = file.type.trim().toLowerCase();
	const looksZip =
		/\.zip$/i.test(name) ||
		declared === 'application/zip' ||
		declared === 'application/x-zip-compressed' ||
		declared === 'multipart/x-zip' ||
		declared === '' ||
		declared === 'application/octet-stream';
	if (!looksZip) {
		return { error: 'A deck is uploaded as a .zip of its exported project folder.', status: 400 };
	}
	return {
		bytes: new Uint8Array(await file.arrayBuffer()),
		filename: name || 'deck.zip'
	};
}

/**
 * A Drive filename for one deck file. The folder is per deck and the RELATIVE
 * PATH is the identity the manifest resolves, so this is presentation for
 * whoever browses the shared drive by eye -- slashes become "__" because Drive
 * has no folders inside a file's name.
 */
export function deckDriveFilename(path: string): string {
	return path.replace(/\//g, '__').slice(0, 240) || 'deck-file';
}

/** The per-deck Drive subfolder name: readable, and unique per upload. */
export function deckFolderName(itemId: string, stamp = new Date()): string {
	const date = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Los_Angeles',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(stamp);
	return `deck_${date}_${itemId.slice(0, 8)}_${Math.random().toString(36).slice(2, 8)}`;
}
