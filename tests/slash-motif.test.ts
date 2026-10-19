// tests/slash-motif.test.ts
//
// NO `//` AS A SEPARATOR IN ANYTHING THE SITE RENDERS (decision 69, ledger
// 0416, report 48f505c1). The IDEA Design System retired the motif; the live
// site still read "Name // IDEA" in 135 page titles and "IDEA // X" in its
// eyebrows. The separator is a middle dot now ("IDEA · Certifications").
//
// What is swept: every `.svelte`, `.ts` and `.css` file under `src/` except
// the frozen legacy HTML (`src/lib/legacy/`, which the freeze forbids editing)
// and the `/dev` harnesses. What counts as rendered: a `<title>`, markup text
// outside `<script>`, `<style>` and comments, a string or template literal
// outside a comment, and a CSS `content:`. A code comment saying `//` is code.
//
// The named exceptions below are each a real name or presented content, with
// the reason.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Lines that keep `//` on purpose, by file and the text they contain. */
const EXCEPTIONS: Array<{ file: string; contains: string; why: string }> = [
	{ file: 'src/routes/gauntlet/speedrun/quickstart/+page.svelte', contains: 'The add-in is "IDEA // GAUNTLET" in SolidWorks', why: "The SolidWorks add-in's own name, which a student looks for in SolidWorks' Add-Ins list." },
	{ file: 'src/routes/gauntlet/tools/+page.svelte', contains: 'check IDEA // GAUNTLET (both columns)', why: "The same add-in's name, as SolidWorks lists it." }
];
/** Whole files of presented content, not the site's chrome. */
const SKIP_FILES = new Map<string, string>([['src/lib/fsp/day1-slides.ts', "The archived Family Science Program deck's slide bodies, as presented that summer."]]);

function walk(dir: string, out: string[] = []): string[] {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

const FILES = walk(join(ROOT, 'src'))
	.map((p) => relative(ROOT, p).split('\\').join('/'))
	.filter((p) => /\.(svelte|ts|css)$/.test(p) && !p.includes('.generated.'))
	.filter((p) => !p.startsWith('src/lib/legacy/') && !p.startsWith('src/routes/dev/') && !SKIP_FILES.has(p));

/** A separator: a word or a closing brace, ` // `, a word or an opening brace. */
const SEPARATOR = /[\w})\].!?'"’] \/\/ [\w{([<$&'"]/;

/** The rendered parts of a JS or TS source: its string and template literals, comments dropped. */
export function jsLiterals(src: string): string[] {
	const out: string[] = [];
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		const n = src[i + 1];
		if (c === '/' && n === '/') {
			const j = src.indexOf('\n', i);
			i = j < 0 ? src.length : j;
			continue;
		}
		if (c === '/' && n === '*') {
			const j = src.indexOf('*/', i + 2);
			i = j < 0 ? src.length : j + 2;
			continue;
		}
		if (c === "'" || c === '"' || c === '`') {
			let j = i + 1;
			let depth = 0;
			while (j < src.length) {
				const d = src[j];
				if (d === '\\') {
					j += 2;
					continue;
				}
				if (c === '`' && d === '$' && src[j + 1] === '{') {
					depth += 1;
					j += 2;
					continue;
				}
				if (c === '`' && depth && d === '}') {
					depth -= 1;
					j += 1;
					continue;
				}
				if ((d === c && depth === 0) || (d === '\n' && c !== '`')) break;
				j += 1;
			}
			out.push(src.slice(i, j + 1));
			i = j + 1;
			continue;
		}
		i += 1;
	}
	return out;
}

/** The rendered parts of a Svelte file: markup text (comments out) and every script's literals. */
export function svelteRendered(src: string): string[] {
	const out: string[] = [];
	for (const m of src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) out.push(...jsLiterals(m[1]));
	const markup = src
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ')
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ');
	// Expressions are code: their literals are rendered, their comments are not.
	for (const m of markup.matchAll(/\{([^{}]*)\}/g)) out.push(...jsLiterals(m[1]));
	out.push(...markup.split('\n'));
	return out;
}

function offenders(file: string, text: string): string[] {
	const parts = file.endsWith('.svelte') ? svelteRendered(text) : file.endsWith('.ts') ? jsLiterals(text) : [];
	const hits: string[] = [];
	for (const part of parts) {
		for (const line of part.split('\n')) {
			const bare = line.replace(/[a-z][a-z0-9+.-]*:\/\/\S*/gi, ' ');
			if (!SEPARATOR.test(bare)) continue;
			if (EXCEPTIONS.some((e) => e.file === file && line.includes(e.contains))) continue;
			hits.push(`${file}: ${line.trim().slice(0, 140)}`);
		}
	}
	// A CSS `content:` that draws the motif, in a stylesheet or a component's style block.
	for (const m of text.matchAll(/content:\s*(['"])\s*\/\/\s*\1/g)) hits.push(`${file}: ${m[0]}`);
	return [...new Set(hits)];
}

describe('no `//` separator in what the site renders (decision 69)', () => {
	it('sweeps a real set of files', () => {
		expect(FILES.length).toBeGreaterThan(1500);
		expect(FILES.filter((f) => f.endsWith('.svelte')).length).toBeGreaterThan(400);
	});

	it('no page title, eyebrow, label or stylesheet uses it', () => {
		const found = FILES.flatMap((f) => offenders(f, readFileSync(join(ROOT, f), 'utf8')));
		expect(found).toEqual([]);
	});

	it('every page title is still a title: the middle dot took the separator\'s place', () => {
		const titles = FILES.filter((f) => f.endsWith('.svelte')).flatMap((f) =>
			[...readFileSync(join(ROOT, f), 'utf8').matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1])
		);
		expect(titles.length).toBeGreaterThan(100);
		expect(titles.filter((t) => t.includes(' · ')).length).toBeGreaterThan(100);
	});

	it('every exception still names a line that exists, so none goes stale', () => {
		for (const e of EXCEPTIONS) expect(readFileSync(join(ROOT, e.file), 'utf8'), e.why).toContain(e.contains);
		for (const [f, why] of SKIP_FILES) expect(readFileSync(join(ROOT, f), 'utf8').length, why).toBeGreaterThan(0);
	});

	it('POSITIVE CONTROLS: the sweep finds the motif in a title, an eyebrow, a literal and a style, and not in a comment or a URL', () => {
		expect(offenders('x.svelte', '<svelte:head><title>{name} // IDEA</title></svelte:head>')).toHaveLength(1);
		expect(offenders('x.svelte', '<div class="eyebrow">IDEA // Coins</div>')).toHaveLength(1);
		expect(offenders('x.ts', "export const EYEBROW = 'IDEA // Certifications';")).toHaveLength(1);
		expect(offenders('x.ts', 'const t = `${a} // ${b}`;')).toHaveLength(1);
		expect(offenders('x.css', "h2::before { content: '// '; }")).toHaveLength(1);
		expect(offenders('x.ts', 'const a = 1; // a comment // with slashes')).toEqual([]);
		expect(offenders('x.svelte', '<!-- the old IDEA // look -->\n<a href="https://ideabosco.com">site</a>')).toEqual([]);
		expect(offenders('x.ts', "const u = 'https://ideabosco.com/coins';")).toEqual([]);
	});
});
