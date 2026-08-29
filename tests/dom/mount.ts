// tests/dom/mount.ts
//
// THE SHARED MOUNT INSTRUMENT for this directory, kept apart from the
// assertions that use it for the reason `composer-mount.ts` states: a mutation
// proof has to drive the IDENTICAL instrument against a deliberately broken
// component, and a body retyped into a test file characterizes what somebody
// believed it did.
//
// Not a `.test.ts`, so vitest does not collect it as a file of its own.
//
// WHAT THIS DIRECTORY CAN AND CANNOT MEASURE. happy-dom has no layout engine:
// `getBoundingClientRect()` answers 0x0, `offsetWidth` is 0 and
// `getComputedStyle(el).color` is the EMPTY STRING (measured, this bundle).
// So a geometry, contrast or tap-target claim written here reads zero and
// passes VACUOUSLY -- which is the shape of defect this repo has already paid
// for once in the browser harness. Those claims belong in
// `npm run verify:browser` and nowhere else. What IS real here is structure,
// events, effects and storage, which is all any assertion in this directory
// makes.

import { flushSync, mount, unmount } from 'svelte';
import type { Component } from 'svelte';
import { page } from '$app/state';

export interface Mounted {
	/** The element the component was mounted into. EVERY query is scoped to it:
	 *  several mounts share one `document.body` inside a file. */
	target: HTMLElement;
	/** Flush the synchronous effect graph after driving something. */
	flush(): void;
	/** Flush, let a promise settle on a real macrotask, flush again. The
	 *  `composer-mount.ts` settle, which is what an upload transport needs. */
	settle(): Promise<void>;
	/** Unmount and detach. Safe to call twice. */
	stop(): Promise<void>;
	one<T extends Element>(selector: string): T;
	all<T extends Element>(selector: string): T[];
	/** The disclosure trigger carrying this `data-testid`, or null. */
	trigger(testId: string): HTMLButtonElement | null;
	/** `aria-expanded` on that trigger, as the string the attribute holds. */
	expanded(testId: string): string | null;
}

/** Mount any component into a fresh detached-then-attached target. */
export function mountInto(
	component: Component<Record<string, unknown>>,
	props: Record<string, unknown>
): Mounted {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(component, { target, props });
	flushSync();

	let stopped = false;
	const m: Mounted = {
		target,
		flush: () => flushSync(),
		async settle() {
			flushSync();
			await new Promise((resolve) => setTimeout(resolve, 30));
			flushSync();
		},
		async stop() {
			if (stopped) return;
			stopped = true;
			await unmount(app);
			target.remove();
		},
		one<T extends Element>(selector: string): T {
			const el = target.querySelector(selector);
			if (!el) throw new Error(`no element matched ${selector}`);
			return el as T;
		},
		all<T extends Element>(selector: string): T[] {
			return Array.from(target.querySelectorAll(selector)) as T[];
		},
		trigger(testId: string) {
			return target.querySelector(
				`button[data-testid="${testId}"]`
			) as HTMLButtonElement | null;
		},
		expanded(testId: string) {
			return m.trigger(testId)?.getAttribute('aria-expanded') ?? null;
		}
	};
	return m;
}

/**
 * WHO IS LOOKING AT THIS PAGE.
 *
 * `Disclosure.svelte` reads the viewer's id off `page.data.claims.sub` -- the
 * key's per-person segment is added there rather than by any caller, so "per
 * person" is one rule in one place. This puts a viewer behind that read and
 * hands back the restore, so a file can mount the same component as two
 * different people and prove their memories do not meet.
 *
 * `$app/state`'s stand-in exports `withPageData`, which is scoped to a
 * synchronous callback; a mount that has to survive an `await` needs the
 * assignment to outlive one, so this sets and restores explicitly.
 */
export function viewerIs(sub: string | null): () => void {
	const previous = page.data;
	page.data = sub === null ? {} : { claims: { sub } };
	return () => {
		page.data = previous;
	};
}

/** Every form control in a subtree, in document order. */
export function controlsIn(root: ParentNode): HTMLElement[] {
	return Array.from(root.querySelectorAll('input, textarea, select')) as HTMLElement[];
}

/** Is this control one a browser would deliver a user's own event to. */
export function isEnabled(el: HTMLElement): boolean {
	return !(el as HTMLInputElement).disabled;
}

/**
 * Dispatch the two events a person typing or ticking produces, at one control.
 *
 * A checkbox is toggled first because `change` without the property having
 * moved is not what a click produces; a text control is given a value.
 */
export function typeAt(el: HTMLElement, value = 'dispatched by a test'): void {
	const input = el as HTMLInputElement;
	if (input.type === 'checkbox' || input.type === 'radio') input.checked = !input.checked;
	else input.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	el.dispatchEvent(new Event('change', { bubbles: true }));
}
