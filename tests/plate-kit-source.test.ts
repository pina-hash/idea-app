// tests/plate-kit-source.test.ts
//
// LEDGER 0468: ONE PLATE SOURCE FOR THE SITE AND THE KIT.
//
// The Plate's parts as classes (`idea-key`, `idea-panel`, `idea-pad`,
// `idea-list`, `idea-display`, the title bar and the rest) live in ONE file,
// tools/hx-kit/kit/plate.css. HTML assignments build it in with the design
// system's tokens (tokens.json); the site imports the same file
// (src/lib/shell/site-plate.css) and declares the names it reads from the
// Plate's own tokens (src/lib/classroom/plate.css, section 1b). A name the
// file reads that one side does not declare paints nothing on that side, and
// nothing on screen says why, so both halves are held here:
//
//   - every name the kit file reads is declared by the site's bridge, or is a
//     site token that means the same thing, or is the file's own local;
//   - every name it reads exists in tokens.json for the kit;
//   - every shadow the bridge composes has the kit's own geometry, layer for
//     layer (only the colours are the theme's);
//   - the site loads the file rather than a copy of it.
//
// Positive controls: a planted unknown name is caught by the same checker, and
// a planted extra layer is caught by the geometry compare.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const KIT = read('tools/hx-kit/kit/plate.css');
const SITE = read('src/lib/classroom/plate.css');
const SITE_PLATE = read('src/lib/shell/site-plate.css');
const TOKENS = JSON.parse(read('tools/hx-kit/kit/tokens.json')) as {
	color: { tokens: { name: string }[] };
	shadow: { tokens: { name: string; value: Record<string, string> }[] };
	spacing: { tokens: { name: string }[] };
	radius: { tokens: { name: string }[] };
	size: { tokens: { name: string }[] };
};

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every `var(--name` a stylesheet reads. */
function reads(css: string): Set<string> {
	return new Set([...stripComments(css).matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
}

/** Every `--name:` a stylesheet declares. */
function declares(css: string): Set<string> {
	return new Set([...stripComments(css).matchAll(/(?:^|[\s;{])(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

/** The bridge: the rule in plate.css section 1b keyed on the parts. */
function bridgeBlocks(css: string): string {
	const start = css.indexOf('1b. THE KIT\'S NAMES');
	expect(start, 'plate.css has its section 1b').toBeGreaterThan(0);
	const end = css.indexOf('/* THE LENGTHS THAT MOVE', start);
	return css.slice(start, end);
}

/** The site's own names the kit file may read as they are: same name, same meaning. */
const SITE_SAME = new Set(['--text-2', '--cyan', '--hover-ink', '--focus-ring', '--plate-ink', '--font-display', '--font-mono', '--space-2', '--space-3', '--space-5']);

function unmet(kit: string, bridge: string): string[] {
	const have = new Set([...declares(bridge), ...declares(kit), ...SITE_SAME]);
	return [...reads(kit)].filter((n) => !have.has(n)).sort();
}

/** A shadow's layers with the colours taken out: the geometry. */
function geometry(shadow: string): string[] {
	const layers: string[] = [];
	let depth = 0;
	let cur = '';
	for (const ch of shadow) {
		if (ch === '(') depth++;
		if (ch === ')') depth--;
		if (ch === ',' && depth === 0) {
			layers.push(cur);
			cur = '';
		} else cur += ch;
	}
	layers.push(cur);
	return layers.map((l) =>
		l
			.replace(/var\([^)]*\)|rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi, '')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

describe('the site and the kit draw the Plate parts from one file', () => {
	const bridge = bridgeBlocks(SITE);

	it('the site loads the kit file itself, and src holds no copy of a part recipe', () => {
		expect(SITE_PLATE).toMatch(/@import '\.\.\/\.\.\/\.\.\/tools\/hx-kit\/kit\/plate\.css';/);
		// Control for the sweep below: the kit file does carry the recipes.
		for (const part of ['.idea-key {', '.idea-pad {', '.idea-list {', '.idea-display {', '.idea-titlebar {', '.idea-eyebrow {']) {
			expect(KIT, part).toContain(part);
			expect(SITE, part).not.toContain(part);
			expect(SITE_PLATE, part).not.toContain(part);
		}
	});

	it('every name the kit file reads is declared by the bridge, the file, or a same-meaning site token', () => {
		expect(reads(KIT).size).toBeGreaterThan(40);
		expect(unmet(KIT, bridge)).toEqual([]);
		// POSITIVE CONTROL: a name nobody declares is caught.
		expect(unmet(`${KIT}\n.idea-x { color: var(--nobody-declares-this); }`, bridge)).toEqual(['--nobody-declares-this']);
	});

	it('every name the kit file reads exists for the kit too (tokens.json or the file itself)', () => {
		const kitHas = new Set([
			...TOKENS.color.tokens.map((t) => `--${t.name}`),
			...TOKENS.shadow.tokens.map((t) => `--${t.name}`),
			...TOKENS.spacing.tokens.map((t) => `--${t.name}`),
			...TOKENS.radius.tokens.map((t) => `--${t.name}`),
			...TOKENS.size.tokens.map((t) => `--${t.name}`),
			'--font-display',
			'--font-mono',
			...declares(KIT)
		]);
		expect([...reads(KIT)].filter((n) => !kitHas.has(n))).toEqual([]);
	});

	it('the bridge sits on the parts, never on the plate root, and the radius collision is held to two parts', () => {
		expect(bridge).toMatch(/:where\(\.cr-plate, \.site-plate\) :where\(\.idea-eyebrow, \.idea-key, \.idea-panel[^)]*\.idea-pad[^)]*\) \{/);
		expect(bridge).toMatch(/:where\(\.cr-plate, \.site-plate\) :where\(\.idea-key, \.idea-well\) \{\s*--radius-control: var\(--plate-r-control\);\s*\}/);
		// `--radius-control` is declared exactly once, there.
		expect(stripComments(bridge).match(/--radius-control:/g)).toHaveLength(1);
	});

	it("every shadow the bridge composes has the kit's own geometry, layer for layer", () => {
		const body = stripComments(bridge);
		let compared = 0;
		for (const t of TOKENS.shadow.tokens) {
			const m = body.match(new RegExp(`--${t.name}:([^;]+);`));
			expect(m, `the bridge composes --${t.name}`).toBeTruthy();
			expect(geometry(m![1]), t.name).toEqual(geometry(t.value.idea));
			expect(geometry(m![1]), t.name).toEqual(geometry(t.value['space-white']));
			compared++;
		}
		expect(compared).toBe(TOKENS.shadow.tokens.length);
		expect(compared).toBeGreaterThanOrEqual(13);
		// POSITIVE CONTROL: one extra layer is a different geometry.
		const key = TOKENS.shadow.tokens.find((t) => t.name === 'shadow-key')!;
		expect(geometry(`${key.value.idea}, 0 0 0 1px red`)).not.toEqual(geometry(key.value.idea));
	});
});
