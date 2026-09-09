// tests/site-icons.test.ts
//
// The site's icon set, asserted from the bytes rather than from the filenames.
//
// WHY THIS IS A TEST. Every failure here is SILENT on the machine that causes
// it. A `<link rel="icon">` pointing at a file that is gone renders a blank tab
// and throws nothing; a manifest naming a missing icon installs a home-screen
// app with no picture on it and reports nothing to the page. And the two
// properties that decide whether an icon looks RIGHT are invisible to any file
// listing: a maskable icon must be fully opaque (Android crops it to the
// launcher's own shape and any transparency becomes a hole), an Apple touch
// icon must carry no alpha at all (iOS composites it onto BLACK, so a
// transparent corner reads as a black corner), and the two "any" icons must be
// transparent so the tile is the icon and not a square behind it.
//
// It reads the real files and hardcodes no byte count: the icons are
// regenerated from `tools/idea_icon_gen.py`, so a size pinned here would be a
// number somebody has to update rather than a property somebody has to keep.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STATIC = join(ROOT, 'static');

const staticPath = (href: string) => join(STATIC, href.replace(/^\//, ''));
const read = (href: string) => readFileSync(staticPath(href));

// ---- PNG ------------------------------------------------------------------

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type Png = {
	width: number;
	height: number;
	bitDepth: number;
	colorType: number;
	interlace: number;
	chunks: string[];
	idat: Buffer;
};

function readPng(buf: Buffer): Png {
	expect(buf.subarray(0, 8).equals(PNG_SIG)).toBe(true);
	const chunks: string[] = [];
	const idat: Buffer[] = [];
	let i = 8;
	while (i + 8 <= buf.length) {
		const len = buf.readUInt32BE(i);
		const type = buf.toString('latin1', i + 4, i + 8);
		chunks.push(type);
		if (type === 'IDAT') idat.push(buf.subarray(i + 8, i + 8 + len));
		i += 12 + len;
		if (type === 'IEND') break;
	}
	expect(chunks[0]).toBe('IHDR');
	expect(chunks).toContain('IEND');
	return {
		width: buf.readUInt32BE(16),
		height: buf.readUInt32BE(20),
		bitDepth: buf[24],
		colorType: buf[25],
		interlace: buf[28],
		chunks,
		idat: Buffer.concat(idat)
	};
}

/** Colour types 4 and 6 carry a per-pixel alpha sample; 0, 2 and 3 do not. */
const hasAlphaChannel = (png: Png) => png.colorType === 4 || png.colorType === 6;
/** A `tRNS` chunk makes an otherwise-opaque colour type carry transparency. */
const carriesTransparency = (png: Png) => hasAlphaChannel(png) || png.chunks.includes('tRNS');

/**
 * Every alpha sample in the image, unfiltered from the real IDAT stream.
 *
 * Deliberately narrow: 8-bit, non-interlaced, alpha-carrying colour types only,
 * which is what the generator emits and what every caller here asserts first.
 * A decoder that quietly handled more shapes would be a second PNG library to
 * keep correct, and a wrong one would answer "opaque" for an image it could not
 * actually read.
 */
function alphaSamples(png: Png): Uint8Array {
	expect(hasAlphaChannel(png)).toBe(true);
	expect(png.bitDepth).toBe(8);
	expect(png.interlace).toBe(0);

	const channels = png.colorType === 6 ? 4 : 2;
	const bpp = channels;
	const stride = png.width * bpp;
	const raw = inflateSync(png.idat);
	expect(raw.length).toBe((stride + 1) * png.height);

	const out = new Uint8Array(png.width * png.height);
	let prev = new Uint8Array(stride);
	let pos = 0;
	for (let y = 0; y < png.height; y++) {
		const filter = raw[pos++];
		const line = new Uint8Array(raw.subarray(pos, pos + stride));
		pos += stride;
		for (let x = 0; x < stride; x++) {
			const a = x >= bpp ? line[x - bpp] : 0;
			const b = prev[x];
			const c = x >= bpp ? prev[x - bpp] : 0;
			if (filter === 1) line[x] = (line[x] + a) & 0xff;
			else if (filter === 2) line[x] = (line[x] + b) & 0xff;
			else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 0xff;
			else if (filter === 4) {
				const p = a + b - c;
				const pa = Math.abs(p - a);
				const pb = Math.abs(p - b);
				const pc = Math.abs(p - c);
				const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
				line[x] = (line[x] + pred) & 0xff;
			} else expect(filter).toBe(0);
		}
		for (let x = 0; x < png.width; x++) out[y * png.width + x] = line[x * bpp + (bpp - 1)];
		prev = line;
	}
	return out;
}

// ---- ICO ------------------------------------------------------------------

type IcoFrame = { width: number; height: number; bpp: number; payload: Buffer };

function readIco(buf: Buffer): IcoFrame[] {
	expect(buf.readUInt16LE(0)).toBe(0); // reserved
	expect(buf.readUInt16LE(2)).toBe(1); // 1 = icon, 2 = cursor
	const count = buf.readUInt16LE(4);
	expect(count).toBeGreaterThan(0);
	const frames: IcoFrame[] = [];
	for (let i = 0; i < count; i++) {
		const e = 6 + 16 * i;
		const size = buf.readUInt32LE(e + 8);
		const offset = buf.readUInt32LE(e + 12);
		expect(offset + size).toBeLessThanOrEqual(buf.length);
		frames.push({
			// 0 in the directory means 256, which is the format's own encoding.
			width: buf[e] || 256,
			height: buf[e + 1] || 256,
			bpp: buf.readUInt16LE(e + 6),
			payload: buf.subarray(offset, offset + size)
		});
	}
	return frames;
}

// ---- the head -------------------------------------------------------------

const appHtml = readFileSync(join(ROOT, 'src', 'app.html'), 'utf8');

/** Every `<link>` in `src/app.html`, as its attribute map. */
const headLinks = [...appHtml.matchAll(/<link\b([^>]*)>/g)].map((m) => {
	const attrs: Record<string, string> = {};
	for (const a of m[1].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
	return attrs;
});

const manifestHref = '/manifest.webmanifest';
const manifest = JSON.parse(readFileSync(staticPath(manifestHref), 'utf8'));

describe('the head references files that exist', () => {
	it('links exactly the icon set, and every href resolves under static/', () => {
		const icons = headLinks.filter((l) => /icon|manifest/.test(l.rel ?? ''));
		expect(icons.map((l) => `${l.rel} ${l.href}`)).toEqual([
			'icon /favicon.ico',
			'icon /favicon.svg',
			'apple-touch-icon /apple-touch-icon.png',
			'manifest /manifest.webmanifest'
		]);
		for (const link of icons) {
			expect(existsSync(staticPath(link.href))).toBe(true);
		}
	});

	it('declares the ico for any size and the svg by type', () => {
		const ico = headLinks.find((l) => l.href === '/favicon.ico');
		expect(ico?.sizes).toBe('any');
		const svg = headLinks.find((l) => l.href === '/favicon.svg');
		expect(svg?.type).toBe('image/svg+xml');
	});

	it('carries the theme colour the manifest carries', () => {
		const meta = appHtml.match(/<meta name="theme-color" content="([^"]+)"/);
		expect(meta?.[1]).toBe('#0A0C0D');
		expect(manifest.theme_color.toLowerCase()).toBe('#0a0c0d');
		expect(manifest.background_color.toLowerCase()).toBe('#0a0c0d');
	});
});

// ---- the manifest ---------------------------------------------------------

describe('the manifest', () => {
	it('is valid JSON with the identity fields set', () => {
		expect(manifest.name).toBe('IDEA');
		expect(manifest.short_name).toBe('IDEA');
		expect(manifest.display).toBe('standalone');
		expect(manifest.start_url).toBe('/');
	});

	it('every icons[] src resolves under static/', () => {
		expect(Array.isArray(manifest.icons)).toBe(true);
		expect(manifest.icons.length).toBeGreaterThan(0);
		for (const icon of manifest.icons) {
			expect(existsSync(staticPath(icon.src))).toBe(true);
			const png = readPng(read(icon.src));
			expect(icon.sizes).toBe(`${png.width}x${png.height}`);
			expect(icon.type).toBe('image/png');
		}
	});

	it('offers both an any icon and a maskable one', () => {
		const purposes = manifest.icons.map((i: { purpose?: string }) => i.purpose);
		expect(purposes).toContain('any');
		expect(purposes).toContain('maskable');
	});
});

// ---- the files themselves -------------------------------------------------

describe('favicon.ico', () => {
	const frames = readIco(read('/favicon.ico'));

	it('parses and carries a 16x16 and a 32x32 frame', () => {
		const sizes = frames.map((f) => `${f.width}x${f.height}`);
		expect(sizes).toContain('16x16');
		expect(sizes).toContain('32x32');
	});

	it('every frame has a payload that is a PNG or a BMP', () => {
		for (const f of frames) {
			expect(f.payload.length).toBeGreaterThan(0);
			const png = f.payload.subarray(0, 8).equals(PNG_SIG);
			// A BMP-in-ICO frame opens with a 40-byte BITMAPINFOHEADER.
			const bmp = f.payload.length >= 40 && f.payload.readUInt32LE(0) === 40;
			expect(png || bmp).toBe(true);
			if (png) {
				const decoded = readPng(f.payload);
				expect(decoded.width).toBe(f.width);
				expect(decoded.height).toBe(f.height);
			}
		}
	});
});

describe.each([
	['/icon-192.png', 192],
	['/icon-512.png', 512]
])('%s', (href, size) => {
	const png = readPng(read(href));

	it(`is ${size}x${size}`, () => {
		expect(png.width).toBe(size);
		expect(png.height).toBe(size);
	});

	it('carries an alpha channel with fully transparent pixels', () => {
		expect(hasAlphaChannel(png)).toBe(true);
		const alpha = alphaSamples(png);
		expect(alpha.some((a) => a === 0)).toBe(true);
		// The positive control: an image that is transparent EVERYWHERE would
		// satisfy the line above and be an invisible icon.
		expect(alpha.some((a) => a === 255)).toBe(true);
	});
});

describe('apple-touch-icon.png', () => {
	const png = readPng(read('/apple-touch-icon.png'));

	it('is 180x180', () => {
		expect(png.width).toBe(180);
		expect(png.height).toBe(180);
	});

	it('carries no alpha channel at all', () => {
		// iOS composites this onto black, so a transparent corner is a black
		// corner. No alpha channel and no tRNS is the only way to be sure.
		expect(hasAlphaChannel(png)).toBe(false);
		expect(carriesTransparency(png)).toBe(false);
	});
});

describe('icon-maskable-512.png', () => {
	const png = readPng(read('/icon-maskable-512.png'));

	it('is 512x512', () => {
		expect(png.width).toBe(512);
		expect(png.height).toBe(512);
	});

	it('is fully opaque', () => {
		// Android crops a maskable icon to the launcher's own shape, so any
		// transparency inside it is a hole rather than a rounded corner.
		if (hasAlphaChannel(png)) {
			const alpha = alphaSamples(png);
			expect(alpha.every((a) => a === 255)).toBe(true);
		} else {
			expect(carriesTransparency(png)).toBe(false);
		}
	});
});

describe('favicon.svg', () => {
	const source = readFileSync(staticPath('/favicon.svg'), 'utf8');
	const doc = new (new Window().DOMParser)().parseFromString(source, 'image/svg+xml');

	it('parses as XML with an svg root', () => {
		expect(doc.querySelectorAll('parsererror').length).toBe(0);
		expect(doc.documentElement?.tagName.toLowerCase()).toBe('svg');
		expect(doc.documentElement?.getAttribute('viewBox')).toBeTruthy();
	});

	it('draws no rect and no background', () => {
		// The tile is a chamfered path, not a square, so the icon keeps its
		// shape wherever the browser rounds it. A rect or a painted background
		// would put a square behind it.
		expect(doc.querySelectorAll('rect').length).toBe(0);
		expect(source).not.toMatch(/background/i);
		// The positive control: the drawing it SHOULD contain is there.
		expect(doc.querySelectorAll('path').length).toBeGreaterThan(0);
	});
});
