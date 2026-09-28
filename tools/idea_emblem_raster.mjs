/**
 * Renders the IDEA emblem's two SVG layers to the PNG copies the site serves,
 * and draws the board the light-console candidates are chosen from.
 *
 *   python3 tools/idea_logo_vector.py --emblem light <dir>
 *   node tools/idea_emblem_raster.mjs <dir> [light] [outdir]
 *   node tools/idea_emblem_raster.mjs --board <pngdir> <out.png> <dpr> <name[:Label]>...
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
 * Output lands in `static/IDEA/` beside the dark copies unless an `outdir` is
 * named (the board renders its candidates into a scratch directory that way):
 *   idea-logo-text-<variant>-<w>.png, idea-logo-text-<variant>.png
 *   idea-gear-<variant>-<g>.png,      idea-gear-<variant>.png
 *
 * THE BOARD (report R13, 2026-09-28) lays each rasterised variant out the way
 * `AnimatedLogo` does -- the gear layer behind the plate layer, the same
 * `srcset` and `sizes`, so the browser picks the copy it would pick on the
 * page -- on the grounds the emblem actually sits on under Space White: the
 * plate's header strip (the classroom header and the home masthead are both
 * that strip), a flat panel, and the same strip under the projector model
 * `tools/browser-verify/checks.mjs` measures against (a 300:1 projector with
 * ambient light at 10% of white). The name `dark` is special: it reads the
 * shipped dark copies from `static/IDEA/` and draws them on the dark plate's
 * strip, as the reference for what the emblem is on its own theme.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser-verify/browser.mjs';

/* Kept in step with AnimatedLogo.svelte by hand: four widths and a share. A
   width the component names and this file does not render is a 404 on the
   page, which the browser pass's resource probe reports. */
const TEXT_W = 2560;
const TEXT_H = 1204;
const GEAR = 1202;
const TEXT_WIDTHS = [128, 256, 512, 1024];
const GEAR_SHARE = GEAR / TEXT_W;
const STATIC_IDEA = new URL('../static/IDEA/', import.meta.url);

if (process.argv[2] === '--board') {
	await board(process.argv[3], process.argv[4], Number(process.argv[5] || 2), process.argv.slice(6));
} else {
	await raster(process.argv[2] ?? 'emblem', process.argv[3] ?? 'light', process.argv[4]);
}

async function raster(dir, variant, outdir) {
	const OUT = outdir ? pathToFileURL(resolve(outdir) + '/') : STATIC_IDEA;
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
}

/** The two layers as `AnimatedLogo` mounts them, at `width` CSS px. */
function emblem(base, infix, width) {
	const text = TEXT_WIDTHS.map((w) => `${base}idea-logo-text${infix}-${w}.png ${w}w`).join(', ') + `, ${base}idea-logo-text${infix}.png 2560w`;
	const gear =
		TEXT_WIDTHS.map((w) => {
			const g = Math.round(w * GEAR_SHARE);
			return `${base}idea-gear${infix}-${g}.png ${g}w`;
		}).join(', ') + `, ${base}idea-gear${infix}.png 1202w`;
	return `<div class="logo" style="width:${width}px"><img class="gear" src="${base}idea-gear${infix}.png" srcset="${gear}" sizes="${Math.round(width * GEAR_SHARE)}px" alt=""><img class="plate" src="${base}idea-logo-text${infix}.png" srcset="${text}" sizes="${width}px" alt=""></div>`;
}

async function board(pngdir, outPng, dpr, specs) {
	const base = pathToFileURL(resolve(pngdir) + '/').href;
	const rows = specs.map((s) => {
		const [name, ...rest] = s.split(':');
		return { name, label: rest.join(':') || name };
	});
	for (const r of rows) {
		const dir = r.name === 'dark' ? STATIC_IDEA : new URL(base);
		const f = r.name === 'dark' ? 'idea-logo-text-128.png' : `idea-logo-text-${r.name}-128.png`;
		if (!existsSync(new URL(f, dir))) throw new Error(`no raster for ${r.name}: ${new URL(f, dir).pathname}`);
	}
	/* The strip is plate.css's header rule with Space White's values (and the
	   dark plate's for the reference row); the panel is the theme's --bg1. */
	const cells = [
		{ head: 'Header, phone (56px)', ground: 'strip', w: 56 },
		{ head: 'Home, phone (72px)', ground: 'strip', w: 72 },
		{ head: 'Header, desktop (104px)', ground: 'strip', w: 104 },
		{ head: 'Panel (104px)', ground: 'panel', w: 104 },
		{ head: 'Projector wash (104px)', ground: 'strip wash', w: 104 },
		{ head: 'Large (260px)', ground: 'page', w: 260 }
	];
	const body = rows
		.map((r) => {
			const dark = r.name === 'dark';
			const b = dark ? STATIC_IDEA.href : base;
			const infix = dark ? '' : `-${r.name}`;
			return `<div class="row${dark ? ' dark' : ''}"><div class="label">${r.label}</div>${cells
				.map((c) => `<div class="cell ${c.ground}">${emblem(b, infix, c.w)}</div>`)
				.join('')}</div>`;
		})
		.join('');
	/* The projector model as a filter in linear light: L' = L(1 - 1/300) +
	   1/300 + 0.10, divided through by the washed white so the page's own white
	   stays white and only the darks lift, which is what the eye adapts to. */
	const k = 1 / 300 + 0.1;
	const top = 1 - 1 / 300 + k;
	const slope = ((1 - 1 / 300) / top).toFixed(5);
	const icpt = (k / top).toFixed(5);
	const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:16px;background:#e8eceb;font:13px/1.3 "DejaVu Sans",sans-serif;color:#0d1311}
.heads,.row{display:grid;grid-template-columns:150px repeat(5,140px) 290px;gap:6px;align-items:stretch;margin-bottom:6px}
.heads div{font-weight:bold;font-size:11px;color:#384340;padding:0 4px}
.label{font-weight:bold;padding:6px 4px;align-self:center}
.cell{display:flex;align-items:center;justify-content:center;min-height:84px;border-radius:2px}
.strip{background:linear-gradient(to bottom,#e4e8ee,#dfe3ea);box-shadow:inset 0 1px 0 0 #f6f8fb,inset 0 -1px 0 0 rgba(84,92,110,.42),inset 0 -2px 0 0 #f7f9fc}
.panel{background:#f7f9f9;box-shadow:inset 0 0 0 1px #6f7c78}
.page{background:linear-gradient(to bottom,#e4e8ee,#dfe3ea);min-height:150px}
.dark .strip,.dark .page{background:linear-gradient(to bottom,#161918,#121413);box-shadow:inset 0 1px 0 0 #2a2f2c}
.dark .panel{background:#101312;box-shadow:inset 0 0 0 1px #6f7b73}
.dark .label{color:#0d1311}
.wash{filter:url(#wash)}
.logo{position:relative;aspect-ratio:2560/1204;line-height:0}
.logo .gear{position:absolute;left:0;top:-1.2%;width:46.95%;height:auto}
.logo .plate{position:absolute;inset:0;width:100%;height:100%}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><filter id="wash" color-interpolation-filters="linearRGB"><feComponentTransfer>
<feFuncR type="linear" slope="${slope}" intercept="${icpt}"/><feFuncG type="linear" slope="${slope}" intercept="${icpt}"/><feFuncB type="linear" slope="${slope}" intercept="${icpt}"/>
</feComponentTransfer></filter></svg>
<div class="heads"><div></div>${cells.map((c) => `<div>${c.head}</div>`).join('')}</div>
${body}
</body></html>`;
	const htmlPath = resolve(pngdir, '_board.html');
	writeFileSync(htmlPath, html);
	const { browser } = await launch();
	try {
		/* Tall enough up front that the screenshot never resizes the viewport:
		   a resize re-runs `srcset` selection, and Chromium then prefers a
		   LARGER copy it already holds (the big column's), so a full-page
		   capture would show the 56px emblem downsampled from the 1024px copy,
		   which is not what a page that never loaded the big copy shows. The
		   picks are read before and after the capture and must agree. */
		const page = await browser.newPage({ deviceScaleFactor: dpr, viewport: { width: 1200, height: 140 + rows.length * 170 } });
		await page.goto(pathToFileURL(htmlPath).href);
		await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
		const picks = () => page.evaluate(() => [...document.images].map((i) => i.currentSrc.split('/').pop()).join(' '));
		const before = await picks();
		const box = await page.evaluate(() => {
			const r = document.body.getBoundingClientRect();
			return { x: 0, y: 0, width: Math.ceil(r.width), height: Math.ceil(r.height) };
		});
		const png = await page.screenshot({ clip: box });
		const after = await picks();
		if (before !== after) throw new Error(`srcset picks moved during the capture:\n${before}\n${after}`);
		writeFileSync(outPng, png);
		console.log(`${outPng}  dpr ${dpr}  ${png.length} bytes  first row: ${before.split(' ').slice(0, 6).join(', ')}`);
	} finally {
		await browser.close();
	}
}
