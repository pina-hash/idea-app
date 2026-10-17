// tests/classroom-thumbnail.test.ts
//
// POST THUMBNAILS (ledger 0396, report a6a037f3): the pure rules the class
// page, the editor and the two serving routes share. The database half (0268,
// its trigger, its writes, its grants and the SQL/TS reader parity) is
// tests/db/classroom-item-thumbnails.test.ts; the layout and the bridge in a
// real browser are tools/browser-verify/routes/post-thumbnails.mjs.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	THUMB_SHAPES,
	THUMB_SHAPE_DEFAULT,
	focalObjectPosition,
	focalPosition,
	hasThumbnailMedia,
	isThumbShape,
	liveTemplateMissing,
	nudgeFocal,
	readItemThumbnail,
	resolveThumbShape,
	thumbnailPlan,
	unitTint,
	withItemThumbnail,
	type ItemThumbnail
} from '../src/lib/classroom/thumbnail';
import {
	HTML_THUMBNAIL_DATA_MAX,
	HX_SANDBOX_FLAGS,
	HX_THUMB_OPEN_TYPE,
	HX_THUMB_READY_TYPE,
	HX_THUMB_SHIM,
	extractThumbnailTemplate,
	htmlThumbnailSrc,
	hxThumbReceive,
	hxThumbStateMessage,
	manifestThumbnail,
	manifestThumbnailWarnings,
	servedThumbnailTemplate,
	thumbnailDocument
} from '../src/lib/classroom/html-assignment/thumbnail';
import { _thumbnailFor } from '../src/routes/hx/[docId]/thumbnail/+server';
import { _decodeDataPicture, GET as thumbnailImageGET } from '../src/routes/api/classroom/thumbnail/[itemId]/+server';
import { readClassroomPreferences } from '../src/lib/preferences/classroom';

const row = (over: Partial<ItemThumbnail> = {}): ItemThumbnail => ({
	source: 'image',
	manual: true,
	image_key: 'item-1/abc.png',
	attachment_id: null,
	image_width: 800,
	image_height: 600,
	focal_x: 0.5,
	focal_y: 0.5,
	html_document_id: null,
	interactive: false,
	updated_at: '2026-10-16T10:00:00.000Z',
	...over
});

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('the shape a person sees', () => {
	it('their own choice, then the class default, then Tile', () => {
		expect(THUMB_SHAPE_DEFAULT).toBe('tile');
		expect(resolveThumbShape('class', null)).toBe('tile');
		expect(resolveThumbShape(undefined, undefined)).toBe('tile');
		expect(resolveThumbShape('class', 'banner')).toBe('banner');
		expect(resolveThumbShape('class', 'off')).toBe('off');
		expect(resolveThumbShape('wide', 'banner')).toBe('wide');
		expect(resolveThumbShape('off', 'banner')).toBe('off');
		// A class default this build does not know reads as no default.
		expect(resolveThumbShape('class', 'hexagon')).toBe('tile');
		expect(THUMB_SHAPES.every(isThumbShape)).toBe(true);
		expect(isThumbShape('class')).toBe(false);
	});

	it('the Display setting reads "class" until a person picks, and drops a value it does not know', () => {
		expect(readClassroomPreferences(null).display.thumbShape).toBe('class');
		expect(readClassroomPreferences({ display: { thumbShape: 'banner' } }).display.thumbShape).toBe('banner');
		expect(readClassroomPreferences({ display: { thumbShape: 'hexagon' } }).display.thumbShape).toBe('class');
	});
});

describe('the stored row, as the client reads it', () => {
	it('takes an object or a one-element array, and refuses what is not a row', () => {
		expect(readItemThumbnail(row())).toMatchObject({ source: 'image', image_key: 'item-1/abc.png' });
		expect(readItemThumbnail([row({ source: 'none' })])?.source).toBe('none');
		expect(readItemThumbnail([])).toBeNull();
		expect(readItemThumbnail(null)).toBeNull();
		expect(readItemThumbnail({ source: 'video' })).toBeNull();
		// A focal point outside the picture is clamped, a missing one centred.
		expect(readItemThumbnail({ source: 'image', focal_x: 3, focal_y: null })).toMatchObject({ focal_x: 1, focal_y: 0.5 });
	});

	it('rides beside the item only when the rung carried the embed: absent is undefined, never null', () => {
		const older = withItemThumbnail({ id: 'a' }, { id: 'a' });
		expect('thumbnail' in older).toBe(false);
		const none = withItemThumbnail({ id: 'b' }, { id: 'b', classroom_item_thumbnails: null });
		expect(none).toMatchObject({ thumbnail: null });
		const set = withItemThumbnail({ id: 'c' }, { id: 'c', classroom_item_thumbnails: [row()] });
		expect(set.thumbnail?.source).toBe('image');
	});
});

describe('what a slot shows', () => {
	it('nothing set, the generated look, or a manual picture whose file is gone, draws the generated identity', () => {
		expect(thumbnailPlan({ id: 'i' })).toEqual({ kind: 'generated' });
		expect(thumbnailPlan({ id: 'i', thumbnail: null })).toEqual({ kind: 'generated' });
		expect(thumbnailPlan({ id: 'i', thumbnail: row({ source: 'none', image_key: null }) })).toEqual({ kind: 'generated' });
		expect(thumbnailPlan({ id: 'i', thumbnail: row({ image_key: null, attachment_id: null }) })).toEqual({ kind: 'generated' });
		expect(hasThumbnailMedia({ id: 'i' })).toBe(false);
	});

	it('a picture loads through the one image route, versioned by the row, around its focal point', () => {
		const plan = thumbnailPlan({ id: 'item-1', thumbnail: row({ focal_x: 0.2, focal_y: 0.75 }) });
		expect(plan).toMatchObject({
			kind: 'image',
			src: '/api/classroom/thumbnail/item-1?v=2026-10-16T10%3A00%3A00.000Z',
			focalX: 0.2,
			focalY: 0.75
		});
		// A manifest picture has neither a key nor an attachment and still loads.
		expect(thumbnailPlan({ id: 'item-2', thumbnail: row({ manual: false, image_key: null }) }).kind).toBe('image');
		expect(hasThumbnailMedia({ id: 'item-1', thumbnail: row() })).toBe(true);
		expect(focalPosition(0.2, 0.75)).toBe('20% 75%');
		expect(focalPosition(Number.NaN, 2)).toBe('50% 100%');
		expect(nudgeFocal(0.98, 0.02, 0.05, -0.05)).toEqual({ x: 1, y: 0 });
	});

	it('a live thumbnail is the document address plus /thumbnail, on the sandbox origin when one is set', () => {
		const t = row({ source: 'html', manual: false, image_key: null, html_document_id: 'doc-9', interactive: true });
		expect(thumbnailPlan({ id: 'i', thumbnail: t })).toEqual({
			kind: 'html',
			src: '/hx/doc-9/thumbnail?v=2026-10-16T10%3A00%3A00.000Z',
			interactive: true
		});
		expect(thumbnailPlan({ id: 'i', thumbnail: t }, { sandboxOrigin: 'https://hx.example' })).toMatchObject({
			src: 'https://hx.example/hx/doc-9/thumbnail?v=2026-10-16T10%3A00%3A00.000Z'
		});
		expect(htmlThumbnailSrc('/hx/doc-9/')).toBe('/hx/doc-9/thumbnail');
	});

	it('a draft, or a post scheduled ahead of the loader clock, asks for no live thumbnail (the route would refuse it)', () => {
		const t = row({ source: 'html', manual: false, image_key: null, html_document_id: 'doc-9' });
		const now = '2026-10-16T17:00:00.000Z';
		const kind = (item: Record<string, unknown>, opts = {}) => thumbnailPlan({ id: 'i', thumbnail: t, ...item }, opts).kind;
		expect(kind({ published: false })).toBe('generated');
		expect(kind({ published: true, publish_at: '2026-10-20T15:00:00.000Z' }, { now })).toBe('generated');
		// Live: published with no date, or a date already past on the loader clock.
		expect(kind({ published: true, publish_at: null }, { now })).toBe('html');
		expect(kind({ published: true, publish_at: '2026-10-10T15:00:00.000Z' }, { now })).toBe('html');
		// No clock handed over is never a device clock: the route decides.
		expect(kind({ published: true, publish_at: '2026-10-20T15:00:00.000Z' })).toBe('html');
		// No published key at all (the editor's preview) is unchanged.
		expect(kind({})).toBe('html');
		// A draft's PICTURE still shows: the image route serves it to whoever can read the post.
		expect(thumbnailPlan({ id: 'i', thumbnail: row(), published: false }).kind).toBe('image');
	});

	it("a unit's tint is its place among the class's units, wrapped at eight; no unit is no tint", () => {
		const units = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'];
		expect(unitTint('u0', units)).toBe(0);
		expect(unitTint('u7', units)).toBe(7);
		expect(unitTint('u8', units)).toBe(0);
		expect(unitTint(null, units)).toBeNull();
		expect(unitTint('gone', units)).toBeNull();
	});
});

describe("the manifest's thumbnail key", () => {
	it('reads html and image forms, and nothing else', () => {
		expect(manifestThumbnail({ thumbnail: { kind: 'html', template: 'idea-thumbnail' } })).toEqual({
			source: 'html',
			template: 'idea-thumbnail',
			interactive: false
		});
		expect(manifestThumbnail({ thumbnail: { kind: 'html', template: 'idea-thumbnail', interactive: true } })).toMatchObject({
			interactive: true
		});
		expect(manifestThumbnail({ thumbnail: { kind: 'image', src: 'attachment:cover.png' } })).toEqual({
			source: 'image',
			src: 'attachment:cover.png'
		});
		expect(manifestThumbnail({ thumbnail: { kind: 'image', src: `data:image/png;base64,${PNG_B64}` } })?.source).toBe('image');
		expect(manifestThumbnail({ thumbnail: { kind: 'image', src: 'attachment:logo.svg' } })).toBeNull();
		expect(manifestThumbnail({ thumbnail: { kind: 'image', src: 'https://example.com/a.png' } })).toBeNull();
		expect(manifestThumbnail({ thumbnail: { kind: 'html', template: '1bad' } })).toBeNull();
		expect(manifestThumbnail({ thumbnail: { kind: 'video' } })).toBeNull();
		expect(manifestThumbnail({})).toBeNull();
	});

	it('every problem is a WARNING that says the class page shows the generated look, never a refusal', () => {
		const html = '<body><template id="idea-thumbnail"><b>hi</b></template></body>';
		expect(manifestThumbnailWarnings({ thumbnail: { kind: 'html', template: 'idea-thumbnail' } }, html)).toEqual([]);
		expect(manifestThumbnailWarnings({}, html)).toEqual([]);
		const missing = manifestThumbnailWarnings({ thumbnail: { kind: 'html', template: 'nope' } }, html);
		expect(missing).toHaveLength(1);
		expect(missing[0]).toContain('<template id="nope">');
		expect(manifestThumbnailWarnings({ thumbnail: { kind: 'html', template: 'e' } }, '<template id="e">  </template>')[0]).toContain('empty');
		expect(manifestThumbnailWarnings({ thumbnail: { kind: 'image', src: 'attachment:a.svg' } }, '')[0]).toContain('SVG');
		const big = `data:image/png;base64,${'A'.repeat(HTML_THUMBNAIL_DATA_MAX)}`;
		expect(manifestThumbnailWarnings({ thumbnail: { kind: 'image', src: big } }, '')[0]).toContain('attachment:');
		expect(manifestThumbnailWarnings({ thumbnail: 'cover.png' }, '')[0]).toContain('generated look');
		expect(manifestThumbnailWarnings({ thumbnail: { kind: 'html', template: 'idea-thumbnail', interactive: 'yes' } }, html)[0]).toContain('read as false');
	});
});

describe('finding the template in the document', () => {
	it('returns the exact bytes between the tags, the first template with that id', () => {
		const html = '<p>x</p><template id="a">  <div class="t">one</div>\n</template><template id="a">two</template>';
		expect(extractThumbnailTemplate(html, 'a')).toBe('  <div class="t">one</div>\n');
		expect(extractThumbnailTemplate("<template id='q' class=x>Q</template>", 'q')).toBe('Q');
		expect(extractThumbnailTemplate('<template id=bare>B</template>', 'bare')).toBe('B');
		expect(extractThumbnailTemplate('<template id="z">Z</template>', 'missing')).toBeNull();
	});

	it('counts nested templates, and never reads a tag inside a comment, a script, a style or a textarea', () => {
		expect(extractThumbnailTemplate('<template id="n">a<template>b</template>c</template>', 'n')).toBe('a<template>b</template>c');
		const tricky = [
			'<!-- <template id="t">comment</template> -->',
			'<script>const s = \'<template id="t">script</template>\';</script>',
			'<style>/* <template id="t">style</template> */</style>',
			'<textarea><template id="t">typed</template></textarea>',
			'<template id="t">REAL</template>'
		].join('');
		expect(extractThumbnailTemplate(tricky, 't')).toBe('REAL');
		// An unclosed raw-text element ends the scan rather than guessing.
		expect(extractThumbnailTemplate('<script>never closed <template id="t">x</template>', 't')).toBeNull();
	});
});

describe('a template the document does not carry (review of ledger 0396)', () => {
	const html = '<p>x</p><template id="idea-thumbnail"><div>spin</div></template>';
	const named = (template: string) => manifestThumbnail({ thumbnail: { kind: 'html', template } });
	const row = (over: Partial<ItemThumbnail> = {}): ItemThumbnail => ({
		source: 'html',
		manual: false,
		image_key: null,
		attachment_id: null,
		image_width: null,
		image_height: null,
		focal_x: 0.5,
		focal_y: 0.5,
		html_document_id: 'doc-1',
		interactive: false,
		updated_at: '2026-10-16T09:00:00.000Z',
		...over
	});

	it('the served template is the extracted one with something in it, and nothing else', () => {
		expect(servedThumbnailTemplate(html, 'idea-thumbnail')).toBe('<div>spin</div>');
		expect(servedThumbnailTemplate(html, 'cam-thumbnail')).toBeNull();
		expect(servedThumbnailTemplate('<template id="e">  \n </template>', 'e')).toBeNull();
		expect(servedThumbnailTemplate('<!-- <template id="c">x</template> -->', 'c')).toBeNull();
	});

	it('a staged document answers from its own bytes, in both directions', () => {
		expect(liveTemplateMissing(named('cam-thumbnail'), html, undefined)).toBe(true);
		expect(liveTemplateMissing(named('idea-thumbnail'), html, undefined)).toBe(false);
		// The staged bytes win over whatever the stored row said.
		expect(liveTemplateMissing(named('cam-thumbnail'), html, row())).toBe(true);
	});

	it('the stored document answers through the row the database wrote', () => {
		expect(liveTemplateMissing(named('idea-thumbnail'), null, row())).toBe(false);
		expect(liveTemplateMissing(named('cam-thumbnail'), null, null)).toBe(true);
		// A picture row under an html manifest is not a live thumbnail either.
		expect(liveTemplateMissing(named('idea-thumbnail'), null, row({ source: 'image', html_document_id: null }))).toBe(true);
	});

	it('cannot tell, and says so: a hand-set row, a read without 0268, no live thumbnail declared', () => {
		expect(liveTemplateMissing(named('idea-thumbnail'), null, row({ manual: true, source: 'none', html_document_id: null }))).toBeNull();
		expect(liveTemplateMissing(named('idea-thumbnail'), null, undefined)).toBeNull();
		expect(liveTemplateMissing(manifestThumbnail({ thumbnail: { kind: 'image', src: 'attachment:a.png' } }), html, null)).toBeNull();
		expect(liveTemplateMissing(null, html, null)).toBeNull();
	});

	it('the dev fixture with the typo is refused by the serving route', async () => {
		const { hxDocument } = await import('../src/routes/hx/_documents');
		const doc = hxDocument('thumb-notemplate', true);
		expect(doc).not.toBeNull();
		expect(_thumbnailFor(doc!.html)).toBeNull();
		expect(doc!.html).toContain('<template id="idea-thumbnail">');
	});
});

describe('the thumbnail document', () => {
	const doc = (manifest: Record<string, unknown>, template = '<div class="spin">S</div>') =>
		`<!doctype html><html><body><template id="idea-thumbnail">${template}</template>` +
		`<script type="application/json" id="idea-manifest">${JSON.stringify(manifest)}</script></body></html>`;

	it("serves the author's template bytes unchanged inside the fixed shell, with the shim first", () => {
		const template = '<style>.spin{animation:s 2s linear infinite}</style>\n<div class="spin">S</div>';
		const out = _thumbnailFor(doc({ thumbnail: { kind: 'html', template: 'idea-thumbnail' } }, template));
		expect(out).not.toBeNull();
		expect(out!).toContain(template);
		expect(out!.indexOf(HX_THUMB_SHIM)).toBeGreaterThan(-1);
		expect(out!.indexOf(HX_THUMB_SHIM)).toBeLessThan(out!.indexOf(template));
		expect(out!).toContain('data-idea-interactive="false"');
		expect(_thumbnailFor(doc({ thumbnail: { kind: 'html', template: 'idea-thumbnail', interactive: true } }))).toContain(
			'data-idea-interactive="true"'
		);
	});

	it('answers nothing (the route 404s) for no key, an image key, a missing or an empty template', () => {
		expect(_thumbnailFor(doc({}))).toBeNull();
		expect(_thumbnailFor(doc({ thumbnail: { kind: 'image', src: 'attachment:a.png' } }))).toBeNull();
		expect(_thumbnailFor(doc({ thumbnail: { kind: 'html', template: 'other' } }))).toBeNull();
		expect(_thumbnailFor(doc({ thumbnail: { kind: 'html', template: 'idea-thumbnail' } }, '   '))).toBeNull();
		expect(_thumbnailFor('<html>no manifest</html>')).toBeNull();
	});

	it('the shim is one valid script, and the shell names no extra privilege', () => {
		expect(() => new Function(HX_THUMB_SHIM)).not.toThrow();
		const shell = thumbnailDocument('<b>x</b>', { interactive: false });
		expect(shell).not.toMatch(/allow-same-origin/);
		expect(HX_SANDBOX_FLAGS).not.toMatch(/allow-same-origin/);
		expect(thumbnailDocument('<b>x</b>', { interactive: false, shape: 'BAD SHAPE' })).toContain('data-idea-shape="tile"');
	});

	it('the frame is sandboxed by the one constant, and the slot never names allow-same-origin', () => {
		const frame = readFileSync('src/lib/classroom/html-assignment/HtmlThumbnailFrame.svelte', 'utf8');
		expect(frame).toContain('sandbox={HX_SANDBOX_FLAGS}');
		expect(frame).not.toMatch(/allow-same-origin/);
	});
});

describe('the bridge, thumbnail half', () => {
	const frame = {};
	it('takes ready and open from the frame it created, at the opaque origin, and nothing else', () => {
		expect(hxThumbReceive({ origin: 'null', source: frame, data: { type: HX_THUMB_READY_TYPE } }, frame)).toEqual({
			ok: true,
			type: 'ready'
		});
		expect(hxThumbReceive({ origin: 'null', source: frame, data: { type: HX_THUMB_OPEN_TYPE } }, frame)).toEqual({
			ok: true,
			type: 'open'
		});
		expect(hxThumbReceive({ origin: 'https://evil.example', source: frame, data: { type: HX_THUMB_READY_TYPE } }, frame).ok).toBe(false);
		expect(hxThumbReceive({ origin: 'null', source: {}, data: { type: HX_THUMB_READY_TYPE } }, frame).ok).toBe(false);
		expect(hxThumbReceive({ origin: 'null', source: frame, data: { type: 'idea:ready' } }, frame).ok).toBe(false);
		expect(hxThumbReceive({ origin: 'null', source: frame, data: { type: HX_THUMB_READY_TYPE } }, null).ok).toBe(false);
	});

	it('the state message carries size, shape, theme, scheme, motion and pause, rounded', () => {
		expect(
			hxThumbStateMessage({
				width: 48.4,
				height: 47.6,
				shape: 'tile',
				theme: 'space-white',
				scheme: 'light',
				reducedMotion: true,
				paused: false
			})
		).toMatchObject({ type: 'idea:thumb', width: 48, height: 48, shape: 'tile', theme: 'space-white', scheme: 'light', reducedMotion: true, paused: false });
	});
});

describe('a data picture named by a manifest, served by the image route', () => {
	it('is decoded only when its bytes are the picture its type claims', () => {
		const ok = _decodeDataPicture(`data:image/png;base64,${PNG_B64}`);
		expect(ok?.type).toBe('image/png');
		expect(ok?.bytes[1]).toBe(0x50);
		// A PNG label over bytes that are not a PNG, an SVG, and junk are refused.
		expect(_decodeDataPicture(`data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`)).toBeNull();
		expect(_decodeDataPicture('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
		expect(_decodeDataPicture('not a data uri')).toBeNull();
	});
});

/*
 * THE IMAGE ROUTE, DRIVEN AS A REQUEST (review round 1: the manifest branch had
 * a unit test of its decoder and no proof of the route around it). Every read
 * is the caller's own client, faked here at the PostgREST shape the route
 * uses; what is asserted is the RESPONSE: a 302 to the right place, the bytes
 * with the right headers, or the one bodyless 404.
 */
describe('the image route answers each kind of picture', () => {
	const ITEM = '3f0a1c2e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
	type Tables = { thumb?: unknown; manifest?: unknown; files?: unknown[] };
	function fakeClient(t: Tables, signed: string | null = null) {
		const table = (name: string) => {
			const one = name === 'classroom_item_thumbnails' ? t.thumb : name === 'classroom_html_assignments' ? (t.manifest === undefined ? null : { manifest: t.manifest }) : null;
			const q = {
				select: () => q,
				eq: () => q,
				maybeSingle: async () => ({ data: one ?? null, error: null }),
				then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: name === 'classroom_attachments' ? (t.files ?? []) : [], error: null }).then(resolve)
			};
			return q;
		};
		return {
			from: table,
			storage: {
				from: () => ({
					createSignedUrl: async () => (signed ? { data: { signedUrl: signed }, error: null } : { data: null, error: { message: 'refused' } })
				})
			}
		};
	}
	const call = (t: Tables, opts: { claims?: boolean; signed?: string | null; itemId?: string } = {}) =>
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thumbnailImageGET({ params: { itemId: opts.itemId ?? ITEM }, locals: { supabase: fakeClient(t, opts.signed ?? null), claims: opts.claims === false ? null : { sub: 'u' } } } as any) as Promise<Response>;
	const auto = { source: 'image', manual: false, image_key: null, attachment_id: null };
	const withThumb = (thumbnail: unknown) => ({ schemaVersion: 3, kind: 'html-assignment', title: 'T', thumbnail });

	it('serves a manifest data picture as its own bytes, typed by its signature, nosniff and sandboxed', async () => {
		const res = await call({ thumb: auto, manifest: withThumb({ kind: 'image', src: `data:image/png;base64,${PNG_B64}` }) });
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/png');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
		const body = new Uint8Array(await res.arrayBuffer());
		expect(body.length).toBe(Buffer.from(PNG_B64, 'base64').length);
		expect([...body.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
	});

	it("redirects a manifest attachment alias to that file's own route, matched by name in any case", async () => {
		const res = await call({
			thumb: auto,
			manifest: withThumb({ kind: 'image', src: 'attachment:badge.png' }),
			files: [{ id: 'att-9', filename: 'Badge.PNG', mime_type: 'application/octet-stream' }]
		});
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/api/classroom/attachment/att-9');
		expect(res.headers.get('cache-control')).toBe('private, max-age=60');
	});

	it('an uploaded picture is a short signed URL, and one of the post\'s files is its own route', async () => {
		const signed = 'https://storage.example/signed?token=t';
		const up = await call({ thumb: { ...auto, manual: true, image_key: `${ITEM}/a.jpg` } }, { signed });
		expect(up.status).toBe(302);
		expect(up.headers.get('location')).toBe(signed);
		const file = await call({ thumb: { ...auto, manual: true, attachment_id: 'att-2' } });
		expect(file.headers.get('location')).toBe('/api/classroom/attachment/att-2');
	});

	it('answers the one bodyless 404 for every picture it must not serve', async () => {
		const cases: [string, Tables, Parameters<typeof call>[1]?][] = [
			['signed out', { thumb: auto, manifest: withThumb({ kind: 'image', src: `data:image/png;base64,${PNG_B64}` }) }, { claims: false }],
			['a malformed id', { thumb: auto }, { itemId: 'not-a-uuid' }],
			['no row', {}],
			['a live thumbnail row', { thumb: { ...auto, source: 'html' } }],
			['a manifest naming an off-host picture', { thumb: auto, manifest: withThumb({ kind: 'image', src: 'https://example.com/a.png' }) }],
			['a manifest naming an SVG file', { thumb: auto, manifest: withThumb({ kind: 'image', src: 'attachment:a.svg' }), files: [{ id: 'att-1', filename: 'a.svg', mime_type: 'image/svg+xml' }] }],
			['an alias whose stored file is an SVG', { thumb: auto, manifest: withThumb({ kind: 'image', src: 'attachment:a.png' }), files: [{ id: 'att-1', filename: 'a.png', mime_type: 'image/svg+xml' }] }],
			['an alias nothing on the post carries', { thumb: auto, manifest: withThumb({ kind: 'image', src: 'attachment:gone.png' }), files: [] }],
			['a data picture whose bytes are not its type', { thumb: auto, manifest: withThumb({ kind: 'image', src: `data:image/png;base64,${Buffer.from('GIF89a----------').toString('base64')}` }) }],
			// A hand-set picture whose file is gone is the generated look, never the manifest's.
			['a manual row with nothing left', { thumb: { ...auto, manual: true }, manifest: withThumb({ kind: 'image', src: `data:image/png;base64,${PNG_B64}` }) }],
			['a refused signature', { thumb: { ...auto, manual: true, image_key: `${ITEM}/a.jpg` } }, { signed: null }]
		];
		const out = await Promise.all(cases.map(async ([label, t, o]) => {
			const res = await call(t, o);
			return `${label}: ${res.status} ${(await res.text()).length}`;
		}));
		expect(out).toEqual(cases.map(([label]) => `${label}: 404 0`));
		expect(out.length).toBe(11);
	});
});

describe('the dev thumbnail fixtures', () => {
	it('each declares a thumbnail the route can serve, and only the interactive one is interactive', async () => {
		const { hxDocument } = await import('../src/routes/hx/_documents');
		for (const id of ['thumb-gear', 'thumb-canvas', 'thumb-interactive']) {
			const doc = hxDocument(id, true);
			expect(doc, id).not.toBeNull();
			expect(hxDocument(id, false), id).toBeNull();
			const served = _thumbnailFor(doc!.html);
			expect(served, id).not.toBeNull();
			expect(served!, id).toContain(`data-idea-interactive="${id === 'thumb-interactive'}"`);
		}
	});
});

describe('the focal point is centred, not merely aligned', () => {
	/** The same arithmetic, in numbers, for a box of w x h: where the focal point lands. */
	function landed(fx: number, fy: number, W: number, H: number, w: number, h: number) {
		const r = W / H;
		const sw = Math.max(w, h * r);
		const sh = Math.max(h, w / r);
		const x = Math.min(0, Math.max(w - sw, w / 2 - fx * sw));
		const y = Math.min(0, Math.max(h - sh, h / 2 - fy * sh));
		return { x: x + fx * sw, y: y + fy * sh };
	}

	it('writes the clamp over the slot size with the picture ratio, and a percentage when no size is known', () => {
		const pos = focalObjectPosition(0.72, 0.6, 800, 600);
		expect(pos).toBe(
			'clamp(100cqw - max(100cqw, 100cqh * 1.3333), 50cqw - 0.72 * max(100cqw, 100cqh * 1.3333), 0px) ' +
				'clamp(100cqh - max(100cqh, 100cqw / 1.3333), 50cqh - 0.6 * max(100cqh, 100cqw / 1.3333), 0px)'
		);
		expect(focalObjectPosition(0.72, 0.6, null, 600)).toBe('72% 60%');
		expect(focalObjectPosition(0.5, 0.5, 0, 0)).toBe('50% 50%');
	});

	it('the arithmetic puts the point in the middle of a banner, and keeps the picture against its edges', () => {
		// A bench photo 800x600 with its subject at (0.72, 0.6), in a 396x56 banner.
		const a = landed(0.72, 0.6, 800, 600, 396, 56);
		expect(a.y).toBeCloseTo(28, 5);
		// A subject at the very bottom cannot be centred without a gap: it is held to the edge.
		const b = landed(0.5, 1, 800, 600, 396, 56);
		expect(b.y).toBeCloseTo(56, 5);
		// What a bare percentage would have done to the first case: 60% of the
		// overflow, which leaves the subject 5.6px below centre in a 56px banner
		// (a tenth of its height) and further off the further from 50% it sits.
		const sh = Math.max(56, 396 / (800 / 600));
		const percentY = 0.6 * (56 - sh) + 0.6 * sh;
		expect(Math.abs(percentY - 28)).toBeGreaterThan(5);
	});
});

describe('the authoring template carries a working thumbnail', () => {
	it('names it in the manifest and the route can serve it, with no thumbnail warning', async () => {
		const html = readFileSync('src/lib/legacy/assignments/_TEMPLATE.html', 'utf8');
		const served = _thumbnailFor(html);
		expect(served).not.toBeNull();
		expect(served!).toContain('@keyframes t-spin');
		const { validateHtmlManifest } = await import('../src/lib/classroom/html-assignment/manifest');
		expect(validateHtmlManifest(html).warnings.filter((w) => /thumbnail/i.test(w))).toEqual([]);
	});
});

describe("the class default on the class's Settings tab", () => {
	const section = {
		id: 's1',
		course_id: 'c1',
		label: 'Period 1',
		block: 'A',
		teacher_email: 'vargas@boscotech.edu',
		active: true,
		course: { id: 'c1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	};
	const renderWith = async (props: Record<string, unknown>) => {
		const { render } = await import('svelte/server');
		const Panel = (await import('../src/lib/classroom/ClassSettingsPanel.svelte')).default;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return render(Panel, { props: { section, transports: {}, ...props } as any }).body;
	};
	const writer = async () => ({ ok: true as const, shape: null });

	it('is a card with five keys and one lit when the database can hold a default', async () => {
		const html = await renderWith({ thumbShape: { ready: true, shape: 'wide' }, setThumbShape: writer });
		expect(html).toContain('data-testid="settings-thumbnails"');
		expect(html.split('data-testid="settings-thumb-shape"').length - 1).toBe(5);
		expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="settings-thumb-shape"[^>]*data-shape="wide"/);
		expect(html.split('aria-pressed="true"').length - 1).toBe(1);
	});

	it('is absent with no writer, no read, or a database without 0268', async () => {
		for (const props of [{}, { setThumbShape: writer }, { thumbShape: { ready: true, shape: null } }, { thumbShape: { ready: false, shape: null }, setThumbShape: writer }]) {
			expect(await renderWith(props), JSON.stringify(props)).not.toContain('settings-thumbnails');
		}
	});
});

describe("the home page's class cards follow the shape (polish round)", () => {
	it("a class's default rides beside the section only when the read carried it", async () => {
		const { withSectionThumbShape } = await import('../src/lib/classroom/thumbnail');
		expect('thumbnail_shape' in withSectionThumbShape({ id: 's' }, { id: 's' })).toBe(false);
		expect(withSectionThumbShape({ id: 's' }, { thumbnail_shape: 'wide' }).thumbnail_shape).toBe('wide');
		expect(withSectionThumbShape({ id: 's' }, { thumbnail_shape: null }).thumbnail_shape).toBeNull();
		expect(withSectionThumbShape({ id: 's' }, { thumbnail_shape: 'square' }).thumbnail_shape).toBeNull();
	});

	it("the device slot is read for the viewer it was written for, through the store's own validation", async () => {
		const { classroomLocalKey, readDeviceClassroomPreferences } = await import('../src/lib/preferences/classroom');
		const slots = new Map<string, string>();
		const storage = {
			getItem: (k: string) => slots.get(k) ?? null,
			setItem: (k: string, v: string) => void slots.set(k, v),
			removeItem: (k: string) => void slots.delete(k)
		};
		slots.set(classroomLocalKey('u1'), JSON.stringify({ display: { thumbShape: 'off' } }));
		slots.set(classroomLocalKey('u2'), JSON.stringify({ display: { thumbShape: 'square' } }));
		expect(readDeviceClassroomPreferences('u1', storage).display.thumbShape).toBe('off');
		expect(readDeviceClassroomPreferences('u2', storage).display.thumbShape).toBe('class');
		expect(readDeviceClassroomPreferences('u3', storage).display.thumbShape).toBe('class');
		expect(readDeviceClassroomPreferences(null, null).display.thumbShape).toBe('class');
		// Reading writes nothing.
		expect([...slots.keys()].sort()).toEqual([classroomLocalKey('u1'), classroomLocalKey('u2')].sort());
	});

	it("the server render takes the class's default (the device slot is the browser's), Off drawing no picture at all", async () => {
		const { render } = await import('svelte/server');
		const { default: ClassroomFeed } = await import('../src/lib/classroom/ClassroomFeed.svelte');
		const section = (id: string, shape?: 'off' | 'wide' | 'banner') => ({
			id,
			course_id: 'c',
			label: 'Period 1',
			block: null,
			teacher_email: 't@boscotech.edu',
			active: true,
			course: { id: 'c', code: 'IDEA100', title: 'Intro', active: true },
			...(shape ? { thumbnail_shape: shape } : {})
		});
		const entry = (id: string, over: Record<string, unknown> = {}) => ({
			item: {
				id,
				kind: 'assignment',
				title: id,
				body: '',
				body_doc: [{ type: 'img', src: '/IDEA/icon-512.png', alt: 'cover' }],
				attachments: [],
				published: true,
				...over
			},
			reason: 'due-soon'
		});
		const own = { thumbnail: { source: 'image', manual: true, image_key: 'k', attachment_id: null, image_width: 10, image_height: 10, focal_x: 0.5, focal_y: 0.5, html_document_id: null, interactive: false, updated_at: null } };
		const feed = (shape?: 'off' | 'wide' | 'banner') => ({
			section: section('s-' + (shape ?? 'none'), shape),
			manages: false,
			urgent: [entry('a', own), entry('b')],
			standing: [],
			hiddenCount: 0
		});
		const html = (shape?: 'off' | 'wide' | 'banner') =>
			render(ClassroomFeed, { props: { feeds: [feed(shape)] as never, now: new Date('2026-10-16T12:00:00Z') } }).body;
		const count = (h: string, re: RegExp) => (h.match(re) ?? []).length;
		// No default: Tile, the post's own thumbnail in the mark and the other's cover.
		const tile = html();
		expect(count(tile, /data-thumbs="tile"/g)).toBe(2);
		expect(count(tile, /data-testid="feed-post-thumb"/g)).toBe(1);
		expect(count(tile, /<img\b/g)).toBe(2);
		// Off: titles and the kind glyph only, no picture of either kind.
		const off = html('off');
		expect(count(off, /data-thumbs="off"/g)).toBe(2);
		expect(count(off, /data-testid="feed-post-thumb"/g)).toBe(0);
		expect(count(off, /<img\b/g)).toBe(0);
		expect(count(off, /class="assignment-icon-thumb[^"]*"/g)).toBe(2);
		// Wide and Banner: a slot over every row, the cover drawn through it.
		for (const shape of ['wide', 'banner'] as const) {
			const h = html(shape);
			expect(count(h, new RegExp(`data-thumbs="${shape}"`, 'g')), shape).toBe(2);
			expect(count(h, /class="feed-slot[^"]*"/g), shape).toBe(2);
			expect(count(h, new RegExp(`data-shape="${shape}"`, 'g')), shape).toBe(2);
			expect(count(h, /class="assignment-icon-thumb/g), shape).toBe(0);
			expect(h, shape).toContain('/IDEA/icon-512.png');
		}
	});
});
