/**
 * A ZIP WRITER, so the browser can hand the server the one input shape it
 * already knows how to read.
 *
 * WHY THIS EXISTS AT ALL. A student arrives with one of three things: a zip, a
 * folder, or a single HTML file. Only the first is what `foundry-ingest`
 * takes. Rather than teach the function two more input shapes -- and re-prove
 * every structural assertion against each of them -- the browser normalizes
 * the other two INTO a zip before anything is uploaded. The function keeps its
 * single input, its single reader, and every check already proven against it.
 *
 * IT IS THE MIRROR OF `./zip.ts`, AND THAT IS THE COMPATIBILITY REQUIREMENT.
 * The zips this produces are read back by `readCentralDirectory` and
 * `inflateEntry` -- first in the browser by the preflight, then on the server
 * by the identical code. So the fields that reader looks at are the fields
 * this writer has to get right: method at +10 and flags at +8 of the central
 * header, sizes at +20/+24, the name length at +28, and a local header whose
 * signature and name length agree. Anything the reader ignores is written in
 * its most boring legal form.
 *
 * `deflate-raw` VIA `CompressionStream`, matching the reader's
 * `DecompressionStream('deflate-raw')`. No dependency, and the two halves
 * cannot disagree about the format because they are the same platform codec.
 *
 * NO ZIP64, NO ENCRYPTION, NO DATA DESCRIPTORS. The cap is 25 MB and 500
 * files, which is nowhere near any 32-bit boundary, and sizes are known before
 * a header is written because everything is compressed into memory first. The
 * reader refuses Zip64 markers outright, so writing one would produce an
 * archive our own preflight rejects.
 */

/** One file going into the archive. Paths are already bundle-relative. */
export interface ZipEntry {
	path: string;
	bytes: Uint8Array;
}

const LOCAL_SIG = 0x04034b50;
const CD_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

/**
 * CRC-32, table-driven.
 *
 * The reader never checks it -- it inflates and counts bytes -- but a zip with
 * a wrong CRC is refused by every other tool a student might open it with, and
 * this archive is the thing they may well download and inspect when something
 * goes wrong. Writing it correctly costs a table.
 */
const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[i] = c >>> 0;
	}
	return t;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes as BlobPart])
		.stream()
		.pipeThrough(new CompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * UTF-8 names, with the flag that says so.
 *
 * Bit 11 of the general purpose flags is the language-encoding flag. The
 * reader decodes names as UTF-8 unconditionally, so this changes nothing for
 * us -- it is set because it is true, and because every other unzipper in the
 * world reads it.
 */
const UTF8_NAME_FLAG = 0x0800;

/**
 * Build a zip in memory.
 *
 * STORED, NOT DEFLATED, WHEN DEFLATING DOES NOT HELP. A compressed run larger
 * than its input is a real outcome for already-compressed bytes -- a PNG, a
 * woff2, a JPEG -- and writing it would make the archive bigger than the files
 * that went into it, against a 25 MB cap the student has to live under.
 */
export async function buildZip(entries: ZipEntry[]): Promise<Uint8Array> {
	const encoder = new TextEncoder();
	const local: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = encoder.encode(entry.path);
		const crc = crc32(entry.bytes);
		const deflated = await deflateRaw(entry.bytes);

		const useDeflate = deflated.byteLength < entry.bytes.byteLength;
		const method = useDeflate ? 8 : 0;
		const payload = useDeflate ? deflated : entry.bytes;

		const header = new Uint8Array(30 + name.byteLength);
		const hv = new DataView(header.buffer);
		hv.setUint32(0, LOCAL_SIG, true);
		hv.setUint16(4, 20, true); // version needed: 2.0, which is deflate
		hv.setUint16(6, UTF8_NAME_FLAG, true);
		hv.setUint16(8, method, true);
		hv.setUint16(10, 0, true); // mod time; a constant, see below
		hv.setUint16(12, 0x21, true); // mod date: 1980-01-01, the DOS epoch
		hv.setUint32(14, crc, true);
		hv.setUint32(18, payload.byteLength, true);
		hv.setUint32(22, entry.bytes.byteLength, true);
		hv.setUint16(26, name.byteLength, true);
		hv.setUint16(28, 0, true); // no extra field
		header.set(name, 30);

		const cd = new Uint8Array(46 + name.byteLength);
		const cv = new DataView(cd.buffer);
		cv.setUint32(0, CD_SIG, true);
		// Host OS 0 (MS-DOS/FAT), version 2.0. Deliberately NOT host OS 3
		// (Unix): the reader only reads the Unix mode bits when the archive
		// claims a Unix host, and claiming one would make it interpret the
		// external attributes we are about to leave at zero.
		cv.setUint16(4, 20, true);
		cv.setUint16(6, 20, true);
		cv.setUint16(8, UTF8_NAME_FLAG, true);
		cv.setUint16(10, method, true);
		cv.setUint16(12, 0, true);
		cv.setUint16(14, 0x21, true);
		cv.setUint32(16, crc, true);
		cv.setUint32(20, payload.byteLength, true);
		cv.setUint32(24, entry.bytes.byteLength, true);
		cv.setUint16(28, name.byteLength, true);
		cv.setUint16(30, 0, true); // extra
		cv.setUint16(32, 0, true); // comment
		cv.setUint16(34, 0, true); // disk number
		cv.setUint16(36, 0, true); // internal attributes
		cv.setUint32(38, 0, true); // external attributes: not a directory, no mode
		cv.setUint32(42, offset, true);
		cd.set(name, 46);

		local.push(header, payload);
		central.push(cd);
		offset += header.byteLength + payload.byteLength;
	}

	const cdSize = central.reduce((n, c) => n + c.byteLength, 0);
	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, EOCD_SIG, true);
	ev.setUint16(4, 0, true);
	ev.setUint16(6, 0, true);
	ev.setUint16(8, entries.length, true);
	ev.setUint16(10, entries.length, true);
	ev.setUint32(12, cdSize, true);
	ev.setUint32(16, offset, true);
	ev.setUint16(20, 0, true); // no archive comment

	const total = offset + cdSize + 22;
	const out = new Uint8Array(total);
	let at = 0;
	for (const part of [...local, ...central, eocd]) {
		out.set(part, at);
		at += part.byteLength;
	}
	return out;
}
