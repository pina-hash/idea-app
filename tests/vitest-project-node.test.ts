// tests/vitest-project-node.test.ts
//
// WHICH BUILD OF SVELTE THIS PROJECT ACTUALLY GOT, asserted behaviourally, plus
// the routing rules that decide which project a new file lands in.
//
// THE FAILURE THIS EXISTS FOR is a test quietly exercising a different build
// than its author intended. `vitest.config.ts` splits the suite in two: every
// file under `tests/` resolves svelte's SERVER build (this project), except
// `tests/dom/**`, which carries happy-dom and the `browser` resolve condition
// and therefore resolves the CLIENT build. That is one line of config away from
// being wrong for the whole suite in either direction, and a suite of 3327
// tests would go on passing while meaning something else.
//
// SO IT IS ASSERTED, ONCE PER PROJECT, BEHAVIOURALLY. Its twin is
// `tests/dom/vitest-project-dom.test.ts`, which makes the opposite assertions.
// If a config change swaps the two, or collapses them, one of the pair reddens
// with a named path rather than the suite silently changing meaning.
//
// WHY BEHAVIOURALLY AND NOT BY READING A PATH OR AN EXPORT LIST -- both obvious
// instruments were tried here and BOTH ARE WRONG:
//
//   * `import.meta.resolve('svelte')` answers `src/index-server.js` in BOTH
//     projects. It runs Node's resolver, which knows nothing about Vite's
//     conditions or aliases, so it reports the wrong answer confidently in the
//     project that is actually on the client build.
//   * The two builds export the SAME NAMES. Measured: `Object.keys` of the
//     `svelte` namespace is character-for-character identical in both projects
//     (`flushSync`, `onMount`, `mount` and all), because the server build ships
//     stubs rather than omitting anything. `typeof mount === 'function'` is
//     true on the server build too.
//
// What separates them is what `mount()` DOES. On the server build it raises
// `lifecycle_function_unavailable`; on the client build it renders. That is the
// only discriminator measured to work, so that is the one used.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import * as svelte from 'svelte';
import { render } from 'svelte/server';
import ProjectIdentity from './fixtures/ProjectIdentity.svelte';

const TESTS_ROOT = 'tests';
const DOM_DIR = 'tests/dom';

function testFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir).sort()) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) testFiles(p, out);
		else if (p.endsWith('.test.ts')) out.push(p.split(sep).join('/'));
	}
	return out;
}

describe('the node project runs svelte on the SERVER build', () => {
	it('refuses to mount, which is the only reliable discriminator', () => {
		// The positive control for the assertion below: the export exists, so a
		// pass here is not `mount` being undefined.
		expect(typeof svelte.mount).toBe('function');
		let message = 'DID NOT THROW';
		try {
			(svelte.mount as (...a: unknown[]) => unknown)(() => {}, {});
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		}
		expect(message).toContain('lifecycle_function_unavailable');
		expect(message).toContain('not available on the server');
	});

	it('has no DOM, which is a SEPARATE axis from the build and is asserted separately', () => {
		// Measured, and the reason both halves are pinned rather than one: adding
		// `environment: 'happy-dom'` WITHOUT the `browser` condition gives a
		// project a real `document` and leaves it on the SERVER build, where
		// `mount()` still throws and the target stays empty. Environment and
		// build move independently, so a single assertion about either one would
		// certify the other by accident.
		expect(typeof globalThis.document).toBe('undefined');
		expect(typeof (globalThis as { happyDOM?: unknown }).happyDOM).toBe('undefined');
	});

	it('server-renders the shared fixture to a string, which is what 22 files here do', () => {
		// THE OTHER HALF OF THE PAIR. `tests/dom/vitest-project-dom.test.ts` MOUNTS
		// this same component and asserts the same markup comes out of a real DOM.
		// One fixture, two builds, two operations -- so the claim "the split gives
		// each project a different build of the same source" is asserted rather
		// than described.
		const { body } = render(ProjectIdentity, { props: { label: 'from the server build' } });
		expect(body).toContain('data-testid="project-identity"');
		expect(body).toContain('from the server build');
	});
});

describe('project routing: a file lands in the right project by WHERE IT IS', () => {
	const all = testFiles(TESTS_ROOT);
	const inDom = all.filter((f) => f.startsWith(`${DOM_DIR}/`));
	const outsideDom = all.filter((f) => !f.startsWith(`${DOM_DIR}/`));

	it('found both halves, so neither list below is vacuous', () => {
		// A DOM project running zero files would pass every assertion its own
		// identity file makes, by never running it.
		expect(inDom.length).toBeGreaterThanOrEqual(1);
		expect(outsideDom.length).toBeGreaterThanOrEqual(100);
	});

	it('has no mount test outside tests/dom/, where mount cannot work', () => {
		// This one is belt to the braces: such a file fails on its first run with
		// `lifecycle_function_unavailable`, which names `mount` and is
		// self-explaining. Named here anyway so the reason is written down where
		// somebody looking at the routing will find it.
		const offenders = outsideDom.filter((f) => {
			const src = readFileSync(f, 'utf8');
			return /^\s*import\s+\{[^}]*\bmount\b[^}]*\}\s+from\s+'svelte'/m.test(src);
		});
		expect(offenders).toEqual([]);
	});

	it('has no server-render test INSIDE tests/dom/, where its failure is illegible', () => {
		// THE ASYMMETRY THAT MAKES THIS ONE WORTH A TEST. A mount test in the
		// wrong place says "mount(...) is not available on the server". An SSR
		// `render()` in the DOM project throws `Cannot read properties of
		// undefined (reading 'call')` -- because the component was compiled to
		// CLIENT output, which the server renderer cannot execute -- and that
		// message names nothing about builds, projects or conditions. Measured on
		// a real component in this repo. Catching it by name here is the
		// difference between a one-line fix and an afternoon.
		const offenders = inDom.filter((f) => /from\s+'svelte\/server'/.test(readFileSync(f, 'utf8')));
		expect(offenders).toEqual([]);
	});
});
