// tests/dom/reactive-props.svelte.ts
//
// A REACTIVE PROPS OBJECT, so a test can change what a MOUNTED component is
// pointed at without remounting it.
//
// `mount(C, { props })` reads props off the object it is handed, so an ordinary
// object is a one-shot: assigning to it afterwards moves nothing and the
// component never re-runs an effect. Wrapping it in `$state` makes the reads
// tracked, which is the arrangement a real parent has -- the gallery and the
// review queue both keep `AppStage` mounted and swap `versionId` underneath it,
// so a teardown keyed on the ids is only reachable this way.
//
// IT IS A `.svelte.ts` MODULE BECAUSE RUNES NEED ONE. `mount.ts` beside it is
// plain TypeScript and four existing files import it; renaming that to reach a
// rune would move every one of them for one caller's benefit.
//
// Not a `.test.ts`, so vitest does not collect it.

/** The same object, made reactive. Assign to its keys to drive a prop change. */
export function reactiveProps<T extends Record<string, unknown>>(initial: T): T {
	// A declaration initializer, which is the only placement `$state` allows;
	// what comes back is the deep proxy, and returning it hands the caller the
	// same reactive object the component will read through.
	const props = $state(initial);
	return props;
}
