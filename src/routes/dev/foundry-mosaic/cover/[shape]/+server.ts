import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { deflateSync } from 'node:zlib';
import type { RequestHandler } from './$types';

/**
 * FIXTURE COVER BYTES FOR THE MOSAIC HARNESS. Dev only: 404 in production.
 *
 * WHY REAL BYTES OVER A REAL REQUEST, rather than a `data:` URI in the page.
 * The whole mechanism under test is the browser measuring a DECODED image and
 * stamping its ratio on the card (`foundryCoverMeasured`), so the fixture has
 * to travel the path a real cover travels -- a request, a decode, a load event
 * -- or the harness would be proving the arithmetic and not the wiring. It is
 * generated rather than committed so no binary rides along with a layout
 * change, and the shapes are the argument: the clamp is what this surface
 * exists to exercise, and the two pathological ones cannot be uploaded to a
 * fixture by hand.
 *
 * THE RAMP IS NOT DECORATION. A flat colour makes a crop invisible: a card
 * whose 1:9 cover has been clamped to 9:16 looks identical to one that was not
 * clamped at all. A vertical light ramp means the cropped card visibly starts
 * and ends mid-gradient, so `object-fit: cover` doing its job is something a
 * reader of the screenshot can see.
 */

/** width, height, and a base colour. The ratio is the point of each row. */
const SHAPES: Record<string, { w: number; h: number; rgb: [number, number, number] }> = {
	/* 16:9 -- a browser window, and the shape the old fixed box assumed. */
	'wide-169': { w: 192, h: 108, rgb: [46, 74, 110] },
	/* 9:16 -- a portrait phone screenshot. Exactly the clamp's tall bound. */
	'tall-916': { w: 108, h: 192, rgb: [92, 52, 84] },
	/* 1:1. */
	square: { w: 90, h: 90, rgb: [58, 92, 70] },
	/* 4:3 -- an older capture, and a shape the mosaic should pass through. */
	'classic-43': { w: 160, h: 120, rgb: [54, 84, 96] },
	/* 9:1. CLAMPED to 2:1. Nothing uploads this on purpose; the gallery has
	   to survive it anyway. */
	ribbon: { w: 360, h: 40, rgb: [120, 78, 40] },
	/* 1:9. CLAMPED to 9:16. The prompt's own case: the one upload that must
	   not be able to destroy the gallery. */
	sliver: { w: 40, h: 360, rgb: [70, 60, 110] },
	/* A genuinely tall modern phone, 1179x2556 reduced. Also clamped, and the
	   one clamped shape that is a real photograph rather than an abuse. */
	'phone-tall': { w: 118, h: 256, rgb: [96, 64, 48] }
};

export const prerender = false;

function crc32(buf: Uint8Array): number {
	let c: number;
	const table: number[] = [];
	for (let n = 0; n < 256; n++) {
		c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	let r = 0xffffffff;
	for (const b of buf) r = table[(r ^ b) & 0xff] ^ (r >>> 8);
	return (r ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(typed));
	return Buffer.concat([len, typed, crc]);
}

/** A truecolour PNG with a vertical light ramp, built by hand. */
function png(w: number, h: number, rgb: [number, number, number]): Buffer {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // colour type: truecolour
	const rows: Buffer[] = [];
	for (let y = 0; y < h; y++) {
		const row = Buffer.alloc(1 + w * 3); // leading filter byte 0
		const lift = Math.round(55 * Math.sin((y / h) * Math.PI));
		for (let x = 0; x < w; x++) {
			row[1 + x * 3] = Math.max(0, Math.min(255, rgb[0] + lift));
			row[2 + x * 3] = Math.max(0, Math.min(255, rgb[1] + lift));
			row[3 + x * 3] = Math.max(0, Math.min(255, rgb[2] + lift));
		}
		rows.push(row);
	}
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

export const GET: RequestHandler = ({ params }) => {
	if (!dev) error(404);
	const shape = SHAPES[params.shape ?? ''];
	if (!shape) error(404);
	const body = png(shape.w, shape.h, shape.rgb);
	// A plain view over the buffer's own bytes: `Buffer` is not a `BodyInit`.
	return new Response(new Uint8Array(body), {
		headers: {
			'content-type': 'image/png',
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
