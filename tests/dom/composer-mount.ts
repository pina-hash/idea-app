// tests/dom/composer-mount.ts
//
// THE INSTRUMENT, kept apart from the assertions that use it, for one reason:
// the mutation proof has to drive the IDENTICAL instrument against a
// deliberately broken copy of the component. A body written inline in the test
// file would have to be retyped to do that, and a retyped instrument
// characterizes what somebody believed it did.
//
// Not a `.test.ts`, so vitest does not collect it as a file of its own.

import { flushSync, mount, unmount } from 'svelte';
import type { Component } from 'svelte';
import { createReactiveLog, type ReactiveLog } from './fixtures/reactive-log.svelte';
import type { ClassroomComposerTransports, ClassroomSection } from '$lib/classroom/classroom';

/**
 * One section on one course, which is the smallest fixture that makes the
 * suggestions effect DO anything: `categoryCourseIds` is derived from the
 * checked publish targets, and the effect returns early on an empty list.
 */
export const SECTION: ClassroomSection = {
	id: 'sec-1',
	course_id: 'course-1',
	label: 'Block 3',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	active: true,
	course: { id: 'course-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
};

export interface MountOutcome {
	/** Every argument list the injected transport was called with. */
	loadCalls: string[][];
	/** Every value the injected dirty callback was handed. */
	dirtyCalls: boolean[];
	/** The fixture the injected code read and wrote. */
	log: ReactiveLog;
	/** The rendered markup, so a settled mount can be told from an empty one. */
	html: string;
	/** `<datalist>` options, i.e. the effect's result reaching the DOM. */
	suggestions: string[];
	/**
	 * WHETHER THE FIELD IS ACTUALLY WIRED TO THE LIST IT RENDERED.
	 *
	 * `suggestions` above says the options EXIST. It says nothing about whether
	 * a browser would ever show them, which is a separate fact living in two
	 * attributes that have to match: the input's `list` and the datalist's
	 * `id`. Both are computed (`categoryListId`), and a mismatch renders a
	 * perfectly ordinary field beside a perfectly ordinary datalist that
	 * nothing points at -- no error, no empty state, just a teacher who never
	 * sees a suggestion again.
	 *
	 * Reported as the two raw values rather than as a boolean, so a failure
	 * says WHICH half moved instead of just "not wired".
	 */
	categoryList: { inputList: string | null; datalistId: string | null };
}

/**
 * Mount the composer with INJECTED CODE THAT READS AND WRITES REACTIVE STATE
 * BEFORE ITS FIRST `await`, drive it to settle, and report what happened.
 *
 * Both injected bindings are the shapes a real caller writes, not contrived
 * ones: the transport is the classroom dev harness's own
 * `loadCategorySuggestions` (log line and all), and the callback is a parent
 * that records the dirty flag it was just handed. Neither has an `await`
 * anywhere before it touches state, which is the whole point -- an `async`
 * function's body runs synchronously up to its first suspension, so all of it
 * is inside the effect's tracking context unless the CALL was untracked.
 */
export async function mountComposer(
	Composer: Component<Record<string, unknown>>,
	opts: { onDirty?: (dirty: boolean, log: ReactiveLog) => void } = {}
): Promise<MountOutcome> {
	const log = createReactiveLog();
	const loadCalls: string[][] = [];
	const dirtyCalls: boolean[] = [];

	const transports = {
		async loadCategorySuggestions(courseIds: string[]) {
			// READ then WRITE, synchronously, in one statement. See the fixture.
			log.note('loadCategorySuggestions', { courseIds, seen: log.entries.length });
			loadCalls.push([...courseIds]);
			return { ok: true as const, data: ['Bench work', 'Bench work', 'Sketching'] };
		}
	} as unknown as ClassroomComposerTransports;

	const target = document.createElement('div');
	document.body.appendChild(target);

	const app = mount(Composer, {
		target,
		props: {
			mode: 'create',
			kind: 'assignment',
			sections: [SECTION],
			initialTargets: [SECTION.id],
			transports,
			onsaved: () => {},
			ondirtychange: (dirty: boolean) => {
				dirtyCalls.push(dirty);
				opts.onDirty?.(dirty, log);
			}
		}
	});

	// Settle: flush the synchronous effect graph, let the transport's promise
	// resolve on a real macrotask, then flush whatever that resolution queued.
	flushSync();
	await new Promise((resolve) => setTimeout(resolve, 50));
	flushSync();

	const outcome: MountOutcome = {
		loadCalls,
		dirtyCalls,
		log,
		html: target.innerHTML,
		suggestions: Array.from(target.querySelectorAll('datalist option')).map(
			(o) => (o as HTMLOptionElement).value
		),
		categoryList: {
			inputList:
				target
					.querySelector('input[placeholder="Unit Labs"]')
					?.getAttribute('list') ?? null,
			datalistId: target.querySelector('datalist')?.getAttribute('id') ?? null
		}
	};

	await unmount(app);
	target.remove();
	return outcome;
}
