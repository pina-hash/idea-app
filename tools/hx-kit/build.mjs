#!/usr/bin/env node
/**
 * IDEA HTML assignment kit: build one self-contained document from a source.
 *
 *   node tools/hx-kit/build.mjs <assignment.src.html> [-o <out.html>]
 *
 * The source is ordinary HTML with two markers the author never writes code
 * for. The plumbing (fonts, design-system tokens, Plate components, the
 * assignment components, the bridge and the step navigator) lives in kit/ and
 * is inlined here, so a fix to the plumbing reaches every assignment on its
 * next build and no author has to remember it.
 *
 *   <!-- hx:head -->    in <head>: embedded fonts, tokens for both themes,
 *                       plate.css, kit.css
 *   <!-- hx:script -->  last thing in <body>: bridge.js then kit.js
 *
 * Output goes beside the source as <name>.html (".src" dropped) unless -o.
 * The importer's 2 MB cap is checked here; the full checks are test.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve, hex, rgbToOklch, oklchToRgb, toHex } from './color.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, 'kit');
const REPO = resolve(HERE, '..', '..');
const MAX_BYTES = 2 * 1024 * 1024; // HTML_DOCUMENT_MAX_BYTES in src/lib/classroom/html-assignment/store.ts

/** Both themes from the design system's tokens.json, as custom properties.
    `idea` is dark and the default; `space-white` answers data-theme="light",
    which is what the bridge sets from idea:theme. */
export function tokensCss(tokens) {
	const dark = [];
	const light = [];
	const flat = [];
	for (const t of tokens.color.tokens) {
		dark.push(`--${t.name}:${t.value.idea}`);
		light.push(`--${t.name}:${t.value['space-white']}`);
	}
	for (const t of tokens.shadow.tokens) {
		if (typeof t.value === 'string') flat.push(`--${t.name}:${t.value}`);
		else {
			dark.push(`--${t.name}:${t.value.idea}`);
			light.push(`--${t.name}:${t.value['space-white']}`);
		}
	}
	for (const group of ['spacing', 'radius', 'size']) {
		for (const t of tokens[group].tokens) flat.push(`--${t.name}:${t.value}`);
	}
	flat.push(`--font-display:${tokens.type.families.display}`);
	flat.push(`--font-mono:${tokens.type.families.mono}`);
	return (
		`:root{${flat.join(';')}}\n` +
		`:root,:root[data-theme="dark"]{color-scheme:dark;${dark.join(';')}}\n` +
		`:root[data-theme="light"]{color-scheme:light;${light.join(';')}}\n`
	);
}

/** The site's own faces as data: URIs (font-src data: since ledger 0351). */
export function fontsCss() {
	const dir = join(REPO, 'node_modules', '@fontsource');
	const faces = [
		['Rajdhani', 500, 'rajdhani/files/rajdhani-latin-500-normal.woff2'],
		['Rajdhani', 600, 'rajdhani/files/rajdhani-latin-600-normal.woff2'],
		['Rajdhani', 700, 'rajdhani/files/rajdhani-latin-700-normal.woff2'],
		['Share Tech Mono', 400, 'share-tech-mono/files/share-tech-mono-latin-400-normal.woff2']
	];
	return faces
		.map(([family, weight, file]) => {
			let b64;
			try {
				b64 = readFileSync(join(dir, file)).toString('base64');
			} catch {
				throw new Error(`Font missing: ${file}. Run npm ci in the repo first.`);
			}
			return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
		})
		.join('\n');
}

/** Which kit and which standard built this page, as two meta tags the site's
    kit-health list reads (2026-10-28): the last commit that touched tools/hx-kit,
    its date, and the standard's version line. */
export function kitStamp() {
	let sha = 'unknown', date = 'unknown', std = 'unknown';
	try {
		const out = execFileSync('git', ['-C', REPO, 'log', '-1', '--format=%h %cs', '--', 'tools/hx-kit'], { encoding: 'utf8' }).trim();
		if (out) [sha, date] = out.split(' ');
	} catch {}
	try {
		const m = readFileSync(join(REPO, 'docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md'), 'utf8').match(/\*\*Version ([0-9.]+)/);
		if (m) std = m[1];
	} catch {}
	return `<meta name="hx-kit" content="${sha} ${date}">\n<meta name="hx-standard" content="${std}">\n`;
}

export function kitHead() {
	const tokens = JSON.parse(readFileSync(join(KIT, 'tokens.json'), 'utf8'));
	return (
		kitStamp() +
		`<style id="hx-kit-css">\n/* hx-kit: fonts, design-system tokens (${tokens.meta?.ref ?? 'unknown ref'}, synced ${tokens.meta?.synced ?? '?'}), Plate, kit. Rebuilt by tools/hx-kit/build.mjs; edit the kit, not this block. */\n` +
		fontsCss() +
		'\n' +
		tokensCss(tokens) +
		readFileSync(join(KIT, 'plate.css'), 'utf8') +
		'\n' +
		readFileSync(join(KIT, 'kit.css'), 'utf8') +
		'\n</style>'
	);
}

export function kitScript() {
	for (const f of ['bridge.js', 'kit.js', 'team.js', 'camera.js']) {
		if (/<\/script/i.test(readFileSync(join(KIT, f), 'utf8'))) throw new Error(`kit/${f} contains a closing script tag, which would end the inlined script early.`);
	}
	return (
		'<script id="hx-kit-js">\n/* hx-kit: bridge and step navigator. Rebuilt by tools/hx-kit/build.mjs; edit the kit, not this block. */\n' +
		readFileSync(join(KIT, 'bridge.js'), 'utf8') +
		'\n' +
		readFileSync(join(KIT, 'kit.js'), 'utf8') +
		'\n' +
		readFileSync(join(KIT, 'team.js'), 'utf8') +
		'\n' +
		readFileSync(join(KIT, 'camera.js'), 'utf8') +
		'\n</script>'
	);
}

export function build(source) {
	if (!source.includes('<!-- hx:head -->')) throw new Error('The source has no <!-- hx:head --> marker in <head>.');
	if (!source.includes('<!-- hx:script -->')) throw new Error('The source has no <!-- hx:script --> marker at the end of <body>.');
	if (/<script[^>]*>[\s\S]*?\bhxStart\(\)/.test(source.replace(/<!-- hx:script -->/, '')))
		throw new Error('The source calls hxStart() itself. The kit starts the page; remove that call.');
	return source.replace('<!-- hx:head -->', () => kitHead() + paletteCss(source)).replace('<!-- hx:script -->', () => kitScript());
}

/* ---- Content colors (AUTHORING D3) ---------------------------------------
   Every color an assignment uses has a name, a meaning and an anchor. The kit's
   library is kit/colors.json; a source adds its own in a JSON block
   <script type="application/json" id="hx-colors">{"name": {"anchor": "#hex",
   "means": "what it stands for"}}</script>. An element takes one with
   data-color="name"; a phase takes one with "color" in hx-plan-data, and its
   steps and progress segments inherit it. Each used color is solved separately
   for each theme (color.mjs solve) into --hx-ink (text), --hx-fill (marks,
   badges, bands), --hx-on (text on the fill), --hx-line (an edge) and --hx-wash
   (a quiet tint), so a yellow is a bright fill on the white theme and never a
   brown outline. The older data-hue-from/to on <html> still builds: it becomes
   eleven solved stops t0 to t10 along that arc, which kit.js gives any phase
   without a color. */
const GREEN_BAND = [120, 160]; // the site's green means done (AUTHORING D2)

export function library() {
	return JSON.parse(readFileSync(join(KIT, 'colors.json'), 'utf8')).colors;
}

/** The two themes' grounds, from the same tokens the page is built with. */
export function themes(tokens) {
	const v = (name, theme) => hex(tokens.color.tokens.find((t) => t.name === name).value[theme]);
	const grounds = (theme) => ['panel-top', 'panel-bot', 'page-top', 'page-bot'].map((n) => v(n, theme));
	return { dark: { dark: true, panels: grounds('idea') }, light: { dark: false, panels: grounds('space-white') } };
}

export function palette(source) {
	const tag = (source.match(/<html\b[^>]*>/i) || [''])[0];
	const num = (name) => {
		const m = tag.match(new RegExp(`\\b${name}="(-?\\d+(?:\\.\\d+)?)"`));
		return m ? Number(m[1]) : NaN;
	};
	const from = num('data-hue-from');
	const to = num('data-hue-to');
	const chroma = num('data-hue-chroma');
	if (Number.isFinite(chroma) && (chroma < 0 || chroma > 1.5)) throw new Error('data-hue-chroma is a multiplier between 0 and 1.5.');
	const lib = library();
	const own = source.match(/<script[^>]*id="hx-colors"[^>]*>([\s\S]*?)<\/script>/);
	if (own) {
		let extra;
		try { extra = JSON.parse(own[1]); } catch (e) { throw new Error(`hx-colors is not valid JSON: ${e.message}`); }
		for (const [name, c] of Object.entries(extra)) {
			if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`hx-colors: "${name}" is not a color name (lowercase, digits, hyphens).`);
			if (!c || !/^#[0-9a-f]{6}$/i.test(c.anchor || '')) throw new Error(`hx-colors: "${name}" needs an anchor, a #rrggbb value taken from the real thing.`);
			if (!c.means) throw new Error(`hx-colors: "${name}" needs "means": what it stands for, in the student's terms.`);
			lib[name] = { ...c, source: c.source || 'this assignment', status: c.status || 'author' };
		}
	}
	const plan = (source.match(/<script[^>]*id="hx-plan-data"[^>]*>([\s\S]*?)<\/script>/) || [])[1];
	const phaseColors = plan ? [...plan.matchAll(/"color"\s*:\s*"([^"]+)"/g)].map((m) => m[1]) : [];
	const used = new Set([...source.matchAll(/\bdata-color="([^"]+)"/g)].map((m) => m[1]).filter((n) => !/^t\d+$/.test(n)));
	phaseColors.forEach((n) => used.add(n));
	for (const n of used) if (!lib[n]) throw new Error(`Color "${n}" is not in kit/colors.json or this source's hx-colors block. Add it with an anchor and what it means.`);
	for (const n of phaseColors) {
		const H = rgbToOklch(hex(lib[n].anchor)).H;
		if (lib[n].identityOnly) throw new Error(`"${n}" cannot color a phase: ${lib[n].identityOnly}.`);
		if (H >= GREEN_BAND[0] && H <= GREEN_BAND[1] && rgbToOklch(hex(lib[n].anchor)).C > 0.04) throw new Error(`"${n}" is in the site's green, which means done. A phase cannot wear it.`);
	}
	const arc = Number.isFinite(from) && Number.isFinite(to) ? { from, to, chroma: Number.isFinite(chroma) ? chroma : 1 } : null;
	if (!arc && !phaseColors.length && plan)
		throw new Error('Give each phase a color: "color" on each phase in hx-plan-data, a name from kit/colors.json or hx-colors, picked from the real subject. There is no default.');
	const named = {};
	for (const n of used) named[n] = lib[n];
	if (arc) for (let i = 0; i <= 10; i++) {
		const h = arc.from + ((arc.to - arc.from) * i) / 10;
		named[`t${i}`] = { anchor: toHex(oklchToRgb(0.68, 0.14 * arc.chroma, ((h % 360) + 360) % 360)), means: `stop ${i} of the data-hue arc`, source: 'data-hue on <html>', status: 'arc' };
	}
	return { arc, phaseColors, colors: named };
}

/** Solve every used color for both themes. */
export function solvePalette(source, tokens) {
	const p = palette(source);
	const th = themes(tokens);
	const solved = {};
	for (const [n, c] of Object.entries(p.colors)) solved[n] = { ...c, dark: solve(c.anchor, th.dark), light: solve(c.anchor, th.light) };
	return { ...p, solved };
}

export function paletteCss(source, tokens = JSON.parse(readFileSync(join(KIT, 'tokens.json'), 'utf8'))) {
	const { solved, arc } = solvePalette(source, tokens);
	const vars = (s) => `--hx-ink:${s.ink};--hx-fill:${s.fill};--hx-on:${s.on};--hx-line:${s.line};--hx-wash:${s.wash};--trk:${s.fill};--trk-ink:${s.ink}`;
	const rules = Object.entries(solved).flatMap(([n, s]) => [`[data-color="${n}"]{${vars(s.dark)}}`, `:root[data-theme="light"] [data-color="${n}"]{${vars(s.light)}}`]);
	const meta = JSON.stringify({ arc, colors: Object.fromEntries(Object.entries(solved).map(([n, s]) => [n, { anchor: s.anchor, means: s.means, status: s.status, dark: s.dark, light: s.light }])) });
	return `\n<style id="hx-palette">\n${rules.join('\n')}\n</style>\n<script type="application/json" id="hx-palette-data">${meta.replace(/</g, '\\u003c')}</script>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);
	const src = args.find((a) => !a.startsWith('-'));
	const oIdx = args.indexOf('-o');
	if (!src) {
		console.error('usage: node tools/hx-kit/build.mjs <assignment.src.html> [-o <out.html>]');
		process.exit(2);
	}
	const out = oIdx >= 0 ? args[oIdx + 1] : join(dirname(src), basename(src).replace(/\.src\.html$/, '.html').replace(/^(?!.*\.html$)(.*)$/, '$1.html'));
	if (resolve(out) === resolve(src)) {
		console.error('Refusing to overwrite the source. Name it <name>.src.html or pass -o.');
		process.exit(2);
	}
	const html = build(readFileSync(src, 'utf8'));
	const bytes = Buffer.byteLength(html, 'utf8');
	writeFileSync(out, html);
	const pct = ((bytes / MAX_BYTES) * 100).toFixed(1);
	console.log(`wrote ${out}  ${(bytes / 1024).toFixed(1)} KB  (${pct}% of the 2 MB import cap)`);
	if (bytes > MAX_BYTES) {
		console.error('OVER the 2 MB cap: the importer will refuse it. Shrink the media (AUTHORING, media budget).');
		process.exit(1);
	}
}
