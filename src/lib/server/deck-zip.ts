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
 * WHAT IT DELIBERATELY DOES NOT DO. No encryption (rejected by name), no
 * Zip64 (rejected by name rather than mis-parsed -- see readZipEntries), no
 * multi-disk archives, no symlink or permission handling. A Claude Design
 * "Project HTML" export is a few dozen small files; anything that needs more
 * than this is not one, and saying so is better than guessing.
 *
 * HIDDEN FILES ARE ORDINARY FILES HERE. Nothing in this module skips a name
 * for starting with a dot. `.image-slots.state.json` is load-bearing -- it
 * carries every image's author-set crop and pan -- and a reader that quietly
 * filtered dotfiles would destroy that framing with no error anywhere. The
 * only names dropped are DIRECTORY entries (a trailing slash), which carry no
 * bytes.
 */

import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
	/** The name exactly as stored in the archive, before any normalization. */
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

function u16(b: Uint8Array, o: number): number {
	return b[o] | (b[o + 1] << 8);
}

function u32(b: Uint8Array, o: number): number {
	// >>> 0 so a high bit does not come back negative.
	return ((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0);
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
 * Reads every FILE entry out of a zip.
 *
 * The central directory is the authority on what the archive contains, but the
 * LOCAL header is what says where an entry's bytes begin -- its `extra` field
 * can differ in length from the central one, so the data offset has to be read
 * there. Getting that wrong reads a few bytes of padding as compressed data,
 * which fails loudly rather than silently, but only ever by luck; do not
 * "simplify" it back to the central header's lengths.
 */
export function readZipEntries(buf: Uint8Array, limits: ZipLimits): ZipEntry[] {
	if (buf.length < 22) {
		throw new ZipError('That file is too small to be a zip archive.');
	}

	// Walk back from the end looking for the EOCD signature. Bounded by the
	// maximum comment length, so a non-zip does not cost a full scan.
	const from = Math.max(0, buf.length - MAX_COMMENT - 22);
	let eocd = -1;
	for (let i = buf.length - 22; i >= from; i--) {
		if (u32(buf, i) === SIG_EOCD) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) {
		throw new ZipError('That file is not a zip archive (no end-of-central-directory record).');
	}

	const entryCount = u16(buf, eocd + 10);
	const cdSize = u32(buf, eocd + 12);
	const cdOffset = u32(buf, eocd + 16);

	// Zip64 uses these sentinels in the 32-bit fields and puts the real values
	// in a separate record. Rejecting by name beats parsing the sentinel as a
	// real offset and failing somewhere confusing 200 lines later.
	if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
		throw new ZipError(
			'That zip uses the Zip64 format, which deck upload does not read. Re-export or re-compress it as a standard zip.'
		);
	}
	if (eocd >= 20 && u32(buf, eocd - 20) === SIG_ZIP64_EOCD_LOCATOR) {
		throw new ZipError(
			'That zip uses the Zip64 format, which deck upload does not read. Re-export or re-compress it as a standard zip.'
		);
	}
	if (entryCount > limits.maxEntries) {
		throw new ZipError(
			`That zip contains ${entryCount} entries; a deck may contain at most ${limits.maxEntries}.`
		);
	}
	if (cdOffset + cdSize > buf.length) {
		throw new ZipError('That zip is truncated or corrupt (its central directory runs past the end).');
	}

	const entries: ZipEntry[] = [];
	let total = 0;
	let p = cdOffset;

	for (let i = 0; i < entryCount; i++) {
		if (p + 46 > buf.length || u32(buf, p) !== SIG_CENTRAL) {
			throw new ZipError('That zip is corrupt (bad central directory entry).');
		}
		const flags = u16(buf, p + 8);
		const method = u16(buf, p + 10);
		const compSize = u32(buf, p + 20);
		const uncompSize = u32(buf, p + 24);
		const nameLen = u16(buf, p + 28);
		const extraLen = u16(buf, p + 30);
		const commentLen = u16(buf, p + 32);
		const localOffset = u32(buf, p + 42);
		const name = NAME_DECODER.decode(buf.subarray(p + 46, p + 46 + nameLen));
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

		// The local header repeats the name and carries its OWN extra field,
		// which is what actually locates the data (see the doc comment).
		if (localOffset + 30 > buf.length || u32(buf, localOffset) !== SIG_LOCAL) {
			throw new ZipError(`That zip is corrupt (bad local header for "${name}").`);
		}
		const localNameLen = u16(buf, localOffset + 26);
		const localExtraLen = u16(buf, localOffset + 28);
		const dataStart = localOffset + 30 + localNameLen + localExtraLen;
		if (dataStart + compSize > buf.length) {
			throw new ZipError(`That zip is truncated (the data for "${name}" runs past the end).`);
		}
		const raw = buf.subarray(dataStart, dataStart + compSize);

		let bytes: Uint8Array;
		if (method === 0) {
			bytes = new Uint8Array(raw); // stored, copied out of the parent buffer
		} else if (method === 8) {
			try {
				const out = inflateRawSync(raw);
				bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
			} catch (e) {
				throw new ZipError(`Could not decompress "${name}": ${(e as Error).message}`);
			}
		} else {
			throw new ZipError(
				`"${name}" uses compression method ${method}, which deck upload does not read (only stored and deflate).`
			);
		}

		entries.push({ name, bytes });
	}

	if (!entries.length) {
		throw new ZipError('That zip contains no files.');
	}
	return entries;
}
