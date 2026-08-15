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
 * THE UPLOAD ZIP GOES THROUGH THIS SERVER AGAIN, and 0102's direct-to-Drive
 * transport is RETIRED. That path handed the browser a Google resumable
 * upload session and had it write the zip straight to Drive, specifically to
 * get around Vercel's ~4.5 MB serverless request-body cap. It never survived
 * contact with reality: live testing found the browser could not reach
 * Google's chunked-upload endpoint at all in this environment, for a small
 * deck in one chunk as much as a large one across several. That is an
 * environmental failure, not a bug in the transport, and every other upload
 * in this app already goes through the server for the credentials' sake --
 * so a deck upload is capped at DECK_UPLOAD_MAX_ZIP_BYTES (see
 * $lib/classroom/deck, the client-safe half of this rule) and posted here as
 * an ordinary multipart form, exactly like a classroom attachment. A deck
 * whose kept files exceed that -- almost always because it carries a gif or a
 * video -- has to have that media pulled out and attached to the item
 * separately; there is no way around the platform's body cap from here.
 *
 * ONCE THE ZIP HAS ARRIVED, NOTHING ELSE CHANGED. It still lands in Drive's
 * OWN deck-uploads staging folder and hands off into the exact same staged
 * ingestion (0105) a direct-to-Drive upload used to feed: `begin` plans the
 * archive and opens a job, `files` stores as many planned files as fit in one
 * request's time budget (called until the plan is exhausted), `finish` hands
 * the manifest to classroom_replace_deck. That staging exists for a real
 * reason unrelated to how the zip arrived -- storing a deck's files back out
 * to Drive one at a time is minutes of round trips for a real export, well
 * past a single serverless request's DURATION limit -- and is untouched here.
 *
 * MEMORY IS BOUNDED BY THE LARGEST FILE, NOT THE ARCHIVE. `planDeck` reads
 * through a `ZipSource` (deck-zip.ts) rather than a buffer: the directory comes
 * out of the archive's tail, and each entry's bytes are read, uploaded and
 * released one at a time. Nothing ever holds the whole zip, let alone the zip
 * plus everything it unpacks to. DECK_LIMITS below still guards the UNPACKED
 * shape of the archive (per-file and total uncompressed bytes, entry count) --
 * a zip-bomb guard that stays relevant even at a few megabytes of INPUT, since
 * DEFLATE can still expand a small, highly repetitive stream a long way.
 */

import { ensureDriveSubfolder, readDriveFileRange } from './notebook-drive';
import { classroomFolderId } from './classroom-attachments';
import {
	memoryZipSource,
	readZipDirectory,
	readZipEntryBytes,
	ZipError,
	type ZipDirEntry,
	type ZipLimits,
	type ZipSource
} from './deck-zip';

/**
 * The upload-request size cap AND its message are ONE client-safe source of
 * truth (deckUploadSizeIssue in $lib/classroom/deck), re-exported here rather
 * than duplicated so the server's defense-in-depth check says exactly what
 * the client's up-front refusal already said.
 */
export { DECK_UPLOAD_MAX_ZIP_BYTES, deckUploadSizeIssue } from '$lib/classroom/deck';

/**
 * Guards against a hostile or accidental archive, and nothing else -- see the
 * header for why these are no longer about the transport.
 *
 * maxEntries is 500 to match the cap classroom_replace_deck enforces on the
 * manifest it is handed; the other three are sized for a deck with embedded
 * video, with the per-file cap doubling as the inflate bomb guard.
 */
export const DECK_LIMITS: ZipLimits & { maxZipBytes: number } = {
	maxZipBytes: 150 * 1024 * 1024,
	maxEntries: 500,
	maxFileBytes: 96 * 1024 * 1024,
	maxTotalBytes: 300 * 1024 * 1024
};

/** The content type the uploaded zip is stored under in Drive's staging folder. */
export const DECK_ZIP_MIME = 'application/zip';

/** Decks live in their own subfolder under the existing classroom parent. */
export const DECKS_FOLDER_NAME = 'IDEA Classroom decks';

export async function decksFolderId(): Promise<string> {
	return ensureDriveSubfolder(DECKS_FOLDER_NAME, await classroomFolderId());
}

/**
 * Where the uploaded zip LANDS, before it is unpacked: a staging folder of
 * its own, sibling to the unpacked decks.
 *
 * Its own folder because whoever browses the shared drive by eye sees
 * transient archives kept apart from the deck trees themselves, the same
 * doctrine that split classroom attachments off the notebook photos.
 * `classroom_deck_uploads` (0102) still authorizes and records one row per
 * upload here, even though the server writes the file itself now rather than
 * handing a browser a session to fill -- see the module header.
 */
export const DECK_UPLOADS_FOLDER_NAME = 'IDEA Classroom deck uploads';

export async function deckUploadsFolderId(): Promise<string> {
	return ensureDriveSubfolder(DECK_UPLOADS_FOLDER_NAME, await classroomFolderId());
}

/**
 * The name the staged zip is stored under, keyed to the upload authorization
 * row (0102's `classroom_deck_uploads.id`) that RPC minted for this caller
 * and this item -- readable, and unique per upload.
 */
export function deckUploadName(uploadId: string): string {
	return `deckupload_${uploadId}.zip`;
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
	/**
	 * WHERE the bytes are, not the bytes. A plan describes a whole deck; holding
	 * every file's contents in it is what the ZipSource read exists to avoid.
	 * Pass this to readDeckFile when it is that file's turn to be uploaded.
	 */
	entry: ZipDirEntry;
	/** Uncompressed size, from the archive's own directory. */
	size: number;
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
 * Reads a deck zip's INDEX and works out what to store.
 *
 * Reads bytes for exactly one file, the entry HTML, because the slide labels
 * come out of it; everything else is decided from names and sizes, and each
 * file's contents are read later, one at a time, by readDeckFile.
 *
 * ENTRY DETECTION IS ALLOWED TO GIVE UP. With exactly one plausible root HTML
 * it picks it; with several it refuses and hands back the candidates so the
 * uploader can choose, rather than guessing and silently hosting the wrong
 * rendering of the deck. `preferredEntry` is that choice coming back.
 */
export async function planDeck(
	source: ZipSource,
	preferredEntry?: string | null
): Promise<DeckPlanResult> {
	if (source.size > DECK_LIMITS.maxZipBytes) {
		return {
			ok: false,
			error: `Deck uploads are capped at ${Math.floor(DECK_LIMITS.maxZipBytes / 1024 / 1024)} MB.`
		};
	}

	let raw: ZipDirEntry[];
	try {
		raw = await readZipDirectory(source, DECK_LIMITS);
	} catch (e) {
		if (e instanceof ZipError) return { ok: false, error: e.message };
		return { ok: false, error: `Could not read that zip: ${(e as Error).message}` };
	}

	// Normalize + refuse escapes BEFORE anything is grouped or stripped.
	const normalized: { path: string; entry: ZipDirEntry }[] = [];
	for (const entry of raw) {
		const path = normalizeDeckPath(entry.name);
		if (path === null) {
			return {
				ok: false,
				error: `"${entry.name}" is not a safe path for a deck file. A deck may not contain absolute paths or refer outside its own folder.`
			};
		}
		normalized.push({ path, entry });
	}

	const stripped = stripCommonRoot(normalized.map((f) => f.path));
	const files = normalized.map((f, i) => ({ path: stripped[i], entry: f.entry }));

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

	// The ONE file this function reads: the entry page carries the slide labels.
	let entryBytes: Uint8Array;
	try {
		entryBytes = await readZipEntryBytes(
			source,
			files.find((f) => f.path === entryPath)!.entry,
			DECK_LIMITS
		);
	} catch (e) {
		if (e instanceof ZipError) return { ok: false, error: e.message };
		return { ok: false, error: `Could not read that zip: ${(e as Error).message}` };
	}
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
		entry: f.entry,
		size: f.entry.uncompressedSize
	}));

	return {
		ok: true,
		plan: {
			entryPath,
			thumbnailPath,
			hasStateFile,
			slides,
			files: planned,
			totalBytes: planned.reduce((n, f) => n + f.size, 0),
			warnings,
			entryCandidates: candidates
		}
	};
}

/**
 * One planned file's bytes and the content type they will be stored under.
 *
 * Called when it is that file's turn -- the caller uploads it and lets the
 * bytes go, so the whole deck is never resident at once. The MIME is decided
 * HERE rather than in the plan because a file with no usable extension
 * (`.thumbnail`) needs a look at its first bytes to be typed at all.
 */
export async function readDeckFile(
	source: ZipSource,
	file: DeckFilePlan
): Promise<{ bytes: Uint8Array; mimeType: string }> {
	const bytes = await readZipEntryBytes(source, file.entry, DECK_LIMITS);
	return { bytes, mimeType: deckFileMime(file.path, bytes) };
}

/** The in-memory form, for callers that genuinely hold the whole archive. */
export function planDeckFromZip(
	zipBytes: Uint8Array,
	preferredEntry?: string | null
): Promise<DeckPlanResult> {
	return planDeck(memoryZipSource(zipBytes), preferredEntry);
}

/**
 * At or below this, the staged zip is pulled down ONCE and read from memory;
 * above it, every read is a ranged request against Drive.
 *
 * The hybrid is deliberate and is about round trips, not correctness. Ranged
 * reading costs roughly two requests per file, which on an ordinary ~30-file
 * deck is 60 round trips to Google to save memory that was never at risk. A
 * typical export is well under this line and takes the single-download path; a
 * deck carrying video is over it and pays the round trips to keep peak memory
 * at one file rather than the whole archive.
 */
const ZIP_IN_MEMORY_MAX = 32 * 1024 * 1024;

/**
 * Reads the staged upload out of Drive: whole, or by range, per the note above.
 * `size` is Drive's own reported size, so the choice is made before a byte
 * moves.
 */
export async function driveZipSource(fileId: string, size: number): Promise<ZipSource> {
	if (size <= ZIP_IN_MEMORY_MAX) {
		return memoryZipSource(await readDriveFileRange(fileId, 0, Math.max(0, size - 1)));
	}
	return {
		size,
		async read(offset: number, length: number) {
			const start = Math.max(0, Math.min(offset, size));
			const end = Math.min(start + length, size) - 1;
			if (end < start) return new Uint8Array(0);
			return readDriveFileRange(fileId, start, end);
		}
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

/**
 * The Drive name one planned file is stored under during a STAGED ingest
 * (0105), prefixed with its position in the plan.
 *
 * THE PREFIX IS WHAT MAKES RESUMPTION EXACT. A staged ingest is several
 * requests, and one killed between storing a file and recording it would leave
 * a stray the next attempt duplicates. Because the name is a pure function of
 * the plan, the next stage can list the folder once and ADOPT anything already
 * there instead of uploading it twice -- so a resumed deck ends up with exactly
 * the manifest and nothing beside it.
 *
 * The index (not just the path) is what guarantees uniqueness: deckDriveFilename
 * truncates at 240 characters, so two deeply nested paths sharing a long prefix
 * could otherwise collide and have one adopted as the other.
 */
export function deckStagedDriveFilename(index: number, path: string): string {
	return `${String(index).padStart(3, '0')}__${deckDriveFilename(path).slice(0, 200)}`;
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
