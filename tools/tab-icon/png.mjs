/**
 * A minimal PNG reader and writer for `tools/tab-icon/build.mjs`, on
 * `node:zlib` alone, because the build adds no image dependency (ledger 0396).
 *
 * NARROW ON PURPOSE. It reads what Chromium's screenshot encoder writes (8-bit,
 * non-interlaced, RGB or RGBA) and writes exactly two shapes: RGBA (colour type
 * 6) for an icon that keeps transparent pixels, and RGB (colour type 2) for an
 * icon that must carry no alpha channel at all -- the apple-touch-icon, which
 * iOS composites onto black, and the maskable icon, which a launcher crops.
 * Anything else is refused with a sentence rather than misread.
 *
 * Each row is filtered with whichever of the five PNG filters gives the
 * smallest sum of absolute bytes (the usual heuristic), then deflated at
 * level 9, so the committed files are small without an optimiser.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decode to `{ width, height, rgba }` (rgba is width*height*4 bytes). */
export function decodePng(buf) {
	if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
	let i = 8;
	let width = 0,
		height = 0,
		bitDepth = 0,
		colorType = 0,
		interlace = 0;
	const idat = [];
	while (i + 8 <= buf.length) {
		const len = buf.readUInt32BE(i);
		const type = buf.toString('latin1', i + 4, i + 8);
		const data = buf.subarray(i + 8, i + 8 + len);
		if (type === 'IHDR') {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			bitDepth = data[8];
			colorType = data[9];
			interlace = data[12];
		} else if (type === 'IDAT') idat.push(data);
		else if (type === 'IEND') break;
		i += 12 + len;
	}
	if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
		throw new Error(`unsupported PNG: depth ${bitDepth}, colour type ${colorType}, interlace ${interlace}`);
	}
	const bpp = colorType === 6 ? 4 : 3;
	const stride = width * bpp;
	const raw = inflateSync(Buffer.concat(idat));
	const rgba = Buffer.alloc(width * height * 4);
	let prev = Buffer.alloc(stride);
	let pos = 0;
	for (let y = 0; y < height; y++) {
		const filter = raw[pos++];
		const line = Buffer.from(raw.subarray(pos, pos + stride));
		pos += stride;
		for (let x = 0; x < stride; x++) {
			const a = x >= bpp ? line[x - bpp] : 0;
			const b = prev[x];
			const c = x >= bpp ? prev[x - bpp] : 0;
			let add = 0;
			if (filter === 1) add = a;
			else if (filter === 2) add = b;
			else if (filter === 3) add = (a + b) >> 1;
			else if (filter === 4) add = paeth(a, b, c);
			else if (filter !== 0) throw new Error(`bad filter ${filter}`);
			line[x] = (line[x] + add) & 0xff;
		}
		for (let x = 0; x < width; x++) {
			const o = (y * width + x) * 4;
			rgba[o] = line[x * bpp];
			rgba[o + 1] = line[x * bpp + 1];
			rgba[o + 2] = line[x * bpp + 2];
			rgba[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
		}
		prev = line;
	}
	return { width, height, rgba };
}

function paeth(a, b, c) {
	const p = a + b - c;
	const pa = Math.abs(p - a),
		pb = Math.abs(p - b),
		pc = Math.abs(p - c);
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(td) >>> 0);
	return Buffer.concat([len, td, crc]);
}

/**
 * Encode `{ width, height, rgba }`. `alpha: false` writes RGB and REFUSES an
 * image with any pixel that is not fully opaque, because dropping the channel
 * would turn a transparent corner into whatever colour sat under it.
 */
export function encodePng({ width, height, rgba }, { alpha }) {
	const bpp = alpha ? 4 : 3;
	const stride = width * bpp;
	const rows = [];
	for (let y = 0; y < height; y++) {
		const line = Buffer.alloc(stride);
		for (let x = 0; x < width; x++) {
			const o = (y * width + x) * 4;
			if (!alpha && rgba[o + 3] !== 255) {
				throw new Error(`pixel ${x},${y} has alpha ${rgba[o + 3]}; an RGB icon must be fully opaque`);
			}
			line[x * bpp] = rgba[o];
			line[x * bpp + 1] = rgba[o + 1];
			line[x * bpp + 2] = rgba[o + 2];
			if (alpha) line[x * bpp + 3] = rgba[o + 3];
		}
		rows.push(line);
	}
	const out = [];
	let prev = Buffer.alloc(stride);
	for (const line of rows) {
		let best = null;
		let bestScore = Infinity;
		for (let f = 0; f <= 4; f++) {
			const filtered = Buffer.alloc(stride + 1);
			filtered[0] = f;
			let score = 0;
			for (let x = 0; x < stride; x++) {
				const a = x >= bpp ? line[x - bpp] : 0;
				const b = prev[x];
				const c = x >= bpp ? prev[x - bpp] : 0;
				const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
				const v = (line[x] - pred) & 0xff;
				filtered[x + 1] = v;
				score += v < 128 ? v : 256 - v;
			}
			if (score < bestScore) {
				bestScore = score;
				best = filtered;
			}
		}
		out.push(best);
		prev = line;
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = alpha ? 6 : 2;
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;
	return Buffer.concat([
		SIG,
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(Buffer.concat(out), { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

/**
 * An ICO container holding PNG frames: a 6-byte header (reserved, type 1 for
 * an icon, the frame count) and one 16-byte directory entry per frame, then
 * the frames. A width or height of 256 is written as 0, the format's own rule.
 */
export function encodeIco(frames) {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(frames.length, 4);
	const entries = [];
	let offset = 6 + 16 * frames.length;
	for (const f of frames) {
		const e = Buffer.alloc(16);
		e[0] = f.width >= 256 ? 0 : f.width;
		e[1] = f.height >= 256 ? 0 : f.height;
		e[2] = 0; // palette size: none
		e[3] = 0; // reserved
		e.writeUInt16LE(1, 4); // colour planes
		e.writeUInt16LE(32, 6); // bits per pixel
		e.writeUInt32LE(f.png.length, 8);
		e.writeUInt32LE(offset, 12);
		offset += f.png.length;
		entries.push(e);
	}
	return Buffer.concat([header, ...entries, ...frames.map((f) => f.png)]);
}
