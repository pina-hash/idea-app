/**
 * Writes the site's static icons from `src/lib/tab-icon/geometry.ts` alone
 * (ledger 0396).
 *
 *   npm run tab-icon:build
 *
 * which is `node --experimental-strip-types tools/tab-icon/build.mjs`: the
 * geometry module is TypeScript and Node strips its types on import, so the
 * build reads the very file the site imports and nothing else draws an icon.
 *
 * WHAT IT WRITES, all into `static/IDEA/` under the filenames `src/app.html`
 * and `static/manifest.webmanifest` already name:
 *
 *   favicon.svg            Home, no status: `icon('gearkey', 'home')`. The live
 *                          icon puts this file back whenever the tab is at rest.
 *   favicon.ico            16 and 32 px PNG frames of the same drawing, in an
 *                          ICO container written by hand (`./png.mjs`).
 *   apple-touch-icon.png   180 px from `appIcon('ios')`. RGB, no alpha channel:
 *                          iOS paints every transparent pixel black.
 *   icon-192.png           from `appIcon('android')`, the key on transparency.
 *   icon-512.png           the same at 512.
 *   icon-maskable-512.png  from `appIcon('maskable')`, RGB, edge to edge.
 *
 * Every other file in `static/IDEA/` is left alone: legacy pages, the Coin
 * Ledger and the push service worker name some of them.
 *
 * HOW IT RASTERISES. playwright-core and the container's Chromium (the
 * launcher `tools/browser-verify/browser.mjs` already resolves), at device
 * scale 1, each size drawn from the vector at its own width (never scaled
 * from a master), screenshotted with the background omitted so transparency
 * survives. Chromium's PNG is decoded and re-encoded by `./png.mjs`, which is
 * what lets the iOS and maskable icons drop their alpha channel entirely.
 *
 * IT REFUSES TO WRITE A WRONG ICON. Before anything is written it checks what
 * each icon must be: the favicon and Android corners fully transparent with an
 * opaque key inside (no black or white square behind it), and the iOS and
 * maskable icons opaque in every pixel. A failed check exits non-zero and
 * writes nothing.
 */
import { writeFileSync } from 'node:fs';
import { appIcon, icon } from '../../src/lib/tab-icon/geometry.ts';
import { launch } from '../browser-verify/browser.mjs';
import { decodePng, encodeIco, encodePng } from './png.mjs';

const OUT = new URL('../../static/IDEA/', import.meta.url);

const favicon = icon('gearkey', 'home', null);

async function rasterize(page, svg, size) {
	const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(
		`<!doctype html><html style="background:transparent"><body style="margin:0;background:transparent">` +
			`<img id="i" src="${uri}" width="${size}" height="${size}" style="display:block"></body></html>`
	);
	await page.waitForFunction(() => {
		const img = document.getElementById('i');
		return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
	});
	const shot = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
	const img = decodePng(shot);
	if (img.width !== size || img.height !== size) throw new Error(`rendered ${img.width}x${img.height}, wanted ${size}`);
	return img;
}

const alphaAt = (img, x, y) => img.rgba[(y * img.width + x) * 4 + 3];

/** Corners transparent, centre opaque: the key on nothing. */
function checkTransparentKey(name, img) {
	const s = img.width - 1;
	const corners = [alphaAt(img, 0, 0), alphaAt(img, s, 0), alphaAt(img, 0, s), alphaAt(img, s, s)];
	if (corners.some((a) => a !== 0)) throw new Error(`${name}: a corner is not transparent (alpha ${corners.join(', ')})`);
	const mid = Math.floor(img.width / 2);
	if (alphaAt(img, mid, mid) !== 255) throw new Error(`${name}: the centre is not opaque`);
	// Along the top edge, outside the key's rounded corner, nothing may be
	// painted: a black or white field would show here first.
	const edge = Math.floor(img.width * 0.06);
	for (let x = 0; x < edge; x++) {
		if (alphaAt(img, x, 0) !== 0) throw new Error(`${name}: pixel ${x},0 outside the key is painted`);
	}
}

function checkOpaque(name, img) {
	for (let i = 3; i < img.rgba.length; i += 4) {
		if (img.rgba[i] !== 255) throw new Error(`${name}: a pixel is not fully opaque`);
	}
}

const { browser, executablePath } = await launch();
const files = new Map();
try {
	const context = await browser.newContext({ deviceScaleFactor: 1 });
	const page = await context.newPage();

	const f16 = await rasterize(page, favicon, 16);
	const f32 = await rasterize(page, favicon, 32);
	checkTransparentKey('favicon 16', f16);
	checkTransparentKey('favicon 32', f32);
	files.set(
		'favicon.ico',
		encodeIco([
			{ width: 16, height: 16, png: encodePng(f16, { alpha: true }) },
			{ width: 32, height: 32, png: encodePng(f32, { alpha: true }) }
		])
	);

	const ios = await rasterize(page, appIcon('gearkey', 'ios'), 180);
	checkOpaque('apple-touch-icon', ios);
	files.set('apple-touch-icon.png', encodePng(ios, { alpha: false }));

	for (const size of [192, 512]) {
		const a = await rasterize(page, appIcon('gearkey', 'android'), size);
		checkTransparentKey(`icon-${size}`, a);
		files.set(`icon-${size}.png`, encodePng(a, { alpha: true }));
	}

	const m = await rasterize(page, appIcon('gearkey', 'maskable'), 512);
	checkOpaque('icon-maskable-512', m);
	files.set('icon-maskable-512.png', encodePng(m, { alpha: false }));

	files.set('favicon.svg', Buffer.from(favicon + '\n'));
	await context.close();
} finally {
	await browser.close();
}

for (const [name, bytes] of files) {
	writeFileSync(new URL(name, OUT), bytes);
	console.log(`wrote static/IDEA/${name} (${bytes.length} bytes)`);
}
console.log(`rasterised with ${executablePath}`);
