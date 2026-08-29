// tests/dom/classroom-composer-effect-mount.test.ts
//
// THE BEHAVIOURAL HALF OF THE INJECTED-CALLBACK CONTRACT.
//
// `tests/classroom-composer-effect-reactivity.test.ts` parses every `.svelte`
// file in `src/` and asserts the SHAPE of the fix -- that no injected call runs
// synchronously inside an `$effect` without `untrack`. That sweep is the one
// that scales: it catches the next occurrence anywhere in the repo, in a file
// nobody has thought about yet, and it costs milliseconds.
//
// What it cannot do is run anything. It reads `untrack(() => load(ids))` and
// concludes the loop is closed; it would read an `untrack` that had been moved
// one paren too far, or a scheduler change that made the wrapping insufficient,
// exactly the same way. THIS file is the other half: it MOUNTS the real
// component with the real hostile transport and proves the mount settles.
//
// The two are not substitutes and neither is redundant. The sweep is breadth
// with no depth; this is depth over one component. Deleting either leaves a
// real gap.
//
// WHY THIS FILE IS IN `tests/dom/`. Effects only run in svelte's CLIENT build,
// which needs a DOM and the `browser` resolve condition. `tests/dom/` is the
// vitest project that has both; every other test file resolves the SERVER
// build, where `mount()` throws `lifecycle_function_unavailable`. See
// `tests/dom/README.md` and the header of `vitest.config.ts`.
//
// THE FIXTURE IS THE HARNESS'S OWN CODE, NOT A CONTRIVANCE. The transport does
// what `src/routes/dev/classroom/+page.svelte`'s `loadCategorySuggestions`
// does, log line included, because that function is what actually took the
// composer down the first time somebody opened the harness. Production's
// transport is a plain Supabase call with no reactivity in it, so production
// never looped -- which is luck, not design, and is the reason the guarantee is
// worth pinning at all.
//
// MEASURED IN BOTH DIRECTIONS. Reverting either `untrack` in a scratch copy of
// the component and running this same instrument against the copy reproduces
// `effect_update_depth_exceeded`; the numbers and the method are in this
// bundle's history entry.

import { describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import ContentComposer from '$lib/classroom/ContentComposer.svelte';
import { mountComposer, SECTION } from './composer-mount';

const Composer = ContentComposer as unknown as Component<Record<string, unknown>>;

describe('ContentComposer settles with injected code that reads and writes state', () => {
	it('runs the suggestions transport exactly once and reaches the DOM with its result', async () => {
		const r = await mountComposer(Composer);

		// THE POSITIVE CONTROL, and it comes first deliberately: a mount that
		// silently never ran the effect would satisfy every "did not loop"
		// assertion below without exercising anything.
		expect(r.loadCalls).toEqual([[SECTION.course_id]]);
		expect(r.log.entries).toHaveLength(1);

		// ONE call, not two and not two hundred: the effect re-running because
		// the transport wrote state is the defect, and it is visible here as a
		// count rather than as a crash.
		expect(r.loadCalls).toHaveLength(1);

		// The component actually rendered, so the counts above are not the
		// counts of a component that threw on the way up.
		expect(r.html.length).toBeGreaterThan(1000);

		// And the effect's RESULT reached the DOM, through the real
		// `courseCategorySuggestions` -- which is also why the duplicate in the
		// fixture data comes back as one option.
		expect(r.suggestions).toEqual(['Bench work', 'Sketching']);
	});

	it('notifies the injected dirty callback without the callback re-triggering the effect', async () => {
		// The SECOND injected binding, and a different shape: not a transport but
		// a plain prop callback with no promise in it at all. `ondirtychange` is
		// one synchronous call, which is exactly why it reads as exempt and is
		// not -- the parent's handler is somebody else's code running inside this
		// effect's tracking context.
		//
		// This handler is the hostile case: it reads and writes the same reactive
		// state on every notification, which under a tracked call is an
		// unbounded loop.
		const r = await mountComposer(Composer, {
			onDirty: (dirty, log) => log.note('ondirtychange', { dirty })
		});

		expect(r.dirtyCalls.length).toBeGreaterThan(0);
		// A composer nobody has typed into is CLEAN, and says so once. A `true`
		// here would be the presence-of-state bug CLAUDE.md names separately:
		// "is there content in here" answered as "has this been edited".
		expect(new Set(r.dirtyCalls)).toEqual(new Set([false]));
		// Bounded. The loop, if the call were tracked, is not.
		expect(r.dirtyCalls.length).toBeLessThan(10);
		expect(r.log.entries.length).toBeLessThan(10);
	});
});
