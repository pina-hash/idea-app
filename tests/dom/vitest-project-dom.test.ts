// tests/dom/vitest-project-dom.test.ts
//
// THE TWIN OF `tests/vitest-project-node.test.ts`, making the opposite
// assertions about the other project. Read that file's header first: it carries
// the argument for why this pair exists, and why both instruments that look
// obvious (`import.meta.resolve`, the export list) were measured and rejected.
//
// This project is `tests/dom/**`. It carries happy-dom AND the `browser`
// resolve condition, and it is the only place in the suite where an `$effect`
// runs at all.
//
// THE TWO ARE INDEPENDENT AXES AND BOTH ARE PINNED SEPARATELY. Measured by
// removing `conditions: ['browser']` from this project and running this same
// file: happy-dom still supplied a real `document`, and `mount()` still raised
// `lifecycle_function_unavailable` with the target left empty. So a DOM is not
// evidence of the client build and never was. Anybody who "adds happy-dom" to
// get a mount test working, and stops there, gets a green-looking environment
// that still cannot mount -- which is exactly the misreading this pair exists
// to prevent, and it is why neither file asserts one axis and infers the other.
//
// WHAT IS DELIBERATELY *NOT* ASSERTED HERE: that `svelte/server`'s `render()`
// fails in this project. It does fail -- a component compiled to CLIENT output
// is not something the server renderer can execute -- but MEASURED ACROSS
// ARRANGEMENTS OF THE SAME FILE IT FAILED INCONSISTENTLY: `Cannot read
// properties of undefined (reading 'call')` in most, and no throw at all in
// one, with the determining factor not isolated. An unstable symptom is a
// flaky test, so the rule is enforced where it is stable -- as a source sweep
// in `tests/vitest-project-node.test.ts`, which refuses a `svelte/server`
// import under `tests/dom/` by name. That the symptom is BOTH illegible and
// unreliable is the argument for the sweep, not against it.

import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ProjectIdentity from '../fixtures/ProjectIdentity.svelte';

describe('the dom project runs svelte on the CLIENT build', () => {
	it('mounts the shared fixture into a real DOM', async () => {
		// THE OTHER HALF OF THE PAIR. `tests/vitest-project-node.test.ts`
		// server-RENDERS this same component to a string and asserts the same
		// markup. One fixture, two builds, two operations -- so "the split gives
		// each project a different build of the same source" is asserted rather
		// than described.
		const target = document.createElement('div');
		document.body.appendChild(target);

		const app = mount(ProjectIdentity, { target, props: { label: 'from the client build' } });
		flushSync();

		const el = target.querySelector('[data-testid="project-identity"]');
		expect(el).not.toBeNull();
		expect(el?.textContent).toBe('from the client build');
		// The prop actually arrived, rather than the element merely existing:
		// a client component whose props did not bind renders the element with
		// an empty text node, which passes a presence check.
		expect(target.innerHTML).toContain('from the client build');

		await unmount(app);
		target.remove();
	});

	it('has a DOM, which is a SEPARATE axis from the build and is asserted separately', () => {
		expect(typeof globalThis.document).toBe('object');
		expect(typeof (globalThis as { happyDOM?: unknown }).happyDOM).toBe('object');
	});

	it('runs an $effect, which is the whole reason this project exists', async () => {
		// The capability the split was built for, asserted at its smallest. Every
		// other file in the suite would report 0 here: effects do not run under
		// the server build, so a bare `$effect.root` never invokes its callback.
		const { effectRunCount } = await import('./fixtures/effect-probe.svelte');
		expect(effectRunCount()).toBe(1);
	});
});
