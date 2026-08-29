/**
 * A stand-in for SvelteKit's `$app/navigation`, aliased in vitest.config.ts.
 *
 * WHY IT EXISTS: server-rendering the real home page reaches ProfileMenu, which
 * imports `invalidateAll` for its sign-out path. Without a stand-in the whole
 * page cannot be imported here, so the section-order assertions could not be
 * made against the shipping component at all.
 *
 * EVERY EXPORT IS A NO-OP THAT RECORDS ITSELF. Nothing under test navigates
 * during SSR; `calls` is here so a future test that expects one can assert it
 * happened rather than assuming, and `reset()` keeps that honest between tests.
 *
 * IT MIRRORS THE REAL MODULE'S WHOLE EXPORT LIST, and that is the point rather
 * than tidiness. A name the real module has and this one lacks is not a missing
 * feature -- it is a MOUNT THAT DIES, and it dies naming the caller instead of
 * the gap: `AssignmentEngine` calls `guardSaveNavigation`, which calls
 * `beforeNavigate` during component init (`save-guard.svelte.ts:64`), so with no
 * such export the call landed on `undefined` and the component never rendered a
 * node, with a stack pointing at the guard. Two sessions each mocked it locally
 * rather than widen this file. Listing all twelve makes that failure class
 * impossible instead of fixing one instance of it. The seven that were missing:
 * `beforeNavigate`, `afterNavigate`, `onNavigate`, `disableScrollHandling`,
 * `refreshAll`, `pushState` and `replaceState`. Of those, `afterNavigate` is the
 * second one a mount actually reaches (`gauntlet/+layout.svelte:52`, also during
 * init); the other five have no caller in `src/` today, and are here because the
 * list is the contract.
 *
 * THE THREE LIFECYCLE REGISTRARS ARE NOT `record()`, because what they take is
 * a CALLBACK rather than a destination. They keep it, so a test can fire the
 * guard it registered and assert what the component does about a navigation --
 * which is the assertion the local mocks could not make. They do NOT fire on
 * their own: the real `afterNavigate` also runs its callback once on mount, and
 * a stub that simulated that would be deciding a component's behaviour rather
 * than recording it.
 */

export const calls: { fn: string; args: unknown[] }[] = [];

/** Every callback handed to a lifecycle registrar, in registration order. */
export const navigationHooks: {
	beforeNavigate: ((nav: unknown) => unknown)[];
	afterNavigate: ((nav: unknown) => unknown)[];
	onNavigate: ((nav: unknown) => unknown)[];
} = { beforeNavigate: [], afterNavigate: [], onNavigate: [] };

export function reset(): void {
	calls.length = 0;
	navigationHooks.beforeNavigate.length = 0;
	navigationHooks.afterNavigate.length = 0;
	navigationHooks.onNavigate.length = 0;
}

const record =
	(fn: string) =>
	async (...args: unknown[]) => {
		calls.push({ fn, args });
	};

const registrar =
	(fn: 'beforeNavigate' | 'afterNavigate' | 'onNavigate') =>
	(callback: (nav: never) => unknown): void => {
		calls.push({ fn, args: [callback] });
		navigationHooks[fn].push(callback as (nav: unknown) => unknown);
	};

export const invalidateAll = record('invalidateAll');
export const invalidate = record('invalidate');
export const goto = record('goto');
export const preloadData = record('preloadData');
export const preloadCode = record('preloadCode');
export const refreshAll = record('refreshAll');
export const disableScrollHandling = record('disableScrollHandling');
export const pushState = record('pushState');
export const replaceState = record('replaceState');

export const beforeNavigate = registrar('beforeNavigate');
export const afterNavigate = registrar('afterNavigate');
export const onNavigate = registrar('onNavigate');
