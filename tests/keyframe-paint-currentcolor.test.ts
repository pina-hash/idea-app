/**
 * NO KEYFRAME ANIMATES TO A `color-mix()` THAT NAMES `currentColor`.
 *
 * Chrome 154 crashes the whole renderer (Windows reports STATUS_BREAKPOINT,
 * "Can't open this page") when a CSS animation moves an SVG `fill` or `stroke`
 * to a `color-mix()` containing `currentColor`. On 2026-10-01 the bolt badge's
 * charge beat did exactly that (`fill: color-mix(in srgb, currentColor 72%,
 * transparent)` in a keyframe), and every classroom page that showed a class
 * whose theme vote picked the bolt died about a second after it painted, for
 * the students in that class and for an admin who sees every class. Measured
 * in Chrome 154.0.8037.92 on bare pages: the keyframe alone crashes it, the
 * same keyframe with a hex colour does not, `currentColor` alone does not,
 * and Chromium 141 (the harness browser) survives all of them -- which is why
 * no browser pass here could have caught it, and why this is a test.
 *
 * The repair is an opacity: `currentColor` at `fill-opacity: 0.22` paints the
 * same pixel as `color-mix(in srgb, currentColor 22%, transparent)`, and
 * opacity animates safely. A STATIC `color-mix()` of `currentColor` is fine
 * and is left alone (the app marks use one); only a value inside a
 * `@keyframes` block is swept, on every property, because the crash is a
 * renderer CHECK and nothing says the next one is limited to paint.
 *
 * WHAT THIS CANNOT SEE: a keyframe whose value reaches `currentColor` through
 * a custom property (`fill: var(--x)` where `--x` is the mix), and a
 * transition between two such mixes (measured not to crash, but not swept).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(svelte|css)$/.test(name)) out.push(p);
	}
	return out;
}

/** Every `@keyframes` block in a stylesheet, as its name and its body. */
function keyframes(css: string): { name: string; body: string }[] {
	const out: { name: string; body: string }[] = [];
	const re = /@keyframes\s+([^\s{]+)\s*\{/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(css))) {
		let depth = 1;
		let i = re.lastIndex;
		for (; i < css.length && depth > 0; i++) {
			if (css[i] === '{') depth += 1;
			else if (css[i] === '}') depth -= 1;
		}
		out.push({ name: m[1], body: css.slice(re.lastIndex, i - 1) });
		re.lastIndex = i;
	}
	return out;
}

/** The declarations in a keyframe body that animate to a mix of `currentColor`. */
function offending(body: string): string[] {
	const noComments = body.replace(/\/\*[\s\S]*?\*\//g, '');
	return [...noComments.matchAll(/[\w-]+\s*:[^;{}]*/g)]
		.map((d) => d[0].trim())
		.filter((d) => /color-mix\([^;]*currentcolor/i.test(d));
}

const FILES = walk('src');
const ALL = FILES.flatMap((f) => keyframes(readFileSync(f, 'utf8')).map((k) => ({ file: f, ...k })));

describe('no keyframe animates to a color-mix of currentColor', () => {
	it('sweeps a real population of keyframes', () => {
		// A sweep that parsed nothing would pass; this tree has well over a
		// hundred keyframes, and the badge renderer alone has sixteen.
		expect(FILES.length).toBeGreaterThan(300);
		expect(ALL.length).toBeGreaterThan(100);
		expect(ALL.filter((k) => k.file.endsWith('BadgeIcon.svelte')).length).toBe(16);
	});

	it('finds none in src/', () => {
		const hits = ALL.flatMap((k) => offending(k.body).map((d) => `${k.file} @keyframes ${k.name}: ${d}`));
		expect(hits).toEqual([]);
	});

	it('catches the keyframe that crashed production, and spares its repair', () => {
		const shipped = `@keyframes -global-idea-badge-charge {
		20%,
		40% {
			fill: color-mix(in srgb, currentColor 72%, transparent);
		}
	}`;
		const [k] = keyframes(shipped);
		expect(k.name).toBe('-global-idea-badge-charge');
		expect(offending(k.body)).toEqual(['fill: color-mix(in srgb, currentColor 72%, transparent)']);
		expect(offending('20% { stroke: color-mix(in oklab, CurrentColor 40%, white); }')).toHaveLength(1);
		expect(offending('20%, 40% { fill-opacity: 0.72; }')).toEqual([]);
		expect(offending('50% { fill: color-mix(in srgb, #3a6 72%, transparent); }')).toEqual([]);
	});
});
