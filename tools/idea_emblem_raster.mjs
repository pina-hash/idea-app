/**
 * Renders the IDEA emblem's two SVG layers to the PNG copies the site serves.
 *
 *   python3 tools/idea_logo_vector.py --emblem light <dir>
 *   node tools/idea_emblem_raster.mjs <dir> [light]
 *
 * THE GEOMETRY IS NOT HERE. `tools/idea_logo_vector.py` is the one place the
 * emblem's geometry and palette are written (CLAUDE.md, Commands); this file
 * only turns its SVG output into pixels. It exists because this container has
 * no cairosvg and no Pillow, and the Chromium the browser pass already uses
 * (`tools/browser-verify/browser.mjs`) rasterises SVG correctly.
 *
 * EACH SIZE IS RENDERED FROM THE VECTOR AT ITS OWN WIDTH, never downsampled
 * from a master, so a 128px copy is drawn at 128px with the renderer's own
 * anti-aliasing. The widths are the ones `AnimatedLogo.svelte` names in its
 * `srcset` (TEXT_WIDTHS, and the gear at the same 1202/2560 share), plus the
 * full-size masters the component keeps as its `src` fallback. The background
 * is transparent (`omitBackground`), because the emblem sits on whatever the
 * masthead's ground is.
 *
 * Output lands in `static/IDEA/` beside the dark copies:
 *   idea-logo-text-<variant>-<w>.png, idea-logo-text-<variant>.png
 *   idea-gear-<variant>-<g>.png,      idea-gear-<variant>.png
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './browser-verify/browser.mjs';

const dir = process.argv[2] ?? 'emblem';
const variant = process.argv[3] ?? 'light';
const OUT = new URL('../static/IDEA/', import.meta.url);

/* Kept in step with AnimatedLogo.svelte by hand: four widths and a share. A
   width the component names and this file does not render is a 404 on the
   page, which the browser pass's resource probe reports. */
const TEXT_W = 2560;
const TEXT_H = 1204;
const GEAR = 1202;
const TEXT_WIDTHS = [128, 256, 512, 1024];
const GEAR_SHARE = GEAR / TEXT_W;

const jobs = [
	...TEXT_WIDTHS.map((w) => ({ src: `idea-logo-text-${variant}.svg`, w, h: Math.round((w * TEXT_H) / TEXT_W), out: `idea-logo-text-${variant}-${w}.png` })),
	{ src: `idea-logo-text-${variant}.svg`, w: TEXT_W, h: TEXT_H, out: `idea-logo-text-${variant}.png` },
	...TEXT_WIDTHS.map((w) => {
		const g = Math.round(w * GEAR_SHARE);
		return { src: `idea-gear-${variant}.svg`, w: g, h: g, out: `idea-gear-${variant}-${g}.png` };
	}),
	{ src: `idea-gear-${variant}.svg`, w: GEAR, h: GEAR, out: `idea-gear-${variant}.png` }
];

const { browser } = await launch();
try {
	const page = await browser.newPage({ deviceScaleFactor: 1 });
	for (const j of jobs) {
		const svg = readFileSync(join(dir, j.src));
		const uri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
		await page.setViewportSize({ width: j.w, height: j.h });
		await page.setContent(
			`<!doctype html><html><body style="margin:0;background:transparent"><img id="e" src="${uri}" width="${j.w}" height="${j.h}" style="display:block"></body></html>`
		);
		await page.waitForFunction(() => {
			const i = document.getElementById('e');
			return i && i.complete && i.naturalWidth > 0;
		});
		const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: j.w, height: j.h } });
		writeFileSync(new URL(j.out, OUT), png);
		console.log(`${j.out}  ${j.w}x${j.h}  ${png.length} bytes`);
	}
} finally {
	await browser.close();
}
