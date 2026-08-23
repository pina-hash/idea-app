/**
 * A ZIP reader with no dependencies, built on `DecompressionStream`.
 *
 * WHY NOT `$lib/server/deck-zip`: that reader is Node's (`node:zlib`,
 * `inflateRawSync`) and reads through a random-access `ZipSource` so a deck can
 * be pulled out of Drive without holding it in memory. Neither half travels.
 * The Foundry ingest function runs on Deno and the Foundry preflight runs in a
 * browser, and both hold the whole archive already -- it is capped at 25 MB, so
 * there is nothing to stream around. `DecompressionStream('deflate-raw')` is a
 * Web API both of those runtimes have and Node's reader cannot use.
 *
 * What is NOT duplicated is any RULE. The path rule is `$lib/bundle-path`, and
 * every cap, extension and message lives in `./preflight.ts`. This file only
 * turns bytes into entries.
 *
 * THE UNCOMPRESSED CAP IS ENFORCED HERE, WHILE INFLATING, and that is the whole
 * reason this reads the stream in chunks rather than calling a one-shot
 * helper. A zip declares its own uncompressed size in the central directory and
 * a hostile one simply lies, so the declared figure is worth an early refusal
 * and worth nothing as a guarantee. `ByteBudget` counts what actually comes out
 * of the decompressor and throws the moment the total crosses, which is what
 * makes a 25 MB archive that expands to gigabytes stop partway instead of
 * filling the bucket.
 */

/** Thrown when inflating would take the run past its uncompressed budget. */
export class ZipBudgetError extends Error {
	readonly limit: number;
	readonly path: string;
	constructor(path: string, limit: number) {
		super(`Unpacking passed the ${limit} byte limit at ${path}.`);
		this.name = 'ZipBudgetError';
		this.limit = limit;
		this.path = path;
	}
}

/** Thrown when the archive is not a zip we can read at all. */
export class ZipReadError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ZipReadError';
	}
}

/**
 * A running total across every entry in one archive, so the cap is on the
 * BUNDLE and not on any single file. Server-side concern: the browser
 * preflight reads text files only and never asks for a budget.
 */
export class ByteBudget {
	readonly limit: number;
	used = 0;
	constructor(limit: number) {
		this.limit = limit;
	}
	/** Throws the moment the total would cross, naming the file it died on. */
	add(bytes: number, path: string): void {
		this.used += bytes;
		if (this.used > this.limit) throw new ZipBudgetError(path, this.limit);
	}
	get remaining(): number {
		return Math.max(0, this.limit - this.used);
	}
}

export interface ZipRecord {
	/** The name exactly as the archive stores it, before any judging. */
	name: string;
	method: number;
	compressedSize: number;
	/** As DECLARED by the central directory. Advisory only -- see the header. */
	uncompressedSize: number;
	localOffset: number;
	/** A directory record rather than a file. */
	directory: boolean;
	/** A symlink, device, fifo -- anything that is not a plain file. */
	irregular: boolean;
	encrypted: boolean;
}

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const ZIP64_MARK = 0xffffffff;

/** Unix `S_IFMT` bits, used to tell a plain file from a symlink. */
const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

function u16(v: DataView, at: number): number {
	return v.getUint16(at, true);
}
function u32(v: DataView, at: number): number {
	return v.getUint32(at, true);
}

/**
 * Locates the end-of-central-directory record, which is the only fixed point in
 * a zip: everything else is found by walking from it. It sits at the very end
 * unless the archive carries a comment, so this scans backwards over the
 * largest comment the format allows.
 */
function findEocd(view: DataView, len: number): number | null {
	const earliest = Math.max(0, len - (0xffff + 22));
	for (let at = len - 22; at >= earliest; at--) {
		if (u32(view, at) === EOCD_SIG) return at;
	}
	return null;
}

/**
 * Reads the central directory into records. Returns null when the bytes are not
 * a zip we can read -- a caller turns that into the student-facing message,
 * because "not a readable zip" is one failure however it was reached.
 *
 * ZIP64 IS REFUSED RATHER THAN IMPLEMENTED. It only appears above 4 GB or
 * 65535 entries, and the caps here are 25 MB and 500 files, so a legitimate
 * upload can never need it. Refusing is a smaller surface than a second size
 * path that almost nothing exercises.
 */
export function readCentralDirectory(bytes: Uint8Array): ZipRecord[] | null {
	if (bytes.byteLength < 22) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const eocd = findEocd(view, bytes.byteLength);
	if (eocd === null) return null;

	const count = u16(view, eocd + 10);
	const cdSize = u32(view, eocd + 12);
	const cdOffset = u32(view, eocd + 16);
	if (count === 0xffff || cdSize === ZIP64_MARK || cdOffset === ZIP64_MARK) return null;
	if (cdOffset + cdSize > bytes.byteLength) return null;

	const decoder = new TextDecoder('utf-8');
	const out: ZipRecord[] = [];
	let at = cdOffset;
	for (let i = 0; i < count; i++) {
		if (at + 46 > bytes.byteLength) return null;
		if (u32(view, at) !== CD_SIG) return null;

		const versionMadeBy = u16(view, at + 4);
		// +6 is "version needed to extract"; the flags are at +8 and the method
		// at +10. Reading these one field early makes every deflated entry look
		// STORED, so the reader hands back the compressed bytes and calls them
		// the file -- which passes a structural check, passes an extension
		// check, and only shows up as content that scans clean because it is
		// not text at all.
		const flags = u16(view, at + 8);
		const method = u16(view, at + 10);
		const compressedSize = u32(view, at + 20);
		const uncompressedSize = u32(view, at + 24);
		const nameLen = u16(view, at + 28);
		const extraLen = u16(view, at + 30);
		const commentLen = u16(view, at + 32);
		const externalAttrs = u32(view, at + 38);
		const localOffset = u32(view, at + 42);

		if (compressedSize === ZIP64_MARK || uncompressedSize === ZIP64_MARK) return null;
		if (localOffset === ZIP64_MARK) return null;
		if (at + 46 + nameLen > bytes.byteLength) return null;

		const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));

		// The MS-DOS directory bit, plus the trailing-slash convention every
		// zipper writes. Either is enough to call it a directory.
		const dosDirectory = (externalAttrs & 0x10) !== 0;
		const directory = dosDirectory || name.endsWith('/');

		// The Unix mode only means anything when the archive says it came from a
		// Unix host; a Windows zipper leaves these bits as flags of its own, so
		// reading them there would invent symlinks that are not there.
		const hostOs = versionMadeBy >> 8;
		const unixMode = (externalAttrs >>> 16) & 0xffff;
		let irregular = false;
		if (hostOs === 3 && unixMode !== 0) {
			const fmt = unixMode & S_IFMT;
			if (fmt === S_IFLNK) irregular = true;
			else if (fmt !== S_IFREG && fmt !== S_IFDIR && fmt !== 0) irregular = true;
		}

		out.push({
			name,
			method,
			compressedSize,
			uncompressedSize,
			localOffset,
			directory,
			irregular,
			// Bit 0 of the general purpose flags.
			encrypted: (flags & 0x1) !== 0
		});

		at += 46 + nameLen + extraLen + commentLen;
	}
	return out;
}

/** Where an entry's compressed bytes actually begin. */
function dataStart(bytes: Uint8Array, view: DataView, record: ZipRecord): number | null {
	const at = record.localOffset;
	if (at + 30 > bytes.byteLength) return null;
	if (u32(view, at) !== LOCAL_SIG) return null;
	// The LOCAL header's own name and extra lengths, which are allowed to differ
	// from the central directory's and are the ones that count here.
	const nameLen = u16(view, at + 26);
	const extraLen = u16(view, at + 28);
	const start = at + 30 + nameLen + extraLen;
	return start <= bytes.byteLength ? start : null;
}

/**
 * Inflates one entry, counting output against `budget` as it goes.
 *
 * `budget` is optional because the browser preflight inflates a handful of text
 * files to scan them and has nothing to protect; the server always passes one.
 */
export async function inflateEntry(
	bytes: Uint8Array,
	record: ZipRecord,
	judgedPath: string,
	budget?: ByteBudget
): Promise<Uint8Array> {
	if (record.encrypted) throw new ZipReadError(`${judgedPath} is password protected.`);

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const start = dataStart(bytes, view, record);
	if (start === null) throw new ZipReadError(`${judgedPath} could not be located in the archive.`);
	const end = start + record.compressedSize;
	if (end > bytes.byteLength) throw new ZipReadError(`${judgedPath} is truncated.`);
	const raw = bytes.subarray(start, end);

	// Stored. Still counted, because a stored entry is just as capable of
	// filling the budget as a compressed one.
	if (record.method === 0) {
		budget?.add(raw.byteLength, judgedPath);
		return raw.slice();
	}
	if (record.method !== 8) {
		throw new ZipReadError(`${judgedPath} uses a compression method this reader does not support.`);
	}

	const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			const chunk = value as Uint8Array;
			// COUNTED PER CHUNK, before the chunk is kept. This is the line that
			// makes a zip bomb stop partway rather than after.
			budget?.add(chunk.byteLength, judgedPath);
			chunks.push(chunk);
			total += chunk.byteLength;
		}
	} catch (err) {
		if (err instanceof ZipBudgetError) {
			// Let go of what was already inflated before rethrowing, so an abort
			// does not sit on the memory it was aborting to avoid.
			chunks.length = 0;
			throw err;
		}
		throw new ZipReadError(`${judgedPath} could not be unpacked.`);
	} finally {
		reader.releaseLock();
	}

	const out = new Uint8Array(total);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.byteLength;
	}
	return out;
}
