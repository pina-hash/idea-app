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
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export function kitHead() {
	const tokens = JSON.parse(readFileSync(join(KIT, 'tokens.json'), 'utf8'));
	return (
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
	for (const f of ['bridge.js', 'kit.js']) {
		if (/<\/script/i.test(readFileSync(join(KIT, f), 'utf8'))) throw new Error(`kit/${f} contains a closing script tag, which would end the inlined script early.`);
	}
	return (
		'<script id="hx-kit-js">\n/* hx-kit: bridge and step navigator. Rebuilt by tools/hx-kit/build.mjs; edit the kit, not this block. */\n' +
		readFileSync(join(KIT, 'bridge.js'), 'utf8') +
		'\n' +
		readFileSync(join(KIT, 'kit.js'), 'utf8') +
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

/** The subject palette, read off <html> and written as the custom properties
    kit.css colors every phase from. Until 2026-10-26 nothing read these
    attributes, so every kit page showed kit.css's old cyan-to-violet default
    whatever its author chose; this is the one place they are read. */
export function palette(source) {
	const tag = (source.match(/<html\b[^>]*>/i) || [''])[0];
	const num = (name) => {
		const m = tag.match(new RegExp(`\\b${name}="(-?\\d+(?:\\.\\d+)?)"`));
		return m ? Number(m[1]) : NaN;
	};
	const from = num('data-hue-from');
	const to = num('data-hue-to');
	const chroma = num('data-hue-chroma');
	if (!Number.isFinite(from) || !Number.isFinite(to))
		throw new Error('Set the subject palette on <html>: data-hue-from and data-hue-to (OKLCH degrees), picked from the real subject. There is no default.');
	if (Number.isFinite(chroma) && (chroma < 0 || chroma > 1.5)) throw new Error('data-hue-chroma is a multiplier between 0 and 1.5.');
	return { from, to, chroma: Number.isFinite(chroma) ? chroma : 1 };
}

export function paletteCss(source) {
	const p = palette(source);
	return `\n<style id="hx-palette">:root{--hx-from:${p.from};--hx-to:${p.to};--hx-cs:${p.chroma}}</style>`;
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
