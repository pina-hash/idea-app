/**
 * A minimal, dependency-free ZIP reader ($lib/server -- SvelteKit refuses to
 * bundle any of this client-side).
 *
 * WHY NOT A LIBRARY. The only thing a deck zip needs is: walk the central
 * directory, and inflate each entry. Node ships the hard half already
 * (`zlib.inflateRawSync` IS the DEFLATE decoder), so the whole reader is the
 * header arithmetic below. The alternative was reaching for `fflate`, which is
 * present in node_modules only as somebody else's transitive dependency -- a
 * thing that can vanish in an unrelated upgrade and take deck ingestion with
 * it. The GREENLINE photo-corrector made the same call for the same reason.
 *
 * IT READS THROUGH A `ZipSource`, NOT A BUFFER, and that is the point of the
 * shape rather than an abstraction for its own sake. A zip's index lives in its
 * LAST few kilobytes and every entry's bytes sit at a known offset, so an
 * unpacker never needs the archive in memory at once: it needs the tail, then
 * one entry at a time. With the deck ceiling raised for real decks with video
 * (0102), holding a 150 MB archive AND everything it unpacks to beside it is
 * exactly the runaway-memory failure a serverless function cannot survive --
 * peak here is the largest SINGLE file instead. `memoryZipSource` is the
 * trivial source for bytes already in hand (the dev fixture, the test suite);
 * the ingest route reads a Drive file by range.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No encryption (rejected by name), no
 * Zip64 (rejected by name rather than mis-parsed -- see readZipDirectory), no
 * multi-disk archives, no symlink or permission handling. A Claude Design
 * "Project HTML" export is a few dozen files; anything that needs more than
 * this is not one, and saying so is better than guessing.
 *
 * HIDDEN FILES ARE ORDINARY FILES HERE. Nothing in this module skips a name
 * for starting with a dot. `.image-slots.state.json` is load-bearing -- it
 * carries every image's author-set crop and pan -- and a reader that quietly
 * filtered dotfiles would destroy that framing with no error anywhere. The
 * only names dropped are DIRECTORY entries (a trailing slash), which carry no
 * bytes.
 */

import { inflateRawSync } from 'node:zlib';

/**
 * Random access over an archive, however it is stored. `read` is inclusive of
 * `offset` and returns at most `length` bytes (fewer only at the end of the
 * source, which the callers below treat as a truncated archive).
 */
export interface ZipSource {
	size: number;
	read(offset: number, length: number): Promise<Uint8Array>;
}

/** One FILE entry, as the central directory describes it. No bytes yet. */
export interface ZipDirEntry {
	/** The name exactly as stored in the archive, before any normalization. */
	name: string;
	/** 0 = stored, 8 = deflate. Anything else is refused when read. */
	method: number;
	compressedSize: number;
	uncompressedSize: number;
	localHeaderOffset: number;
}

export interface ZipEntry {
	name: string;
	bytes: Uint8Array;
}

/** Signatures, little-endian, as they appear on disk. */
const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const SIG_ZIP64_EOCD_LOCATOR = 0x07064b50;

/** A zip's end-of-central-directory record sits within 64 KiB of the end. */
const MAX_COMMENT = 0xffff;

export interface ZipLimits {
	/** Reject the archive outright past this many entries. */
	maxEntries: number;
	/** Reject if any single entry inflates past this. */
	maxFileBytes: number;
	/** Reject once the running total of inflated bytes passes this (zip bomb). */
	maxTotalBytes: number;
}

export class ZipError extends Error {}

export function memoryZipSource(bytes: Uint8Array): ZipSource {
	return {
		size: bytes.length,
		async read(offset: number, length: number) {
			const start = Math.max(0, Math.min(offset, bytes.length));
			const end = Math.max(start, Math.min(offset + length, bytes.length));
			return bytes.subarray(start, end);
		}
	};
}

function u16(b: Uint8Array, o: number): number {
	return b[o] | (b[o + 1] << 8);
}

function u32(b: Uint8Array, o: number): number {
	// >>> 0 so a high bit does not come back negative.
	return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

/**
 * Entry names are UTF-8 when the general-purpose bit 11 is set, and CP437
 * otherwise. Decoding as UTF-8 either way is right for every name that is
 * plain ASCII (which is what a deck export produces) and for every modern
 * zipper; `fatal: false` means an odd legacy byte becomes a replacement
 * character rather than throwing, and such a name will simply fail the path
 * rule downstream.
 */
const NAME_DECODER = new TextDecoder('utf-8', { fatal: false });

/**
 * Reads the central directory -- every FILE entry's name, size and where its
 * bytes begin -- without touching the bytes themselves.
 *
 * Two reads: the archive's tail (to find the end-of-central-directory record)
 * and the directory itself, which is a few tens of kilobytes even for a full
 * 500-entry deck.
 */
export async function readZipDirectory(
	source: ZipSource,
	limits: ZipLimits
): Promise<ZipDirEntry[]> {
	if (source.size < 22) {
		throw new ZipError('That file is too small to be a zip archive.');
	}

	// The EOCD is within 64 KiB + its own 22 bytes of the end; the extra 4 lets
	// the Zip64 locator check below read the word in front of it.
	const tailLen = Math.min(source.size, MAX_COMMENT + 22 + 20);
	const tailStart = source.size - tailLen;
	const tail = await source.read(tailStart, tailLen);
	if (tail.length < Math.min(22, tailLen)) {
		throw new ZipError('That zip is truncated (its end-of-central-directory record is missing).');
	}

	let eocd = -1;
	for (let i = tail.length - 22; i >= 0; i--) {
		if (u32(tail, i) === SIG_EOCD) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) {
		throw new ZipError('That file is not a zip archive (no end-of-central-directory record).');
	}

	const entryCount = u16(tail, eocd + 10);
	const cdSize = u32(tail, eocd + 12);
	const cdOffset = u32(tail, eocd + 16);

	// Zip64 uses these sentinels in the 32-bit fields and puts the real values
	// in a separate record. Rejecting by name beats parsing the sentinel as a
	// real offset and failing somewhere confusing 200 lines later.
	if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
		throw new ZipError(
			'That zip uses the Zip64 format, which deck upload does not read. Re-export or re-compress it as a standard zip.'
		);
	}
	if (eocd >= 20 && u32(tail, eocd - 20) === SIG_ZIP64_EOCD_LOCATOR) {
		throw new ZipError(
			'That zip uses the Zip64 format, which deck upload does not read. Re-export or re-compress it as a standard zip.'
		);
	}
	if (entryCount > limits.maxEntries) {
		throw new ZipError(
			`That zip contains ${entryCount} entries; a deck may contain at most ${limits.maxEntries}.`
		);
	}
	if (cdOffset + cdSize > source.size) {
		throw new ZipError('That zip is truncated or corrupt (its central directory runs past the end).');
	}

	const cd = await source.read(cdOffset, cdSize);
	if (cd.length < cdSize) {
		throw new ZipError('That zip is truncated (its central directory is incomplete).');
	}

	const entries: ZipDirEntry[] = [];
	let total = 0;
	let p = 0;

	for (let i = 0; i < entryCount; i++) {
		if (p + 46 > cd.length || u32(cd, p) !== SIG_CENTRAL) {
			throw new ZipError('That zip is corrupt (bad central directory entry).');
		}
		const flags = u16(cd, p + 8);
		const method = u16(cd, p + 10);
		const compSize = u32(cd, p + 20);
		const uncompSize = u32(cd, p + 24);
		const nameLen = u16(cd, p + 28);
		const extraLen = u16(cd, p + 30);
		const commentLen = u16(cd, p + 32);
		const localOffset = u32(cd, p + 42);
		const name = NAME_DECODER.decode(cd.subarray(p + 46, p + 46 + nameLen));
		p += 46 + nameLen + extraLen + commentLen;

		// Bit 0: the entry is encrypted. There is no password to give it.
		if (flags & 0x1) {
			throw new ZipError(`"${name}" is encrypted; deck upload cannot read a password-protected zip.`);
		}

		// A directory entry carries no bytes. Skipping these is the ONLY name
		// filter in this reader -- see the module header about dotfiles.
		if (name.endsWith('/')) continue;

		if (uncompSize > limits.maxFileBytes) {
			throw new ZipError(
				`"${name}" is larger than the ${Math.floor(limits.maxFileBytes / 1024 / 1024)} MB per-file limit.`
			);
		}
		total += uncompSize;
		if (total > limits.maxTotalBytes) {
			throw new ZipError(
				`That zip unpacks to more than the ${Math.floor(limits.maxTotalBytes / 1024 / 1024)} MB limit.`
			);
		}
		if (localOffset + 30 > source.size) {
			throw new ZipError(`That zip is corrupt (bad local header offset for "${name}").`);
		}

		entries.push({
			name,
			method,
			compressedSize: compSize,
			uncompressedSize: uncompSize,
			localHeaderOffset: localOffset
		});
	}

	if (!entries.length) {
		throw new ZipError('That zip contains no files.');
	}
	return entries;
}

/**
 * Reads and decompresses ONE entry.
 *
 * The central directory is the authority on what the archive contains, but the
 * LOCAL header is what says where an entry's bytes begin -- its `extra` field
 * can differ in length from the central one, so the data offset has to be read
 * there. Getting that wrong reads a few bytes of padding as compressed data,
 * which fails loudly rather than silently, but only ever by luck; do not
 * "simplify" it to the central header's lengths.
 */
export async function readZipEntryBytes(
	source: ZipSource,
	entry: ZipDirEntry,
	limits: ZipLimits
): Promise<Uint8Array> {
	if (entry.uncompressedSize > limits.maxFileBytes) {
		throw new ZipError(
			`"${entry.name}" is larger than the ${Math.floor(limits.maxFileBytes / 1024 / 1024)} MB per-file limit.`
		);
	}

	const head = await source.read(entry.localHeaderOffset, 30);
	if (head.length < 30 || u32(head, 0) !== SIG_LOCAL) {
		throw new ZipError(`That zip is corrupt (bad local header for "${entry.name}").`);
	}
	const dataStart = entry.localHeaderOffset + 30 + u16(head, 26) + u16(head, 28);
	if (dataStart + entry.compressedSize > source.size) {
		throw new ZipError(`That zip is truncated (the data for "${entry.name}" runs past the end).`);
	}

	const raw =
		entry.compressedSize === 0
			? new Uint8Array(0)
			: await source.read(dataStart, entry.compressedSize);
	if (raw.length < entry.compressedSize) {
		throw new ZipError(`That zip is truncated (the data for "${entry.name}" is incomplete).`);
	}

	if (entry.method === 0) {
		// Stored: copied out of whatever buffer the source handed back, so the
		// parent (a 64 KiB tail, or a whole in-memory archive) can be released.
		return new Uint8Array(raw);
	}
	if (entry.method === 8) {
		try {
			const out = inflateRawSync(raw, { maxOutputLength: limits.maxFileBytes });
			return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
		} catch (e) {
			throw new ZipError(`Could not decompress "${entry.name}": ${(e as Error).message}`);
		}
	}
	throw new ZipError(
		`"${entry.name}" uses compression method ${entry.method}, which deck upload does not read (only stored and deflate).`
	);
}

/**
 * Every entry, bytes and all, from an archive already in memory. Kept for the
 * callers that genuinely have the whole thing (the dev fixture and the test
 * suite); the ingest route reads one entry at a time instead.
 */
export async function readZipEntries(buf: Uint8Array, limits: ZipLimits): Promise<ZipEntry[]> {
	const source = memoryZipSource(buf);
	const dir = await readZipDirectory(source, limits);
	const out: ZipEntry[] = [];
	for (const entry of dir) {
		out.push({ name: entry.name, bytes: await readZipEntryBytes(source, entry, limits) });
	}
	return out;
}
