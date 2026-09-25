// tests/no-global-document-lock.test.ts
//
// NO COMPONENT MAY STYLE THE WHOLE DOCUMENT UNLESS THE RULE SWITCHES ITSELF
// OFF WHEN THE COMPONENT IS GONE.
//
// THE DEFECT (ledger 0298, reports R29 and R07). `IdeaCadApp.svelte` carried
// `:global(html), :global(body) { overflow: hidden; height: 100% }`. Svelte
// compiles a `:global()` rule into the component's stylesheet with nothing
// scoping it; that stylesheet arrives the moment the component's MODULE is
// imported (mounted or not), and a client-side navigation never removes a
// route's stylesheet. So after one visit to IdeaCAD by a link, every later
// page in the tab was cut off at the window with no scrollbar until a reload.
// Measured in Chromium on the unfixed tree: html and body `overflow: hidden`,
// scrollY 0 after scrolling to the end, on a page whose content runs 9177px.
//
// WHY THIS IS A TEST AND NOT A HARNESS. The failure is SILENT everywhere a
// person checks: the page that carries the rule looks right, a fresh load of
// any other page looks right, and `svelte-check` has nothing to say. It only
// shows on the page you reach NEXT, by a link, which is exactly what nobody
// looks at. CLAUDE.md's Testing section admits a test for that class.
//
// THE RULE, IN TWO HALVES.
//  1. A compiled rule whose SUBJECT is `html`, `body` or `:root` (the last
//     compound of the selector, so `:root[data-theme=x] .card` is about
//     `.card` and is fine) must carry a `:has(` somewhere in its selector. That
//     is the repo's own room convention (`body:has(.lp-root)` in
//     ProjectorView, `body:has(.tv.fixed)` in TvStage, `body:has(.cr-root)` in
//     classroom.css): the rule is true only while the room is on the page, so
//     a stylesheet left behind by a navigation matches nothing. A theme
//     attribute is NOT a room: `:root[data-theme=x] { ... }` still outlives
//     the page that carried it.
//  2. A compiled rule that names NO class, id, attribute or `:has(` at all
//     (`main`, `a`, `*`) matches something on every page, so it leaks the same
//     way whatever its subject. IdeaCAD's own route layout carried
//     `:global(main) { max-width: none; margin: 0; padding: 0 }`, which took
//     the reading column and the padding off every later page that leaned on
//     app.css's `main` (in a production build, where that layout's sheet lands
//     after app.css). A class inside `:not()` scopes nothing.
// The other answer to both, and the one IdeaCAD took, is a `position: fixed;
// inset: 0` shell that needs no document rule at all.
//
// IT READS WHAT SVELTE EMITS, NOT WHAT THE SOURCE SAYS. Each candidate file is
// compiled with the real compiler and its OUTPUT stylesheet is parsed. That
// resolves every spelling of `:global` (`:global(x)`, a bare `:global x`, a
// `:global {}` block) the way the build does, drops unused selectors the way
// the build does, and leaves nothing to re-implement. A file is compiled only
// when its style text says `:global` or names `html`, `body` or `:root` as a
// word; that filter is a superset (a component rule escapes its scope only
// through `:global` or by being a bare `:root`, which Svelte emits unscoped --
// measured -- and a type selector cannot be preceded by `-`, `.`, `#` or a
// word character), so it only saves time.
//
// `.css` FILES ARE SWEPT TOO, except the ones the ROOT layout loads. A room
// stylesheet imported by a route leaks exactly as a component's does; the
// root layout's own `app.css` and everything it `@import`s are on every page
// from the first paint, so they have nothing to outlive. That set is DERIVED
// by following the `@import`s, and the root layout's import of it is
// asserted, so the exemption cannot quietly cover a file it should not.
//
// `/dev` IS OUT OF SCOPE. Those routes 404 in production; several IdeaCAD
// harnesses still carry the old rule and are left alone on purpose, because
// their own browser specs were measured with it.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { compile, parse } from 'svelte/compiler';
import { documentScrollHolds, lockDocumentScroll } from '$lib/shell/scroll-lock';

interface DocumentRule {
	selector: string;
	declarations: string[];
	media: string | null;
	/** True when a `:has(` (for the document) or a class, id or attribute (for anything else) conditions it. */
	scoped: boolean;
}

type Node = any;
const last = <T>(a: T[]): T => a[a.length - 1];

/** Does any selector node under `node` satisfy `hit`? `:not()` is never descended: it excludes, it does not scope. */
function contains(node: Node, hit: (n: Node) => boolean): boolean {
	if (!node || typeof node !== 'object') return false;
	if (Array.isArray(node)) return node.some((n) => contains(n, hit));
	if (hit(node)) return true;
	if (node.type === 'PseudoClassSelector' && node.name === 'not') return false;
	for (const k of Object.keys(node)) if (k !== 'metadata' && contains(node[k], hit)) return true;
	return false;
}
const containsHas = (node: Node) => contains(node, (n) => n.type === 'PseudoClassSelector' && n.name === 'has');
/** Names something narrower than an element type: a class, an id or an attribute. */
const containsName = (node: Node) =>
	contains(node, (n) => n.type === 'ClassSelector' || n.type === 'IdSelector' || n.type === 'AttributeSelector');

/** Is this compound about the document itself: `html`, `body`, `:root`, or an `:is()` of one? */
function compoundIsDocument(rel: Node): boolean {
	return rel.selectors.some(
		(s: Node) =>
			(s.type === 'TypeSelector' && /^(html|body)$/i.test(s.name)) ||
			(s.type === 'PseudoClassSelector' && s.name === 'root') ||
			(s.type === 'PseudoClassSelector' &&
				['is', 'where', 'matches', 'any'].includes(s.name) &&
				s.args?.children?.some((c: Node) => compoundIsDocument(last(c.children))))
	);
}

const isNesting = (rel: Node) => rel.selectors.some((s: Node) => s.type === 'NestingSelector');

/**
 * Every rule in a plain stylesheet that is about the document (half 1) or
 * names nothing narrower than an element (half 2), with whether it is scoped.
 * Rules about the document are reported scoped or not, so the real rooms that
 * do it right can serve as a positive control; an element-only rule is
 * reported only when nothing scopes it. Nested rules inherit their parent: a
 * `& { ... }` under an unscoped `body` rule is about `body`, and anything
 * under a scoped parent is conditional on it. `@keyframes` stops are not
 * selectors and are skipped.
 */
function documentRules(css: string): DocumentRule[] {
	const text = `<style>${css}</style>`;
	const ast = parse(text, { modern: true }) as Node;
	const out: DocumentRule[] = [];
	type Ctx = { media: string[]; parentUnscopedDoc: boolean; ancestorHas: boolean; ancestorScoped: boolean };
	const walk = (children: Node[] | undefined, ctx: Ctx) => {
		for (const node of children ?? []) {
			if (node.type === 'Atrule') {
				if (node.block && !/keyframes$/i.test(node.name)) {
					walk(node.block.children, { ...ctx, media: [...ctx.media, `@${node.name} ${node.prelude}`.trim()] });
				}
				continue;
			}
			if (node.type !== 'Rule') continue;
			const declarations = node.block.children
				.filter((d: Node) => d.type === 'Declaration')
				.map((d: Node) => `${d.property}: ${d.value}`);
			let anyUnscopedDoc = false;
			let allHas = true;
			let allScoped = true;
			for (const complex of node.prelude.children) {
				const subject = last(complex.children as Node[]);
				const ownHas = containsHas(complex);
				const doc = compoundIsDocument(subject) || (isNesting(subject) && ctx.parentUnscopedDoc);
				const scoped = doc ? ownHas || ctx.ancestorHas : ownHas || containsName(complex) || ctx.ancestorScoped;
				if (!ownHas) allHas = false;
				if (!scoped) allScoped = false;
				if (doc && !scoped) anyUnscopedDoc = true;
				if (!doc && scoped) continue;
				out.push({ selector: text.slice(complex.start, complex.end).trim(), declarations, media: ctx.media.join(' ') || null, scoped });
			}
			walk(node.block.children, {
				media: ctx.media,
				parentUnscopedDoc: anyUnscopedDoc,
				ancestorHas: ctx.ancestorHas || allHas,
				ancestorScoped: ctx.ancestorScoped || allScoped
			});
		}
	};
	walk(ast.css?.children, { media: [], parentUnscopedDoc: false, ancestorHas: false, ancestorScoped: false });
	return out;
}

/** The document rules a component's compiled stylesheet carries. */
function componentDocumentRules(source: string, filename: string): DocumentRule[] {
	const css = compile(source, { filename, css: 'external', generate: 'client' }).css?.code ?? '';
	return documentRules(css);
}

/** A superset filter: could this style text possibly produce a rule that escapes the component? */
const MAY_ESCAPE = /:global|(?<![\w.#-])(html|body)(?![\w-])|:root/i;
const styleText = (source: string) =>
	[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

function walkFiles(dir: string, ext: string, acc: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walkFiles(p, ext, acc);
		else if (p.endsWith(ext)) acc.push(p.split('\\').join('/'));
	}
	return acc;
}

/** `src/app.css` and everything it `@import`s, transitively: the root layout's own sheets. */
function rootStylesheets(): Set<string> {
	const seen = new Set<string>();
	const visit = (file: string) => {
		const rel = relative(process.cwd(), file).split('\\').join('/');
		if (seen.has(rel)) return;
		seen.add(rel);
		for (const m of readFileSync(file, 'utf8').matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)) {
			if (!m[1].startsWith('.')) continue; // a package sheet is not under src/
			const next = resolve(dirname(file), m[1]);
			if (existsSync(next)) visit(next);
		}
	};
	visit(resolve('src/app.css'));
	return seen;
}

/**
 * THE EXCEPTIONS, EACH PINNED TO ITS EXACT DECLARATIONS AND WITH A REASON.
 * A rule listed here that changes (say, gains `overflow: hidden`) no longer
 * matches and reddens; an entry nothing produces any more also reddens, so the
 * list cannot outlive what it excuses. Adding one is a decision: say why the
 * rule is harmless on EVERY page it can be carried onto.
 */
const ALLOWED: Array<{ file: string; selector: string; declarations: string[]; media: string | null; reason: string }> = [
	{
		file: 'src/lib/ideacad/BladeEditor.svelte',
		selector: 'body',
		declarations: ['margin: 0'],
		media: null,
		reason:
			'app.css already gives every element `margin: 0` (`*, *::before, *::after`), so this rule changes nothing on any page it is carried onto.'
	},
	{
		file: 'src/routes/reference/[itemId]/+page.svelte',
		selector: 'body',
		declarations: ['background: #fff !important', 'color: #000 !important'],
		media: '@media print',
		reason:
			'print only: it cannot touch a page on screen, and a later page that is printed white on black ink is the reference viewer asking for paper, not a lock.'
	}
];

const key = (f: { file: string; selector: string; declarations: string[]; media: string | null }) =>
	`${f.file} :: ${f.media ?? '(screen and print)'} :: ${f.selector} { ${f.declarations.join('; ')} }`;

describe('the analyzer, on a planted component (the positive control)', () => {
	const PLANTED = `<div class="x"><span class="y"></span></div>
<style>
	:global(html), :global(body) { overflow: hidden; height: 100%; }
	:global html { margin: 0; }
	:global { body { overflow: hidden; } }
	@media print { :global(body) { color: #000; } }
	.x :global(body) { color: red; }
	:global(:root[data-theme='a']) { --planted-token: 1; }
	:root { --bare-root-escapes: 1; }
	:global(main) { max-width: none; padding: 0; }
	:global(a:not(.x)) { color: red; }
	:global(*) { outline: 0; }

	/* Scoped, or naming something narrower than an element: none of these may
	   be reported as unscoped. */
	:global(:root[data-theme='a']) .x { color: red; }
	:global(body:has(.x)) { overflow: hidden; }
	:global(html:has(.x) body) { overflow: hidden; }
	:global(body:has(.x) .y) { color: blue; }
	:global(body:has(.x)) { & { overflow: hidden; } }
	.x { :global(body) & { color: green; } }
	.x :global(main) { padding: 0; }
	:global(.room main), :global(main.room) { padding: 0; }
	:global(.room) { & a { color: red; } }
	@keyframes planted-spin { from { opacity: 0; } to { opacity: 1; } }
	.x { animation: planted-spin 1s; }
	body { color: blue; }
	.doc-body, .body-text { color: red; }
</style>`;
	const found = componentDocumentRules(PLANTED, 'Planted.svelte');
	const unscoped = found.filter((r) => !r.scoped);

	/* The component's own scoping class is a hash; it is not what is asserted. */
	const shown = (r: DocumentRule) =>
		`${r.media ? `${r.media} ` : ''}${r.selector.replace(/\.svelte-[a-z0-9]+/g, '')} { ${r.declarations.join('; ')} }`;

	it('reports every unscoped spelling of a document rule, and only those', () => {
		expect(unscoped.map(shown)).toEqual([
			'html { overflow: hidden; height: 100% }',
			'body { overflow: hidden; height: 100% }',
			'html { margin: 0 }',
			'body { overflow: hidden }',
			'@media print body { color: #000 }',
			'.x body { color: red }',
			":root[data-theme='a'] { --planted-token: 1 }",
			':root { --bare-root-escapes: 1 }',
			'main { max-width: none; padding: 0 }',
			'a:not(.x) { color: red }',
			'* { outline: 0 }'
		]);
	});

	it('sees the scoped document rules and does not count them (the other direction)', () => {
		expect(found.filter((r) => r.scoped).map((r) => r.selector)).toEqual(['body:has(.x)', 'html:has(.x) body', 'body:has(.x)']);
	});

	it('finds a bare stylesheet rule too, which is how a room .css file would leak', () => {
		const css = documentRules(
			'body { overflow: hidden } body:has(.room) { overflow: hidden } :root[data-theme="a"] .card { color: red } h2 { margin: 0 } .room h2 { margin: 0 }'
		);
		expect(css.map((r) => [r.selector, r.scoped])).toEqual([
			['body', false],
			['body:has(.room)', true],
			['h2', false]
		]);
	});
});

describe('the tree', () => {
	const components = walkFiles('src', '.svelte').filter((f) => !f.startsWith('src/routes/dev/'));
	const rootSheets = rootStylesheets();
	const stylesheets = walkFiles('src', '.css').filter((f) => !rootSheets.has(f));

	let withStyle = 0;
	let compiled = 0;
	const unscoped: string[] = [];
	const scoped: string[] = [];
	for (const file of components) {
		const source = readFileSync(file, 'utf8');
		const style = styleText(source);
		if (!style) continue;
		withStyle++;
		if (!MAY_ESCAPE.test(style)) continue;
		compiled++;
		for (const r of componentDocumentRules(source, file)) (r.scoped ? scoped : unscoped).push(key({ file, ...r }));
	}
	for (const file of stylesheets) {
		for (const r of documentRules(readFileSync(file, 'utf8'))) (r.scoped ? scoped : unscoped).push(key({ file, ...r }));
	}

	it('sweeps the whole tree rather than a handful of files', () => {
		// Floors, not pins: a component added tomorrow must not redden this.
		// 444 components (367 with a style block, 77 compiled) and 12 route
		// stylesheets when this was written.
		expect(components.length).toBeGreaterThan(400);
		expect(withStyle).toBeGreaterThan(300);
		expect(compiled).toBeGreaterThan(10);
		expect(stylesheets.length).toBeGreaterThan(10);
	});

	it('exempts only the stylesheets the root layout loads on every page', () => {
		expect(readFileSync('src/routes/+layout.svelte', 'utf8')).toMatch(/import '\.\.\/app\.css';/);
		expect(rootSheets.has('src/app.css')).toBe(true);
		for (const f of rootSheets) expect(f === 'src/app.css' || f.startsWith('src/lib/design-system/')).toBe(true);
	});

	it('reads the rooms that do this correctly (the positive control on real files)', () => {
		for (const room of [
			'src/lib/classroom/live-class/ProjectorView.svelte :: (screen and print) :: body:has(.lp-root) {',
			'src/lib/tournaments/TvStage.svelte :: (screen and print) :: body:has(.tv.fixed) {'
		]) {
			expect(scoped.filter((s) => s.startsWith(room)), room).toHaveLength(1);
		}
	});

	it('carries no document rule that outlives its page, apart from the pinned exceptions', () => {
		expect(ALLOWED).toHaveLength(2);
		expect(unscoped.sort()).toEqual(ALLOWED.map(key).sort());
	});
});

// THE OTHER ROAD TO THE SAME SYMPTOM: two layers locking `body` by hand.
// Each remembered the inline value, set `hidden` and put the value back on
// teardown, which composes only when layers close in reverse order. The
// counted lock in `$lib/shell/scroll-lock` is the one way to do it now.
describe('the counted document scroll lock', () => {
	const fakeDocument = (overflow = '') => ({ body: { style: { overflow } } });

	it('reproduces the leak with the hand-rolled capture and restore (the control)', () => {
		const doc = fakeDocument('auto');
		const lockByHand = () => {
			const previous = doc.body.style.overflow;
			doc.body.style.overflow = 'hidden';
			return () => {
				doc.body.style.overflow = previous;
			};
		};
		const releaseA = lockByHand();
		const releaseB = lockByHand();
		releaseA();
		releaseB();
		expect(doc.body.style.overflow).toBe('hidden');
	});

	it('gives back exactly what was there once the last holder lets go, in any order', () => {
		const doc = fakeDocument('auto');
		const releaseA = lockDocumentScroll(doc);
		const releaseB = lockDocumentScroll(doc);
		expect(doc.body.style.overflow).toBe('hidden');
		expect(documentScrollHolds(doc)).toBe(2);
		releaseA();
		expect(doc.body.style.overflow).toBe('hidden');
		releaseB();
		expect(doc.body.style.overflow).toBe('auto');
		expect(documentScrollHolds(doc)).toBe(0);
	});

	it('ignores a second release rather than giving away somebody else\'s hold', () => {
		const doc = fakeDocument('');
		const releaseA = lockDocumentScroll(doc);
		const releaseB = lockDocumentScroll(doc);
		releaseA();
		releaseA();
		expect(doc.body.style.overflow).toBe('hidden');
		releaseB();
		expect(doc.body.style.overflow).toBe('');
	});

	it('reads the page afresh for the next lock after a full release', () => {
		const doc = fakeDocument('');
		lockDocumentScroll(doc)();
		doc.body.style.overflow = 'scroll';
		const release = lockDocumentScroll(doc);
		expect(doc.body.style.overflow).toBe('hidden');
		release();
		expect(doc.body.style.overflow).toBe('scroll');
	});

	it('is the only thing in src/ that writes the body overflow', () => {
		const writes = [...walkFiles('src', '.svelte'), ...walkFiles('src', '.ts')]
			.filter((f) => !f.startsWith('src/routes/dev/'))
			.filter((f) => /\.body\.style\.overflow\s*=(?!=)/.test(readFileSync(f, 'utf8')));
		expect(writes).toEqual(['src/lib/shell/scroll-lock.ts']);
	});
});
