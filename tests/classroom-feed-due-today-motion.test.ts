// tests/classroom-feed-due-today-motion.test.ts
//
// THE DUE-TODAY ROW BREATHES, AND ONLY WITH MOTION ALLOWED (prompt 0098,
// item I). Pinned at the source because the two ways this goes wrong are
// silent: an animation that escapes its reduced-motion gate still renders
// perfectly for everyone who never asked for less motion, and a keyframe whose
// resting frame differs from the static rule hides part of the marker from a
// reader whose browser never runs the animation. Three claims:
//
//   1. the `today` row carries an animation, and it sits INSIDE
//      `@media (prefers-reduced-motion: no-preference)`;
//   2. the keyframe's resting frame IS the static rule's value, so nothing is
//      hidden in a base state;
//   3. no other urgency step animates -- `overdue` and `imminent` stay still.
//
// The browser half -- that the row's computed animation-name is the keyframe
// under the harness's no-preference default -- is a probe on
// tools/browser-verify/routes/home-order-role-student-classes-1-rows-4-due-1-0-1-5.mjs.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('../src/lib/classroom/ClassroomFeed.svelte', import.meta.url), 'utf8');
const style = src.slice(src.lastIndexOf('<style>'));

/** The body of the one reduced-motion block that carries the animation. */
function motionBlock(): string {
	const start = style.indexOf('@media (prefers-reduced-motion: no-preference)');
	expect(start).toBeGreaterThan(-1);
	// Balanced-brace scan from the block's opening brace.
	const open = style.indexOf('{', start);
	let depth = 0;
	for (let i = open; i < style.length; i++) {
		if (style[i] === '{') depth++;
		else if (style[i] === '}') {
			depth--;
			if (depth === 0) return style.slice(open + 1, i);
		}
	}
	throw new Error('unbalanced media block');
}

describe('the due-today animation', () => {
	it('is declared on the today row inside the no-preference gate, and nowhere outside it', () => {
		const block = motionBlock();
		expect(block).toMatch(/\.feed-row\[data-urgency='today'\]\s*\{[^}]*animation:\s*feed-due-today/);
		expect(block).toMatch(/@keyframes feed-due-today/);
		const outside = style.replace(block, '');
		expect(outside).not.toMatch(/animation:\s*feed-due-today/);
		expect(outside).not.toMatch(/@keyframes feed-due-today/);
	});

	it('rests on the static marker, so a reduced-motion reader sees the whole thing', () => {
		const staticRule = style.match(/\.feed-row\[data-urgency='today'\]\s*\{\s*box-shadow:\s*([^;]+);/);
		expect(staticRule).not.toBeNull();
		const resting = motionBlock().match(/0%,\s*100%\s*\{\s*box-shadow:\s*([^;]+);/);
		expect(resting).not.toBeNull();
		expect(resting![1].trim()).toBe(staticRule![1].trim());
	});

	it('leaves overdue and imminent still', () => {
		const block = motionBlock();
		expect(block).not.toMatch(/data-urgency='overdue'/);
		expect(block).not.toMatch(/data-urgency='imminent'/);
		expect(style.match(/@keyframes/g) ?? []).toHaveLength(1);
	});
});
