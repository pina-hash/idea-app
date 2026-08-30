#!/usr/bin/env node
// ONE-SHOT script that performed the routes.mjs -> routes/*.mjs split. Kept for
// provenance (how the 25 files were produced, byte for byte, from the original
// array) rather than as a tool anyone runs again -- a second run would refuse,
// since routes/*.mjs already exist and this script does not overwrite them.
//
// Splits `export const ROUTES = [ {...}, {...}, ... ]` in the ORIGINAL
// routes.mjs (read from a pinned git revision, not the working tree, so this
// stays runnable after routes.mjs has already been replaced with the
// assembler) into one file per element, preserving each element's source text
// exactly except for a one-tab dedent (array member -> top-level default
// export) and a prepended SETTLE_ENTRANCE import where the body references it.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PINNED_REV = 'b4ceb02b44894d107d5373d7b9058fb12f7213be:tools/browser-verify/routes.mjs';
const OUT_DIR = new URL('../', import.meta.url).pathname;

const src = execFileSync('git', ['show', PINNED_REV], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 8 });
const lines = src.split('\n');

const starts = [];
const ends = [];
lines.forEach((l, i) => {
	if (l === '\t{') starts.push(i);
	if (l === '\t},' || l === '\t}') ends.push(i);
});
if (starts.length !== 25 || ends.length !== 25) {
	throw new Error(`expected 25 route boundaries, found starts=${starts.length} ends=${ends.length}`);
}

const slugify = (path) =>
	path
		.replace(/^\/dev\//, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

const seen = new Set();
for (let i = 0; i < 25; i++) {
	const body = lines.slice(starts[i] + 1, ends[i]).map((l) => (l.startsWith('\t') ? l.slice(1) : l));
	const text = body.join('\n');
	const m = /path: '([^']*)'/.exec(text);
	if (!m) throw new Error(`route ${i} has no path:`);
	const slug = slugify(m[1]);
	if (seen.has(slug)) throw new Error(`slug collision: ${slug}`);
	seen.add(slug);

	const usesSettle = /\bSETTLE_ENTRANCE\b/.test(text);
	const header = usesSettle ? "import { SETTLE_ENTRANCE } from './_shared.mjs';\n\n" : '';
	const out = `${header}// original array position ${i + 1} of 25 -- see ../README.md for what \`order\` means\nexport const order = ${i + 1};\n\nexport default {\n${text}\n};\n`;

	const outPath = `${OUT_DIR}${slug}.mjs`;
	if (existsSync(outPath)) {
		console.error(`skip (exists): ${outPath}`);
		continue;
	}
	writeFileSync(outPath, out);
	console.error(`wrote ${outPath}`);
}
