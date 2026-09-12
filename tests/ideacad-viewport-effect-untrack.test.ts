// tests/ideacad-viewport-effect-untrack.test.ts
//
// `untrack(() => fn)?.(args)` UNTRACKS THE LOOKUP AND LEAVES THE CALL TRACKED,
// and it looks exactly like the correct thing.
//
// `CLAUDE.md`'s rule is "track the inputs, untrack the call", and the call means
// the INVOCATION. Written the wrong way round, everything the callee touches
// joins the effect's dependency set. The viewport shipped it: `build()` reads
// the `rotation` prop and ends in `paint()`, which reads `cam` and `style`
// through its own defaults, so once an evaluation change armed that effect
// every camera write during a drag re-triggered a full geometry rebuild.
//
// MEASURED IN CHROMIUM, by counting `createBuffer` calls with the GL context
// patched before the renderer existed -- a rebuild allocates fresh buffers and
// reusing geometry allocates none. Switching concepts (which is what actually
// replaces `draft`; Accept does not) allocated 22 buffers either way, and the
// 30-frame drag that followed allocated **0 with the fix and 594 without it**,
// 19.8 per frame.
//
// WHY A STATIC CHECK AND NOT A RUNTIME ONE. `tests/dom/` has no WebGL, so
// nothing there can see a geometry rebuild. The browser harness could, but the
// existing effect sweep -- `tests/classroom-composer-effect-reactivity.test.ts`
// -- cannot: it looks for calls to CALLER-SUPPLIED code, and `rebuild` and
// `apply` are local variables, so a regression here is invisible to it. The
// defect is also silent by nature: 1148 triangles rebuild fast enough that no
// frame time moved at either width. A silent regression with no existing sweep
// is exactly what `CLAUDE.md` says to write a test for.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SOURCE = 'src/lib/ideacad/viewport/Viewport.svelte';
const raw = readFileSync(SOURCE, 'utf8');

/**
 * COMMENTS ARE STRIPPED BEFORE THE SWEEP, and the first run of this file is why:
 * the fix's own comment QUOTES the broken shape to explain it, and the scan
 * matched the explanation. `tools/claude-md-check.mjs` reads a migration with
 * its comments stripped for exactly this reason. Newlines are preserved so a
 * reported line number still points at the real line.
 */
function stripComments(text: string): string {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
		.replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}
const source = stripComments(raw);

/** `untrack(` whose arrow returns a bare identifier that is then CALLED --
 *  `untrack(() => name)?.(` or `untrack(() => name)(`. The optional chain is
 *  the shape this file shipped. */
const LOOKUP_ONLY = /untrack\(\s*\(\)\s*=>\s*[A-Za-z_$][\w$]*\s*\)\s*\??\.?\(/g;

describe('the viewport untracks the CALL, not the lookup', () => {
	it('strips comments without eating code, which the sweep below depends on', () => {
		/* The stripper must remove the explanation and keep the statement. Both
		   directions, because a stripper that removed everything would make every
		   absence below pass. */
		expect(source).not.toContain('untracks only');
		expect(source).toContain('untrack(() => apply?.(s, st));');
		expect(source).toContain('untrack(() => rebuild?.(e));');
		/* Line numbering survives, so a hit reports the right line. */
		expect(source.split('\n').length).toBe(raw.split('\n').length);
	});

	it('has effects to check, which is the positive control', () => {
		/* A file that stopped using effects entirely would pass every absence
		   below while meaning nothing. */
		expect(source.match(/\$effect\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
		expect(source).toContain('untrack(');
	});

	it('contains no `untrack(() => fn)?.(...)` anywhere', () => {
		const hits = [...source.matchAll(LOOKUP_ONLY)].map((m) => {
			const line = source.slice(0, m.index ?? 0).split('\n').length;
			return `${SOURCE}:${line}  ${m[0]}`;
		});
		expect(hits).toEqual([]);
	});

	it('and the pattern DOES find that shape, so the check is not vacuous', () => {
		/* The exact text this file shipped, put to the same regex. Without this
		   a typo in the pattern would read as a clean sweep forever. */
		const broken = 'untrack(() => rebuild)?.(e);';
		expect([...broken.matchAll(LOOKUP_ONLY)].length).toBe(1);
		expect([...'untrack(() => apply)?.(s, st);'.matchAll(LOOKUP_ONLY)].length).toBe(1);
		/* And does NOT find the correct shape, so it cannot pass by matching
		   everything. */
		expect([...'untrack(() => rebuild?.(e));'.matchAll(LOOKUP_ONLY)].length).toBe(0);
		expect([...'untrack(() => apply?.(s, st));'.matchAll(LOOKUP_ONLY)].length).toBe(0);
	});

	it('keeps the tracked reads OUTSIDE untrack, which is the other half', () => {
		/* Untracking the whole effect body buys the same safety by deleting the
		   reason the effect exists, and nothing on screen reports an effect that
		   stopped re-running. Both effects read their input on a line of their
		   own before the untracked call. */
		for (const input of ['const s = cam;', 'const st = style;', 'const e = evaluation;']) {
			expect(source, input).toContain(input);
		}
	});
});
